"""How far to trust each mandal's released three-month forecast, from its own record.

The forecast is retrained every quarter since 2018 and scored on what followed
(experiment_forecast_bias.py). Against simply assuming no change, its skill is
not even through the year: it depends on the month the forecast is made and on
whether the rain over the three months before that ran short, normal or above.
Forecasts made in August after a failed monsoon, for example, have done no
better than assuming no change; forecasts made in June have beaten it by a
quarter. Both are known on the day a forecast is made, so they can label it.

An El Nino rule was tested first and rejected: forecasts made from April to
July while the Pacific was already warm beat assuming no change as often as
any others (2.11 m against 2.51 m mean error), so a warm Pacific alone is no
reason to doubt a forecast.

  --calibrate  rebuild reports/forecast_reliability_table.json from the backtest
               rows (git-ignored, reproducible by experiment_forecast_bias.py)
  default      read that committed table, the released forecast and the CHIRPS
               history, and publish app/data/forecast_reliability.json

Nothing here changes a forecast; it only says how such forecasts have fared.
"""
import argparse
import csv
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
ROWS = os.path.join(ROOT, "data", "raw", "experiments", "forecast_bias_rows.csv")
TABLE = os.path.join(ROOT, "reports", "forecast_reliability_table.json")
OUT = os.path.join(APP, "forecast_reliability.json")
RAIN = [os.path.join(HERE, "data", name) for name in ("mandal_rain_history_chirps_archive.csv", "mandal_rain_history_chirps.csv")]

DEFICIT, SURPLUS = -0.20, 0.20     # rain over the three months to the origin, against its normal
BEATS, WORSE = 0.10, -0.05         # gain over "no change" that counts as beating it, or losing to it
MIN_ROWS, MIN_YEARS = 500, 5       # a cell thinner than this is reported as untested
NORMAL_FROM = 1991                 # the rain normal: every complete year from here to the one before the origin
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def condition(anomaly):
    if anomaly is None:
        return None
    return "deficit" if anomaly <= DEFICIT else "surplus" if anomaly >= SURPLUS else "normal"


def verdict(cell):
    if cell["rows"] < MIN_ROWS or cell["years"] < MIN_YEARS:
        return "untested"
    return "beats" if cell["gain"] >= BEATS else "worse" if cell["gain"] <= WORSE else "level"


def calibrate():
    import pandas as pd

    rows = pd.read_csv(ROWS)
    rows["om"] = rows.origin.str.slice(5, 7).astype(int)
    rows["cond"] = [condition(a) if a == a else None for a in rows.rain_3m_anom]
    rows["err"] = rows.blend - rows.actual
    rows["err0"] = rows.noChange - rows.actual
    cells = {}
    for (om, cond), part in rows.dropna(subset=["cond"]).groupby(["om", "cond"]):
        mae, mae0 = float(part.err.abs().mean()), float(part.err0.abs().mean())
        cell = {"originMonth": int(om), "rain": cond, "rows": int(len(part)),
                "years": int(part.origin.str.slice(0, 4).nunique()),
                "forecastMaeM": round(mae, 3), "noChangeMaeM": round(mae0, 3),
                "biasM": round(float(part.err.mean()), 3), "gain": round(1 - mae / mae0, 3)}
        cell["verdict"] = verdict(cell)
        cells[f"{int(om):02d}-{cond}"] = cell
    table = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "experiment_forecast_bias.py: quarterly retrains 2018-2026, the released blend scored on what followed",
        "firstTarget": str(rows.target_date.min()), "lastTarget": str(rows.target_date.max()),
        "rows": int(len(rows)),
        "rule": {"deficit": DEFICIT, "surplus": SURPLUS, "beats": BEATS, "worse": WORSE,
                 "minRows": MIN_ROWS, "minYears": MIN_YEARS,
                 "rain": "rain over the three months to the forecast month against the mandal's normal for the same months",
                 "bias": "forecast minus outcome, metres below ground: negative means more water was expected than came"},
        "cells": cells,
    }
    with open(TABLE, "w") as handle:
        json.dump(table, handle, indent=1)
        handle.write("\n")
    for key, cell in sorted(cells.items()):
        print(f"  {key:<11} {cell['verdict']:<8} gain {100 * cell['gain']:+4.0f}%  n={cell['rows']:>5}  years={cell['years']}")
    print(f"  wrote {os.path.relpath(TABLE, ROOT)}")


def norm(text):
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def rain_history():
    """{(district, mandal): {"YYYY-MM": mm}} from both halves of the CHIRPS record."""
    history = {}
    for path in RAIN:
        if not os.path.exists(path):
            continue
        with open(path) as handle:
            for row in csv.DictReader(handle):
                history.setdefault((norm(row["district"]), norm(row["mandal"])), {})[row["date"]] = float(row["rain_mm"])
    return history


def shift(period, months):
    year, month = int(period[:4]), int(period[5:7])
    index = year * 12 + month - 1 + months
    return f"{index // 12}-{index % 12 + 1:02d}"


def rain_anomaly(series, origin):
    """Rain over the three months to the origin, as a share above or below their normal."""
    def window(end):
        values = [series.get(shift(end, -k)) for k in range(3)]
        return None if any(v is None for v in values) else sum(values)

    now = window(origin)
    past = [window(f"{year}{origin[4:]}") for year in range(NORMAL_FROM, int(origin[:4]))]
    past = [value for value in past if value is not None]
    if now is None or len(past) < 10:
        return None
    normal = sum(past) / len(past)
    return None if normal <= 0 else now / normal - 1


def publish():
    table = json.load(open(TABLE))
    records = json.load(open(os.path.join(APP, "mandal_groundwater_records_v2.json")))["records"]
    history = rain_history()
    mandals, counts, used = {}, {}, set()
    for record in records:
        forecast = record.get("forecast") or {}
        if forecast.get("releaseStatus") != "released" or not forecast.get("originPeriod"):
            continue
        identity = record["identity"]
        series = history.get((norm(identity["districtName"]), norm(identity["mandalName"])))
        anomaly = rain_anomaly(series, forecast["originPeriod"]) if series else None
        cond = condition(anomaly)
        key = f"{forecast['originPeriod'][5:7]}-{cond}" if cond else None
        cell = table["cells"].get(key) if key else None
        flag = cell["verdict"] if cell else "untested"
        counts[flag] = counts.get(flag, 0) + 1
        if cell:
            used.add(key)
        mandals[identity["mandalId"]] = [None if anomaly is None else round(100 * anomaly), key]
    origins = sorted({record["forecast"]["originPeriod"] for record in records
                      if (record.get("forecast") or {}).get("releaseStatus") == "released"})
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "kind": "backtest_context",
        "note": ("How forecasts made in the same month after similar rain fared in the rolling-origin backtest. "
                 "Nothing here changes a forecast."),
        "origins": origins,
        "backtest": {key: table[key] for key in ("source", "firstTarget", "lastTarget", "rows", "rule")},
        "counts": counts,
        "cells": {key: table["cells"][key] for key in sorted(used)},
        "mandals": mandals,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    month = MONTHS[int(origins[-1][5:7]) - 1] if origins else "?"
    print(f"  {len(mandals)} released forecasts, made in {month}: " + ", ".join(f"{v} {k}" for k, v in sorted(counts.items())))
    print(f"  wrote {os.path.relpath(OUT, ROOT)}")
    return 0 if mandals else 1


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--calibrate", action="store_true", help="rebuild the committed table from the backtest rows")
    args = parser.parse_args()
    if args.calibrate:
        calibrate()
        return 0
    return publish()


if __name__ == "__main__":
    sys.exit(main())
