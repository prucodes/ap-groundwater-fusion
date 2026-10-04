"""Field-scale vegetation for the crop water check's record: Sentinel-2 over rainfed cropland.

The track record's outcome so far is NOAA's 4 km vegetation index: one value
for some 1,600 hectares, mixing irrigated and rainfed fields, crops and scrub.
Sentinel-2 sees the same ground at 10 m every two to three days (three
satellites since 2025). This reads it at 160 m, a few fields to a pixel, and
keeps only rainfed cropland, so the outcome is the fields the check speaks for.

- Scenes: Copernicus Sentinel-2 Level-2A from the open Element 84 / AWS
  catalogue (earth-search), red (B04), near infrared (B08) and the scene
  classification (SCL), read through each file's 16x overview (160 m).
- Clear pixels: SCL vegetation (4) or not-vegetated (5); cloud, shadow, water
  and unclassified pixels are left out.
- Weekly composite: for each NOAA VHP week the record uses, the greenest
  clear NDVI of the week's passes (the usual maximum-value composite, which
  also discards residual haze).
- Rainfed cropland pixels: at least half cropland in ESA WorldCover 2021, and
  less than half of that cropland irrigated in ESA WorldCereal (rabi 2020-21).
- Per mandal and check week: the mean three-week change in NDVI over the
  pixels clear at both ends, and the NDVI three weeks on; where at least
  MIN_PIXELS pixels (about half a square kilometre) are clear at both.

Kharif is the cloudy season, so many mandal-weeks have no clear pair: the
record says how many it could read.

The tile grid and masks are kept in phase3_levels/data/sentinel_masks/
(committed, ~1.3 MB); the weekly composites in data/private/sentinel/
(git-ignored). Output, committed:
phase3_levels/data/sentinel_outcomes.json (per check week, per mandal).
Run by hand after build_irrigated_fraction.py; build_crop_water_record.py
reads the output.
"""
import concurrent.futures
import datetime
import glob
import json
import os
import sys
import time
import urllib.request

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.warp import reproject, transform_geom
from rasterio.windows import from_bounds
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_crop_water_record import LEAD_WEEKS, SEASONS, WEEKS, week_start  # noqa: E402
from build_cropland_fraction import TILE_URL as WORLDCOVER_URL  # noqa: E402
from fetch_chirps_history import mandal_shapes  # noqa: E402
from fetch_field_signals import geometry  # noqa: E402
from fetch_nasa_power_rainfall import _tls_context  # noqa: E402

ROOT = os.path.join(HERE, "..")
CACHE = os.path.join(ROOT, "data", "private", "sentinel")
# The tile grid and the rainfed-cropland masks are static and small (~1.3 MB), so they are committed:
# the weekly scorecard reads Sentinel-2 on GitHub's runner without WorldCover or WorldCereal.
MASKS = os.path.join(HERE, "data", "sentinel_masks")
WORLDCEREAL = os.path.join(ROOT, "data", "private", "worldcereal")
OUT = os.path.join(HERE, "data", "sentinel_outcomes.json")
STAC = "https://earth-search.aws.element84.com/v1/search"
GRID_PX = 686                 # a 109.8 km tile at 160 m
CLEAR = (4, 5)
MAX_CLOUD = 95.0              # scenes the catalogue rates cloudier are not opened
MIN_PIXELS = 20               # 20 x 2.56 ha: about half a square kilometre of rainfed cropland
THREADS = 12
GDAL_ENV = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
                GDAL_HTTP_MAX_RETRY="4", GDAL_HTTP_RETRY_DELAY="2", AWS_NO_SIGN_REQUEST="YES", GDAL_CACHEMAX=256)


def post_json(url, body, tries=5):
    data = json.dumps(body).encode()
    for attempt in range(tries):
        try:
            request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(request, timeout=120, context=_tls_context()) as answer:
                return json.loads(answer.read())
        except Exception:  # noqa: BLE001 - the catalogue is retried, then the error raised
            if attempt == tries - 1:
                raise
            time.sleep(5 * (attempt + 1))


def search(start, end, bbox, fields=None):
    """Every Sentinel-2 L2A item over a box between two dates, page by page."""
    body = {"collections": ["sentinel-2-l2a"], "bbox": bbox, "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z", "limit": 250}
    if fields:
        body["fields"] = fields
    items = []
    while True:
        page = post_json(STAC, body)
        items += page.get("features", [])
        nxt = next((link for link in page.get("links", []) if link.get("rel") == "next"), None)
        if not nxt or not page.get("features"):
            return items
        body = {**body, **(nxt.get("body") or {})}   # the next page's body drops "fields"; keep it


def tile_name(item):
    p = item["properties"]
    return f"{p.get('mgrs:utm_zone')}{p.get('mgrs:latitude_band')}{p.get('mgrs:grid_square')}"


def cached_json(name, build, folder=CACHE):
    path = os.path.join(folder, name)
    if os.path.exists(path):
        return json.load(open(path))
    value = build()
    os.makedirs(folder, exist_ok=True)
    json.dump(value, open(path + ".tmp", "w"))
    os.replace(path + ".tmp", path)
    return value


def state_shape(shapes):
    return unary_union([shape(geom) for *_, geom in shapes]).buffer(0)


def tiles(shapes):
    """The Sentinel-2 tiles that touch the State, with the grid of their 160 m overview."""
    def build():
        ap = state_shape(shapes)
        items = search("2025-03-01", "2025-03-12", list(ap.bounds))
        out = {}
        for item in items:
            name = tile_name(item)
            if name in out or not shape(item["geometry"]).intersects(ap):
                continue
            href = item["assets"]["red"]["href"]
            with rasterio.Env(**GDAL_ENV), rasterio.open("/vsicurl/" + href) as source:
                scale = source.width / GRID_PX
                transform = source.transform * rasterio.Affine.scale(scale, scale)
                out[name] = {"crs": source.crs.to_string(), "transform": list(transform)[:6]}
        return out
    return cached_json("tiles.json", build, folder=MASKS)


def worldcover_names(bounds):
    west, south, east, north = bounds
    lats = range(int(np.floor(south / 3) * 3), int(np.ceil(north / 3) * 3), 3)
    lons = range(int(np.floor(west / 3) * 3), int(np.ceil(east / 3) * 3), 3)
    return [f"N{lat:02d}E{lon:03d}" for lat in lats for lon in lons]


def to_grid(source_array, source_transform, crs, transform):
    out = np.zeros((GRID_PX, GRID_PX), dtype="float32")
    reproject(source_array.astype("float32"), out, src_transform=source_transform, src_crs="EPSG:4326",
              dst_transform=transform, dst_crs=crs, resampling=Resampling.average, src_nodata=-1, dst_nodata=0)
    return out


def tile_masks(name, grid, shapes):
    """Mandal labels and the rainfed-cropland mask on the tile's 160 m grid (cached)."""
    path = os.path.join(MASKS, f"mask_{name}.npz")
    os.makedirs(MASKS, exist_ok=True)
    if os.path.exists(path):
        saved = np.load(path)
        return saved["labels"], saved["rainfed"]
    crs, transform = grid["crs"], rasterio.Affine(*grid["transform"])
    footprint = transform_geom(crs, "EPSG:4326", mapping(box(transform.c, transform.f + GRID_PX * transform.e, transform.c + GRID_PX * transform.a, transform.f)))
    bounds = shape(footprint).bounds
    labels = rasterize(((transform_geom("EPSG:4326", crs, geom), index) for index, _, _, geom in shapes),
                       out_shape=(GRID_PX, GRID_PX), transform=transform, fill=-1, dtype="int32")
    crop = np.zeros((GRID_PX, GRID_PX), dtype="float32")
    step = 0.0004   # about 44 m, from the WorldCover overviews
    with rasterio.Env(**GDAL_ENV):
        for tile in worldcover_names(bounds):
            try:
                with rasterio.open("/vsicurl/" + WORLDCOVER_URL.format(name=tile)) as source:
                    window = from_bounds(*bounds, source.transform).intersection(rasterio.windows.Window(0, 0, source.width, source.height))
                    h, w = max(1, int(round(window.height * source.res[1] / step))), max(1, int(round(window.width * source.res[0] / step)))
                    classes = source.read(1, window=window, out_shape=(h, w), resampling=Resampling.nearest)
                    t = source.window_transform(window) * rasterio.Affine.scale(window.width / w, window.height / h)
                    binary = np.where(classes == 0, -1, np.where(classes == 40, 1.0, 0.0))
                    crop = np.maximum(crop, to_grid(binary, t, crs, transform))
            except rasterio.errors.RasterioIOError:
                continue   # an all-sea WorldCover tile does not exist
    irrigated = np.zeros((GRID_PX, GRID_PX), dtype="float32")
    for path_tif in glob.glob(os.path.join(WORLDCEREAL, "*_tc-maize-main_irrigation_*_classification.tif")):
        with rasterio.open(path_tif) as source:
            window = from_bounds(*bounds, source.transform)
            h, w = max(1, int(round(window.height / 4))), max(1, int(round(window.width / 4)))   # about 33 m
            classes = source.read(1, window=window, out_shape=(h, w), boundless=True, fill_value=255, resampling=Resampling.nearest)
            t = source.window_transform(window) * rasterio.Affine.scale(window.width / w, window.height / h)
            binary = np.where(classes == 255, -1, np.where(classes == 100, 1.0, 0.0))
            irrigated = np.maximum(irrigated, to_grid(binary, t, crs, transform))
    rainfed = (crop >= 0.5) & (irrigated < 0.5 * crop) & (labels >= 0)
    np.savez_compressed(path, labels=labels.astype("int16"), rainfed=rainfed)
    return labels.astype("int16"), rainfed


def stored_offset(item):
    """The reflectance offset still in the stored values, in stored units.

    Processing baseline 04.00 (January 2022) adds 1000 to every L2A value. Element 84's archive
    removes it again and says so ("earthsearch:boa_offset_applied": true), while its raster:bands
    still describe the original offset. Subtracting it a second time drives red to zero and every
    pixel's NDVI to 1; the first build of the field-scale record (4 October 2026) did exactly that.
    """
    if item["properties"].get("earthsearch:boa_offset_applied"):
        return 0
    band = (item["assets"]["red"].get("raster:bands") or [{}])[0]
    return int(round(-(band.get("offset") or 0) / (band.get("scale") or 0.0001)))


def check_composite(year, week, best):
    """Refuse a composite whose cropland NDVI is not plausible: a wrong offset or a broken band shows here."""
    values = np.concatenate([v[np.isfinite(v)] for v in best.values()]) if best else np.array([])
    if len(values) < 1000:
        return
    median = float(np.median(values))
    if not 0.1 <= median <= 0.9 or float(np.mean(values > 0.98)) > 0.05:
        raise RuntimeError(f"{year} week {week}: implausible cropland NDVI (median {median:.3f}, "
                           f"{100 * float(np.mean(values > 0.98)):.0f}% above 0.98); check the reflectance offset")


def scene_ndvi(base, offset_dn):
    """NDVI of one scene at 160 m, NaN where the scene classification is not clear ground.
    offset_dn: the reflectance offset in stored units, from the item's raster:bands (1000 since
    processing baseline 04.00, January 2022; 0 before)."""
    with rasterio.Env(**GDAL_ENV):
        bands = {}
        for band in ("B04", "B08", "SCL"):
            with rasterio.open(f"/vsicurl/{base}{band}.tif") as source:
                bands[band] = source.read(1, out_shape=(GRID_PX, GRID_PX), resampling=Resampling.nearest)
    red, nir = bands["B04"].astype("float32"), bands["B08"].astype("float32")
    red, nir = np.clip(red - offset_dn, 0, None), np.clip(nir - offset_dn, 0, None)
    clear = np.isin(bands["SCL"], CLEAR) & (red + nir > 0)
    ndvi = np.where(clear, (nir - red) / np.maximum(nir + red, 1), np.nan)
    return ndvi.astype("float32")


def week_composite(year, week, tile_grids, masks, ap_bounds):
    """The greenest clear NDVI of the week at every tile's rainfed pixels (cached per week)."""
    path = os.path.join(CACHE, f"ndvi_{year}_{week:03d}.npz")
    if os.path.exists(path):
        return dict(np.load(path))
    start = week_start(year, week)
    items = search(start.isoformat(), (start + datetime.timedelta(days=6)).isoformat(), list(ap_bounds),
                   fields={"include": ["id", "properties.mgrs:utm_zone", "properties.mgrs:latitude_band", "properties.mgrs:grid_square",
                                       "properties.eo:cloud_cover", "properties.earthsearch:boa_offset_applied",
                                       "assets.red.href", "assets.red.raster:bands"], "exclude": ["geometry", "links"]})
    jobs = []
    for item in items:
        name = tile_name(item)
        if name in tile_grids and (item["properties"].get("eo:cloud_cover") or 0) < MAX_CLOUD:
            offset_dn = stored_offset(item)
            href = item["assets"]["red"]["href"]
            if href.startswith("s3://"):   # some items list the bucket path; the same file is served over https
                bucket, key = href[5:].split("/", 1)
                href = f"https://{bucket}.s3.us-west-2.amazonaws.com/{key}"
            jobs.append((name, href.rsplit("/", 1)[0] + "/", offset_dn))
    best = {name: np.full(int(masks[name][1].sum()), np.nan, dtype="float32") for name in tile_grids}
    with concurrent.futures.ThreadPoolExecutor(THREADS) as pool:
        futures = {pool.submit(scene_ndvi, base, offset_dn): name for name, base, offset_dn in jobs}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                values = future.result()[masks[name][1]]
            except Exception as error:  # noqa: BLE001 - one unreadable scene leaves the others
                print(f"    [skip] {name}: {str(error)[:120]}", flush=True)
                continue
            best[name] = np.fmax(best[name], values)
    check_composite(year, week, best)
    np.savez_compressed(path, **{name: values.astype("float16") for name, values in best.items()})
    print(f"  {year} week {week}: {len(jobs)} scenes over {len({job[0] for job in jobs})} tiles", flush=True)
    return best


def outcomes(before, after, masks, count):
    """Per mandal: mean NDVI change and NDVI after, over rainfed pixels clear in both weeks."""
    change_sum, after_sum, n = np.zeros(count), np.zeros(count), np.zeros(count)
    for name, (labels, rainfed) in masks.items():
        b, a = before[name].astype("float32"), after[name].astype("float32")
        both = np.isfinite(b) & np.isfinite(a)
        lab = labels[rainfed][both]
        change_sum += np.bincount(lab, weights=(a - b)[both], minlength=count)
        after_sum += np.bincount(lab, weights=a[both], minlength=count)
        n += np.bincount(lab, minlength=count)
    rows = [None] * count
    for i in range(count):
        if n[i] >= MIN_PIXELS:
            rows[i] = [round(float(change_sum[i] / n[i]), 4), round(float(after_sum[i] / n[i]), 4), int(n[i])]
    return rows


def main():
    shapes = mandal_shapes()
    count = len(geometry())
    tile_grids = tiles(shapes)
    print(f"{len(tile_grids)} Sentinel-2 tiles over the State", flush=True)
    masks = {}
    for name, grid in sorted(tile_grids.items()):
        masks[name] = tile_masks(name, grid, shapes)
    print(f"rainfed cropland pixels at 160 m: {sum(int(m[1].sum()) for m in masks.values()):,}", flush=True)
    ap_bounds = state_shape(shapes).bounds
    today = datetime.date.today()
    weeks_out = []
    for year in SEASONS:
        weeks = [w for w in WEEKS if week_start(year, w + LEAD_WEEKS) + datetime.timedelta(days=9) <= today]
        composites = {}
        for week in sorted(set(weeks) | {w + LEAD_WEEKS for w in weeks}):
            composites[week] = week_composite(year, week, tile_grids, masks, ap_bounds)
        for week in weeks:
            rows = outcomes(composites[week], composites[week + LEAD_WEEKS], masks, count)
            weeks_out.append({"year": year, "week": week, "mandals": rows})
            print(f"  {year} check week {week}: {sum(r is not None for r in rows)} mandals with a clear pair", flush=True)
    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "Copernicus Sentinel-2 Level-2A (ESA), via the Element 84 earth-search catalogue on AWS; B04, B08 and SCL read at 160 m",
        "licence": "Copernicus open licence; contains modified Copernicus Sentinel data",
        "pixels": "Rainfed cropland: half or more WorldCover 2021 cropland, less than half of it WorldCereal-irrigated (rabi 2020-21)",
        "composite": "Weekly maximum NDVI over clear pixels (SCL 4 or 5)",
        "fields": ["ndviChange", "ndviAfter", "pixels"],
        "minPixels": MIN_PIXELS, "leadWeeks": LEAD_WEEKS, "tiles": len(tile_grids),
        "weeks": weeks_out,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"Wrote {OUT}: {len(weeks_out)} check weeks")


if __name__ == "__main__":
    main()
