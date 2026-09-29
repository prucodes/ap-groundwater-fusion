"""Andhra Pradesh's temperature record, from two independent products.

Written against the finding in docs/temperature_record_findings.md. Two long
gridded records agree that the state is warming, agree that 2024 is the warmest
year in either of them, and agree that El Nino years run hotter here even once
the trend is taken out. They disagree by a factor of 2.7 on the rate.

So this publishes what they agree on and shows the disagreement rather than
hiding it: both series go on the same baseline, on the same chart, and a reader
can see the warming and the honest spread in its size at once. No rate is
published as a figure, and no projection is made -- there is no climate model
here, and the rest of the site depends on this one not starting.

Not part of the weekly refresh: 250 MB of sources that gain a month at a time.
Run it alongside build_enso_pacific.py.

    python3 phase3_levels/build_temperature_record.py
"""
import argparse
import csv
import json
import os
import ssl
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
CACHE = os.path.join("/tmp", "ap-gw-video-assets")

SOURCES = {
    "ghcn_cams": {
        "url": "https://downloads.psl.noaa.gov/Datasets/ghcncams/air.mon.mean.nc",
        "file": "ghcncams.nc",
        "label": "GHCN_CAMS",
        "note": "0.5°, land, station and reanalysis blend",
        "kind": "absolute",
    },
    "noaa_globaltemp": {
        "url": "https://downloads.psl.noaa.gov/Datasets/noaaglobaltemp/air.mon.anom.nc",
        "file": "noaaglobaltemp.nc",
        "label": "NOAAGlobalTemp",
        "note": "5°, station-based anomaly",
        "kind": "anomaly",
    },
}

# Both records cover this, and a mid-record baseline puts the early years below
# the line and the recent ones above it, which is the shape of the finding.
BASE_FROM, BASE_TO = 1961, 1990
FIRST_YEAR = 1948
EL_NINO, LA_NINA = 0.5, -0.5


def tls_context():
    if not ssl.get_default_verify_paths().cafile:
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
    return ssl.create_default_context()


def cached(spec):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, spec["file"])
    if not os.path.exists(path):
        print(f"  fetching {spec['label']}")
        request = urllib.request.Request(spec["url"], headers={"User-Agent": "ap-groundwater-fusion"})
        with urllib.request.urlopen(request, timeout=900, context=tls_context()) as response, \
                open(path, "wb") as handle:
            handle.write(response.read())
    return path


def state_outline():
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    rings = []
    for feature in geo["mandals"]:
        for ring in feature.get("rings", []):
            if len(ring) < 4:
                continue
            polygon = Polygon(ring)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            if polygon.is_valid and polygon.area > 0:
                rings.append(polygon)
    return unary_union(rings)


def annual_series(spec, outline):
    """Area-weighted annual mean over the state.

    Each cell is weighted by how much of it actually falls inside Andhra
    Pradesh. Testing cell centres instead looked reasonable and was not: at five
    degrees one cell is larger than the whole state, so the centre test found a
    single cell and the answer to "which year was warmest" flipped between 2016
    and 2024 on that choice alone. Intersection area is the same method at any
    resolution and takes the choice away.
    """
    import numpy as np
    import pandas as pd
    import xarray as xr
    from shapely.geometry import box as bbox

    path = cached(spec)
    try:
        data = xr.open_dataset(path)
    except Exception:
        # NOAAGlobalTemp carries a fill value in time_bnds that trips decoding.
        data = xr.open_dataset(path, decode_times=False)
        data = data.assign_coords(
            time=pd.to_datetime("1800-01-01") + pd.to_timedelta(data.time.values, unit="D"))

    field = data["air"]
    west, south, east, north = outline.bounds
    step = float(abs(field.lat.values[1] - field.lat.values[0]))
    pad = step * 1.5
    window = field.sel(lat=slice(north + pad, south - pad), lon=slice(west - pad, east + pad))
    if window.sizes["lat"] == 0:
        window = field.sel(lat=slice(south - pad, north + pad), lon=slice(west - pad, east + pad))

    lats, lons = window.lat.values, window.lon.values
    weights = np.zeros((len(lats), len(lons)))
    for i, latitude in enumerate(lats):
        for j, longitude in enumerate(lons):
            cell = bbox(float(longitude) - step / 2, float(latitude) - step / 2,
                        float(longitude) + step / 2, float(latitude) + step / 2)
            share = cell.intersection(outline).area
            if share > 0:
                # cos(lat) so a northern cell does not count for more ground
                # than a southern one of the same span.
                weights[i, j] = share * np.cos(np.radians(float(latitude)))
    touched = int((weights > 0).sum())

    values = window.values
    finite = np.isfinite(values)
    weights = np.where(finite[0], weights, 0)
    total = np.nansum(np.where(finite, values, 0) * weights, axis=(1, 2))
    count = np.nansum(finite * weights, axis=(1, 2))
    monthly = total / np.where(count == 0, np.nan, count)
    if spec["kind"] == "absolute":
        monthly = monthly - 273.15

    years = np.array([int(str(t)[:4]) for t in window.time.values])
    whole = [y for y in range(FIRST_YEAR, years.max() + 1)
             if (years == y).sum() == 12 and np.isfinite(monthly[years == y]).all()]
    means = {y: float(monthly[years == y].mean()) for y in whole}
    base = [means[y] for y in whole if BASE_FROM <= y <= BASE_TO]
    offset = sum(base) / len(base)
    return {y: round(means[y] - offset, 3) for y in whole}, touched, step


def enso_split(series, oni):
    """El Nino against La Nina years, with the warming trend removed first.

    Without detrending this would mostly report that El Nino years happened to
    fall later in a warming record.
    """
    import numpy as np
    from scipy import stats

    years = sorted(series)
    values = np.array([series[y] for y in years])
    fit = stats.linregress(years, values)
    residual = values - (fit.slope * np.array(years) + fit.intercept)
    warm = [i for i, y in enumerate(years) if oni.get(f"{y}-07", 0) >= EL_NINO]
    cool = [i for i, y in enumerate(years) if oni.get(f"{y}-07", 0) <= LA_NINA]
    if len(warm) < 5 or len(cool) < 5:
        return None
    test = stats.ttest_ind(residual[warm], residual[cool])
    return {
        "elNinoYears": len(warm),
        "laNinaYears": len(cool),
        "elNinoAnomalyC": round(float(residual[warm].mean()), 2),
        "laNinaAnomalyC": round(float(residual[cool].mean()), 2),
        "differenceC": round(float(residual[warm].mean() - residual[cool].mean()), 2),
        "pValue": float(f"{test.pvalue:.2g}"),
        # Reported so a reader can see how strong the warming is without a rate
        # being published as a headline figure.
        "trendRSquared": round(float(fit.rvalue ** 2), 3),
        "trendCPerDecade": round(float(fit.slope * 10), 3),
    }


def main():
    argparse.ArgumentParser().parse_args()
    outline = state_outline()
    oni_path = os.path.join(HERE, "data", "enso_oni.csv")
    oni = {row["date"]: float(row["oni_c"]) for row in csv.DictReader(open(oni_path))}

    records = {}
    for key, spec in SOURCES.items():
        series, cells, step = annual_series(spec, outline)
        split = enso_split(series, oni)
        warmest = max(series, key=series.get)
        records[key] = {
            "label": spec["label"],
            "note": spec["note"],
            "source": spec["url"],
            "cells": cells,
            "gridDegrees": step,
            # A product whose cells are larger than the state cannot say which
            # single year was warmest here; it can still check the direction of
            # the trend and an average taken over dozens of years.
            "canRankYears": bool(cells >= 10 and step <= 1.0),
            "firstYear": min(series),
            "lastYear": max(series),
            "warmestYear": warmest,
            "warmestAnomalyC": series[warmest],
            "series": [{"year": y, "anomalyC": series[y]} for y in sorted(series)],
            "enso": split,
        }
        print(f"  {spec['label']:<16} {min(series)}-{max(series)}  {cells} cells  "
              f"warmest {warmest}  El Nino {split['differenceC']:+.2f} C (p={split['pValue']})"
              + ("" if records[key]["canRankYears"] else "  [too coarse to rank years]"))

    keys = list(records)
    rankers = [k for k in keys if records[k]["canRankYears"]]
    agree_warmest = bool(rankers) and len({records[k]["warmestYear"] for k in rankers}) == 1
    rates = sorted(records[k]["enso"]["trendCPerDecade"] for k in keys)
    payload = {
        "contractVersion": "1.0.0",
        "baseline": f"{BASE_FROM}-{BASE_TO}",
        "records": records,
        "agreement": {
            "warmestYear": records[rankers[0]]["warmestYear"] if agree_warmest else None,
            "warmestYearFrom": [records[k]["label"] for k in rankers],
            "bothWarming": all(records[k]["enso"]["trendRSquared"] > 0.3 for k in keys),
            "bothHotterInElNino": all(records[k]["enso"]["differenceC"] > 0 for k in keys),
            # Published as a range, never as one figure: the two products differ
            # by a factor of about 2.7 and this project does not pick a winner.
            "trendRangeCPerDecade": [rates[0], rates[-1]],
        },
        "publishes": "what both records agree on; no rate as a single figure, and no projection",
    }
    out = os.path.join(APP, "ap_temperature.json")
    with open(out, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"  warmest year published from {len(rankers)} of {len(keys)} records   "
          f"trend range {rates[0]:+.3f} to {rates[-1]:+.3f} C/decade")
    print(f"  wrote {os.path.relpath(out, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
