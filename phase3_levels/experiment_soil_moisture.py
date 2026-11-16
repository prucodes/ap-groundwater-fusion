"""Experiment: does the State's soil moisture lift the 3- and 6-month forecasts?

APWRIMS publishes the NRSC VIC land-surface model's plant-available water for every
mandal at 5, 30, 100 and 150 cm, for any past date back to 2014, keyed by the same
mandal UUIDs as the groundwater history. Water held deep in the soil is water still on
its way to the water table, so it may say what a mandal's level will do next.

Each feature is known at the forecast origin: the snapshot for the 28th of the origin
month, which is out before that month's well reading is published. A month whose
snapshot is identical to another month's is a fill, not a model run, and is dropped.

    python phase3_levels/experiment_soil_moisture.py     # fetches once into CACHE, then reuses it

Adds sm30, sm100, sm150 (per cent of what the soil can hold), and sm150_anom: the
150 cm value against the mandal's own median for that calendar month in earlier years.

16 Nov 2026, rolling-origin MAE in metres, against the model with the climatology inputs:
  3 months: 1.831 -> +sm150 1.791, +sm100+sm150 1.791, +all soil 1.798
  6 months: 2.283 -> +sm150 2.258 (clears the gate: seasonal 2.388, needs 2.269)
So sm150 alone went into train_multihorizon.NUM (fetch_soil_moisture_history.py keeps it).
"""
import datetime
import json
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_apwrims_context as context  # noqa: E402
import train_multihorizon as tm  # noqa: E402
from build_levels_engine import build_frame  # noqa: E402

CACHE = os.environ.get("SOIL_CACHE", "/tmp/ap-gw-video-assets/soil_monthly.json")
FIRST, LAST = (2014, 1), (2026, 10)
FEATURES = ["sm30", "sm100", "sm150", "sm150_anom"]


def months():
    y, m = FIRST
    while (y, m) <= LAST:
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def fetch_all():
    """{"YYYY-MM": {uuid: [5, 30, 100, 150 cm]}}, cached, resumable."""
    cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
    for y, m in months():
        key = f"{y}-{m:02d}"
        if key in cache:
            continue
        try:
            table = context.soil_table(datetime.date(y, m, 28))
        except Exception as error:  # a month the portal cannot answer stays missing
            print(f"  {key}: {error}", flush=True)
            table = {}
        cache[key] = {uid: row["pct"] for uid, row in table.items()}
        print(f"  {key}: {len(table)} mandals", flush=True)
        os.makedirs(os.path.dirname(CACHE), exist_ok=True)
        json.dump(cache, open(CACHE, "w"))
        time.sleep(context.PAUSE_S)
    return cache


def real_months(cache):
    """Drop empty months and every copy of a snapshot that repeats another month's."""
    seen = {}
    for key, table in cache.items():
        if len(table) >= context.MIN_MANDALS // 2:
            mark = hash(tuple(sorted((u, tuple(round(v, 4) for v in p)) for u, p in table.items())))
            seen.setdefault(mark, []).append(key)
    return {keys[0]: cache[keys[0]] for keys in seen.values() if len(keys) == 1}


def soil_frame(cache):
    rows = [(key, uid, *pct) for key, table in real_months(cache).items() for uid, pct in table.items()]
    soil = pd.DataFrame(rows, columns=["date", "mkey", "sm5", "sm30", "sm100", "sm150"]).sort_values(["mkey", "date"])
    soil["month"] = soil.date.str.slice(5, 7)
    # Against the mandal's own median for this calendar month, earlier years only.
    soil["sm150_anom"] = soil.sm150 - soil.groupby(["mkey", "month"]).sm150.transform(lambda s: s.expanding().median().shift(1))
    return soil.drop(columns=["sm5", "month"])


def add_features(frame, soil):
    frame = frame.drop(columns=[c for c in FEATURES if c in frame], errors="ignore")
    return frame.merge(soil, on=["mkey", "date"], how="left")


def run(frame, h, extra):
    saved = list(tm.NUM)
    tm.NUM[:] = saved + extra
    try:
        t = time.time()
        return tm.rolling_origin(frame, h), time.time() - t
    finally:
        tm.NUM[:] = saved


def main():
    soil = soil_frame(fetch_all())
    print(f"soil: {soil.date.nunique()} real months, {soil.date.min()} to {soil.date.max()}, {soil.mkey.nunique()} mandals")
    df = build_frame()
    for h in (3, 6):
        frame = add_features(tm.make_horizon(df, h), soil)
        print(f"h={h}: {len(frame)} rows; soil known for {frame.sm150.notna().mean():.0%}", flush=True)
        for name, extra in [("current model", []), ("+sm150", ["sm150"]), ("+sm100+sm150", ["sm100", "sm150"]),
                            ("+all soil", FEATURES)]:
            r, secs = run(frame, h, extra)
            b = r["baselines"]
            cohorts = {k: v["improvementPct"] for k, v in r["terrainCohorts"].items()}
            print(f"  {name:16s} MAE {r['maeM']:.3f}  noChange {b['noChange']['maeM']:.3f}  seasonal {b['seasonal']['maeM']:.3f}  "
                  f"gate {r['beatsBothBaselinesByFivePct']}  cohorts {cohorts}  ({secs:.0f}s)", flush=True)


if __name__ == "__main__":
    if sys.argv[1:] == ["--fetch"]:
        fetch_all()
    else:
        main()
