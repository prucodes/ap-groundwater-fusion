"""Publish the released 3-month groundwater forecast, one row per mandal.

Only the 3-month horizon clears the release gate (`train_multihorizon.py`):
under rolling-origin validation it is 20.4% better than assuming no change and
23.7% better than looking up the same month a year earlier, and it improves in
every aquifer and every depth band. The 1, 6 and 12-month horizons do not, and
nothing here publishes them.

The published number is the model blended with the same month a year before the
target, at a weight fitted per depth band on a held-out year -- at this range
the seasonal cycle carries information the model alone misses, and the blend is
worth about 3%. The band is a p10-p90 quantile range widened per aquifer by
split conformal calibration, exactly as the nowcast's is.
"""
import datetime
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_levels_engine import (  # noqa: E402
    BLEND_EDGES, NOMINAL_COVERAGE, apply_conformal, band_label, conformal_offsets,
    build_frame, depth_band_index, reset_mandal_base, sha256,
)
from train_multihorizon import CAT, NUM, est, make_horizon  # noqa: E402

HORIZON_MONTHS = 3
MODEL_VERSION = "phase0-forecast-3m-1.0.0"
SCHEMA_VERSION = "1.0.0"
CALIBRATION_MONTHS = 12
OUTD = os.path.join(HERE, "outputs")
APP = os.path.join(HERE, "..", "app", "data")


def fit_quantiles(train):
    models = {}
    for name, quantile in (("p50", None), ("p10", 0.1), ("p90", 0.9)):
        model = est(quantile)
        model.fit(train[NUM + CAT], train.target.to_numpy())
        models[name] = model
    return models


def predict_quantiles(models, rows):
    raw = np.vstack([models[name].predict(rows[NUM + CAT]) for name in ("p10", "p50", "p90")])
    lower, point, upper = np.sort(raw, axis=0)
    return lower, point, upper


def credible_anchor(anchor, lower, upper):
    """Is a year-ago reading worth blending toward?

    Where it falls outside the model's own P10-P90 it is describing a different
    regime -- a well swapped mid-series, a reporting change -- not the same
    place a year earlier. Kalla read 27 m every November to 2025 and 1.9 m
    through 2026; blending to that anchor forecast a 20 m collapse by November.
    The model says such an anchor is not credible, so we believe the model.
    """
    return np.isfinite(anchor) & (anchor >= lower) & (anchor <= upper)


def blend_weights(actual, anchor, point, usable):
    """How much to trust the model over a year-ago lookup, per depth band."""
    grid = np.linspace(0, 1, 21)
    index = depth_band_index(anchor)
    weights = {}
    for band in range(len(BLEND_EDGES) - 1):
        rows = (index == band) & usable
        if rows.sum() < 50:
            weights[band] = 1.0
            continue
        errors = [np.mean(np.abs(actual[rows] - (w * point[rows] + (1 - w) * anchor[rows])))
                  for w in grid]
        weights[band] = float(grid[int(np.argmin(errors))])
    return weights


def apply_blend(weights, anchor, lower, point, upper, depth, usable):
    """Where the anchor is missing or not credible, the model stands alone."""
    index = depth_band_index(depth)
    weight = np.where(usable, np.array([weights.get(int(i), 1.0) for i in index]), 1.0)
    safe_anchor = np.where(usable, anchor, 0.0)
    blended = weight * point + (1 - weight) * safe_anchor
    return blended - (point - lower), blended, blended + (upper - point)


def calibrate(frame):
    """Blend weights and band widening, both from months the model never saw."""
    months = sorted(frame.target_date.unique())
    split = months[-CALIBRATION_MONTHS]
    early, window = frame[frame.target_date < split], frame[frame.target_date >= split]
    early, window = reset_mandal_base(early, window)
    warm = fit_quantiles(early)
    lower, point, upper = predict_quantiles(warm, window)
    actual = window.target.to_numpy()
    anchor = window.seasonal_base.to_numpy()
    usable = credible_anchor(anchor, lower, upper)
    weights = blend_weights(actual, anchor, point, usable)
    lower, point, upper = apply_blend(
        weights, anchor, lower, point, upper, window.cur.to_numpy(), usable
    )
    offsets = conformal_offsets(actual, lower, upper, window.aquifer_type.to_numpy())
    # Calibration may say a band over-covers and could be narrowed. On a forward
    # number that is not a trade worth making: widen where it is needed, never
    # claim more precision than the model itself does.
    offsets = {name: max(0.0, value) for name, value in offsets.items()}
    return weights, offsets, {"start": str(window.target_date.min()), "end": str(window.target_date.max())}


def origin_rows(df):
    """Each mandal's latest month, with the target-season and year-ago anchor.

    A mandal whose series stepped to a new level has no eligible origin until a
    year of the new regime exists; forecasting from its last pre-step reading
    would carry a different well three months into the future.
    """
    eligible = df[df.regime_start.isna() | (df.date >= df.regime_start)]
    latest = eligible.sort_values("date").groupby("mkey").tail(1).copy()
    periods = pd.PeriodIndex(latest.date, freq="M")
    target = periods + HORIZON_MONTHS
    latest["cur"] = latest.level_mbgl
    latest["target_date"] = target.astype(str)
    month = target.month
    latest["tgt_sin"] = np.sin(2 * np.pi * (month - 1) / 12)
    latest["tgt_cos"] = np.cos(2 * np.pi * (month - 1) / 12)
    # The same calendar month a year before the target, which is nine months
    # before the origin and therefore already measured.
    lookup = df.set_index(["mkey", "date"]).level_mbgl
    keys = pd.MultiIndex.from_arrays([latest.mkey, (target - 12).astype(str)])
    latest["seasonal_base"] = lookup.reindex(keys).to_numpy()
    return latest


def main():
    df = build_frame()
    frame = make_horizon(df, HORIZON_MONTHS)
    weights, offsets, calibration_period = calibrate(frame)

    latest = origin_rows(df)
    train, latest = reset_mandal_base(frame, latest)
    models = fit_quantiles(train)
    lower, point, upper = predict_quantiles(models, latest)
    anchor = latest.seasonal_base.to_numpy()
    usable = credible_anchor(anchor, lower, upper)
    lower, point, upper = apply_blend(
        weights, anchor, lower, point, upper, latest.cur.to_numpy(), usable
    )
    lower, upper = apply_conformal(offsets, lower, upper, latest.aquifer_type.to_numpy())

    evaluation = json.load(open(os.path.join(OUTD, "phase0_evaluations.json")))
    horizon = next(h for h in evaluation["directForecast"]["horizons"]
                   if h["horizonMonths"] == HORIZON_MONTHS)
    rolling = horizon["rollingOrigin"]
    if horizon["releaseBlockers"]:
        raise SystemExit(f"3-month horizon has release blockers: {horizon['releaseBlockers']}")

    records = []
    for position, (_, row) in enumerate(latest.iterrows()):
        records.append({
            "sourceSeriesId": row.mkey,
            "mandal": row.mandal,
            "district": row.district,
            "boundaryIndex": None if pd.isna(row.boundary_index) else int(row.boundary_index),
            "originPeriod": row.date,
            "originLevelMbgl": round(float(row.level_mbgl), 2),
            "targetPeriod": row.target_date,
            "value": round(float(point[position]), 2),
            "lower": round(float(lower[position]), 2),
            "upper": round(float(upper[position]), 2),
            "anchoredToYearAgo": bool(usable[position]),
        })

    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "modelVersion": MODEL_VERSION,
        "horizonMonths": HORIZON_MONTHS,
        "label": "Released 3-month forecast; modelled, not an APWRIMS measurement",
        "unit": "m_bgl",
        "intervalType": "conformalised_quantile_p10_p90",
        "method": {
            "estimator": "gradient_boosted_regression_trees, direct 3-step",
            "blendedWith": "same calendar month twelve months before the target",
            "blendWeightOnModel": {band_label(band): round(weight, 2)
                                   for band, weight in sorted(weights.items())},
            "conformalWidenM": {name: round(value, 4) for name, value in sorted(offsets.items())},
            "calibrationPeriod": calibration_period,
            "nominalCoveragePct": round(NOMINAL_COVERAGE * 100),
        },
        "validation": {
            "task": rolling.get("task", "rolling_origin"),
            "originCount": rolling["originCount"],
            "sampleCount": rolling["sampleCount"],
            "maeM": rolling["maeM"],
            "baselines": rolling["baselines"],
            "terrainCohorts": rolling["terrainCohorts"],
            "beatsBothBaselinesByFivePct": rolling["beatsBothBaselinesByFivePct"],
            "everyTerrainCohortImproves": rolling["everyTerrainCohortImproves"],
        },
        "inputHashes": {
            "apwrimsHistory": sha256(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")),
            "rainfallHistory": sha256(os.path.join(HERE, "data", "mandal_rain_history.csv")),
            "chirpsRainfallHistory": sha256(os.path.join(HERE, "data", "mandal_rain_history_chirps.csv")),
        },
        "forecasts": records,
    }
    path = os.path.join(OUTD, "mandal_forecast_3m.json")
    with open(path, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    anchored = sum(1 for row in records if row["anchoredToYearAgo"])
    print(f"  emitted {len(records)} three-month forecasts -> outputs/mandal_forecast_3m.json")
    print(f"  {anchored} blended with a credible year-ago reading, {len(records) - anchored} model-only")
    print(f"  mean band width: {np.mean(upper - lower):.2f} m")


if __name__ == "__main__":
    main()
