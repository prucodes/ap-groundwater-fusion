"""Find mandals whose depth series steps to a new level and stays there.

A water table moves with the season and the monsoon. It does not fall thirty
metres in a month and hold: Kalla read 27-33 m every month to February 2026 and
1.2-3.1 m from March, and Undi did the same thing in the same month. That is a
well swapped mid-record, or a change in what the source reports -- not water.

Left alone these series poison the features that reach backwards. A mandal's
historical mean, its level a year ago and the year-ago anchor the forecast
blends toward all describe a well that is no longer being read.

This writes the changepoints it finds for a person to confirm. It is not run by
the weekly refresh: the table is reviewed data, like the boundary aliases.
"""
import argparse
import csv
import os

import numpy as np
import pandas as pd
from series_quality import history_carried_forward  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "mandal_series_discontinuities.csv")

# A step this many times the local spread is not a season. The 99th percentile
# of all 688 mandals is 4.2 and the flagged ones start at 5.3, so the cut sits
# in open water rather than on the shoulder of the distribution.
MIN_SCORE = 5.0
WINDOW = 6          # months compared either side of a candidate month
MIN_READINGS = 4    # in each window, so a gap cannot manufacture a step
LOOKBACK = 24       # only recent changepoints matter to what we publish


def scan(history, end_period):
    """Score every mandal's largest sustained step, most recent first."""
    history = history.copy()
    history["period"] = pd.PeriodIndex(history.date, freq="M")
    found = []
    for uid, rows in history.groupby("mandal_uuid"):
        series = rows.set_index("period").level_mbgl.sort_index()
        best = None
        for candidate in pd.period_range(end_period - (LOOKBACK - 1), end_period - 3, freq="M"):
            before = series[(series.index >= candidate - WINDOW) & (series.index < candidate)]
            after = series[(series.index >= candidate) & (series.index < candidate + WINDOW)]
            if len(before) < MIN_READINGS or len(after) < MIN_READINGS:
                continue
            step = float(np.median(after) - np.median(before))
            spread = max(
                float(np.percentile(before, 90) - np.percentile(before, 10)),
                float(np.percentile(after, 90) - np.percentile(after, 10)),
                0.3,
            )
            score = abs(step) / spread
            if best is None or score > best["score"]:
                best = {"score": score, "period": candidate, "step": step, "spread": spread,
                        "before": float(np.median(before)), "after": float(np.median(after))}
        if best and best["score"] >= MIN_SCORE:
            found.append({
                "mandal_uuid": uid,
                "district": rows.district.iloc[0],
                "mandal": rows.mandal.iloc[0],
                "regime_start": str(best["period"]),
                "median_before_m": round(best["before"], 2),
                "median_after_m": round(best["after"], 2),
                "step_m": round(best["step"], 2),
                "local_spread_m": round(best["spread"], 2),
                "score": round(best["score"], 2),
            })
    return sorted(found, key=lambda row: -row["score"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", default=os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    args = parser.parse_args()
    history = pd.read_csv(args.history)
    history = history[~history.date.isin(history_carried_forward(args.history))]
    end = pd.PeriodIndex(history.date, freq="M").max()
    found = scan(history, end)
    fields = ["mandal_uuid", "district", "mandal", "regime_start", "median_before_m",
              "median_after_m", "step_m", "local_spread_m", "score"]
    with open(OUT, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(found)
    print(f"{len(found)} mandals step to a new level and stay there -> data/mandal_series_discontinuities.csv")
    for row in found:
        print(f"  {row['district']:>16} / {row['mandal']:<18} {row['regime_start']}  "
              f"{row['median_before_m']:>7.2f} -> {row['median_after_m']:<7.2f} m  (score {row['score']})")


if __name__ == "__main__":
    main()
