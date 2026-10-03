"""Correct the forecast's dry-season bias with what was known at the time.

Reads the per-row backtest from experiment_forecast_bias.py. For each quarterly
retrain ("cut"), a correction is learned only from the rows of EARLIER cuts --
forecasts whose outcomes were already measured -- and applied to the cut's own
rows. Nothing about a cut's outcome is used to correct that cut.

Corrections, keyed by what is known at the forecast origin: whether the target
month falls in the monsoon-and-after season (July-November), and how far the
mandal's rain over the three months to the origin ran below its normal:

  E_bias      subtract the mean past error of forecasts in the same key
              (shrunk toward zero where the key has few past rows)
  D_shrink    move the forecast toward "no change" by a weight learned per key

Each is applied to the released blend and to the model alone, and judged on:
the dry monsoon windows (the bias to fix), and every row (it must not cost the
gate). Writes reports/forecast_bias_correction.json.
"""
import datetime
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ROWS = os.path.join(ROOT, "data", "raw", "experiments", "forecast_bias_rows.csv")
OUT = os.path.join(ROOT, "reports", "forecast_bias_correction.json")
DEFICIT_EDGES = [-np.inf, -0.4, -0.2, 0.0, 0.2, np.inf]
SHRINK_N = 200            # a key with n past rows keeps n/(n+SHRINK_N) of its mean error
MONSOON_TARGETS = {"07", "08", "09", "10", "11"}


def keys(rows):
    season = np.where(rows.target_date.str.slice(5, 7).isin(MONSOON_TARGETS), "monsoon", "dry_season")
    deficit = pd.cut(rows.rain_3m_anom.fillna(0.0), DEFICIT_EDGES, labels=False).astype(int)
    return pd.Series([f"{s}|{d}" for s, d in zip(season, deficit)], index=rows.index)


def corrected(rows, column):
    """E_bias and D_shrink for one forecast column, cut by cut."""
    rows = rows.copy()
    rows["key"] = keys(rows)
    bias_out = pd.Series(np.nan, index=rows.index)
    shrink_out = pd.Series(np.nan, index=rows.index)
    grid = np.linspace(0, 1, 21)
    for cut in sorted(rows.cut.unique()):
        past = rows[rows.cut < cut]
        now = rows.cut == cut
        if past.empty:
            bias_out[now] = rows.loc[now, column]
            shrink_out[now] = rows.loc[now, column]
            continue
        error = (past[column] - past.actual).groupby(past.key)
        mean, count = error.mean(), error.size()
        shrunk = mean * count / (count + SHRINK_N)
        adjust = rows.loc[now, "key"].map(shrunk).fillna(0.0)
        bias_out[now] = rows.loc[now, column] - adjust
        weights = {}
        for key, part in past.groupby("key"):
            if len(part) < 100:
                weights[key] = 1.0
                continue
            maes = [np.mean(np.abs(w * part[column] + (1 - w) * part.noChange - part.actual)) for w in grid]
            weights[key] = float(grid[int(np.argmin(maes))])
        w = rows.loc[now, "key"].map(weights).fillna(1.0)
        shrink_out[now] = w * rows.loc[now, column] + (1 - w) * rows.loc[now, "noChange"]
    return bias_out, shrink_out


def stats(rows, columns, mask):
    part = rows[mask]
    out = {"rows": int(mask.sum())}
    for c in columns:
        e = part[c] - part.actual
        out[c] = {"maeM": round(float(e.abs().mean()), 4), "biasM": round(float(e.mean()), 4)}
    return out


def main():
    rows = pd.read_csv(ROWS)
    for base in ("model", "blend"):
        rows[f"{base}_E_bias"], rows[f"{base}_D_shrink"] = corrected(rows, base)
    columns = ["noChange", "model", "blend", "model_E_bias", "model_D_shrink", "blend_E_bias", "blend_D_shrink"]
    monsoon = rows.target_date.str.slice(5, 7).isin(MONSOON_TARGETS)
    deficit_known = rows.rain_3m_anom < -0.2
    result = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "method": ("corrections learned per cut from earlier cuts only; key = target season (Jul-Nov or not) x "
                   "three-month rain deficit at the origin; bias shrunk by n/(n+200)"),
        "scopes": {},
    }
    for scope, mask_scope in (("long", np.ones(len(rows), bool)), ("gate2024on", (rows.target_date >= "2024-01").to_numpy())):
        block = {}
        for name, mask in (("all", np.ones(len(rows), bool)),
                           ("dry", (rows.window_class == "dry").to_numpy()),
                           ("normal", (rows.window_class == "normal").to_numpy()),
                           ("wet", (rows.window_class == "wet").to_numpy()),
                           ("monsoonDry", (monsoon & (rows.window_class == "dry")).to_numpy()),
                           ("deficitKnownAtOrigin", (monsoon & deficit_known).to_numpy())):
            block[name] = stats(rows, columns, mask & mask_scope)
        result["scopes"][scope] = block
        print(f"\n  {scope}")
        print(f"  {'variant':<16}" + "".join(f"{c:>18}" for c in block))
        for c in columns:
            print(f"  {c:<16}" + "".join(f"{block[s][c]['maeM']:>8.3f} ({block[s][c]['biasM']:+.2f})" for s in block))
        print("  rows: " + ", ".join(f"{s} {block[s]['rows']}" for s in block))
    with open(OUT, "w") as handle:
        json.dump(result, handle, indent=1)
        handle.write("\n")


if __name__ == "__main__":
    sys.exit(main())
