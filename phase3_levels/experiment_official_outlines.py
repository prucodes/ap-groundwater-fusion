"""Would the forecast be better on the State's official mandal outlines?

The model's inputs touch the boundaries in two places: each mandal's centre
(lat, lon) and its rainfall, CHIRPS averaged over the polygon. This re-runs
both on the outlines the maps now draw (app/data/ap_map_display.json: official
where rebuilt within tolerance, prototype elsewhere) and on the prototype
outlines, over the same cached CHIRPS rasters, then scores both with the
release gate's rolling origin and the long backtest. Same rows, same model,
only the outlines differ.

Steps (each cached, so re-runs are cheap):
  1. fetch the AP window of every CHIRPS v3 month into data/raw/chirps/ap_window/
  2. average each month over every outline in both sets (all parts of a split mandal)
  3. rebuild the feature frame twice and score it

Writes reports/official_outlines_experiment.json. Research only.
"""
import datetime
import json
import os
import sys
import tempfile

import numpy as np
import pandas as pd
import rasterio
from shapely.geometry import MultiPolygon, Polygon, mapping

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_chirps_history as chirps  # noqa: E402
from fetch_nasa_power_rainfall import _tls_context  # noqa: E402

ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, "data", "raw", "chirps", "ap_window")
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(ROOT, "reports", "official_outlines_experiment.json")
FIRST, LAST = (2014, 1), (2026, 8)


def months():
    year, month = FIRST
    while (year, month) <= LAST:
        yield year, month
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)


def shapes(path):
    """(index, geometry) for every boundary, every part of a split mandal kept."""
    out = []
    for index, feature in enumerate(json.load(open(path))["mandals"]):
        parts = [Polygon(ring) for ring in feature.get("rings", []) if len(ring) >= 4]
        parts = [p if p.is_valid else p.buffer(0) for p in parts]
        if parts:
            geometry = parts[0] if len(parts) == 1 else MultiPolygon([q for p in parts for q in getattr(p, "geoms", [p])])
            out.append((index, mapping(geometry)))
    return out


def fetch_stack():
    os.makedirs(CACHE, exist_ok=True)
    bounds = chirps.state_bounds([(i, None, None, g) for i, g in shapes(os.path.join(APP, "ap_map_display.json"))])
    context = _tls_context()
    missing = [(y, m) for y, m in months() if not os.path.exists(os.path.join(CACHE, f"{y}-{m:02d}.tif"))]
    print(f"  CHIRPS AP window: {len(missing)} months to fetch into {os.path.relpath(CACHE, ROOT)}")
    with tempfile.TemporaryDirectory() as workdir:
        for y, m in missing:
            memory = chirps.fetch_month(y, m, bounds, context, workdir)
            with memory.open() as dataset:
                profile = dataset.profile
                data = dataset.read(1)
            with rasterio.open(os.path.join(CACHE, f"{y}-{m:02d}.tif"), "w", **profile) as target:
                target.write(data, 1)
            print(f"    {y}-{m:02d}")


def zonal_table(path):
    rows = []
    geoms = shapes(path)
    for y, m in months():
        with rasterio.open(os.path.join(CACHE, f"{y}-{m:02d}.tif")) as dataset:
            for index, geom in geoms:
                value = chirps.zonal_mean(dataset, geom)
                if value is not None:
                    rows.append((index, f"{y}-{m:02d}", round(value, 2)))
    return pd.DataFrame(rows, columns=["boundary_index", "date", "rain_mm"])


def centroids(path):
    import build_levels_engine as engine
    return {i: engine.centroid(f) for i, f in enumerate(json.load(open(path))["mandals"])}


def with_outlines(df, table, geometry_path):
    """The feature frame with rain and centre taken from one set of outlines.
    Rows without a boundary of their own keep their district fallback, so both
    variants differ only where an outline does."""
    import build_levels_engine as engine
    out = df.copy()
    rain = table.set_index(["boundary_index", "date"]).rain_mm
    has = out.boundary_index.notna()
    keys = pd.MultiIndex.from_arrays([out.boundary_index.fillna(-1).astype(int), out.date])
    fresh = pd.Series(rain.reindex(keys).to_numpy(), index=out.index)
    out.loc[has & fresh.notna(), "rain_mm"] = fresh[has & fresh.notna()]
    out["rain_1m"] = out.rain_mm
    periods = pd.PeriodIndex(out.date, freq="M")
    lookup = out.set_index(["mkey", "date"]).rain_mm
    shifted = [pd.Series(lookup.reindex(pd.MultiIndex.from_arrays([out.mkey, (periods - k).astype(str)])).to_numpy(),
                         index=out.index) for k in range(12)]
    out["rain_3m"] = pd.concat(shifted[:3], axis=1).sum(axis=1, min_count=3)
    out["rain_12m"] = pd.concat(shifted, axis=1).sum(axis=1, min_count=12)
    points = centroids(geometry_path)
    lat = out.boundary_index.map(lambda i: points.get(int(i))[0] if pd.notna(i) and points.get(int(i)) else np.nan)
    lon = out.boundary_index.map(lambda i: points.get(int(i))[1] if pd.notna(i) and points.get(int(i)) else np.nan)
    out.loc[lat.notna(), "lat"] = lat[lat.notna()]
    out.loc[lon.notna(), "lon"] = lon[lon.notna()]
    return out


def rolling(frame, start, step=3):
    """The release gate's rolling origin from `start`; per-row absolute errors."""
    from build_levels_engine import reset_mandal_base
    from train_multihorizon import CAT, NUM, est
    months = sorted(frame.target_date.unique())
    cuts = [m for m in months if m >= start][::step]
    parts = []
    for index, cut in enumerate(cuts):
        stop = cuts[index + 1] if index + 1 < len(cuts) else None
        train = frame[frame.target_date < cut]
        test = frame[(frame.target_date >= cut) & ((frame.target_date < stop) if stop else True)]
        if len(test) < 200 or train.empty:
            continue
        train, test = reset_mandal_base(train, test)
        model = est().fit(train[NUM + CAT], train.target.to_numpy())
        parts.append(pd.DataFrame({"mkey": test.mkey.to_numpy(), "target_date": test.target_date.to_numpy(),
                                   "boundary_index": test.boundary_index.to_numpy(),
                                   "aquifer": test.aquifer_type.to_numpy(),
                                   "error": np.abs(model.predict(test[NUM + CAT]) - test.target.to_numpy()),
                                   "noChange": np.abs(test.cur.to_numpy() - test.target.to_numpy())}))
    return pd.concat(parts, ignore_index=True)


def score():
    from build_levels_engine import build_frame
    from train_multihorizon import make_horizon
    base = build_frame()
    display = json.load(open(os.path.join(APP, "ap_map_display.json")))["mandals"]
    verdict = {i: m.get("verdict") if m.get("src") == "official" else "prototype kept" for i, m in enumerate(display)}
    variants = {
        "published": base,
        "prototypeAllParts": with_outlines(base, pd.read_csv(os.path.join(CACHE, "zonal_prototype.csv")),
                                           os.path.join(APP, "ap_map_geometry.json")),
        "official": with_outlines(base, pd.read_csv(os.path.join(CACHE, "zonal_official.csv")),
                                  os.path.join(APP, "ap_map_display.json")),
    }
    result = {}
    for scope, start in (("gate2024on", "2024-01"), ("long2018on", "2018-01")):
        rows = {name: rolling(make_horizon(frame, 3), start) for name, frame in variants.items()}
        block = {}
        for name, table in rows.items():
            entry = {"rows": int(len(table)), "maeM": round(float(table.error.mean()), 4),
                     "noChangeMaeM": round(float(table.noChange.mean()), 4)}
            groups = table.boundary_index.map(lambda i: verdict.get(int(i), "no boundary") if pd.notna(i) else "no boundary")
            entry["byOutlineVerdict"] = {k: {"rows": int((groups == k).sum()), "maeM": round(float(table.error[groups == k].mean()), 4)}
                                         for k in sorted(groups.unique())}
            entry["byAquifer"] = {k: round(float(table.error[table.aquifer == k].mean()), 4) for k in sorted(table.aquifer.unique())}
            block[name] = entry
        result[scope] = block
        print(f"  {scope}: " + ", ".join(f"{n} {b['maeM']:.4f}" for n, b in block.items()))
    return result


def main():
    fetch_stack()
    tables = {}
    for name, file in (("prototype", "ap_map_geometry.json"), ("official", "ap_map_display.json")):
        cached = os.path.join(CACHE, f"zonal_{name}.csv")
        if not os.path.exists(cached):
            zonal_table(os.path.join(APP, file)).to_csv(cached, index=False)
        tables[name] = pd.read_csv(cached)
        print(f"  {name}: {len(tables[name])} mandal-months")
    published = pd.read_csv(os.path.join(HERE, "data", "mandal_rain_history_chirps.csv"))
    check = published.merge(tables["prototype"], on=["boundary_index", "date"], suffixes=("_published", "_here"))
    diff = (check.rain_mm_published - check.rain_mm_here).abs()
    print(f"  reproduces the published history: median |diff| {diff.median():.3f} mm, "
          f"{(diff > 1).mean():.2%} of rows differ by more than 1 mm (split mandals now count every part)")
    if "--score" in sys.argv[1:]:
        result = {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                  "reproduction": {"medianAbsDiffMm": round(float(diff.median()), 4),
                                   "shareOver1Mm": round(float((diff > 1).mean()), 4)},
                  **score()}
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w") as handle:
            json.dump(result, handle, indent=1)
            handle.write("\n")


if __name__ == "__main__":
    main()
