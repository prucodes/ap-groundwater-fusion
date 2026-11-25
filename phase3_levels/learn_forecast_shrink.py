#!/usr/bin/env python3
"""How far a monsoon-season forecast should lean back toward today's level.

The released 3-month forecast leans partly on the same month a year earlier
(build_forecast.py), and in a monsoon that fails it promised recharge that never came:
targets in July to November of the dry El Nino years 2023 and 2026 missed by 2.6 and
2.2 m, worse than simply assuming no change. experiment_bias_correction.py found the
fix that holds up: pull those forecasts part of the way back to the level at the origin.

This learns that one weight from the long rolling-origin backtest rows written by
experiment_forecast_bias.py (each forecast made from earlier months only), and
reports how the weight would have done had it been learned, cut by cut, from earlier
cuts alone. Only targets in MONSOON_MONTHS are touched: in the dry season the
forecast's drawdown is already right, and pulling it back made it worse.

Result, 25 Nov 2026 (45,630 forecasts, 2018 onward): weight 0.65 on the forecast,
steady at 0.65-0.70 across every retrain since 2024. Monsoon targets in dry windows
2.49 -> 2.15 m; July-October 2026 2.21 -> 1.93 m; July-November 2023 2.62 -> 2.14 m;
the wet 2025 monsoon 1.62 -> 1.71 m; all targets since 2024 1.740 -> 1.748 m.

Relearn each quarter:
    python phase3_levels/experiment_forecast_bias.py      # about six minutes
    python phase3_levels/learn_forecast_shrink.py
Writes phase3_levels/outputs/forecast_shrink.json, which build_forecast.py applies.
"""
import datetime
import hashlib
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROWS = os.path.join(ROOT, "data", "raw", "experiments", "forecast_bias_rows.csv")
OUT = os.path.join(HERE, "outputs", "forecast_shrink.json")
MONSOON_MONTHS = (7, 8, 9, 10, 11)
GRID = np.linspace(0, 1, 21)
MIN_ROWS = 300


def best_weight(rows, column="blend"):
    """The weight on the forecast that minimises mean error against what came; 1.0 keeps it as it is."""
    errors = [np.mean(np.abs(w * rows[column] + (1 - w) * rows.noChange - rows.actual)) for w in GRID]
    return float(GRID[int(np.argmin(errors))])


def is_monsoon(target_dates):
    return pd.Series(target_dates).astype(str).str.slice(5, 7).astype(int).isin(MONSOON_MONTHS).to_numpy()


def out_of_sample(rows, column="blend"):
    """Each cut corrected with a weight learned from earlier cuts only, as the release would have been."""
    monsoon = is_monsoon(rows.target_date)
    corrected, weights = rows[column].to_numpy().copy(), []
    for cut in sorted(rows.cut.unique()):
        past = rows[(rows.cut < cut).to_numpy() & monsoon]
        now = (rows.cut == cut).to_numpy() & monsoon
        if len(past) < MIN_ROWS:
            continue
        w = best_weight(past, column)
        weights.append({"cut": cut, "weight": round(w, 2)})
        corrected[now] = w * rows[column].to_numpy()[now] + (1 - w) * rows.noChange.to_numpy()[now]
    return corrected, weights


def summary(rows, corrected, column="blend"):
    def mae(values, mask):
        return round(float(np.mean(np.abs(values[mask] - rows.actual.to_numpy()[mask]))), 3)
    monsoon = is_monsoon(rows.target_date)
    dry = (rows.window_class == "dry").to_numpy()
    scopes = {
        "all": np.ones(len(rows), bool),
        "since2024": (rows.target_date >= "2024-01").to_numpy(),
        "monsoonDry": monsoon & dry,
        "monsoonNotDry": monsoon & ~dry,
    }
    released = rows[column].to_numpy()
    return {name: {"forecasts": int(mask.sum()), "releasedMaeM": mae(released, mask), "correctedMaeM": mae(corrected, mask),
                   "noChangeMaeM": mae(rows.noChange.to_numpy(), mask)} for name, mask in scopes.items()}


def main():
    if not os.path.exists(ROWS):
        print(f"no backtest rows at {os.path.relpath(ROWS, ROOT)}; run experiment_forecast_bias.py first")
        return 1
    rows = pd.read_csv(ROWS)
    monsoon = is_monsoon(rows.target_date)
    weight = best_weight(rows[monsoon])
    corrected, by_cut = out_of_sample(rows)
    payload = {
        "learnedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "rule": "For targets in July to November only: published = weight x forecast + (1 - weight) x level at the origin; the band moves with it.",
        "monsoonMonths": list(MONSOON_MONTHS),
        "weight": round(weight, 2),
        "learnedFrom": {"forecasts": int(monsoon.sum()), "cuts": int(rows.cut.nunique()),
                        "firstTarget": str(rows.target_date.min()), "lastTarget": str(rows.target_date.max()),
                        "rowsSha256": hashlib.sha256(open(ROWS, "rb").read()).hexdigest()},
        "weightByCut": by_cut,
        "outOfSample": summary(rows, corrected),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    o = payload["outOfSample"]
    print(f"weight {payload['weight']} from {payload['learnedFrom']['forecasts']} monsoon forecasts; "
          f"monsoon dry {o['monsoonDry']['releasedMaeM']} -> {o['monsoonDry']['correctedMaeM']} m, "
          f"since 2024 {o['since2024']['releasedMaeM']} -> {o['since2024']['correctedMaeM']} m")
    return 0


if __name__ == "__main__":
    sys.exit(main())
