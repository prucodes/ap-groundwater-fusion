"""Build a per-mandal CHIRPS monthly rainfall history.

The model's rain features come from NASA POWER, which serves MERRA-2 reanalysis
at roughly 55 km -- one cell covering about sixteen mandals. CHIRPS is a
satellite-and-gauge blend at 0.05 degrees, about 5.5 km, and the weekly refresh
already downloads its latest raster for the heat map. This walks the archive
once so the same product can be tested, and used, as a model input.

The record is CHIRPS v3. The Climate Hazards Center stops producing v2 after
December 2026, and v3 is not a drop-in continuation: it corrects gauges for
wind undercatch and draws on about four times the station sources, so it is
wetter overall. Moving to it is therefore a full rebuild of BOTH halves of the
record -- never v3 months appended to a v2 history. A manifest beside the CSVs
records which product built them, and an incremental run refuses to append to
a history built from a different one.

Each month is read straight from the publisher's cloud-optimised GeoTIFF over
HTTP range requests -- Andhra Pradesh's window only, about 165 x 135 cells of a
7200 x 2400 global grid -- and reduced to a per-mandal mean. If that read fails
the whole GeoTIFF is downloaded over verified TLS instead. Nothing larger than
one raster is ever on disk.
"""
import argparse
import csv
import datetime
import json
import os
import shutil
import sys
import tempfile
import urllib.request

import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.mask import mask
from rasterio.windows import from_bounds
from shapely.geometry import Polygon, mapping, shape

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
MANIFEST = os.path.join(HERE, "data", "mandal_rain_history_chirps_manifest.json")
FIRST_YEAR = 1981
PRODUCT = "CHIRPS v3.0"
BASE = "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global"
# CHIRPS writes ocean as -9999 without declaring it as nodata. Filling with
# zero instead of masking once diluted this product three- to six-fold.
NODATA_FLOOR = -9000.0
# Room around the state's outline, so every polygon sits wholly inside the
# window that is read and none is clipped at its edge.
WINDOW_MARGIN_DEG = 0.25
# The two most recent months may simply not be published yet: the final
# product lands around the third week of the following month.
UNPUBLISHED_ALLOWANCE = 2
GDAL_HTTP = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".cog,.tif",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "2",
    "GDAL_HTTP_TIMEOUT": "120",
}


def month_urls(year, month):
    """The cloud-optimised copy first, the plain GeoTIFF as the fallback."""
    name = f"chirps-v3.0.{year}.{month:02d}"
    return f"{BASE}/cogs/{name}.cog", f"{BASE}/tifs/{name}.tif"


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


def state_bounds(shapes, margin=WINDOW_MARGIN_DEG):
    """West, south, east, north of every mandal polygon, widened by a margin."""
    boxes = [shape(geom).bounds for *_, geom in shapes]
    return (min(box[0] for box in boxes) - margin, min(box[1] for box in boxes) - margin,
            max(box[2] for box in boxes) + margin, max(box[3] for box in boxes) + margin)


def read_window(path, bounds):
    """The state's window of one raster, as an in-memory dataset on the source grid.

    The window keeps the source's own cell alignment, so a polygon selects
    exactly the cells it would have selected from the full global raster.
    """
    with rasterio.open(path) as source:
        window = from_bounds(*bounds, transform=source.transform).round_offsets().round_lengths()
        data = source.read(1, window=window)
        profile = {"driver": "GTiff", "height": data.shape[0], "width": data.shape[1], "count": 1,
                   "dtype": data.dtype, "crs": source.crs, "nodata": source.nodata,
                   "transform": source.window_transform(window)}
    memory = MemoryFile()
    with memory.open(**profile) as target:
        target.write(data, 1)
    return memory


def fetch_month(year, month, bounds, context, workdir):
    cog, tif = month_urls(year, month)
    try:
        with rasterio.Env(**GDAL_HTTP):
            return read_window("/vsicurl/" + cog, bounds)
    except Exception as error:  # range read refused or unavailable; try the whole file
        first = error
    target = os.path.join(workdir, "month.tif")
    request = urllib.request.Request(tif, headers={"User-Agent": "ap-groundwater-fusion"})
    try:
        with urllib.request.urlopen(request, timeout=180, context=context) as response, \
                open(target, "wb") as handle:
            shutil.copyfileobj(response, handle)
    except Exception as error:
        raise RuntimeError(f"{str(first)[:40]} / {str(error)[:40]}") from error
    return read_window(target, bounds)


def history_paths():
    """Both halves of the record, oldest first; the archive may not exist."""
    return [path for path in (ARCHIVE, OUT) if os.path.exists(path)]


def history_manifest():
    """Which product built the stored history; empty for a history that predates the manifest."""
    try:
        with open(MANIFEST) as handle:
            manifest = json.load(handle)
        return manifest if isinstance(manifest, dict) else {}
    except (OSError, ValueError):
        return {}


def history_product():
    """The stored history's product. One built before the manifest existed was v2."""
    if not history_paths():
        return None
    return history_manifest().get("product") or "CHIRPS v2.0"


def read_rows(path):
    if not os.path.exists(path):
        return []
    with open(path) as handle:
        return list(csv.DictReader(handle))


def last_complete_month(today=None):
    today = today or datetime.datetime.now(datetime.timezone.utc).date()
    return (today.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")


def months_between(start_year, end_year, end_month):
    for year in range(start_year, end_year + 1):
        for month in range(1, (end_month if year == end_year else 12) + 1):
            yield year, month


def blocking_gaps(missing, end_year, end_month):
    """Missing months a rebuild cannot publish around: all but the newest, unpublished ones."""
    recent = set()
    year, month = end_year, end_month
    for _ in range(UNPUBLISHED_ALLOWANCE):
        recent.add((year, month))
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return [entry for entry in missing if (entry[0], entry[1]) not in recent]


def write_manifest(rows, rebuilt_at):
    """Deterministic between runs that add nothing, so an idle week commits nothing."""
    months = sorted({row["date"] for row in rows})
    prior = history_manifest()
    manifest = {
        "product": PRODUCT,
        "source": BASE,
        "resolutionDeg": 0.05,
        "reduction": ("mean of the 0.05-degree cells whose centres fall inside the mandal polygon; "
                      "the cells it touches, for a polygon too small to contain a centre"),
        "firstMonth": months[0] if months else None,
        "lastMonth": months[-1] if months else None,
        "months": len(months),
        "rebuiltAt": rebuilt_at or prior.get("rebuiltAt"),
    }
    with open(MANIFEST, "w") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--start-year", type=int, default=None,
                        help=f"first year to fetch (default 2014; {FIRST_YEAR} with --rebuild)")
    parser.add_argument("--end", default=None, help="last month as YYYY-MM")
    parser.add_argument("--rebuild", action="store_true",
                        help="re-fetch every month of both halves of the record")
    args = parser.parse_args()
    start_year = args.start_year or (FIRST_YEAR if args.rebuild else 2014)
    if args.rebuild and start_year > FIRST_YEAR:
        parser.error(f"--rebuild must start at {FIRST_YEAR}: a partial rebuild would leave the "
                     f"archive before {ARCHIVE_BEFORE} on the old product")
    stored = history_product()
    if not args.rebuild and stored and stored != PRODUCT:
        print(f"  The stored history was built from {stored}. Appending {PRODUCT} months to it "
              f"would splice two products into one record; run with --rebuild instead.")
        return 1

    shapes = mandal_shapes()
    bounds = state_bounds(shapes)
    print(f"  {len(shapes)} mandal polygons; {PRODUCT} window "
          f"{bounds[0]:.2f}..{bounds[2]:.2f} E, {bounds[1]:.2f}..{bounds[3]:.2f} N")

    end_year, end_month = (int(part) for part in (args.end or last_complete_month()).split("-"))
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
        for year, month in months_between(start_year, end_year, end_month):
            if f"{year}-{month:02d}" in have:
                continue
            try:
                memory = fetch_month(year, month, bounds, context, workdir)
            except Exception as error:
                missing.append((year, month, str(error)[:80]))
                continue
            with memory, memory.open() as dataset:
                for index, district, mandal, geom in shapes:
                    value = zonal_mean(dataset, geom)
                    if value is not None:
                        rows.append({"boundary_index": index, "district": district,
                                     "mandal": mandal, "date": f"{year}-{month:02d}",
                                     "rain_mm": round(value, 2)})
            print(f"  {year}-{month:02d}  {len(rows):>7,} rows", flush=True)

    if args.rebuild:
        gaps = blocking_gaps(missing, end_year, end_month)
        if gaps:
            print(f"  Refusing to publish a rebuild with {len(gaps)} months missing "
                  f"(first: {gaps[:3]}); the stored history is untouched.")
            return 1
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
    # weekly run leaves that file untouched and commits nothing for it. A rebuild
    # always rewrites it: the same row count can carry a different product.
    if archive and (args.rebuild or len(archive) != len(read_rows(ARCHIVE))):
        write(ARCHIVE, archive)
        print(f"  wrote {len(archive):,} rows -> data/{os.path.basename(ARCHIVE)}")
    write(OUT, current)
    rebuilt_at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds") if args.rebuild else None
    write_manifest(rows, rebuilt_at)
    print(f"\n  wrote {len(current):,} rows -> data/mandal_rain_history_chirps.csv"
          f" ({len(rows):,} with the archive) from {PRODUCT}")
    if missing:
        print(f"  {len(missing)} months unavailable: {missing[:4]}")
        return 1 if len(missing) > 6 else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
