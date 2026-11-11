"""Village tanks before and after Cyclones Arnab and Murasu, from Sentinel-2.

The same reading as the rabi tank layer (build_tank_fill.py): JRC tank beds, and
for every tank pixel the share of its clear Sentinel-2 looks that saw water, read
at 80 m from the open Element 84 catalogue. Two windows instead of one season:
before Arnab's rain began, and after Murasu's ended. A mandal is compared only
where half its tank bed was seen clear in both.

Beside the State figure, a pair of true-colour pictures (Sentinel-2 TCI, 10 m) of
the largest tank in a few of the mandals that gained most, from the clearest
scene in each window, so a reader can see the water arrive.

Output: app/data/cyclone_tanks.json and app/public/cyclones/tanks/*.jpg. Run once,
after the storms; the pictures are picked by hand from what it prints with --pick.
"""
import argparse
import datetime
import json
import os
import sys

import numpy as np
import rasterio
from PIL import Image
from rasterio.windows import from_bounds
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_sentinel_outcomes import GDAL_ENV, search, tile_name  # noqa: E402
from build_tank_fill import GRID_PX, MASKS, MIN_SEEN, MIN_TANK_HA, TILES, boundaries, tile_mask, window_fill  # noqa: E402

OUT = os.path.join(ROOT, "app", "data", "cyclone_tanks.json")
PICTURES = os.path.join(ROOT, "app", "public", "cyclones", "tanks")
CACHE = os.path.join("/tmp", "ap-gw-video-assets", "cyclone_tanks.json")
BEFORE = ("2026-10-01", "2026-10-24")   # Arnab's rain is counted from 25 Oct
AFTER = ("2026-11-05", "2026-11-11")    # Murasu's ended on 6 Nov
ROSE = 0.10                              # a mandal "filled" when 10 more points of its tank bed held water
PICTURE_PX = 640
MAX_PICTURE_CLOUD = 0.12            # a little cloud is fine; the tank must show


def measure():
    if os.path.exists(CACHE):
        return json.load(open(CACHE))
    g, _ = boundaries()
    grids = json.load(open(TILES))
    masks = {name: tile_mask(name, grid, None, None) for name, grid in grids.items()}
    before = window_fill(*BEFORE, grids, masks, len(g))
    print(f"  before: {before['scenes']} scenes", flush=True)
    after = window_fill(*AFTER, grids, masks, len(g))
    print(f"  after: {after['scenes']} scenes", flush=True)
    out = {"before": before, "after": after}
    os.makedirs(os.path.dirname(CACHE), exist_ok=True)
    json.dump(out, open(CACHE, "w"))
    return out


def compare(raw):
    g, _ = boundaries()
    hectares = json.load(open(os.path.join(MASKS, "tank_ha.json")))["hectares"]
    rows = []
    for i, feature in enumerate(g):
        b, a = raw["before"], raw["after"]
        if hectares[i] < MIN_TANK_HA or None in (b["wet"][i], a["wet"][i]):
            continue
        if (b["seen"][i] or 0) < MIN_SEEN or (a["seen"][i] or 0) < MIN_SEEN:
            continue
        rows.append({"index": i, "district": feature["d"], "mandal": feature["m"], "tankHa": round(hectares[i]),
                     "before": b["wet"][i], "after": a["wet"][i]})
    return rows


def tank_pixels(index):
    """The largest tank in a mandal: its tile and its bounds in the tile's own grid, from the committed masks."""
    grids = json.load(open(TILES))
    best = None
    for name, grid in grids.items():
        flat, fraction, mandal = tile_mask(name, grid, None, None)
        mine = flat[(mandal == index) & (fraction.astype("float32") > 0.3)]
        if not len(mine):
            continue
        canvas = np.zeros(GRID_PX * GRID_PX, dtype=bool)
        canvas[mine] = True
        labels, count = ndimage.label(canvas.reshape(GRID_PX, GRID_PX))
        if not count:
            continue
        sizes = ndimage.sum(labels > 0, labels, np.arange(1, count + 1))
        biggest = int(np.argmax(sizes)) + 1
        if best is None or sizes[biggest - 1] > best[0]:
            rows, cols = np.nonzero(labels == biggest)
            best = (sizes[biggest - 1], name, grid, rows.min(), rows.max(), cols.min(), cols.max())
    return best


def clearest(name, start, end, bounds_4326):
    items = search(start, end, bounds_4326, fields={"include": ["id", "properties.mgrs:utm_zone", "properties.mgrs:latitude_band",
                                                                "properties.mgrs:grid_square", "properties.eo:cloud_cover",
                                                                "properties.datetime", "assets.visual.href", "assets.scl.href"],
                                                    "exclude": ["geometry", "links"]})
    items = [i for i in items if tile_name(i) == name]
    return sorted(items, key=lambda i: i["properties"].get("eo:cloud_cover") or 100)


def https(href):
    if href.startswith("s3://"):
        bucket, key = href[5:].split("/", 1)
        return f"https://{bucket}.s3.us-west-2.amazonaws.com/{key}"
    return href


def crop(href, bounds_utm, size=PICTURE_PX):
    with rasterio.Env(**GDAL_ENV), rasterio.open(f"/vsicurl/{https(href)}") as source:
        window = from_bounds(*bounds_utm, transform=source.transform)
        return source.read(window=window, out_shape=(source.count, size, size), boundless=True, fill_value=0)


def picture(index, slug):
    """True colour of the mandal's largest tank, from the clearest look in each window at the tank itself."""
    found = tank_pixels(index)
    if not found:
        return None
    _, name, grid, r0, r1, c0, c1 = found
    t = rasterio.Affine(*grid["transform"]) * rasterio.Affine.scale(0.5, 0.5)
    (x0, y0), (x1, y1) = t * (c0, r0), t * (c1 + 1, r1 + 1)
    cx, cy, half = (x0 + x1) / 2, (y0 + y1) / 2, max(abs(x1 - x0), abs(y1 - y0)) * 0.75 + 400
    box = (cx - half, cy - half, cx + half, cy + half)
    from rasterio.warp import transform_bounds
    lonlat = transform_bounds(grid["crs"], "EPSG:4326", *box)
    shots, images = {}, {}
    for label, (start, end) in (("before", BEFORE), ("after", AFTER)):
        for item in clearest(name, start, end, list(lonlat))[:10]:
            scl = crop(item["assets"]["scl"]["href"], box, 128)[0]
            # Cloud, cloud shadow and cirrus over the picture, and the share of it the scene covers.
            cloudy = float(np.isin(scl, (3, 8, 9, 10)).mean())
            if cloudy < MAX_PICTURE_CLOUD and (scl > 0).mean() > 0.95:
                rgb = crop(item["assets"]["visual"]["href"], box)
                images[label] = Image.fromarray(np.transpose(rgb[:3], (1, 2, 0)))
                shots[label] = {"date": item["properties"]["datetime"][:10], "file": f"cyclones/tanks/{slug}-{label}.jpg", "cloudPct": round(100 * cloudy)}
                break
    if len(shots) < 2:
        return None
    os.makedirs(PICTURES, exist_ok=True)
    for label, img in images.items():
        img.save(os.path.join(PICTURES, f"{slug}-{label}.jpg"), quality=82, optimize=True, progressive=True)
    return {"lon": round((lonlat[0] + lonlat[2]) / 2, 4), "lat": round((lonlat[1] + lonlat[3]) / 2, 4),
            "widthKm": round(2 * half / 1000, 1), **shots}


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--pick", action="store_true", help="print the mandals that gained most, to choose pictures from")
    parser.add_argument("--pictures", nargs="*", type=int, default=[], help="boundary indices to photograph")
    args = parser.parse_args()
    rows = compare(measure())
    if args.pick:
        for r in sorted(rows, key=lambda r: -(r["after"] - r["before"]) * r["tankHa"])[:25]:
            print(f"{r['index']:4d} {r['district']:<22} {r['mandal']:<24} {r['tankHa']:6d} ha  {r['before']:.2f} -> {r['after']:.2f}")
        return 0
    wet_before = sum(r["tankHa"] * r["before"] for r in rows)
    wet_after = sum(r["tankHa"] * r["after"] for r in rows)
    pictures = []
    for index in args.pictures:
        r = next(r for r in rows if r["index"] == index)
        slug = r["mandal"].lower().replace(" ", "-")
        shot = picture(index, slug)
        if shot:
            pictures.append({"mandal": r["mandal"], "district": r["district"], "shareBefore": round(r["before"], 3),
                             "shareAfter": round(r["after"], 3), **shot})
            print(f"  picture: {r['mandal']} {shot['before']['date']} / {shot['after']['date']}")
        else:
            print(f"  no clear pair for {r['mandal']}")
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": ("Tank beds: JRC Global Surface Water 1984-2021 (EC JRC / Google). Water: Copernicus Sentinel-2 Level-2A scene "
                   "classification (ESA), via Element 84 earth-search, read at 80 m. Pictures: Sentinel-2 true colour, 10 m."),
        "before": BEFORE, "after": AFTER,
        "mandals": len(rows),
        "wetHaBefore": round(wet_before), "wetHaAfter": round(wet_after),
        "rose": sum(1 for r in rows if r["after"] - r["before"] > ROSE),
        "fell": sum(1 for r in rows if r["before"] - r["after"] > ROSE),
        "roseRule": f"tank bed holding water up by more than {round(ROSE * 100)} points",
        "pictures": pictures,
        # [boundary index, share of tank bed holding water before, after, tank bed in hectares]
        "rows": [[r["index"], round(r["before"], 3), round(r["after"], 3), r["tankHa"]] for r in rows],
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    print(f"  {len(rows)} mandals seen both times: tank water {wet_before / 100:,.0f} km2 before, {wet_after / 100:,.0f} km2 after; "
          f"rose in {payload['rose']}, fell in {payload['fell']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
