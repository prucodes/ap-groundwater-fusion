"""Multi-horizon forecast: how far ahead can we usefully predict a mandal's metres?

The production engine nowcasts the current month. Here we train DIRECT h-step
models for h = 1, 3, 6, 12: at origin t we use only what is known at t (current
level, its lags and recent moves, trailing rainfall, location, aquifer, and the
*calendar* month of the target) and predict the level h months later. No future
rainfall is used, so this is an honest forecast.

Two evaluations are reported per horizon:

  * a fixed temporal hold-out (train before 2024, predict 2024 onward), kept for
    continuity with earlier runs; and
  * ROLLING ORIGIN -- retrain at successive quarterly cuts, each time on targets
    that fall strictly before the cut, and score the quarter that follows. This
    is what the release gate asks for, and it is the only one that reflects a
    model retrained every week.

Both are compared against the two baselines a reader would reach for:

  * no-change : the level at the origin
  * seasonal  : the level twelve months before the TARGET, which is known at the
                origin for every horizon up to twelve months. At h = 12 the two
                baselines coincide by construction, because the level twelve
                months before the target IS the origin level.
"""
import argparse
import datetime
import json
import math
import os
import sys

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_levels_engine import build_frame, reset_mandal_base  # noqa: E402

HORIZONS = (1, 3, 6, 12)
# Rolling origin is the expensive part: one retrain per cut per horizon. Only
# the horizons actually under consideration for release are validated weekly.
# h=1 adds almost nothing over the origin level and h=12 is worse than it, both
# measured on the fixed split below, so neither is a release candidate.
ROLLING_HORIZONS = (3, 6)
FIXED_CUT = "2024-01"
# Rolling origin: retrain every ROLL_STEP months from ROLL_START and score the
# months that follow. Quarterly keeps the weekly refresh affordable while still
# giving every horizon several independent retrains.
ROLL_START = "2024-01"
ROLL_STEP = 3
MIN_ORIGINS = 4
MIN_ROWS_PER_ORIGIN = 200
REQUIRED_IMPROVEMENT = 0.05

NUM = ["lat", "lon", "specific_yield", "cur", "lag1", "lag2", "lag3", "lag6", "lag12",
       "roll3", "move_1m", "move_3m", "move_12m", "rain_1m", "rain_3m", "rain_12m",
       "tgt_sin", "tgt_cos", "mandal_base"]
CAT = ["aquifer_type"]


def est(quantile=None):
    """The point estimator, or a p10/p90 quantile twin of it for the band."""
    params = dict(max_iter=600, learning_rate=0.05, max_depth=8,
                  l2_regularization=1.0, random_state=0)
    reg = (HistGradientBoostingRegressor(loss="quantile", quantile=quantile, **params)
           if quantile is not None else HistGradientBoostingRegressor(**params))
    pre = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    return Pipeline([("pre", pre), ("reg", reg)])


def metrics(actual, predicted):
    keep = ~np.isnan(predicted)
    return (
        math.sqrt(mean_squared_error(actual[keep], predicted[keep])),
        mean_absolute_error(actual[keep], predicted[keep]),
        r2_score(actual[keep], predicted[keep]),
    )


def make_horizon(df, h):
    """Attach the level h months ahead, and the baselines known at the origin."""
    frame = df.copy()
    periods = pd.PeriodIndex(frame.date, freq="M")
    lookup = frame.set_index(["mkey", "date"]).level_mbgl

    def at(offset):
        keys = pd.MultiIndex.from_arrays([frame.mkey, (periods + offset).astype(str)])
        return pd.Series(lookup.reindex(keys).to_numpy(), index=frame.index)

    frame["cur"] = frame.level_mbgl
    frame["target"] = at(h)
    frame["target_date"] = (periods + h).astype(str)
    # The same calendar month a year before the target. Known at the origin for
    # every horizon up to twelve months; at h = 12 it is the origin level.
    frame["seasonal_base"] = at(h - 12)
    target_month = (periods + h).month
    frame["tgt_sin"] = np.sin(2 * np.pi * (target_month - 1) / 12)
    frame["tgt_cos"] = np.cos(2 * np.pi * (target_month - 1) / 12)
    return frame.dropna(subset=["target", "seasonal_base"]).reset_index(drop=True)


def score(train, test):
    """Fit on `train`, score `test`; returns model and baseline metrics."""
    train, test = reset_mandal_base(train, test)
    model = est()
    model.fit(train[NUM + CAT], train.target.to_numpy())
    actual = test.target.to_numpy()
    predicted = model.predict(test[NUM + CAT])
    return {
        "model": metrics(actual, predicted),
        "noChange": metrics(actual, test.cur.to_numpy()),
        "seasonal": metrics(actual, test.seasonal_base.to_numpy()),
        "errors": np.abs(actual - predicted),
        "noChangeErrors": np.abs(actual - test.cur.to_numpy()),
        "seasonalErrors": np.abs(actual - test.seasonal_base.to_numpy()),
        "aquifer": test.aquifer_type.to_numpy(),
    }


def beats_both(model_mae, no_change_mae, seasonal_mae):
    limit = 1 - REQUIRED_IMPROVEMENT
    return bool(model_mae <= no_change_mae * limit and model_mae <= seasonal_mae * limit)


def rolling_origin(frame, h):
    """Retrain at each quarterly cut on targets strictly before it."""
    months = sorted(frame.target_date.unique())
    cuts = [m for m in months if m >= ROLL_START][::ROLL_STEP]
    collected, origins = [], []
    for index, cut in enumerate(cuts):
        stop = cuts[index + 1] if index + 1 < len(cuts) else None
        train = frame[frame.target_date < cut]
        window = frame[frame.target_date >= cut]
        if stop is not None:
            window = window[window.target_date < stop]
        if len(window) < MIN_ROWS_PER_ORIGIN or train.empty:
            continue
        collected.append(score(train, window))
        origins.append({"cut": cut, "trainRows": int(len(train)), "testRows": int(len(window))})
    if len(origins) < MIN_ORIGINS:
        return {"validated": False, "reason": f"only {len(origins)} usable origins", "originCount": len(origins)}

    errors = np.concatenate([part["errors"] for part in collected])
    no_change = np.concatenate([part["noChangeErrors"] for part in collected])
    seasonal = np.concatenate([part["seasonalErrors"] for part in collected])
    aquifer = np.concatenate([part["aquifer"] for part in collected])
    cohorts = {}
    for name in sorted(set(aquifer)):
        rows = aquifer == name
        cohorts[str(name)] = {
            "sampleCount": int(rows.sum()),
            "maeM": round(float(errors[rows].mean()), 4),
            "noChangeMaeM": round(float(no_change[rows].mean()), 4),
            "improvementPct": round(float(100 * (1 - errors[rows].mean() / no_change[rows].mean())), 2),
        }
    model_mae = float(errors.mean())
    return {
        "validated": True,
        "originCount": len(origins),
        "originStep": f"{ROLL_STEP} months",
        "origins": origins,
        "sampleCount": int(errors.size),
        "maeM": round(model_mae, 4),
        "baselines": {
            "noChange": {"maeM": round(float(no_change.mean()), 4)},
            "seasonal": {"maeM": round(float(seasonal.mean()), 4)},
        },
        "beatsBothBaselinesByFivePct": beats_both(model_mae, float(no_change.mean()), float(seasonal.mean())),
        "terrainCohorts": cohorts,
        # Every cohort must improve, not just the state as a whole: a horizon
        # that helps the coast and hurts Rayalaseema is not releasable.
        "everyTerrainCohortImproves": all(c["improvementPct"] > 0 for c in cohorts.values()),
    }


def evaluate():
    df = build_frame()
    rows = []
    for h in HORIZONS:
        frame = make_horizon(df, h)
        fixed_train = frame[frame.target_date < FIXED_CUT]
        fixed_test = frame[frame.target_date >= FIXED_CUT]
        fixed = score(fixed_train, fixed_test)
        rolling = (rolling_origin(frame, h) if h in ROLLING_HORIZONS
                   else {"validated": False, "reason": "not a release candidate; rolling origin not run at this horizon"})
        model_mae = fixed["model"][1]
        blockers = []
        if not rolling.get("validated"):
            blockers.append("rolling_origin_incomplete")
        elif not rolling["beatsBothBaselinesByFivePct"]:
            blockers.append("does_not_beat_both_baselines_by_five_pct_under_rolling_origin")
        elif not rolling["everyTerrainCohortImproves"]:
            blockers.append("a_terrain_cohort_does_not_improve")
        rows.append({
            "horizonMonths": h,
            "task": "direct_forecast",
            "trainingOriginPeriod": {"start": str(fixed_train.date.min()), "end": str(fixed_train.date.max())},
            "evaluationOriginPeriod": {"start": str(fixed_test.date.min()), "end": str(fixed_test.date.max())},
            "sampleCount": int(len(fixed_test)),
            "model": {
                "maeM": round(float(model_mae), 4),
                "rmseM": round(float(fixed["model"][0]), 4),
                "r2": round(float(fixed["model"][2]), 4),
            },
            "baselines": {
                "noChange": {"maeM": round(float(fixed["noChange"][1]), 4)},
                "seasonal": {"maeM": round(float(fixed["seasonal"][1]), 4)},
            },
            "beatsBothBaselinesByFivePct": beats_both(
                model_mae, float(fixed["noChange"][1]), float(fixed["seasonal"][1])
            ),
            "rollingOrigin": rolling,
            "rollingOriginValidated": bool(rolling.get("validated")),
            "releaseBlockers": blockers,
            "releaseStatus": "research_only",
        })
    return {
        "task": "direct_multi_horizon_forecast",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "featureTiming": "features available at forecast origin; no future rainfall",
        "baselineDefinitions": {
            "noChange": "the level at the forecast origin",
            "seasonal": "the level twelve months before the target month, known at the origin; identical to noChange at h=12",
        },
        "releaseGate": {
            "requiredImprovementPct": 5,
            "requiresRollingOriginValidation": True,
            "requiresNoTargetLeakage": True,
            "requiresReconciledTerrainCohorts": True,
        },
        # Releasing a horizon publishes a forward number to the public site.
        # That is a decision for the project owner, not for this script; the
        # gate below records whether the evidence would support it.
        "releasedHorizons": [],
        "horizons": rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-out")
    args = parser.parse_args()
    result = evaluate()
    print(f"  {'horizon':>8} | {'fixed MAE':>9} | {'rolling':>8} {'no-change':>9} {'seasonal':>9} {'gain':>6} | gate")
    print("  " + "-" * 78)
    for row in result["horizons"]:
        roll = row["rollingOrigin"]
        if roll.get("validated"):
            gain = 100 * (1 - roll["maeM"] / roll["baselines"]["noChange"]["maeM"])
            verdict = "PASS" if not row["releaseBlockers"] else row["releaseBlockers"][0]
            print(
                f"  {row['horizonMonths']:>6}mo | {row['model']['maeM']:>9.3f} | {roll['maeM']:>8.3f} "
                f"{roll['baselines']['noChange']['maeM']:>9.3f} {roll['baselines']['seasonal']['maeM']:>9.3f} "
                f"{gain:>5.1f}% | {verdict}"
            )
        else:
            print(f"  {row['horizonMonths']:>6}mo | {row['model']['maeM']:>9.3f} | {roll.get('reason', 'not run'):>36}")
    print("\n  Rolling origin retrains at every quarterly cut on targets before it.")
    print("  No horizon is released: releasing a forward number is the owner's call.")
    if args.json_out:
        with open(args.json_out, "w") as handle:
            json.dump(result, handle, indent=2)
            handle.write("\n")


if __name__ == "__main__":
    main()
