#!/usr/bin/env python3
"""Cyclone Arnab: where its rain fell, against where the water table had room to rise.

Arnab came ashore on the Godavari delta coast on 28 October 2026. The water
context (fetch_apwrims_context.py) records gauge rain for the water year to date,
so the storm's rain in each mandal is the difference between two readings of it:
to 24 October, before the storm, and to 28 October. The same two readings give
soil moisture before and after, and reservoir storage. Those are captured once,
with --capture, into phase3_levels/data/cyclone_arnab_capture.json; the weekly
refresh moves on, so the event is kept as it was measured.

Groundwater after the storm is not published yet: the State's monthly readings run
to September, and the November reading is the first that will show it. What can be
said now comes from last year. Cyclone Montha came ashore on the same coast on the
same date in 2025. For each mandal, the change between its October and November
2025 readings is set against its usual change between those months (the median of
2015-2024, leaving out the 2021 months that repeat the month before), and grouped
by how much October rain exceeded that mandal's October average (satellite rain,
2014-2024). That is a precedent, not a forecast: October 2025 was wet across the
State before Montha too, and the deepest band holds few mandals.

Output: app/data/cyclone_arnab.json
"""
import csv
import datetime
import json
import os
import re
import statistics
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CAPTURE = os.path.join(HERE, "data", "cyclone_arnab_capture.json")
GW = os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")
RAIN = os.path.join(HERE, "data", "mandal_rain_history.csv")
OUT = os.path.join(ROOT, "app", "data", "cyclone_arnab.json")

HEAVY_MM = 100                       # the storm's rain counted as heavy for a mandal
BANDS = [(0, 3, "under 3 m"), (3, 8, "3 to 8 m"), (8, 20, "8 to 20 m"), (20, 1e9, "over 20 m")]
DEEP_M = 8                           # a water table with real room to rise
COPIED_MONTHS = {"2021-03", "2021-04", "2021-06", "2021-09", "2021-10", "2021-11", "2021-12"}
USUAL_YEARS = range(2015, 2025)
NORMAL_YEARS = range(2014, 2025)


def band_of(depth):
    for lo, hi, label in BANDS:
        if lo <= depth < hi:
            return label
    return None


def norm(name):
    return re.sub(r"[^A-Z0-9]", "", str(name).upper())


def capture(before_path, after_path):
    """Keep the two water-context readings that bracket the storm."""
    before, after = json.load(open(before_path)), json.load(open(after_path))
    rain_b = {m["uuid"]: m for m in before["rainfall"]["mandals"]}
    soil_b = {m["uuid"]: m for m in before["soilMoisture"]["mandals"]}
    soil_a = {m["uuid"]: m for m in after["soilMoisture"]["mandals"]}
    rows = []
    for m in after["rainfall"]["mandals"]:
        b = rain_b.get(m["uuid"])
        if not b or m.get("actualMm") is None or b.get("actualMm") is None:
            continue
        sb, sa = soil_b.get(m["uuid"], {}), soil_a.get(m["uuid"], {})
        rows.append({"uuid": m["uuid"], "district": m["district"], "mandal": m["mandal"], "boundaryIndex": m.get("boundaryIndex"),
                     "rainBeforeMm": b["actualMm"], "rainAfterMm": m["actualMm"],
                     "soil30Before": (sb.get("pct") or [None, None])[1], "soil30After": (sa.get("pct") or [None, None])[1]})
    payload = {
        "source": "APWRIMS water context (gauge rain, NRSC soil moisture, reservoirs), read before and after the storm",
        "rainWindow": {"before": before["rainfall"]["window"]["end"], "after": after["rainfall"]["window"]["end"]},
        "soilAsOf": {"before": before["soilMoisture"]["asOf"], "after": after["soilMoisture"]["asOf"]},
        "state": {
            "rainTmcBefore": before["rainfall"]["state"]["actualTmc"], "rainTmcAfter": after["rainfall"]["state"]["actualTmc"],
            "normalTmcBefore": before["rainfall"]["state"]["normalTmc"], "normalTmcAfter": after["rainfall"]["state"]["normalTmc"],
            "seasonDeviationBefore": before["rainfall"]["state"]["deviationPct"], "seasonDeviationAfter": after["rainfall"]["state"]["deviationPct"],
            "soilMedianBefore": before["soilMoisture"]["summary"]["medianPct"], "soilMedianAfter": after["soilMoisture"]["summary"]["medianPct"],
            "soilDriestBefore": before["soilMoisture"]["summary"]["driestOnRecord"], "soilDriestAfter": after["soilMoisture"]["summary"]["driestOnRecord"],
            "reservoirTmcBefore": before["reservoirs"]["state"]["storageTmc"], "reservoirTmcAfter": after["reservoirs"]["state"]["storageTmc"],
            "reservoirAsOf": {"before": before["reservoirs"]["asOf"], "after": after["reservoirs"]["asOf"]},
        },
        "mandals": rows,
    }
    with open(CAPTURE, "w") as handle:
        json.dump(payload, handle, indent=1)
    print(f"  captured {len(rows)} mandals, rain to {payload['rainWindow']['before']} and to {payload['rainWindow']['after']}")


def groundwater():
    """{(district, mandal): {month: depth}} and {uuid: {month: depth}}, mandal means."""
    by_name, by_uuid = defaultdict(lambda: defaultdict(list)), defaultdict(lambda: defaultdict(list))
    for r in csv.DictReader(open(GW)):
        if r["date"] in COPIED_MONTHS or not r["level_mbgl"]:
            continue
        level = float(r["level_mbgl"])
        by_name[(norm(r["district"]), norm(r["mandal"]))][r["date"]].append(level)
        by_uuid[r["mandal_uuid"]][r["date"]].append(level)
    mean = lambda d: {k: {m: statistics.fmean(v) for m, v in s.items()} for k, s in d.items()}
    return mean(by_name), mean(by_uuid)


def montha_precedent(gw_by_name):
    rain = defaultdict(dict)
    for r in csv.DictReader(open(RAIN)):
        if r["date"].endswith("-10") and r["rain_mm"]:
            rain[(norm(r["district"]), norm(r["mandal"]))][r["date"][:4]] = float(r["rain_mm"])
    rows = []
    for key, series in gw_by_name.items():
        oct25, nov25 = series.get("2025-10"), series.get("2025-11")
        usual = [series[f"{y}-11"] - series[f"{y}-10"] for y in USUAL_YEARS if f"{y}-10" in series and f"{y}-11" in series]
        octs = rain.get(key, {})
        normal = [octs[str(y)] for y in NORMAL_YEARS if str(y) in octs]
        if oct25 is None or nov25 is None or len(usual) < 5 or "2025" not in octs or len(normal) < 8:
            continue
        rows.append({"depth": oct25, "change": nov25 - oct25, "usual": statistics.median(usual),
                     "extraRain": octs["2025"] - statistics.fmean(normal)})
    wet = [r for r in rows if r["extraRain"] >= HEAVY_MM]
    bands = []
    for lo, hi, label in BANDS:
        group = [r for r in wet if lo <= r["depth"] < hi]
        if not group:
            continue
        beyond = [r["usual"] - r["change"] for r in group]          # depth falls as the table rises
        bands.append({"band": label, "mandals": len(group),
                      "extraRiseM": round(statistics.median(beyond), 2),
                      "roseMorePct": round(100 * sum(b > 0 for b in beyond) / len(group), 0)})
    return {"mandalsCompared": len(rows), "mandalsWithHeavyRain": len(wet), "bands": bands}


def main():
    if "--capture" in sys.argv:
        i = sys.argv.index("--capture")
        capture(sys.argv[i + 1], sys.argv[i + 2])
    cap = json.load(open(CAPTURE))
    gw_by_name, gw_by_uuid = groundwater()
    latest = max(m for s in gw_by_uuid.values() for m in s)

    mandals = []
    for m in cap["mandals"]:
        depth = gw_by_uuid.get(m["uuid"], {}).get(latest)
        mandals.append({**m, "stormMm": round(m["rainAfterMm"] - m["rainBeforeMm"], 1),
                        "depthM": round(depth, 2) if depth is not None else None})
    heavy = [m for m in mandals if m["stormMm"] >= HEAVY_MM]

    districts = defaultdict(list)
    for m in mandals:
        districts[m["district"]].append(m)
    district_rows = sorted(({"district": d, "mandals": len(ms), "medianMm": round(statistics.median(x["stormMm"] for x in ms), 0),
                             "heavy": sum(x["stormMm"] >= HEAVY_MM for x in ms)} for d, ms in districts.items()),
                           key=lambda r: -r["medianMm"])

    by_depth = []
    for lo, hi, label in BANDS:
        group = [m for m in mandals if m["depthM"] is not None and lo <= m["depthM"] < hi]
        by_depth.append({"band": label, "mandals": len(group), "medianMm": round(statistics.median(m["stormMm"] for m in group), 0) if group else None,
                         "heavy": sum(m["stormMm"] >= HEAVY_MM for m in group)})
    deep = [m for m in mandals if m["depthM"] is not None and m["depthM"] >= DEEP_M]
    watch = sorted((m for m in deep if m["stormMm"] >= HEAVY_MM), key=lambda m: -m["stormMm"])

    # One row per map outline; where two mandals share an outline, the wetter one speaks for it.
    outline = {}
    for m in mandals:
        i = m.get("boundaryIndex")
        if i is None:
            continue
        if i not in outline or m["stormMm"] > outline[i]["stormMm"]:
            outline[i] = m
    map_rows = [[i, m["mandal"], m["district"], round(m["stormMm"]), m["depthM"]] for i, m in sorted(outline.items())]

    s = cap["state"]
    window_days = (datetime.date.fromisoformat(cap["rainWindow"]["after"]) - datetime.date.fromisoformat(cap["rainWindow"]["before"])).days
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "event": "Cyclone Arnab", "landfall": "2026-10-28",
        "rainWindow": {"from": (datetime.date.fromisoformat(cap["rainWindow"]["before"]) + datetime.timedelta(days=1)).isoformat(),
                       "to": cap["rainWindow"]["after"], "days": window_days},
        "source": cap["source"], "authorizationStatus": "research_pending",
        "groundwaterLatest": latest,
        "state": {
            "rainTmc": round(s["rainTmcAfter"] - s["rainTmcBefore"], 1),
            "normalTmc": round(s["normalTmcAfter"] - s["normalTmcBefore"], 1),
            "seasonDeviationBefore": s["seasonDeviationBefore"], "seasonDeviationAfter": s["seasonDeviationAfter"],
            "soilMedianBefore": s["soilMedianBefore"], "soilMedianAfter": s["soilMedianAfter"],
            "soilDriestBefore": s["soilDriestBefore"], "soilDriestAfter": s["soilDriestAfter"],
            "soilAsOf": cap["soilAsOf"],
            "reservoirTmcBefore": s["reservoirTmcBefore"], "reservoirTmcAfter": s["reservoirTmcAfter"],
            "mandals": len(mandals), "heavyMandals": len(heavy),
            "deepMandals": len(deep), "deepHeavyMandals": len(watch),
        },
        "heavyMm": HEAVY_MM, "deepM": DEEP_M,
        "districts": district_rows,
        "byDepth": by_depth,
        "precedent": {"event": "Cyclone Montha", "landfall": "2025-10-28", **montha_precedent(gw_by_name)},
        "map": map_rows,
        "watch": [{"district": m["district"], "mandal": m["mandal"], "stormMm": m["stormMm"], "depthM": m["depthM"]} for m in watch],
        "caveat": ("Rain is the State's gauge network, the difference between its season totals before and after the storm. "
                   "Groundwater after the storm is not published yet; the November reading is the first that will show it. "
                   "Last year's figures are a precedent, not a forecast: October 2025 was wet before Montha too, and the deepest "
                   "band holds few mandals. The three-month forecasts frozen before the storm did not know about it."),
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
    st = payload["state"]
    print(f"  {st['rainTmc']} TMC in {window_days} days against a normal {st['normalTmc']}; {st['heavyMandals']} mandals had {HEAVY_MM} mm or more")
    print(f"  of {st['deepMandals']} mandals deeper than {DEEP_M} m, {st['deepHeavyMandals']} had {HEAVY_MM} mm or more")
    for b in payload["precedent"]["bands"]:
        print(f"  Montha precedent, {b['band']}: {b['mandals']} mandals, {b['extraRiseM']} m beyond the usual, {b['roseMorePct']}% rose more")


if __name__ == "__main__":
    sys.exit(main())
