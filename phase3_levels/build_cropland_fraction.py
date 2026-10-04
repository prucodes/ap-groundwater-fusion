"""The cropland share of every 4 km NOAA vegetation-health cell over Andhra Pradesh.

NOAA STAR's Vegetation Health Product (the VCI that Drought Watch reads) is a
4 km grid over all vegetation: forest on the Eastern Ghats counts as much as a
groundnut field. The drought manual itself notes the index should be read over
agricultural areas. ESA WorldCover 2021 maps land cover at 10 m; its class 40 is
cropland. Reading each WorldCover tile at a coarse overview (about 330 m) and
counting cropland pixels inside each 4 km cell gives every cell a cropland
share, so a mandal's vegetation index can be weighted towards its fields.

WorldCover is a 2021 snapshot, and "cropland" there means annual cropland
visible in 2021 imagery, not this season's sowing. Plantations and orchards
are tree cover, not cropland.

Static: run by hand when WorldCover is updated. Output, committed:
phase3_levels/data/vhp_cropland_fraction.json, the VHP grid window used by
build_drought_watch.py (same bounds, same cells) with one row of percentages
per grid row.
"""
import datetime
import json
import os
import sys

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import Affine

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_drought_watch import AP_BOUNDS, vhp_available, vhp_window  # the same 4 km window Drought Watch reads

OUT = os.path.join(HERE, "data", "vhp_cropland_fraction.json")
TILE_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{name}_Map.tif"
CROPLAND = 40
NODATA = 0
WATER = 80   # permanent water, including the sea: not land, so not in the denominator
SAMPLE_PX = 900   # per 3 degree tile: about 330 m, some 140 samples per 4 km cell


def tile_names(bounds=AP_BOUNDS):
    west, south, east, north = bounds
    lats = range(int(np.floor(south / 3) * 3), int(np.ceil(north / 3) * 3), 3)
    lons = range(int(np.floor(west / 3) * 3), int(np.ceil(east / 3) * 3), 3)
    return [(f"N{lat:02d}E{lon:03d}", lat, lon) for lat in lats for lon in lons]


def read_tile(name):
    """(classes, transform) for one tile at a coarse overview, or None if the tile is all sea."""
    url = "/vsicurl/" + TILE_URL.format(name=name)
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
               GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="2")
    try:
        with rasterio.Env(**env), rasterio.open(url) as source:
            data = source.read(1, out_shape=(SAMPLE_PX, SAMPLE_PX), resampling=Resampling.nearest)
            scale = Affine.scale(source.width / SAMPLE_PX, source.height / SAMPLE_PX)
            return data, source.transform * scale
    except rasterio.errors.RasterioIOError as error:
        if "404" in str(error) or "does not exist" in str(error) or "No such file" in str(error):
            return None
        raise


def main():
    year = datetime.date.today().year
    week = vhp_available(year)[-1]
    sample, grid = vhp_window(year, week)
    height, width = sample.shape
    crop = np.zeros((height, width))
    land = np.zeros((height, width))
    for name, _, _ in tile_names():
        tile = read_tile(name)
        if tile is None:
            print(f"WorldCover {name}: no tile (sea)", flush=True)
            continue
        data, transform = tile
        rr, cc = np.indices(data.shape)
        xs = transform.c + (cc + 0.5) * transform.a
        ys = transform.f + (rr + 0.5) * transform.e
        col = np.floor((xs - grid.c) / grid.a).astype(int)
        row = np.floor((ys - grid.f) / grid.e).astype(int)
        inside = (row >= 0) & (row < height) & (col >= 0) & (col < width) & (data != NODATA) & (data != WATER)
        np.add.at(land, (row[inside], col[inside]), 1)
        np.add.at(crop, (row[inside], col[inside]), (data[inside] == CROPLAND).astype(float))
        print(f"WorldCover {name}: {inside.sum()} samples in the window, {round(100 * (data[inside] == CROPLAND).mean(), 1)}% cropland", flush=True)
    share = np.where(land > 0, np.round(100 * crop / np.maximum(land, 1)), -1).astype(int)
    payload = {
        "source": "ESA WorldCover 10 m 2021 v200, class 40 (cropland), read at about 330 m and counted per NOAA VHP 4 km cell",
        "url": "https://esa-worldcover.org",
        "licence": "CC BY 4.0",
        "caveat": "Cropland as seen in 2021 imagery, not this season's sowing; plantations and orchards count as tree cover.",
        "grid": {"bounds": list(AP_BOUNDS), "transform": [grid.a, grid.b, grid.c, grid.d, grid.e, grid.f], "shape": [height, width],
                 "from": f"VHP week {year}-{week:03d}"},
        "unit": "% of the cell's land (water excluded) that is cropland; -1 where the cell has no land",
        "builtAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    head = json.dumps(payload, indent=1)
    with open(OUT, "w") as handle:
        handle.write(head[:-2] + ',\n "share": [\n' + ",\n".join(json.dumps(r) for r in share.tolist()) + "\n ]\n}\n")
    landed = share[share >= 0]
    print(f"Wrote {OUT}: {height} x {width} cells; median cropland share of land cells {int(np.median(landed))}%")


if __name__ == "__main__":
    main()
