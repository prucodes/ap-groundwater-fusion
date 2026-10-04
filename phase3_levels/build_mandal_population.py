"""How many people live in each mandal: WorldPop's 2020 population grid summed over the mandal outlines.

The summer outlook names mandals whose water table may pass its record; the
question that follows is how many people live there. The Census of 2011 is
the official count but is fifteen years old and not published by today's
mandal outlines. WorldPop (University of Southampton, CC BY 4.0) spreads the
UN-adjusted national estimate for 2020 over a 1 km grid using settlement and
land-cover data; summed over each outline it gives a consistent, open
estimate for every mandal. It is a modelled estimate, not a head count.

The 1 km cells are split into 16 equal parts (250 m) before they are counted
by mandal, so a small mandal is not lost between cell centres.

Static: run by hand. The grid (18 MB) is downloaded once into
data/private/worldpop/ (git-ignored). Output, committed:
phase3_levels/data/mandal_population.json, one count per boundary.
"""
import datetime
import json
import os
import sys
import urllib.request

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import from_bounds

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_chirps_history import mandal_shapes  # noqa: E402
from fetch_field_signals import geometry  # noqa: E402
from fetch_nasa_power_rainfall import _tls_context  # noqa: E402

ROOT = os.path.join(HERE, "..")
URL = "https://data.worldpop.org/GIS/Population/Global_2000_2020_1km_UNadj/2020/IND/ind_ppp_2020_1km_Aggregated_UNadj.tif"
LOCAL = os.path.join(ROOT, "data", "private", "worldpop", "ind_ppp_2020_1km_Aggregated_UNadj.tif")
OUT = os.path.join(HERE, "data", "mandal_population.json")
SPLIT = 4          # each 1 km cell into 4 x 4 parts of about 250 m
AP_BOUNDS = (76.5, 12.4, 85.0, 20.0)


def grid():
    if not os.path.exists(LOCAL):
        os.makedirs(os.path.dirname(LOCAL), exist_ok=True)
        with urllib.request.urlopen(URL, timeout=300, context=_tls_context()) as answer, open(LOCAL + ".part", "wb") as out:
            out.write(answer.read())
        os.replace(LOCAL + ".part", LOCAL)
    with rasterio.open(LOCAL) as source:
        window = from_bounds(*AP_BOUNDS, source.transform).round_offsets().round_lengths()
        data = source.read(1, window=window).astype("float64")
        transform = source.window_transform(window)
        nodata = source.nodata
    data[(data == nodata) | ~np.isfinite(data) | (data < 0)] = 0.0
    fine = np.repeat(np.repeat(data / (SPLIT * SPLIT), SPLIT, axis=0), SPLIT, axis=1)
    return fine, transform * rasterio.Affine.scale(1 / SPLIT, 1 / SPLIT), float(data.sum())


def main():
    fine, transform, window_total = grid()
    shapes = mandal_shapes()
    count = len(geometry())
    labels = rasterize(((geom, index) for index, _, _, geom in shapes), out_shape=fine.shape, transform=transform, fill=-1, dtype="int32")
    inside = labels >= 0
    people = np.bincount(labels[inside], weights=fine[inside], minlength=count)
    values = [int(round(p)) if p > 0 else None for p in people]
    state = int(round(people.sum()))
    payload = {
        "source": "WorldPop (University of Southampton) 2020 population counts, 1 km, UN-adjusted, India; summed over each mandal outline at 250 m",
        "url": "https://hub.worldpop.org/geodata/summary?id=31559", "doi": "10.5258/SOTON/WP00671", "licence": "CC BY 4.0",
        "year": 2020, "caveat": "A modelled estimate that spreads the national total over settlements, not a census count; mandal totals include towns.",
        "builtAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "statePeople": state, "people": values,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"Wrote {OUT}: {state:,} people in {sum(v is not None for v in values)} mandals (window total {window_total:,.0f})")


if __name__ == "__main__":
    main()
