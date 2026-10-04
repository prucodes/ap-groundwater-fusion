"""How much of each mandal's cropland is irrigated: ESA WorldCereal 2021 on the 4 km vegetation grid.

The crop water check is a rainfed water balance: rain and the water stored in
the soil against what the crop uses. Where a canal or a bore well waters the
field it says little, and the satellite vegetation over that field stays green
whatever the soil model says. So the check, and its track record, should be
read over rainfed cropland.

ESA WorldCereal maps actively irrigated cropland at 10 m from Sentinel-1 and
Sentinel-2 (2021 release, v1.0.0, CC BY 4.0). Over Andhra Pradesh its season
(tc-maize-main) runs from about October 2020 to May 2021, the rabi season.
Land irrigated in rabi has a canal or a well; most rabi-irrigated land is
irrigated in kharif too. Land not irrigated in rabi is rainfed or left fallow.
This is one season's satellite detection, not the irrigation census, and it
cannot say which crop is grown: WorldCereal's crop-type layers cover only
maize and cereals, not groundnut, cotton, chilli or the pulses.

The product is published as one global zip per layer (about 17 GB). The three
agro-ecological zones that cover the State (AEZ 28107, 28122 and 11047) are
taken out of it by range requests (remote_zip.py), about 900 MB, into
data/private/worldcereal/ (git-ignored), then read at the 8x overview (about
75 m) and counted per NOAA VHP 4 km cell: the same grid as
vhp_cropland_fraction.json, so the two combine cell by cell.

- irrigated: % of the cell (sea and no-data excluded) mapped irrigated;
- rainfed cropland weight = WorldCover cropland share less the irrigated share,
  never below zero: what the vegetation index is weighted to for the rainfed
  reading;
- per mandal: the irrigated share of its cropland, the cells counted by centre
  as the vegetation index is.

Static: run by hand when WorldCereal publishes a new release. Outputs,
committed: phase3_levels/data/vhp_irrigated_fraction.json (grid) and
phase3_levels/data/mandal_irrigated_share.json (per boundary).
"""
import datetime
import glob
import json
import os
import shutil
import sys
import zipfile

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import remote_zip  # noqa: E402
from fetch_chirps_history import mandal_shapes  # noqa: E402
from fetch_field_signals import cell_labels, cropland_grid, geometry  # noqa: E402

ROOT = os.path.join(HERE, "..")
CACHE = os.path.join(ROOT, "data", "private", "worldcereal")
GRID_OUT = os.path.join(HERE, "data", "vhp_irrigated_fraction.json")
MANDAL_OUT = os.path.join(HERE, "data", "mandal_irrigated_share.json")
ZIP_URL = "https://zenodo.org/records/7875105/files/WorldCereal_2021_tc-maize-main_irrigation_classification.zip?download=1"
ZONES = ("28107", "28122", "11047")
IRRIGATED, RAINFED, NO_CROP, NODATA = 100, 0, 254, 255
OVERVIEW = 8               # about 75 m: some 2,300 samples per 4 km cell
MOSTLY_RAINFED = 50.0      # % of cropland irrigated below which a mandal is read as rainfed


def zone_file(zone):
    """The zone's GeoTIFF, taken out of the global zip on first use."""
    found = glob.glob(os.path.join(CACHE, f"{zone}_tc-maize-main_irrigation_*_classification.tif"))
    if found:
        return found[0]
    remote_zip.CHUNK = 8 << 20
    archive = zipfile.ZipFile(remote_zip.RemoteFile(ZIP_URL))
    info = next(i for i in archive.infolist() if i.filename.rsplit("/", 1)[-1].startswith(f"{zone}_"))
    os.makedirs(CACHE, exist_ok=True)
    out = os.path.join(CACHE, info.filename.rsplit("/", 1)[-1])
    with archive.open(info) as source, open(out + ".part", "wb") as target:
        shutil.copyfileobj(source, target, 8 << 20)
    os.replace(out + ".part", out)
    return out


def counts_on_grid(path, grid_shape, grid_transform, strip=6):
    """(irrigated, valid) sample counts per VHP cell from one zone's raster, a strip of grid rows at a time."""
    rows, cols = grid_shape
    west, north = grid_transform.c, grid_transform.f
    east = west + cols * grid_transform.a
    irrigated = np.zeros(rows * cols)
    total = np.zeros(rows * cols)
    with rasterio.open(path) as source:
        tags = source.tags()
        left, bottom, right, top = source.bounds
        for first in range(0, rows, strip):
            last = min(rows, first + strip)
            strip_north = north + first * grid_transform.e
            strip_south = north + last * grid_transform.e
            if strip_south >= top or strip_north <= bottom:
                continue
            window = from_bounds(west, strip_south, east, strip_north, source.transform)
            height = max(1, int(round(window.height / OVERVIEW)))
            width = max(1, int(round(window.width / OVERVIEW)))
            data = source.read(1, window=window, out_shape=(height, width), boundless=True, fill_value=NODATA,
                               resampling=Resampling.nearest)
            # Sample centres in degrees, then the VHP cell each falls in.
            lon = west + (np.arange(width) + 0.5) * (east - west) / width
            lat = strip_north - (np.arange(height) + 0.5) * (strip_north - strip_south) / height
            col = np.clip(((lon - west) / grid_transform.a).astype(int), 0, cols - 1)
            row = np.clip(((north - lat) / -grid_transform.e).astype(int), first, last - 1)
            cell = (row[:, None] * cols + col[None, :]).ravel()
            flat = data.ravel()
            valid = np.isin(flat, (IRRIGATED, RAINFED, NO_CROP))
            irrigated += np.bincount(cell[flat == IRRIGATED], minlength=rows * cols)
            total += np.bincount(cell[valid], minlength=rows * cols)
    return irrigated.reshape(rows, cols), total.reshape(rows, cols), tags


def main():
    payload, crop = cropland_grid()
    grid = payload["grid"]
    rows, cols = grid["shape"]
    transform = rasterio.Affine(*grid["transform"][:6])
    irrigated = np.zeros((rows, cols))
    total = np.zeros((rows, cols))
    seasons = []
    for zone in ZONES:
        path = zone_file(zone)
        zone_irrigated, zone_total, tags = counts_on_grid(path, (rows, cols), transform)
        irrigated += zone_irrigated
        total += zone_total
        seasons.append({"zone": zone, "start": tags.get("start_date"), "end": tags.get("end_date"), "version": tags.get("product_version")})
        print(f"AEZ {zone}: {int(zone_total.sum()):,} samples, {int(zone_irrigated.sum()):,} irrigated ({tags.get('start_date')} to {tags.get('end_date')})", flush=True)
    irr = np.where(total > 0, irrigated / np.maximum(total, 1), np.nan)
    land = np.array(payload["share"]) >= 0
    # Never more irrigated than there is cropland: the two maps disagree at the edges.
    irr_crop = np.where(land & np.isfinite(irr), np.minimum(irr, crop), 0.0)
    rainfed = np.where(land, np.maximum(crop - irr_crop, 0.0), 0.0)
    pct = lambda grid_values, mask: [[int(round(100 * v)) if m else -1 for v, m in zip(r, mr)] for r, mr in zip(grid_values, mask)]  # noqa: E731
    built = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    source = {
        "source": "ESA WorldCereal 10 m 2021 v1.0.0, irrigation layer of the tc-maize-main season (rabi 2020-21 over Andhra Pradesh), read at about 75 m and counted per NOAA VHP 4 km cell",
        "url": "https://esa-worldcereal.org", "doi": "10.5281/zenodo.7875105", "licence": "CC BY 4.0",
        "caveat": "One rabi season's satellite detection of active irrigation, not the irrigation census; it cannot say which crop is grown.",
        "seasons": seasons,
    }
    json.dump({**source, "grid": grid, "unit": "% of the cell mapped irrigated (rainfed: WorldCover cropland share less that, never below zero); -1 where the cell has no land",
               "builtAt": built, "irrigated": pct(irr_crop, land), "rainfed": pct(rainfed, land)},
              open(GRID_OUT, "w"), separators=(",", ":"))
    with open(GRID_OUT, "a") as handle:
        handle.write("\n")

    count = len(geometry())
    labels, extra = cell_labels(mandal_shapes(), (rows, cols), transform)
    inside = labels >= 0
    crop_sum = np.bincount(labels[inside], weights=crop[inside], minlength=count)
    irr_sum = np.bincount(labels[inside], weights=irr_crop[inside], minlength=count)
    shares = []
    for i in range(count):
        if i in extra:
            r, c = extra[i]
            c_sum, i_sum = crop[r, c], irr_crop[r, c]
        else:
            c_sum, i_sum = crop_sum[i], irr_sum[i]
        shares.append(round(float(100 * i_sum / c_sum), 1) if c_sum > 0.05 else None)
    known = [s for s in shares if s is not None]
    state = float(100 * irr_crop[land].sum() / crop[land].sum())
    summary = {"mandals": len(known), "mostlyRainfed": sum(s < MOSTLY_RAINFED for s in known),
               "mostlyIrrigated": sum(s >= MOSTLY_RAINFED for s in known), "stateIrrigatedPct": round(state, 1)}
    json.dump({**source, "builtAt": built, "mostlyRainfedBelowPct": MOSTLY_RAINFED,
               "unit": "% of the mandal's cropland (ESA WorldCover 2021) mapped irrigated in rabi 2020-21; null where it has almost no cropland",
               "summary": summary, "share": shares}, open(MANDAL_OUT, "w"), separators=(",", ":"))
    with open(MANDAL_OUT, "a") as handle:
        handle.write("\n")
    print(f"Wrote {GRID_OUT} and {MANDAL_OUT}: {summary}")


if __name__ == "__main__":
    main()
