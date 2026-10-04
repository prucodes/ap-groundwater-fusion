"""How much water each mandal's soil can hold for a crop, by depth, from ISRIC SoilGrids 2.0.

SoilGrids maps the volumetric water content of the soil at field capacity
(33 kPa, `wv0033`) and at the permanent wilting point (1500 kPa, `wv1500`) for
six depth intervals, at 250 m. The difference is the water a crop can draw from
each metre of soil: FAO-56's total available water per metre (Chapter 8,
Eq. 82). SoilGrids' mapped unit, 10^-3 cm3/cm3, is also mm of water per metre
of soil, so no conversion is needed.

These are predictions from soil profiles and covariates, not measurements in
each mandal: SoilGrids' own uncertainty layers are wide in places. They are used
for one thing only: turning the APWRIMS soil-moisture percentages (which are
already "% of what the soil can hold") into millimetres, so the crop water check
can step depletion forward day by day.

Soil does not change from week to week, so this runs by hand and its output is
committed: phase3_levels/data/mandal_soil_water_capacity.json, one row per
mandal in ap_map_geometry.json order. Read by fetch_field_signals.py.
"""
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.io import MemoryFile
from rasterio.transform import rowcol
from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_chirps_history import mandal_shapes  # same mandal polygons as the rainfall record
from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation

OUT = os.path.join(HERE, "data", "mandal_soil_water_capacity.json")
WCS = "https://maps.isric.org/mapserv"
DEPTHS = ("0-5cm", "5-15cm", "15-30cm", "30-60cm", "60-100cm", "100-200cm")
DEPTHS_CM = ((0, 5), (5, 15), (15, 30), (30, 60), (60, 100), (100, 200))
BOUNDS = (76.6, 12.5, 85.0, 19.95)   # west, south, east, north: the state with a margin
CELL_DEG = 0.01                       # about 1 km: some 200 cells per mandal
# Below this, a cell is water, rock or no data, not soil that holds water.
MIN_CONTENT = 1


def coverage(prop, depth, context):
    """One SoilGrids layer over the state on a regular 0.01 degree grid, in memory."""
    width = round((BOUNDS[2] - BOUNDS[0]) / CELL_DEG)
    height = round((BOUNDS[3] - BOUNDS[1]) / CELL_DEG)
    query = [("map", f"/map/{prop}.map"), ("SERVICE", "WCS"), ("VERSION", "2.0.1"), ("REQUEST", "GetCoverage"),
             ("COVERAGEID", f"{prop}_{depth}_mean"), ("FORMAT", "image/tiff"),
             ("SUBSET", f"long({BOUNDS[0]},{BOUNDS[2]})"), ("SUBSET", f"lat({BOUNDS[1]},{BOUNDS[3]})"),
             ("SUBSETTINGCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"),
             ("OUTPUTCRS", "http://www.opengis.net/def/crs/EPSG/0/4326"),
             ("SCALESIZE", f"long({width}),lat({height})")]
    url = WCS + "?" + urllib.parse.urlencode(query)
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=300, context=context) as response:
                body = response.read()
            if not body.startswith((b"II*\x00", b"MM\x00*")):
                raise ValueError(f"{prop} {depth}: not a GeoTIFF: {body[:120]!r}")
            memory = MemoryFile(body)
            with memory.open() as dataset:
                data = dataset.read(1).astype("float64")
                transform = dataset.transform
            return data, transform
        except Exception as error:  # noqa: BLE001 - retried, then raised
            if attempt == 3:
                raise
            print(f"  {prop} {depth}: {error}; retrying", flush=True)
            time.sleep(10 * (attempt + 1))


def labels_for(shapes, data_shape, transform):
    """Each cell's mandal index by cell centre; tiny mandals take the cell under a point inside them."""
    labels = rasterize(((geom, index) for index, _, _, geom in shapes), out_shape=data_shape,
                       transform=transform, fill=-1, dtype="int32")
    present = set(np.unique(labels).tolist())
    extra = {}
    for index, _, _, geom in shapes:
        if index not in present:
            point = shape(geom).representative_point()
            row, col = rowcol(transform, point.x, point.y)
            if 0 <= row < data_shape[0] and 0 <= col < data_shape[1]:
                extra[index] = (row, col)
    return labels, extra


def zonal(data, labels, extra, count):
    valid = (labels >= 0) & np.isfinite(data) & (data >= MIN_CONTENT)
    sums = np.bincount(labels[valid], weights=data[valid], minlength=count)
    cells = np.bincount(labels[valid], minlength=count)
    out = [float(sums[i] / cells[i]) if cells[i] else None for i in range(count)]
    for index, (row, col) in extra.items():
        value = data[row, col]
        out[index] = float(value) if np.isfinite(value) and value >= MIN_CONTENT else None
    return out


def main():
    context = _tls_context()
    shapes = mandal_shapes()
    count = len(json.load(open(os.path.join(HERE, "..", "app", "data", "ap_map_geometry.json")))["mandals"])
    labels = extra = None
    layers = {}
    for prop in ("wv0033", "wv1500"):
        for depth in DEPTHS:
            print(f"SoilGrids {prop} {depth}", flush=True)
            data, transform = coverage(prop, depth, context)
            if labels is None:
                labels, extra = labels_for(shapes, data.shape, transform)
            layers[(prop, depth)] = zonal(data, labels, extra, count)
            time.sleep(2)
    rows = []
    for index in range(count):
        row = []
        for depth in DEPTHS:
            fc, wp = layers[("wv0033", depth)][index], layers[("wv1500", depth)][index]
            row.append(None if fc is None or wp is None else round(max(0.0, fc - wp), 1))
        rows.append(row if all(value is not None for value in row) else None)
    known = [row for row in rows if row]
    payload = {
        "source": "ISRIC SoilGrids 2.0: volumetric water content at 33 kPa (wv0033) and 1500 kPa (wv1500), mean predictions, 250 m",
        "url": "https://soilgrids.org",
        "licence": "CC BY 4.0",
        "method": "Per depth interval: water at field capacity minus water at the wilting point (FAO-56 Eq. 82), averaged over the cells whose centre lies in the mandal, on a 0.01 degree grid.",
        "unit": "mm of plant-available water per metre of soil",
        "depthsCm": [list(pair) for pair in DEPTHS_CM],
        "builtAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "mandals": len(known),
        "of": count,
        "medianTopMetre": round(float(np.median([sum(r[i] * (b - a) for i, (a, b) in enumerate(DEPTHS_CM[:5])) / 100 for r in known])), 1),
        "values": rows,
    }
    # One mandal per line: compact, and a rebuild diffs row by row.
    head = json.dumps({k: v for k, v in payload.items() if k != "values"}, indent=1)
    with open(OUT, "w") as handle:
        handle.write(head[:-2] + ',\n "values": [\n' + ",\n".join(json.dumps(r) for r in rows) + "\n ]\n}\n")
    print(f"Wrote {OUT}: {len(known)} of {count} mandals; median plant-available water in the top metre "
          f"{payload['medianTopMetre']} mm")


if __name__ == "__main__":
    main()
