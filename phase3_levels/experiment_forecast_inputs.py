"""Experiment: do new inputs lift the 3- and 6-month forecasts under the repo's own rolling-origin test?

Run from the repo root (16 Nov 2026 result, rolling-origin MAE in metres):
  3 months: base 1.912, +clim 1.831, +clim+ONI 1.916, +clim+ONI+GRACE 1.851
  6 months: base 2.509, +clim 2.283, +clim+ONI 2.341, +clim+ONI+GRACE 2.269 (seasonal baseline 2.388; the gate needs 2.269)
So clim_change and clim_max went into train_multihorizon.NUM; ONI and GRACE did not.
Needs /tmp/ap-gw-video-assets/oni.ascii.txt (NOAA CPC) and the CSR mascon file. Adds, each known at the forecast origin:
- clim_change: the mandal's own median change from the origin's calendar month to the
  target's, over earlier years only (expanding, shifted: no leakage);
- clim_max: the largest such change on record so far (the dry-winter case);
- oni_lag: NOAA's ONI for the season centred two months before the origin (as published);
- grace_lag: CSR GRACE/GRACE-FO storage at the mandal's grid cell three months before the origin.
"""
import collections
import datetime
import os
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, "phase3_levels")
import train_multihorizon as tm  # noqa: E402
from build_levels_engine import build_frame  # noqa: E402

CACHE = "/tmp/ap-gw-video-assets"
SEASONS = {"DJF": 1, "JFM": 2, "FMA": 3, "MAM": 4, "AMJ": 5, "MJJ": 6, "JJA": 7, "JAS": 8, "ASO": 9, "SON": 10, "OND": 11, "NDJ": 12}


def oni_table():
    out = {}
    for line in open(os.path.join(CACHE, "oni.ascii.txt")).read().splitlines()[1:]:
        season, year, _, anom = line.split()
        out[f"{int(year)}-{SEASONS[season]:02d}"] = float(anom)
    return out


def grace_table(frame):
    import xarray as xr
    d = xr.open_dataset(os.path.join(CACHE, "CSR_GRACE_GRACE-FO_RL0603_Mascons_all-corrections.nc"))
    stamps = [(datetime.date(2002, 1, 1) + datetime.timedelta(days=float(t))).isoformat()[:7] for t in d.time.values]
    sub = d.lwe_thickness.sel(lat=slice(11, 21), lon=slice(76, 86))
    lat, lon = sub.lat.values, sub.lon.values
    values = sub.values
    cells = {}
    for mkey, la, lo in frame[["mkey", "lat", "lon"]].drop_duplicates("mkey").itertuples(index=False):
        cells[mkey] = (int(np.abs(lat - la).argmin()), int(np.abs(lon - lo).argmin()))
    table = {}
    for i, month in enumerate(stamps):
        table.setdefault(month, i)
    return table, values, cells


def add_features(frame, h, oni, grace):
    frame = frame.sort_values(["mkey", "date"]).copy()
    frame["origin_month"] = pd.PeriodIndex(frame.date, freq="M").month
    change = frame.target - frame.cur
    # Same mandal, same calendar month of origin: one row a year. Earlier years only.
    grouped = change.groupby([frame.mkey, frame.origin_month])
    frame["clim_change"] = grouped.transform(lambda s: s.expanding().median().shift(1))
    frame["clim_max"] = grouped.transform(lambda s: s.expanding().max().shift(1))
    periods = pd.PeriodIndex(frame.date, freq="M")
    frame["oni_lag"] = [oni.get(str(p - 2)) for p in periods]
    index, values, cells = grace
    g = []
    for mkey, p in zip(frame.mkey, periods):
        i = index.get(str(p - 3))
        c = cells.get(mkey)
        g.append(float(values[i, c[0], c[1]]) if i is not None and c else np.nan)
    frame["grace_lag"] = g
    return frame.reset_index(drop=True)


def run(frame, h, extra):
    saved = list(tm.NUM)
    # The base is the model before the trial: without the climatology it adopted.
    tm.NUM[:] = [c for c in saved if c not in ("clim_change", "clim_max")] + extra
    try:
        t = time.time()
        r = tm.rolling_origin(frame, h)
        return r, time.time() - t
    finally:
        tm.NUM[:] = saved


def main():
    df = build_frame()
    oni = oni_table()
    grace = grace_table(df)
    for h in (3, 6):
        frame = add_features(tm.make_horizon(df, h), h, oni, grace)
        print(f"h={h}: {len(frame)} rows; clim_change known for {frame.clim_change.notna().mean():.0%}, grace {frame.grace_lag.notna().mean():.0%}, oni {frame.oni_lag.notna().mean():.0%}")
        for name, extra in [("base", []), ("+clim", ["clim_change", "clim_max"]), ("+clim+oni", ["clim_change", "clim_max", "oni_lag"]),
                            ("+clim+oni+grace", ["clim_change", "clim_max", "oni_lag", "grace_lag"])]:
            r, secs = run(frame, h, extra)
            b = r["baselines"]
            cohorts = {k: v["improvementPct"] for k, v in r["terrainCohorts"].items()}
            print(f"  {name:18s} MAE {r['maeM']:.3f}  noChange {b['noChange']['maeM']:.3f}  seasonal {b['seasonal']['maeM']:.3f}  "
                  f"gate {r['beatsBothBaselinesByFivePct']}  cohorts {cohorts}  ({secs:.0f}s)", flush=True)


if __name__ == "__main__":
    main()
