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

After the storm, each run also adds the day's water context to a log
(phase3_levels/data/cyclone_arnab_daily.json): rain since the storm began,
soil moisture, and storage in every reservoir, so the page can show where the
water went as the rivers bring it down. And once the State publishes October
and November readings, it sets what the water table did against the precedent.

Run daily by .github/workflows/arnab_daily.yml until 15 November 2026, and by
the weekly refresh after that.

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
LOG = os.path.join(HERE, "data", "cyclone_arnab_daily.json")
CONTEXT = os.path.join(ROOT, "app", "data", "water_context.json")
DROUGHT = os.path.join(ROOT, "app", "data", "drought_watch.json")
BEFORE_MONTH = "2026-09"             # the last reading before the storm
AFTER_MONTHS = ["2026-10", "2026-11"]

RAIN_BASE_TMC = None
# The drought manual's outcome: moderate or worse counts as flagged. "normal|moderate"
# is undecided (a missing indicator settles it), so it is not counted.
SEVERE = {"severe", "moderate|severe"}
FLAGGED = SEVERE | {"moderate"}
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


def log_entry(context):
    """One day of the water context, as the log keeps it."""
    rain, soil, res = context["rainfall"], context["soilMoisture"], context["reservoirs"]
    return {
        "date": context["generatedAt"][:10],
        "rainTo": rain["window"]["end"], "rainTmc": rain["state"]["actualTmc"], "normalTmc": rain["state"]["normalTmc"],
        "soilAsOf": soil["asOf"], "soilMedian30": soil["summary"]["medianPct"], "soilDriest": soil["summary"]["driestOnRecord"],
        "reservoirsAsOf": res["asOf"], "reservoirTmc": res["state"]["storageTmc"], "capacityTmc": res["state"]["capacityTmc"],
        "basins": {b["basin"]: b["storageTmc"] for b in res["byBasin"]},
        "reservoirs": {r["name"]: r["storageTmc"] for r in res["reservoirs"] if r.get("storageTmc") is not None},
        "meta": {r["name"]: [r.get("capacityTmc"), r.get("basin"), r.get("district")] for r in res["reservoirs"]},
    }


def update_log(paths):
    """Add each water context read to the log, one entry per day; a later read of the same day replaces it."""
    log = json.load(open(LOG)) if os.path.exists(LOG) else {"meta": {}, "days": []}
    days = {d["date"]: d for d in log["days"]}
    for path in paths:
        if not os.path.exists(path):
            continue
        entry = log_entry(json.load(open(path)))
        log["meta"].update(entry.pop("meta"))
        days[entry["date"]] = entry
    log["days"] = [days[k] for k in sorted(days)]
    with open(LOG, "w") as handle:
        json.dump(log, handle, indent=1)
    return log


def where_it_went(log):
    """Rain since the storm began, soil and storage by day; reservoirs and basins that gained most."""
    days = log["days"]
    if not days:
        return None
    first, last = days[0], days[-1]
    gains = []
    for name, now in last["reservoirs"].items():
        then = first["reservoirs"].get(name)
        cap, basin, district = (log["meta"].get(name) or [None, None, None])
        if then is None or not cap:
            continue
        gains.append({"name": name, "basin": basin, "district": district, "capacityTmc": cap,
                      "beforeTmc": round(then, 2), "nowTmc": round(now, 2), "gainTmc": round(now - then, 2),
                      "beforePct": round(100 * then / cap, 1), "nowPct": round(100 * now / cap, 1)})
    gains.sort(key=lambda g: -g["gainTmc"])
    basins = []
    for basin, now in last["basins"].items():
        then = first["basins"].get(basin)
        cap = sum((m[0] or 0) for m in log["meta"].values() if m[1] == basin)
        if then is None or not cap:
            continue
        basins.append({"basin": basin, "beforePct": round(100 * then / cap, 1), "nowPct": round(100 * now / cap, 1),
                       "gainTmc": round(now - then, 1)})
    basins.sort(key=lambda b: -b["gainTmc"])
    return {
        "from": first["reservoirsAsOf"][:10], "to": last["reservoirsAsOf"][:10],
        "days": [{"date": d["date"], "rainTo": d["rainTo"], "rainSinceTmc": round(d["rainTmc"] - RAIN_BASE_TMC, 1),
                  "soilMedian30": d["soilMedian30"], "reservoirTmc": round(d["reservoirTmc"], 1),
                  "reservoirPct": round(100 * d["reservoirTmc"] / d["capacityTmc"], 1)} for d in days],
        "gainTmc": round(last["reservoirTmc"] - first["reservoirTmc"], 1),
        "basins": basins, "reservoirs": [g for g in gains if g["gainTmc"] > 0][:8],
    }


def did_it_follow(gw_by_uuid, mandals, precedent):
    """Once the State publishes October and November, what the water table did against the precedent."""
    def usual(series_by_month, a, b):
        moves = [series_by_month[f"{y}-{b}"] - series_by_month[f"{y}-{a}"] for y in USUAL_YEARS
                 if f"{y}-{a}" in series_by_month and f"{y}-{b}" in series_by_month]
        return statistics.median(moves) if len(moves) >= 5 else None
    published = [m for m in AFTER_MONTHS if any(m in s for s in gw_by_uuid.values())]
    rows = {}
    for m in mandals:
        series = gw_by_uuid.get(m["uuid"], {})
        row = {}
        if "2026-10" in series and BEFORE_MONTH in series:
            row["octRiseM"] = round(series[BEFORE_MONTH] - series["2026-10"], 2)    # positive: the table rose
        if "2026-11" in series and "2026-10" in series:
            u = usual(series, "10", "11")
            if u is not None:
                row["novExtraRiseM"] = round(u - (series["2026-11"] - series["2026-10"]), 2)
        rows[m["uuid"]] = row
    bands = []
    if "2026-11" in published:
        prec = {b["band"]: b for b in precedent["bands"]}
        for lo, hi, label in BANDS:
            got = [rows[m["uuid"]]["novExtraRiseM"] for m in mandals if m["stormMm"] >= HEAVY_MM and m["depthM"] is not None
                   and lo <= m["depthM"] < hi and "novExtraRiseM" in rows[m["uuid"]]]
            if got:
                bands.append({"band": label, "mandals": len(got), "extraRiseM": round(statistics.median(got), 2),
                              "precedentM": prec.get(label, {}).get("extraRiseM")})
    return {"published": published, "bands": bands}, rows


def drought_overlay(outline):
    """The storm's rain against the drought manual's flags, outline by outline."""
    if not os.path.exists(DROUGHT):
        return {}, None
    watch = json.load(open(DROUGHT))
    flags, flagged = {}, []
    for row in watch["mandals"]:
        category = row.get("category")
        if category in FLAGGED:
            flags[row["i"]] = "s" if category in SEVERE else "m"
            if row["i"] in outline:
                flagged.append({"storm": outline[row["i"]]["stormMm"], "severe": category in SEVERE,
                                "drySpell": row.get("t1Why") == "drySpell"})
    if not flagged:
        return flags, None
    severe = [f for f in flagged if f["severe"]]
    return flags, {
        "asOf": watch["season"]["asOf"], "declareBy": watch["season"]["declareBy"],
        "flagged": len(flagged), "flaggedHeavy": sum(f["storm"] >= HEAVY_MM for f in flagged),
        "medianMm": round(statistics.median(f["storm"] for f in flagged)),
        "severe": len(severe), "severeHeavy": sum(f["storm"] >= HEAVY_MM for f in severe),
        "byDrySpell": sum(f["drySpell"] for f in flagged),
    }


def main():
    if "--capture" in sys.argv:
        i = sys.argv.index("--capture")
        capture(sys.argv[i + 1], sys.argv[i + 2])
    cap = json.load(open(CAPTURE))
    global RAIN_BASE_TMC
    RAIN_BASE_TMC = cap["state"]["rainTmcBefore"]
    seeds = sys.argv[sys.argv.index("--seed") + 1:sys.argv.index("--seed") + 3] if "--seed" in sys.argv else []
    log = update_log(seeds + [CONTEXT])
    gw_by_name, gw_by_uuid = groundwater()
    latest = BEFORE_MONTH

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
    flags, drought = drought_overlay(outline)
    map_rows = [[i, m["mandal"], m["district"], round(m["stormMm"]), m["depthM"], flags.get(i, "")] for i, m in sorted(outline.items())]

    precedent = {"event": "Cyclone Montha", "landfall": "2025-10-28", **montha_precedent(gw_by_name)}
    follow, follow_rows = did_it_follow(gw_by_uuid, mandals, precedent)
    expected = {b["band"]: b["extraRiseM"] for b in precedent["bands"]}

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
        "drought": drought,
        "precedent": precedent,
        "since": where_it_went(log),
        "follow": follow,
        "updatedAt": log["days"][-1]["date"] if log["days"] else None,
        "map": map_rows,
        "watch": [{"district": m["district"], "mandal": m["mandal"], "stormMm": m["stormMm"], "depthM": m["depthM"],
                   "precedentM": expected.get(band_of(m["depthM"])), **follow_rows.get(m["uuid"], {})} for m in watch],
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
