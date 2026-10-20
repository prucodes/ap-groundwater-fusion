#!/usr/bin/env python3
"""Phase 3 - DEM enrichment: elevation statistics for every mandal, by zonal statistics.

Terrain is static, so this is NOT part of the weekly job. Run it when the mandal
boundaries change. The result (data/mandal_terrain.csv) is cached and read by
build_mandal_features.py and train_from_apwrims.py.

Rebuilt 2026-10-20, for two reasons.

The keys had gone stale. The file was written in June against the boundaries of the
day, so it filed Veeraghattam under SRIKAKULAM where the geometry now has
PARVATHIPURAM MANYAM. Only 238 of 653 mandals still joined, and every other one was
quietly falling back to an aquifer-wide proxy elevation. Keys come from
app/data/ap_map_geometry.json, so rebuilding against the current file fixes them.

The method changed as well. The old file held one open-elevation reading at each
mandal's centroid. A mandal is tens of kilometres across, a centroid can fall
outside a concave one, and one point cannot say how varied the ground is. Asking
the same API for a grid of points instead ran into HTTP 429 at a few thousand
requests, which is fair on a free endpoint. So this reads a DEM directly: it pulls
the Terrarium terrain tiles that AWS publishes openly, then takes real zonal
statistics over each mandal's own rings, roughly 150 m a pixel and typically
thousands of pixels per mandal.

That gives a mean worth the name, and `relief_m` beside it saying how much ground
the mean is averaging over. The spread matters for anything compared against a
fixed threshold, such as whether a water table stands below sea level, where a
mandal reported at 4 m may hold land at -1 m and at 30 m.

Elevation is Terrarium's blend of SRTM and other public sources. Treat a single
pixel as roughly +/-10 m. Slope and TWI stay a regional proxy here; a defensible
slope wants gradients taken across the raster rather than a lookup table.
"""
import argparse
import concurrent.futures
import csv
import io
import json
import math
import os
import ssl
import sys
import urllib.error
import urllib.request

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(HERE, "data", "mandal_terrain.csv")
TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium"

ZOOM = 10                # about 150 m a pixel at this latitude
TILE = 256
WORKERS = 8
RETRIES = 3
# No mandal needs more than this many pixels for a stable mean; the few large ones
# are sampled on a coarser stride instead of pulling their whole grid into memory.
MAX_PIXELS = 40000

HARD_ROCK = {"ANANTHAPURAMU", "ANANTAPUR", "SRI SATHYA SAI", "Y.S.R KADAPA", "Y.S.R.",
             "KADAPA", "KURNOOL", "NANDYAL", "CHITTOOR", "ANNAMAYYA", "TIRUPATI"}
DELTA = {"KRISHNA", "EAST GODAVARI", "WEST GODAVARI", "GUNTUR", "KONASEEMA", "ELURU",
         "NTR", "BAPATLA", "PALNADU"}


def slope_twi(district):
    if district in HARD_ROCK:
        return 5.0, 7.0
    if district in DELTA:
        return 1.5, 11.0
    return 2.5, 9.0


def tls_context():
    """Verified TLS. The framework Python here ships no CA bundle, so certifi's is
    used when it is installed; verification is never switched off."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def to_pixel(lon, lat, zoom=ZOOM):
    """Longitude and latitude to global Web Mercator pixel coordinates."""
    span = (2 ** zoom) * TILE
    x = (lon + 180.0) / 360.0 * span
    y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * span
    return x, y


def to_lonlat(px, py, zoom=ZOOM):
    """The inverse, vectorised over numpy arrays of pixel coordinates."""
    span = (2 ** zoom) * TILE
    lon = px / span * 360.0 - 180.0
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1.0 - 2.0 * py / span))))
    return lon, lat


def fetch_tile(key, context):
    x, y = key
    url = f"{TILES}/{ZOOM}/{x}/{y}.png"
    request = urllib.request.Request(url, headers={"User-Agent": "ap-groundwater-fusion/1.0"})
    for attempt in range(RETRIES):
        try:
            with urllib.request.urlopen(request, timeout=60, context=context) as answer:
                raw = answer.read()
            rgb = np.asarray(Image.open(io.BytesIO(raw)).convert("RGB")).astype(np.int32)
            # Terrarium packs height as (R * 256 + G + B / 256) - 32768 metres.
            metres = (rgb[:, :, 0] * 256 + rgb[:, :, 1] + rgb[:, :, 2] / 256.0) - 32768.0
            return key, metres.astype(np.float32)
        except urllib.error.HTTPError as problem:
            # Outside the published coverage a tile is simply absent; sea reads as 0.
            if problem.code == 404:
                return key, np.zeros((TILE, TILE), dtype=np.float32)
            if attempt == RETRIES - 1:
                raise
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == RETRIES - 1:
                raise
    return key, np.zeros((TILE, TILE), dtype=np.float32)


def inside_any(lon, lat, rings):
    """Vectorised ray casting. True where a point falls in any of the mandal's rings.

    Separate rings here are the pieces of a multipolygon rather than holes, so a
    point in any one of them is in the mandal.
    """
    hit = np.zeros(lon.shape, dtype=bool)
    for ring in rings:
        poly = np.asarray(ring, dtype=np.float64)
        x1, y1 = poly[:, 0], poly[:, 1]
        x2, y2 = np.roll(x1, 1), np.roll(y1, 1)
        this = np.zeros(lon.shape, dtype=bool)
        for i in range(len(poly)):
            straddles = (y1[i] > lat) != (y2[i] > lat)
            if not straddles.any():
                continue
            with np.errstate(divide="ignore", invalid="ignore"):
                cut = (x2[i] - x1[i]) * (lat - y1[i]) / (y2[i] - y1[i]) + x1[i]
            this ^= straddles & (lon < cut)
        hit |= this
    return hit


def mandal_rings():
    """key -> list of rings, with the pieces of a multipolygon merged under one key."""
    with open(os.path.join(APP, "ap_map_geometry.json"), encoding="utf-8") as handle:
        geometry = json.load(handle)
    merged = {}
    for entry in geometry["mandals"]:
        if entry.get("rings"):
            merged.setdefault(f"{entry['d']}|{entry['m']}", []).extend(entry["rings"])
    return merged


def tiles_for(rings):
    """The tile keys covering a mandal's bounding box."""
    pts = [pt for ring in rings for pt in ring]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    x0, y0 = to_pixel(min(lons), max(lats))
    x1, y1 = to_pixel(max(lons), min(lats))
    return {(tx, ty)
            for tx in range(int(x0) // TILE, int(x1) // TILE + 1)
            for ty in range(int(y0) // TILE, int(y1) // TILE + 1)}


def elevations(rings, cache):
    """Every DEM pixel whose centre falls inside the mandal."""
    pts = [pt for ring in rings for pt in ring]
    lons = [p[0] for p in pts]
    lats = [p[1] for p in pts]
    x0, y0 = to_pixel(min(lons), max(lats))
    x1, y1 = to_pixel(max(lons), min(lats))
    px0, px1 = int(math.floor(x0)), int(math.ceil(x1))
    py0, py1 = int(math.floor(y0)), int(math.ceil(y1))
    wide, tall = max(px1 - px0, 1), max(py1 - py0, 1)
    stride = max(1, int(math.sqrt(wide * tall / MAX_PIXELS)))

    xs = np.arange(px0, px1 + 1, stride) + 0.5
    ys = np.arange(py0, py1 + 1, stride) + 0.5
    grid_x, grid_y = np.meshgrid(xs, ys)
    lon, lat = to_lonlat(grid_x, grid_y)
    keep = inside_any(lon, lat, rings)
    if not keep.any():
        # A mandal smaller than one pixel still gets its centroid read.
        cx = sum(lons) / len(lons)
        cy = sum(lats) / len(lats)
        gx, gy = to_pixel(cx, cy)
        grid_x, grid_y = np.array([[gx]]), np.array([[gy]])
        keep = np.array([[True]])

    hit_x = grid_x[keep].astype(np.int64)
    hit_y = grid_y[keep].astype(np.int64)
    out = np.empty(hit_x.shape, dtype=np.float32)
    tx, ty = hit_x // TILE, hit_y // TILE
    for key in set(zip(tx.tolist(), ty.tolist())):
        tile = cache.get(key)
        if tile is None:
            continue
        pick = (tx == key[0]) & (ty == key[1])
        out[pick] = tile[hit_y[pick] % TILE, hit_x[pick] % TILE]
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--test", action="store_true",
                        help="do three mandals and print them, writing nothing")
    args = parser.parse_args()

    rings_by_key = mandal_rings()
    if args.test:
        rings_by_key = dict(list(rings_by_key.items())[:3])

    wanted = set()
    for rings in rings_by_key.values():
        wanted |= tiles_for(rings)
    print(f"  {len(rings_by_key)} mandals over {len(wanted)} terrain tiles at zoom {ZOOM}")

    context = tls_context()
    cache = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(fetch_tile, key, context) for key in sorted(wanted)]
        for done, future in enumerate(concurrent.futures.as_completed(futures), 1):
            key, tile = future.result()
            cache[key] = tile
            if done % 100 == 0 or done == len(futures):
                print(f"    {done}/{len(futures)} tiles")

    rows = []
    for key, rings in sorted(rings_by_key.items()):
        values = elevations(rings, cache)
        if values.size == 0:
            print(f"    [warn] no pixels for {key}")
            continue
        slope, twi = slope_twi(key.split("|")[0].upper())
        rows.append({
            "mandal_id": key,
            # The column every existing reader expects, now a polygon mean.
            "elevation_m": round(float(values.mean()), 1),
            "slope_deg": slope,
            "twi": twi,
            "elevation_min_m": round(float(values.min()), 1),
            "elevation_p10_m": round(float(np.percentile(values, 10)), 1),
            "elevation_p90_m": round(float(np.percentile(values, 90)), 1),
            "elevation_sd_m": round(float(values.std()), 1),
            "relief_m": round(float(values.max() - values.min()), 1),
            "dem_pixels": int(values.size),
        })

    if args.test:
        for row in rows:
            print("   ", row)
        return 0

    with open(OUT, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    relief = sorted(row["relief_m"] for row in rows)
    pixels = sorted(row["dem_pixels"] for row in rows)
    print(f"  wrote {len(rows)} mandals -> {OUT}")
    print(f"  median {pixels[len(pixels) // 2]:,} DEM pixels a mandal; "
          f"median relief {relief[len(relief) // 2]:.0f} m, p90 {relief[int(0.9 * len(relief))]:.0f} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
