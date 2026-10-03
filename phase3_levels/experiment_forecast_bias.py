"""Does the 3-month forecast over-predict recharge in dry years, and what fixes it?

On 3 Oct 2026 the State's September readings (AWARE, via the AI Living Labs
data lake) showed the forecast made from June expecting the usual monsoon rise
in a year when the water table kept falling. This is the long backtest that
checks whether that is a pattern, and tests fixes against it.

Long rolling origin: retrain every quarter from LONG_START on targets strictly
before the cut, score the quarter that follows -- the release gate's own
procedure, run back far enough to include the dry years in the record. Each
scored row is classed by the rain that actually fell in its forecast window
against that mandal's normal for those months (a label for the analysis only,
never a feature).

Variants, all scored on the same rows:
  noChange, seasonal       the two baselines the gate uses
  model                    the released estimator, no blend
  blend                    model blended with the year-ago level at the published weights
  A_anomaly                model with rain-anomaly features (normals from training years only)
  B_gatedBlend             blend only where this season's rain resembles the anchor year's
  C_shiftedAnchor          year-ago level shifted by this year's departure at the origin
  C_blend                  model blended with the shifted anchor at fitted weights

Writes reports/forecast_bias_experiment.json and prints the comparison.
Research only: nothing here changes the released forecast.
"""
import datetime
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_levels_engine import BLEND_EDGES, build_frame, depth_band_index, reset_mandal_base  # noqa: E402
from train_multihorizon import CAT, NUM, est, make_horizon  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "reports", "forecast_bias_experiment.json")
# Every scored row, so corrections can be tested without retraining (git-ignored).
ROWS_OUT = os.path.join(ROOT, "data", "raw", "experiments", "forecast_bias_rows.csv")
HORIZON = 3
LONG_START = "2018-01"
STEP = 3
DRY, WET = -0.25, 0.25          # window rain below / above normal by this share
GATE = 0.30                      # B: anchor-year rain may differ from this year's by this share of normal
ANOMALY = ["rain_3m_anom", "rain_12m_anom", "rain_3m_vs_last_year", "rain_12m_vs_last_year", "move_vs_last_year"]


def est_with(features, quantile=None):
    """The released estimator's settings, on a different numeric feature list."""
    from sklearn.compose import ColumnTransformer
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import OneHotEncoder
    params = dict(max_iter=600, learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0)
    reg = (HistGradientBoostingRegressor(loss="quantile", quantile=quantile, **params)
           if quantile is not None else HistGradientBoostingRegressor(**params))
    pre = ColumnTransformer([("num", "passthrough", features), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    return Pipeline([("pre", pre), ("reg", reg)])


def lookup_at(df, column, offset):
    periods = pd.PeriodIndex(df.date, freq="M")
    table = df.set_index(["mkey", "date"])[column]
    keys = pd.MultiIndex.from_arrays([df.mkey, (periods + offset).astype(str)])
    return pd.Series(table.reindex(keys).to_numpy(), index=df.index)


def window_rain(df):
    """Rain in the forecast window (months origin+1..origin+h): an analysis label."""
    parts = [lookup_at(df, "rain_mm", k) for k in range(1, HORIZON + 1)]
    return pd.concat(parts, axis=1).sum(axis=1, min_count=HORIZON)


def prepare():
    df = build_frame()
    df["window_rain"] = window_rain(df)
    df["rain_3m_year_ago"] = lookup_at(df, "rain_3m", -12)
    df["rain_12m_year_ago"] = lookup_at(df, "rain_12m", -12)
    df["level_year_ago"] = lookup_at(df, "level_mbgl", -12)
    frame = make_horizon(df, HORIZON)
    frame["origin_month"] = frame.date.str.slice(5, 7)
    # This year's departure from last year at the origin: deeper now is positive.
    frame["move_vs_last_year"] = frame.cur - frame.level_year_ago
    return frame


def add_anomalies(train, test):
    """Rain against each mandal's normal for the same calendar window, the normal
    taken from training rows only, so no future year shapes a feature."""
    train, test = train.copy(), test.copy()
    for column in ("rain_3m", "rain_12m"):
        normal = train.groupby(["mkey", "origin_month"])[column].mean()
        fallback = train.groupby("origin_month")[column].mean()
        for part in (train, test):
            keys = pd.MultiIndex.from_arrays([part.mkey, part.origin_month])
            n = pd.Series(normal.reindex(keys).to_numpy(), index=part.index)
            n = n.fillna(part.origin_month.map(fallback))
            part[f"{column}_anom"] = part[column] / n.replace(0, np.nan) - 1
            part[f"{column}_vs_last_year"] = (part[column] - part[f"{column}_year_ago"]) / n.replace(0, np.nan)
    return train, test


def window_class(frame):
    """Dry, normal or wet by the rain that actually fell in the window, against
    the mandal's mean for the same window across the record (a label only)."""
    normal = frame.groupby(["mkey", "origin_month"]).window_rain.transform("mean")
    anomaly = frame.window_rain / normal.replace(0, np.nan) - 1
    return np.select([anomaly < DRY, anomaly > WET], ["dry", "wet"], "normal"), anomaly


def fitted_weights(actual, anchor, point, depth):
    """Blend weight on the model per depth band, chosen on the given rows."""
    grid = np.linspace(0, 1, 21)
    index = depth_band_index(depth)
    weights = {}
    for band in range(len(BLEND_EDGES) - 1):
        rows = (index == band) & np.isfinite(anchor)
        if rows.sum() < 50:
            weights[band] = 1.0
            continue
        errors = [np.mean(np.abs(actual[rows] - (w * point[rows] + (1 - w) * anchor[rows]))) for w in grid]
        weights[band] = float(grid[int(np.argmin(errors))])
    return weights


def blend(weights, anchor, point, depth):
    index = depth_band_index(depth)
    weight = np.array([weights.get(int(i), 1.0) for i in index])
    use = np.isfinite(anchor)
    return np.where(use, weight * point + (1 - weight) * np.where(use, anchor, 0.0), point)


def fold(train, test):
    """Fit on train; predict test for every variant. Blend weights are fitted on
    the last twelve training months by a model that never saw them, as the
    released forecast's calibration does."""
    train, test = reset_mandal_base(train, test)
    train, test = add_anomalies(train, test)
    months = sorted(train.target_date.unique())
    split = months[-12] if len(months) > 24 else months[len(months) // 2]
    early, late = train[train.target_date < split], train[train.target_date >= split]

    out = pd.DataFrame(index=test.index)
    # Known at the origin: kept so corrections can be learned from earlier folds.
    out["mkey"] = test.mkey.to_numpy()
    out["origin"] = test.date.to_numpy()
    for column in ("rain_3m_anom", "rain_12m_anom", "rain_3m_vs_last_year"):
        out[column] = test[column].to_numpy()
    out["actual"] = test.target.to_numpy()
    out["noChange"] = test.cur.to_numpy()
    out["seasonal"] = test.seasonal_base.to_numpy()
    shifted = test.seasonal_base.to_numpy() + test.move_vs_last_year.to_numpy()
    out["C_shiftedAnchor"] = shifted

    plain = est().fit(train[NUM + CAT], train.target.to_numpy())
    out["model"] = plain.predict(test[NUM + CAT])
    feats = NUM + ANOMALY
    rich = est_with(feats).fit(train[feats + CAT], train.target.to_numpy())
    out["A_anomaly"] = rich.predict(test[feats + CAT])

    # Blend weights from the held-out late year.
    warm = est().fit(early[NUM + CAT], early.target.to_numpy())
    late_point = warm.predict(late[NUM + CAT])
    late_actual, late_depth = late.target.to_numpy(), late.cur.to_numpy()
    w_seasonal = fitted_weights(late_actual, late.seasonal_base.to_numpy(), late_point, late_depth)
    late_shifted = late.seasonal_base.to_numpy() + late.move_vs_last_year.to_numpy()
    w_shifted = fitted_weights(late_actual, late_shifted, late_point, late_depth)
    depth = test.cur.to_numpy()
    out["blend"] = blend(w_seasonal, test.seasonal_base.to_numpy(), out["model"].to_numpy(), depth)
    out["C_blend"] = blend(w_shifted, shifted, out["model"].to_numpy(), depth)
    # B: use the year-ago anchor only where this season's rain resembles that year's.
    similar = (np.abs(test.rain_3m_vs_last_year.to_numpy()) <= GATE)
    gated_anchor = np.where(similar, test.seasonal_base.to_numpy(), np.nan)
    out["B_gatedBlend"] = blend(w_seasonal, gated_anchor, out["model"].to_numpy(), depth)
    return out, {"seasonal": w_seasonal, "shifted": w_shifted}


def summarise(rows, variants):
    def stats(mask):
        part = rows[mask]
        result = {"rows": int(mask.sum())}
        for v in variants:
            error = part[v] - part.actual
            ok = np.isfinite(error)
            result[v] = {"maeM": round(float(np.abs(error[ok]).mean()), 4),
                         # Metres below ground: negative bias = forecast shallower than what happened,
                         # i.e. more recharge expected than occurred.
                         "biasM": round(float(error[ok].mean()), 4)}
        return result
    out = {"all": stats(np.ones(len(rows), bool))}
    for name in ("dry", "normal", "wet"):
        out[name] = stats(rows.window_class.to_numpy() == name)
    monsoon = rows.target_date.str.slice(5, 7).isin(["07", "08", "09", "10", "11"]).to_numpy()
    out["monsoonTargets"] = stats(monsoon)
    out["monsoonTargetsDry"] = stats(monsoon & (rows.window_class.to_numpy() == "dry"))
    return out


def main():
    frame = prepare()
    frame["window_class"], frame["window_anomaly"] = window_class(frame)
    months = sorted(frame.target_date.unique())
    cuts = [m for m in months if m >= LONG_START][::STEP]
    collected, weights = [], []
    for index, cut in enumerate(cuts):
        stop = cuts[index + 1] if index + 1 < len(cuts) else None
        train = frame[frame.target_date < cut]
        test = frame[(frame.target_date >= cut) & ((frame.target_date < stop) if stop else True)]
        if len(test) < 200 or train.empty:
            continue
        predictions, w = fold(train, test)
        predictions["target_date"] = test.target_date.to_numpy()
        predictions["window_class"] = test.window_class.to_numpy()
        predictions["window_anomaly"] = test.window_anomaly.to_numpy()
        predictions["aquifer"] = test.aquifer_type.to_numpy()
        predictions["cut"] = cut
        collected.append(predictions)
        weights.append({"cut": cut, **{k: {str(b): v for b, v in w[k].items()} for k in w}})
        print(f"  cut {cut}: {len(test)} rows, model MAE {np.mean(np.abs(predictions.model - predictions.actual)):.3f}")
    rows = pd.concat(collected, ignore_index=True)
    rows.to_csv(ROWS_OUT, index=False)
    variants = ["noChange", "seasonal", "model", "blend", "A_anomaly", "B_gatedBlend", "C_shiftedAnchor", "C_blend"]
    gate_rows = rows[rows.target_date >= "2024-01"]
    result = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "horizonMonths": HORIZON, "longStart": LONG_START, "stepMonths": STEP, "origins": len(collected),
        "classRule": f"window rain below normal by more than {-DRY:.0%} is dry, above by more than {WET:.0%} wet",
        "biasConvention": "forecast minus actual, metres below ground: negative = more recharge forecast than occurred",
        "long": summarise(rows, variants),
        "gateWindow2024on": summarise(gate_rows, variants),
        "byYear": {year: summarise(rows[rows.target_date.str.startswith(year)], ["model", "blend", "A_anomaly", "C_blend"])["all"]
                   for year in sorted(rows.target_date.str.slice(0, 4).unique())},
        "blendWeights": weights,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as handle:
        json.dump(result, handle, indent=1)
        handle.write("\n")
    for scope in ("long", "gateWindow2024on"):
        print(f"\n  {scope}")
        print(f"  {'variant':<16}" + "".join(f"{c:>18}" for c in ("all", "dry", "normal", "wet", "monsoonDry")))
        block = result[scope]
        for v in variants:
            cells = []
            for c in ("all", "dry", "normal", "wet", "monsoonTargetsDry"):
                s = block[c][v]
                cells.append(f"{s['maeM']:>7.3f} ({s['biasM']:+.2f})")
            print(f"  {v:<16}" + "".join(f"{cell:>18}" for cell in cells))
        print("  rows: " + ", ".join(f"{c} {block[c]['rows']}" for c in ("all", "dry", "normal", "wet", "monsoonTargetsDry")))


if __name__ == "__main__":
    main()
