#!/usr/bin/env python3
"""Can the State's daily sensors stand in for its monthly hand-read wells?

The site's water table is the monthly hand-read record (APWRIMS mandal averages):
long, checked, and a month old by the time it is published. About 1,560 automatic
sensors report every day, but they stand in different wells. If a sensor's reading
could be turned into the hand-read figure, the site could give today's level for
every mandal. This is the test, run every week, before any such figure is shown.

For each month M the hand-read record has published, every estimate is made from what
would have been known without M's own reading, and set against it:
  carry         last month's hand reading, H(M-1): what the site effectively shows today
  sensorYear    H(M-12) plus the same sensors' change on a year (each station's reading
                in M less its own reading a year before, as the service reports it)
  sensorMonth   H(M-1) plus the same sensors' change since last month (stations with
                readings in both months); needs a month of recorded sensor history

Sensor values come from phase3_levels/data/sensor_station_daily.json (sensor_archive.py),
which starts on 11 Nov 2026: the service keeps no history. Readings above 120 m or a
change of more than 15 m on a year are left out as dry wells or faulty sensors.

Same month only for the verdict. When a month has no sensor days of its own but some
within EARLY_DAYS after it (October 2026, read against mid-November sensors), the
sensorYear estimate is reported as an early look, flagged sameMonth: false, and never
counted toward the verdict. The verdict: the sensors stand in only once an estimate
beats carrying last month forward by REQUIRED_GAIN on mean error in MIN_MONTHS
same-month tests.

Output: app/data/sensor_wells_check.json. Weekly, after the APWRIMS history refresh.
"""
import collections
import csv
import datetime
import json
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ARCHIVE = os.path.join(HERE, "data", "sensor_station_daily.json")
HISTORY = os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")
CONTEXT = os.path.join(ROOT, "app", "data", "water_context.json")
OUT = os.path.join(ROOT, "app", "data", "sensor_wells_check.json")
MAX_M = 120.0          # deeper than this is a dry well or a fault, not a water table
MAX_YEAR_CHANGE_M = 15.0
EARLY_DAYS = 45        # how far after a month its early look may read the sensors
REQUIRED_GAIN = 0.05   # better than carrying last month forward by this share of mean error
MIN_MONTHS = 2


def month_add(ym, n):
    year, month = divmod(int(ym[:4]) * 12 + int(ym[5:7]) - 1 + n, 12)
    return f"{year:04d}-{month + 1:02d}"


def hand_by_boundary(history=HISTORY, context=CONTEXT):
    """Hand-read level by map outline and month; two APWRIMS series on one outline give their median."""
    where = {}
    ctx = json.load(open(context))
    for section in ("soilMoisture", "rainfall"):
        for row in (ctx.get(section) or {}).get("mandals") or []:
            if row.get("boundaryIndex") is not None:
                where.setdefault(row["uuid"], row["boundaryIndex"])
    values = collections.defaultdict(lambda: collections.defaultdict(list))
    for row in csv.DictReader(open(history)):
        if row["level_mbgl"] and row["mandal_uuid"] in where:
            values[where[row["mandal_uuid"]]][row["date"]].append(float(row["level_mbgl"]))
    return {b: {m: statistics.median(v) for m, v in months.items()} for b, months in values.items()}


def sensor_months(archive):
    """Per outline and month: the median level, the median change on a year, and each station's mean level."""
    stations = archive["stations"]
    per = collections.defaultdict(lambda: collections.defaultdict(lambda: {"days": set(), "level": [], "year": [], "station": collections.defaultdict(list)}))
    for day, values in archive["days"].items():
        month = day[:7]
        by_boundary = collections.defaultdict(lambda: ([], []))
        for i, (level, ago) in enumerate(zip(values["level"], values["yearAgo"])):
            boundary = stations[i][3]
            if boundary is None or level is None or level / 100 > MAX_M:
                continue
            by_boundary[boundary][0].append(level / 100)
            per[boundary][month]["station"][i].append(level / 100)
            if ago is not None and ago / 100 <= MAX_M and abs(level - ago) / 100 <= MAX_YEAR_CHANGE_M:
                by_boundary[boundary][1].append((level - ago) / 100)
        for boundary, (levels, changes) in by_boundary.items():
            cell = per[boundary][month]
            cell["days"].add(day)
            cell["level"].append(statistics.median(levels))
            if changes:
                cell["year"].append(statistics.median(changes))
    return per


def estimates(hand, per, month, early=False):
    """Every estimate for one hand-read month, keyed by outline."""
    out = collections.defaultdict(dict)
    sensor_month = month
    if early:
        later = sorted({m for cells in per.values() for m in cells if m > month})
        sensor_month = later[0] if later else None
    for boundary, months in hand.items():
        actual, previous = months.get(month), months.get(month_add(month, -1))
        if actual is None or previous is None:
            continue
        out[boundary]["actual"] = actual
        out[boundary]["carry"] = previous
        cells = per.get(boundary, {})
        here = cells.get(sensor_month) if sensor_month else None
        year_ago = months.get(month_add(month, -12))
        if here and here["year"] and year_ago is not None:
            out[boundary]["sensorYear"] = year_ago + statistics.median(here["year"])
        before = cells.get(month_add(month, -1))
        if not early and here and before:
            moves = [statistics.fmean(here["station"][i]) - statistics.fmean(before["station"][i])
                     for i in here["station"] if i in before["station"]]
            if moves:
                out[boundary]["sensorMonth"] = previous + statistics.median(moves)
    return out


def score(rows, name):
    pairs = [(r[name], r["actual"], r["carry"]) for r in rows.values() if name in r]
    if not pairs:
        return None
    errors = [e - a for e, a, _ in pairs]
    carry = [c - a for _, a, c in pairs]
    mae, carry_mae = statistics.fmean(abs(x) for x in errors), statistics.fmean(abs(x) for x in carry)
    return {"mandals": len(pairs), "maeM": round(mae, 2), "medianErrorM": round(statistics.median(abs(x) for x in errors), 2),
            "biasM": round(statistics.fmean(errors), 2), "withinOneMetrePct": round(100 * sum(abs(x) <= 1 for x in errors) / len(errors), 1),
            "carryMaeM": round(carry_mae, 2), "gainPct": round(100 * (1 - mae / carry_mae), 1) if carry_mae else None}


def build(archive, hand):
    per = sensor_months(archive)
    sensor_days = sorted(archive["days"])
    tests = []
    if sensor_days:
        first = sensor_days[0][:7]
        published = sorted({m for months in hand.values() for m in months})
        for month in [m for m in published if m >= month_add(first, -1)]:
            same = any(month in cells for cells in per.values())
            if not same:
                start = datetime.date.fromisoformat(f"{month_add(month, 1)}-01")
                if (datetime.date.fromisoformat(sensor_days[0]) - start).days > EARLY_DAYS:
                    continue
            rows = estimates(hand, per, month, early=not same)
            results = {name: score(rows, name) for name in ("sensorYear", "sensorMonth")}
            if any(results.values()):
                tests.append({"month": month, "sameMonth": same,
                              "sensorDays": sum(1 for d in sensor_days if d.startswith(month if same else month_add(month, 1))),
                              **{k: v for k, v in results.items() if v}})
    counted = [t for t in tests if t["sameMonth"]]
    wins = [t for t in counted if any((t.get(k) or {}).get("gainPct") is not None and t[k]["gainPct"] >= 100 * REQUIRED_GAIN
                                       for k in ("sensorYear", "sensorMonth"))]
    if len(wins) >= MIN_MONTHS:
        verdict = "stands in"
    elif counted and not wins:
        verdict = "not better"
    else:
        verdict = "awaiting"
    last_hand = max((m for months in hand.values() for m in months), default=None)
    pending = sorted({d[:7] for d in sensor_days if last_hand is None or d[:7] > last_hand})
    return {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "question": "Can the State's daily sensors stand in for its monthly hand-read wells?",
        "rule": (f"Each estimate made without the month's own hand reading, scored against it. The sensors stand in once an "
                 f"estimate beats carrying last month's reading forward by {round(100 * REQUIRED_GAIN)}% on mean error in "
                 f"{MIN_MONTHS} same-month tests. Early looks read a later month's sensors and never count."),
        "sensorDays": {"first": sensor_days[0] if sensor_days else None, "last": sensor_days[-1] if sensor_days else None, "count": len(sensor_days)},
        "lastHandMonth": last_hand,
        "nextTest": pending[0] if pending else None,
        "tests": tests,
        "verdict": verdict,
    }


def main():
    if not os.path.exists(ARCHIVE):
        print("no sensor archive yet; nothing to test")
        return 0
    payload = build(json.load(open(ARCHIVE)), hand_by_boundary())
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    for t in payload["tests"]:
        print(f"{t['month']}{'' if t['sameMonth'] else ' (early look)'}: "
              + "; ".join(f"{k} {t[k]['maeM']} m vs carry {t[k]['carryMaeM']} m over {t[k]['mandals']}" for k in ("sensorYear", "sensorMonth") if k in t))
    print(f"verdict: {payload['verdict']}; next same-month test {payload['nextTest']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
