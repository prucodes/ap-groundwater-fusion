"""The third cyclone of the season (provisionally Akvan), measured as it comes.

IMD expects a very severe cyclonic storm to reach the south Andhra Pradesh coast
around the night of 19 November 2026. Arnab and Murasu, the two before it, put
676 TMC on the State but left 175 of its deep water tables with under 50 mm, most
of them in the south and in Rayalaseema, near where this one is forecast to come
ashore. So the question this page answers is not only how much fell but whether it
reached the mandals the first two missed.

Two baselines, frozen once, before the storm:
- rain: each mandal's season total from the State gauges to 14 November
  (data/cyclone_akvan_rain_before.json); the storm's rain is the total now less it;
- sensors: every automatic water-level recorder's reading on 16 November
  (data/cyclone_akvan_sensors_before.json); each sensor's change since then is the
  first sign of the water table answering, days before the monthly reading. A
  sensor is set only against itself.

The rain count closes when the gauges pass CLOSES; until then it moves daily. The
name, the date and the place of landfall are IMD's, kept here as LANDFALL and NEAR,
and set when IMD confirms them.

Output: app/data/cyclone_akvan.json. Daily, from the cyclone page's daily job.
"""
import datetime
import json
import os
import statistics
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
CONTEXT = os.path.join(APP, "water_context.json")
SENSORS = os.path.join(APP, "gw_sensors.json")
EARLIER = os.path.join(APP, "cyclone_arnab.json")
RAIN_BEFORE = os.path.join(HERE, "data", "cyclone_akvan_rain_before.json")
SENSORS_BEFORE = os.path.join(HERE, "data", "cyclone_akvan_sensors_before.json")
OUT = os.path.join(APP, "cyclone_akvan.json")

NAME = "Akvan"                      # the next name on the north Indian Ocean list; IMD confirms it
NAME_CONFIRMED = True              # the name on the list; set on 16 Nov as the depression became a cyclone
LANDFALL = "2026-11-19"             # IMD's expected date (night of 19 November)
LANDFALL_CONFIRMED = False
NEAR = "the south Andhra Pradesh coast"
BASELINE_RAIN_TO = "2026-11-14"     # the last gauge day before the storm's rain
CLOSES = "2026-11-24"               # move later if rain is still falling then
HEAVY_MM = 100
DEEP_M = 8
STILL_DRY_MM = 50
RISE_M = 0.1                        # a sensor counts as risen past this
MIN_DISTRICT_SENSORS = 10           # a district needs this many sensors to be ranked


def freeze_baselines():
    """Write each baseline once, from the files as they stand before the storm."""
    if not os.path.exists(RAIN_BEFORE):
        rain = json.load(open(CONTEXT))["rainfall"]
        if rain["window"]["end"] > BASELINE_RAIN_TO:
            sys.exit(f"The water context already runs to {rain['window']['end']}; the rain baseline must be frozen before the storm.")
        json.dump({"to": rain["window"]["end"], "state": {"rainTmc": rain["state"]["actualTmc"], "normalTmc": rain["state"]["normalTmc"],
                                                        "seasonDeviation": rain["state"]["deviationPct"]},
                   "mandals": {m["uuid"]: [m["actualMm"], m.get("boundaryIndex"), m["district"], m["mandal"]]
                               for m in rain["mandals"] if m.get("actualMm") is not None}},
                  open(RAIN_BEFORE, "w"), separators=(",", ":"))
        print(f"  froze the rain baseline at {rain['window']['end']}")
    if not os.path.exists(SENSORS_BEFORE):
        s = json.load(open(SENSORS))
        live = [st for st in s["stations"] if st[7] is not None and st[7] <= s["activeHours"]]
        json.dump({"reading": s["latestReading"], "stations": {f"{st[0]}|{st[1]}|{st[2]}": [st[5], st[8]] for st in live}},
                  open(SENSORS_BEFORE, "w"), separators=(",", ":"))
        print(f"  froze {len(live)} sensors at {s['latestReading']}")


def missed_before():
    """The deep water tables Arnab and Murasu together left under STILL_DRY_MM, by outline."""
    together = (json.load(open(EARLIER)).get("together") or {})
    return {row[0] for row in together.get("map", []) if row[4] is not None and row[4] >= DEEP_M and row[3] < STILL_DRY_MM}


def rain_now(before):
    rain = json.load(open(CONTEXT))["rainfall"]
    end = min(rain["window"]["end"], CLOSES)
    now = {m["uuid"]: m["actualMm"] for m in rain["mandals"] if m.get("actualMm") is not None}
    rows = []
    for uuid, (base, index, district, mandal) in before["mandals"].items():
        if uuid in now:
            # A revision to the season total can pull a reading below the baseline; that is not rain.
            rows.append({"uuid": uuid, "boundaryIndex": index, "district": district, "mandal": mandal, "mm": round(max(0.0, now[uuid] - base), 1)})
    state = {"rainTmc": round(rain["state"]["actualTmc"] - before["state"]["rainTmc"], 1),
             "normalTmc": round(rain["state"]["normalTmc"] - before["state"]["normalTmc"], 1),
             "seasonDeviationBefore": before["state"]["seasonDeviation"], "seasonDeviationAfter": rain["state"]["deviationPct"]}
    return rain["window"]["end"], end, rows, state


def sensors_now(before):
    s = json.load(open(SENSORS))
    rises, seen = [], set()
    for st in s["stations"]:
        key = f"{st[0]}|{st[1]}|{st[2]}"
        # Two recorders can share a name and a position; the baseline holds one, so count the place once.
        if key in before["stations"] and key not in seen and st[7] is not None and st[7] <= s["activeHours"]:
            seen.add(key)
            then, index = before["stations"][key]
            # Positive is a rise: the water table nearer the surface than before the storm.
            rises.append([st[0], st[1], st[2], index, round(then - st[5], 2), st[3]])
    return s["latestReading"], rises


def ist_day(iso):
    return (datetime.datetime.fromisoformat(iso) + datetime.timedelta(hours=5, minutes=30)).date().isoformat()


def timeline(reading, rises, rain_tmc):
    """One point per IST day, kept across runs: the day's last reading replaces its earlier one."""
    try:
        points = json.load(open(OUT)).get("timeline", [])
    except (OSError, ValueError):
        points = []
    today = ist_day(reading)
    point = {"day": today, "compared": len(rises), "risen": sum(r[4] > RISE_M for r in rises),
             "medianRiseM": round(statistics.median(r[4] for r in rises), 2) if rises else None, "rainTmc": rain_tmc}
    return sorted([p for p in points if p["day"] != today] + [point], key=lambda p: p["day"])


def district_response(rises):
    """Each district's sensors: how many, how many risen, and the median rise."""
    by = defaultdict(list)
    for r in rises:
        by[r[5]].append(r[4])
    rows = [{"district": d, "compared": len(v), "risen": sum(x > RISE_M for x in v), "medianRiseM": round(statistics.median(v), 2)}
            for d, v in by.items() if d and len(v) >= MIN_DISTRICT_SENSORS]
    return sorted(rows, key=lambda r: (-r["risen"] / r["compared"], -r["medianRiseM"], r["district"]))


def main():
    freeze_baselines()
    rain_before = json.load(open(RAIN_BEFORE))
    sensors_before = json.load(open(SENSORS_BEFORE))
    missed = missed_before()
    gauges_to, counted_to, rows, state = rain_now(rain_before)
    started = (datetime.date.fromisoformat(rain_before["to"]) + datetime.timedelta(days=1)).isoformat()
    counting = counted_to >= started

    outline = {}
    for r in rows:
        i = r["boundaryIndex"]
        if i is not None and (i not in outline or r["mm"] > outline[i]["mm"]):
            outline[i] = r
    reached = [i for i in missed if i in outline and outline[i]["mm"] >= STILL_DRY_MM]
    by_district = defaultdict(list)
    for r in rows:
        by_district[r["district"]].append(r["mm"])

    reading, rises = sensors_now(sensors_before)
    risen = [r for r in rises if r[4] > RISE_M]
    in_missed = [r for r in rises if r[3] in missed]
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "event": f"Cyclone {NAME}", "name": NAME, "nameConfirmed": NAME_CONFIRMED,
        "landfall": LANDFALL, "landfallConfirmed": LANDFALL_CONFIRMED, "near": NEAR,
        "source": "APWRIMS water context (State rain gauges) and telemetry (automatic water-level recorders), against frozen pre-storm baselines",
        "authorizationStatus": "research_pending",
        "rainWindow": {"from": started, "to": counted_to if counting else None, "gaugesTo": gauges_to, "closes": CLOSES,
                       "open": counted_to < CLOSES, "baselineTo": rain_before["to"]},
        "state": {**state, "mandals": len(rows), "heavyMandals": sum(r["mm"] >= HEAVY_MM for r in rows)} if counting else None,
        "missedBefore": {"mandals": len(missed), "reached": len(reached), "reachedMm": STILL_DRY_MM,
                         "medianMm": round(statistics.median([outline[i]["mm"] for i in missed if i in outline]), 0) if counting and missed else None},
        "districts": sorted(({"district": d, "medianMm": round(statistics.median(v), 0), "heavy": sum(x >= HEAVY_MM for x in v)}
                             for d, v in by_district.items()), key=lambda r: -r["medianMm"]) if counting else [],
        # [boundary index, mandal, district, storm mm, missed by the first two]
        "map": [[i, r["mandal"], r["district"], round(r["mm"]), i in missed] for i, r in sorted(outline.items())] if counting else [],
        "missed": sorted(missed),
        "sensors": {
            "baseline": sensors_before["reading"], "reading": reading, "compared": len(rises),
            "risen": len(risen), "medianRiseM": round(statistics.median(r[4] for r in rises), 2) if rises else None,
            "inMissed": len(in_missed), "risenInMissed": sum(r[4] > RISE_M for r in in_missed),
            # [name, lat, lng, boundary index, rise since the baseline m]
            "stations": [r[:5] for r in rises],
            "districts": district_response(rises),
        },
        # The water table's answer day by day, beside the rain: one point per IST day.
        "timeline": timeline(reading, rises, round(state["rainTmc"], 1) if counting else None),
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"  {payload['event']}: rain {'from ' + started + ' to ' + counted_to if counting else 'not yet counted'}"
          f"{'; ' + str(state['rainTmc']) + ' TMC' if counting else ''}; missed-before reached {len(reached)} of {len(missed)}; "
          f"sensors risen {len(risen)} of {len(rises)} since {sensors_before['reading']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
