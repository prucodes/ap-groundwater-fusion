"""How full the State's irrigation tanks are going into rabi, against their usual.

Tank beds: JRC Global Surface Water 1984-2021 (Pekel et al. 2016), "transitions" layer.
Kept: water that was seasonal both before and after 2000 (class 4), in water bodies of
2 to 5,000 ha with at most a quarter permanent water. That leaves out permanent lakes and
lagoons, reservoir drawdown rings around a permanent core, and water that became
permanent after 2000, which is largely aquaculture.

Water now: Sentinel-2 Level-2A scene classification (SCL, water = 6; clear = 4, 5 or 6),
read at 80 m from the open Element 84 catalogue, over a fixed window from 15 September to
15 October each year. For every tank pixel, the share of its clear looks that saw water;
for every mandal, those shares weighted by how much of each pixel is tank bed. A mandal
counts only where at least half its tank bed was seen clear at least once.

Usual: the same window in 2019 to the year before, per mandal, the median.

Masks (committed, small): phase3_levels/data/tank_masks/ (tank pixels and mandal labels on
each Sentinel-2 tile's 80 m grid). Past years (committed): phase3_levels/data/tank_fill_years.json.
Output: app/data/tank_fill.json. The JRC tiles are read only when the masks are rebuilt
(data/raw/jrc/, git-ignored). Run by hand; a run reads only the years not yet in the table,
and always the current one.
"""
import concurrent.futures
import datetime
import json
import os
import sys

import numpy as np
import rasterio
import shapely
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.mask import mask as rio_mask
from rasterio.warp import reproject, transform_geom
from scipy import ndimage
from shapely.geometry import MultiPolygon, Polygon, mapping

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
sys.path.insert(0, HERE)
from build_sentinel_outcomes import GDAL_ENV, search, tile_name  # noqa: E402

JRC = os.path.join(ROOT, "data", "raw", "jrc", "transitions_{tile}_20Nv1_4_2021.tif")
MASKS = os.path.join(HERE, "data", "tank_masks")
TILES = os.path.join(HERE, "data", "sentinel_masks", "tiles.json")
YEARS = os.path.join(HERE, "data", "tank_fill_years.json")
OUT = os.path.join(APP, "tank_fill.json")
GRID_PX = 1372                 # a 109.8 km tile at 80 m
WINDOW = ("09-15", "10-15")
FIRST_YEAR = 2019
WATER, CLEAR = 6, (4, 5, 6)
MIN_SEEN = 0.5                 # share of a mandal's tank bed seen clear at least once
MIN_TANK_HA = 20               # a mandal with less tank bed than this is not scored
MAX_CLOUD = 90.0
THREADS = 12


def boundaries():
    g = json.load(open(os.path.join(APP, "ap_map_display.json")))["mandals"]
    return g, [shapely.make_valid(MultiPolygon([Polygon(r) for r in b["rings"] if len(r) >= 4])) for b in g]


def tank_beds(shapes):
    """The JRC tank-bed mask over the State (30 m, EPSG:4326), one array per JRC tile."""
    state = shapely.unary_union(shapes)
    out = []
    for tile in ("70E", "80E"):
        with rasterio.open(JRC.format(tile=tile)) as source:
            data, transform = rio_mask(source, [mapping(state)], crop=True, filled=True, nodata=0)
        classes = data[0]
        water = classes > 0
        bodies, count = ndimage.label(water, structure=np.ones((3, 3)))
        index = np.arange(1, count + 1)
        size = ndimage.sum(water, bodies, index)
        permanent = ndimage.sum(np.isin(classes, (1, 2, 7)), bodies, index)
        seasonal = ndimage.sum(classes == 4, bodies, index)
        lat = transform.f + transform.e * classes.shape[0] / 2
        pixel_ha = (abs(transform.a) * 111320) * (abs(transform.e) * 111320 * np.cos(np.radians(lat))) / 1e4
        area = size * pixel_ha
        keep = (area >= 2) & (area <= 5000) & (permanent / np.maximum(size, 1) <= 0.25) & (seasonal / np.maximum(size, 1) >= 0.5)
        tank = (classes == 4) & np.concatenate([[False], keep])[bodies]
        out.append((tank, transform, pixel_ha, int(keep.sum())))
    return out


def tank_ha_by_mandal(beds, shapes):
    hectares = np.zeros(len(shapes))
    for tank, transform, pixel_ha, _ in beds:
        labels = rasterize(((mapping(s), i) for i, s in enumerate(shapes)), out_shape=tank.shape, transform=transform, fill=-1, dtype="int32")
        ok = tank & (labels >= 0)
        np.add.at(hectares, labels[ok], pixel_ha)
    return hectares


def tile_mask(name, grid, beds, shapes):
    """Tank pixels on one tile's 80 m grid: flat index, tank fraction and mandal (cached, committed)."""
    path = os.path.join(MASKS, f"tank_{name}.npz")
    if os.path.exists(path):
        saved = np.load(path)
        return saved["index"], saved["fraction"], saved["mandal"]
    crs = grid["crs"]
    transform = rasterio.Affine(*grid["transform"]) * rasterio.Affine.scale(0.5, 0.5)
    fraction = np.zeros((GRID_PX, GRID_PX), dtype="float32")
    for tank, source_transform, _, _ in beds:
        part = np.zeros_like(fraction)
        reproject(tank.astype("float32"), part, src_transform=source_transform, src_crs="EPSG:4326",
                  dst_transform=transform, dst_crs=crs, resampling=Resampling.average, src_nodata=None, dst_nodata=0)
        fraction = np.maximum(fraction, part)
    labels = rasterize(((transform_geom("EPSG:4326", crs, mapping(s)), i) for i, s in enumerate(shapes)),
                       out_shape=(GRID_PX, GRID_PX), transform=transform, fill=-1, dtype="int32")
    keep = (fraction > 0.05) & (labels >= 0)
    index = np.flatnonzero(keep).astype("int32")
    os.makedirs(MASKS, exist_ok=True)
    np.savez_compressed(path, index=index, fraction=fraction.ravel()[index].astype("float16"), mandal=labels.ravel()[index].astype("int16"))
    return index, fraction.ravel()[index].astype("float16"), labels.ravel()[index].astype("int16")


def scene_scl(base, index):
    with rasterio.Env(**GDAL_ENV), rasterio.open(f"/vsicurl/{base}SCL.tif") as source:
        scl = source.read(1, out_shape=(GRID_PX, GRID_PX), resampling=Resampling.nearest)
    return scl.ravel()[index]


def year_fill(year, grids, masks, count):
    """Per mandal: the tank-bed share that held water, and the share seen, over the window."""
    start, end = f"{year}-{WINDOW[0]}", min(f"{year}-{WINDOW[1]}", datetime.date.today().isoformat())
    bounds = [76.7, 12.6, 84.8, 19.95]
    items = search(start, end, bounds, fields={"include": ["id", "properties.mgrs:utm_zone", "properties.mgrs:latitude_band",
                                                           "properties.mgrs:grid_square", "properties.eo:cloud_cover", "assets.scl.href"],
                                               "exclude": ["geometry", "links"]})
    jobs = []
    for item in items:
        name = tile_name(item)
        if name in grids and (item["properties"].get("eo:cloud_cover") or 0) < MAX_CLOUD:
            href = item["assets"]["scl"]["href"]
            if href.startswith("s3://"):
                bucket, key = href[5:].split("/", 1)
                href = f"https://{bucket}.s3.us-west-2.amazonaws.com/{key}"
            jobs.append((name, href.rsplit("/", 1)[0] + "/"))
    clear = {name: np.zeros(len(masks[name][0]), dtype="int16") for name in grids}
    wet = {name: np.zeros(len(masks[name][0]), dtype="int16") for name in grids}
    with concurrent.futures.ThreadPoolExecutor(THREADS) as pool:
        futures = {pool.submit(scene_scl, base, masks[name][0]): name for name, base in jobs}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                scl = future.result()
            except Exception as error:  # noqa: BLE001 - one unreadable scene leaves the others
                print(f"    [skip] {name}: {str(error)[:100]}", flush=True)
                continue
            clear[name] += np.isin(scl, CLEAR)
            wet[name] += scl == WATER
    held, seen, bed = np.zeros(count), np.zeros(count), np.zeros(count)
    for name in grids:
        _, fraction, mandal = masks[name]
        f = fraction.astype("float64")
        looked = clear[name] > 0
        share = np.where(looked, wet[name] / np.maximum(clear[name], 1), 0.0)
        np.add.at(bed, mandal, f)
        np.add.at(seen, mandal, f * looked)
        np.add.at(held, mandal, f * share)
    print(f"  {year}: {len(jobs)} scenes over {len({j[0] for j in jobs})} tiles, {start} to {end}", flush=True)
    return {"window": [start, end], "scenes": len(jobs),
            "wet": [round(float(h / s), 4) if s > 0 else None for h, s in zip(held, seen)],
            "seen": [round(float(s / b), 3) if b > 0 else None for s, b in zip(seen, bed)]}


def main():
    g, shapes = boundaries()
    grids = json.load(open(TILES))
    need_beds = not all(os.path.exists(os.path.join(MASKS, f"tank_{name}.npz")) for name in grids)
    beds = tank_beds(shapes) if need_beds or not os.path.exists(os.path.join(MASKS, "tank_ha.json")) else None
    if beds is not None:
        os.makedirs(MASKS, exist_ok=True)
        hectares = tank_ha_by_mandal(beds, shapes)
        json.dump({"bodies": sum(b[3] for b in beds), "hectares": [round(float(h), 1) for h in hectares]},
                  open(os.path.join(MASKS, "tank_ha.json"), "w"))
    meta = json.load(open(os.path.join(MASKS, "tank_ha.json")))
    hectares = np.array(meta["hectares"])
    masks = {name: tile_mask(name, grid, beds, shapes) for name, grid in grids.items()}

    table = json.load(open(YEARS)) if os.path.exists(YEARS) else {}
    today = datetime.date.today()
    # Before this year's window opens, the latest is last year's: rabi runs October to March.
    this_year = today.year if today.isoformat()[5:] >= WINDOW[0] else today.year - 1
    for year in range(FIRST_YEAR, this_year):
        if str(year) not in table:
            table[str(year)] = year_fill(year, grids, masks, len(g))
            json.dump(table, open(YEARS, "w"), separators=(",", ":"))
    now = year_fill(this_year, grids, masks, len(g))

    mandals, scored = [], []
    for i in range(len(g)):
        past = [table[str(y)]["wet"][i] for y in range(FIRST_YEAR, this_year)
                if table[str(y)]["wet"][i] is not None and (table[str(y)]["seen"][i] or 0) >= MIN_SEEN]
        current = now["wet"][i] if now and (now["seen"][i] or 0) >= MIN_SEEN else None
        if hectares[i] < MIN_TANK_HA:
            mandals.append(None)
            continue
        usual = float(np.median(past)) if len(past) >= 3 else None
        row = {"tankHa": round(float(hectares[i])), "now": current, "usual": round(usual, 4) if usual is not None else None,
               "years": len(past), "seen": now["seen"][i] if now else None}
        mandals.append(row)
        if current is not None and usual is not None:
            scored.append((i, current, usual))
    def year_summary(year, wet_shares, seen_shares):
        shares = [w for i, (w, s) in enumerate(zip(wet_shares, seen_shares))
                  if mandals[i] and w is not None and (s or 0) >= MIN_SEEN]
        return {"year": year, "mandals": len(shares), "medianShare": round(float(np.median(shares)), 3) if shares else None}
    by_year = [year_summary(y, table[str(y)]["wet"], table[str(y)]["seen"]) for y in range(FIRST_YEAR, this_year)]
    if now:
        by_year.append(year_summary(this_year, now["wet"], now["seen"]))
    tank_total = float(sum(r["tankHa"] for r in mandals if r))
    wet_now = sum(hectares[i] * c for i, c, _ in scored)
    wet_usual = sum(hectares[i] * u for i, _, u in scored)
    emptier = [i for i, c, u in scored if c < u - 0.1]
    fuller = [i for i, c, u in scored if c > u + 0.1]
    payload = {
        "contractVersion": "tank-fill-v1",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "window": now["window"] if now else None,
        "usualYears": [FIRST_YEAR, this_year - 1],
        "source": ("Tank beds: JRC Global Surface Water 1984-2021 (EC JRC / Google), transitions layer. Water: Copernicus "
                   "Sentinel-2 Level-2A scene classification (ESA), via Element 84 earth-search, read at 80 m."),
        "tankBodies": meta["bodies"],
        "tankHa": round(tank_total),
        "tankMandals": sum(1 for r in mandals if r),
        "scoredMandals": len(scored),
        "wetHaNow": round(wet_now), "wetHaUsual": round(wet_usual),
        "emptier": len(emptier), "fuller": len(fuller),
        "byYear": by_year,
        "rule": "Emptier or fuller: the tank bed holding water now differs from the mandal's own median for the window by more than 10 points.",
        "mandals": mandals,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    print(f"  tank beds {tank_total / 100:,.0f} km2 in {payload['tankMandals']} mandals ({meta['bodies']:,} water bodies)")
    if now:
        print(f"  {now['window'][0]} to {now['window'][1]}: scored {len(scored)} mandals; tank bed holding water "
              f"{wet_now / 100:,.0f} km2 against a usual {wet_usual / 100:,.0f} km2; emptier {len(emptier)}, fuller {len(fuller)}")
    print(f"  wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
