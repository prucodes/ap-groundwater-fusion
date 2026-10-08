"""Would IMD's gridded rainfall make the model better than CHIRPS?

IMD's 0.25-degree daily grid (Pai et al. 2014) is the rainfall Indian officials quote.
data/mandal_rain_history_imd.csv holds it per mandal, January 2014 to December 2025,
keyed by mandal name. This rebuilds the model's feature frame twice, once on CHIRPS
(the production input) and once with IMD's monthly rain wherever a mandal's name is
unique, and scores both with the release gate's rolling origin over 2024 and 2025:
retrain before every month, nowcast that month. Same rows, same model; only the rain.

Writes reports/imd_rainfall_experiment.json. Research only: nothing here changes a forecast.
"""
import json
import os
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import build_levels_engine as engine  # noqa: E402
from source_identity import key  # noqa: E402

IMD = os.path.join(HERE, "data", "mandal_rain_history_imd.csv")
OUT = os.path.join(ROOT, "reports", "imd_rainfall_experiment.json")
FIRST, LAST = "2024-01", "2025-12"


def imd_rain(lv):
    """IMD's monthly rain for each row, where the mandal's name is unique in both records."""
    imd = pd.read_csv(IMD)
    imd["k"] = imd.mkey.map(key)
    names = lv.drop_duplicates("mkey").mandal.map(key).value_counts()
    unique = set(names[names == 1].index) & set(imd.drop_duplicates("mkey").k)
    table = imd[imd.k.isin(unique)].set_index(["k", "date"]).rain_mm
    keys = pd.MultiIndex.from_arrays([lv.mandal.map(key), lv.date])
    return pd.Series(table.reindex(keys).to_numpy(), index=lv.index)


def agreement():
    """How closely IMD's grid and the CHIRPS record agree, mandal by mandal, 2014 to 2025."""
    c = pd.read_csv(os.path.join(HERE, "data", "mandal_rain_history_chirps.csv"))
    i = pd.read_csv(IMD)
    c["k"], i["k"] = c.mandal.map(key), i.mkey.map(key)
    names = c.drop_duplicates("boundary_index").k.value_counts()
    unique = set(names[names == 1].index)
    j = c[c.k.isin(unique)].merge(i[i.k.isin(unique)][["k", "date", "rain_mm"]], on=["k", "date"], suffixes=("_chirps", "_imd"))
    j = j[j.date <= LAST]
    j["y"], j["m"] = j.date.str[:4].astype(int), j.date.str[5:7].astype(int)
    season = j[j.m.between(6, 9)].groupby(["k", "y"])[["rain_mm_chirps", "rain_mm_imd"]].sum()
    anomaly = season.groupby(level=0).transform(lambda s: s / s.mean() - 1)
    clear = anomaly[anomaly.rain_mm_imd.abs() >= 0.1]
    return {"mandals": int(j.k.nunique()), "years": [int(j.y.min()), int(j.y.max())],
            "monthlyCorrelation": round(float(j.rain_mm_chirps.corr(j.rain_mm_imd)), 3),
            "seasonCorrelation": round(float(season.rain_mm_chirps.corr(season.rain_mm_imd)), 3),
            "seasonRatioMedian": round(float(np.median(season.rain_mm_chirps / season.rain_mm_imd.replace(0, np.nan))), 3),
            "wetDryAgreement": round(float(np.mean(np.sign(clear.rain_mm_chirps) == np.sign(clear.rain_mm_imd))), 3),
            "wetDrySeasons": int(len(clear))}


def score(df):
    months = [m for m in sorted(df.date.unique()) if FIRST <= m <= LAST]
    errors, last, by_month = [], [], {}
    for month in months:
        history, target = df[df.date < month], df[df.date == month]
        history, target = engine.reset_mandal_base(history, target)
        models = engine.fit_models(engine.screen_training_rows(history), names=("p50",))
        point = target.lag1.to_numpy() + models["p50"].predict(target[engine.NUM + engine.CAT])
        errors.append(np.abs(target.level_mbgl.to_numpy() - point))
        by_month[month] = float(errors[-1].mean())
        last.append(np.abs(target.level_mbgl.to_numpy() - target.lag1.to_numpy()))
    errors, last = np.concatenate(errors), np.concatenate(last)
    return {"origins": len(months), "rows": int(errors.size), "maeM": round(float(errors.mean()), 4),
            "lastReadingMaeM": round(float(last.mean()), 4), "byMonth": {k: round(v, 4) for k, v in by_month.items()}}


def main():
    chirps_series = engine.rainfall_series
    frames = {}
    frames["chirps"] = engine.build_frame()
    swapped = {"rows": 0}

    def with_imd(lv, geo, boundary_index):
        values = chirps_series(lv, geo, boundary_index)
        imd = imd_rain(lv)
        swapped["rows"] = int(imd.notna().sum())
        return imd.fillna(values)
    engine.rainfall_series = with_imd
    frames["imd"] = engine.build_frame()
    engine.rainfall_series = chirps_series

    # Score only the rows both frames hold, so the comparison is like for like.
    keys = set(map(tuple, frames["chirps"][["mkey", "date"]].to_numpy())) & set(map(tuple, frames["imd"][["mkey", "date"]].to_numpy()))
    for name in frames:
        f = frames[name]
        frames[name] = f[[k in keys for k in map(tuple, f[["mkey", "date"]].to_numpy())]].reset_index(drop=True)
    results = {name: score(frame) for name, frame in frames.items()}
    payload = {
        "question": "Does IMD's gridded rainfall beat CHIRPS as the model's rain input?",
        "window": {"first": FIRST, "last": LAST},
        "rowsWithImdRain": swapped["rows"],
        "agreement": agreement(),
        "results": results,
        "gainPct": round(100 * (1 - results["imd"]["maeM"] / results["chirps"]["maeM"]), 2),
        "monthsImdBetter": sum(results["imd"]["byMonth"][m] < results["chirps"]["byMonth"][m] for m in results["imd"]["byMonth"]),
        "availability": ("IMD's gridded page lists whole years only, 2025 the latest in June 2026: a year is published "
                         "after it ends, while CHIRPS posts each month about three weeks after it. The weekly nowcast needs "
                         "this season's rain, so CHIRPS stays the production input."),
        "note": "Rolling origin, retrained before every month; IMD replaces CHIRPS only where a mandal name is unique in both records.",
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
    for name, r in results.items():
        print(f"  {name:<7} MAE {r['maeM']:.4f} m   (last reading {r['lastReadingMaeM']:.4f} m, {r['rows']} rows, {r['origins']} origins)")
    print(f"  IMD against CHIRPS: {payload['gainPct']:+.2f}%   ({swapped['rows']} rows carried IMD rain); "
          f"IMD better in {payload['monthsImdBetter']} of {results['imd']['origins']} months")
    print(f"  wrote {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
