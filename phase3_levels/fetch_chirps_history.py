"""Build a per-mandal CHIRPS monthly rainfall history.

The model's rain features come from NASA POWER, which serves MERRA-2 reanalysis
at roughly 55 km -- one cell covering about sixteen mandals. CHIRPS is a
satellite-and-gauge blend at 0.05 degrees, about 5.5 km, and the weekly refresh
already downloads its latest raster for the heat map. This walks the archive
once so the same product can be tested, and used, as a model input.

Each month is fetched, clipped to Andhra Pradesh, reduced to a per-mandal mean
and then deleted; nothing larger than one raster is ever on disk.
"""
import argparse
import csv
import gzip
import json
import os
import shutil
import sys
import tempfile
import urllib.request

import numpy as np
import rasterio
from rasterio.mask import mask
from shapely.geometry import Polygon, mapping

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation
APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(HERE, "data", "mandal_rain_history_chirps.csv")
# Months before this live in a second file that is written once and then never
# touched again. The weekly refresh appends one month; if the deep archive
# shared the file, every refresh would commit a fresh 2 MB blob of rainfall
# that has not changed since 1981.
ARCHIVE_BEFORE = "2014-01"
ARCHIVE = os.path.join(HERE, "data", "mandal_rain_history_chirps_archive.csv")
BASE = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs"
# CHIRPS writes ocean as -9999 without declaring it as nodata. Filling with
# zero instead of masking once diluted this product three- to six-fold.
NODATA_FLOOR = -9000.0


def zonal_mean(dataset, geom):
    """Mean of the cells the polygon covers, or that it touches if it is small."""
    for all_touched in (False, True):
        try:
            out, _ = mask(dataset, [geom], crop=True, filled=False, all_touched=all_touched)
        except ValueError:
            return None
        values = np.asarray(out[0].compressed(), dtype="float64")
        values = values[np.isfinite(values) & (values > NODATA_FLOOR)]
        if values.size:
            return float(values.mean())
    return None


def mandal_shapes():
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    shapes = []
    for index, feature in enumerate(geo["mandals"]):
        rings = [ring for ring in feature.get("rings", []) if len(ring) >= 4]
        if not rings:
            continue
        polygon = Polygon(rings[0])
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        shapes.append((index, feature["d"], feature["m"], mapping(polygon)))
    return shapes


def download(year, month, target, context):
    url = f"{BASE}/chirps-v2.0.{year}.{month:02d}.tif.gz"
    request = urllib.request.Request(url, headers={"User-Agent": "ap-groundwater-fusion"})
    with urllib.request.urlopen(request, timeout=180, context=context) as response, \
            gzip.GzipFile(fileobj=response) as raw, open(target, "wb") as handle:
        shutil.copyfileobj(raw, handle)


def history_paths():
    """Both halves of the record, oldest first; the archive may not exist."""
    return [path for path in (ARCHIVE, OUT) if os.path.exists(path)]


def read_rows(path):
    if not os.path.exists(path):
        return []
    with open(path) as handle:
        return list(csv.DictReader(handle))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-year", type=int, default=2014)
    parser.add_argument("--end", default=None, help="last month as YYYY-MM")
    parser.add_argument("--rebuild", action="store_true", help="re-fetch every month")
    args = parser.parse_args()
    shapes = mandal_shapes()
    print(f"  {len(shapes)} mandal polygons")

    end_year, end_month = (int(part) for part in (args.end or "2026-08").split("-"))
    # Incremental by default: the weekly refresh should fetch the one new month,
    # not walk the archive again. --rebuild forces the full walk.
    have = set()
    if not args.rebuild:
        for path in history_paths():
            have |= {row["date"] for row in read_rows(path)}
        if have:
            print(f"  {len(have)} months already on disk; fetching only what is missing")
    context = _tls_context()
    rows, missing = [], []
    with tempfile.TemporaryDirectory() as workdir:
        target = os.path.join(workdir, "month.tif")
        for year in range(args.start_year, end_year + 1):
            last = end_month if year == end_year else 12
            for month in range(1, last + 1):
                if f"{year}-{month:02d}" in have:
                    continue
                try:
                    download(year, month, target, context)
                except Exception as error:
                    missing.append((year, month, str(error)[:60]))
                    continue
                with rasterio.open(target) as dataset:
                    for index, district, mandal, geom in shapes:
                        value = zonal_mean(dataset, geom)
                        if value is not None:
                            rows.append({"boundary_index": index, "district": district,
                                         "mandal": mandal, "date": f"{year}-{month:02d}",
                                         "rain_mm": round(value, 2)})
                print(f"  {year}-{month:02d}  {len(rows):>7,} rows", flush=True)
    fields = ["boundary_index", "district", "mandal", "date", "rain_mm"]
    kept = [] if args.rebuild else [row for path in history_paths() for row in read_rows(path)]
    rows = sorted(kept + rows, key=lambda row: (row["date"], int(row["boundary_index"])))

    def write(path, chosen):
        with open(path, "w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(chosen)

    archive = [row for row in rows if row["date"] < ARCHIVE_BEFORE]
    current = [row for row in rows if row["date"] >= ARCHIVE_BEFORE]
    # Only rewrite the archive when it actually gained something, so an ordinary
    # weekly run leaves that file untouched and commits nothing for it.
    if archive and len(archive) != len(read_rows(ARCHIVE)):
        write(ARCHIVE, archive)
        print(f"  wrote {len(archive):,} rows -> data/{os.path.basename(ARCHIVE)}")
    write(OUT, current)
    print(f"\n  wrote {len(current):,} rows -> data/mandal_rain_history_chirps.csv"
          f" ({len(rows):,} with the archive)")
    if missing:
        print(f"  {len(missing)} months unavailable: {missing[:4]}")
        return 1 if len(missing) > 6 else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
