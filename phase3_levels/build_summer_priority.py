"""Where to plan summer drinking water first: one ranked list of mandals.

The summer outlook says where the water table is heading past its deepest May on
record. That is 107 mandals, too many to start everywhere at once, and the
outlook's own record says a "beyond" call sets a new record about one time in
three. So the list asks what else this season says about each of them, from
sources that do not share the outlook's inputs:

  storms    the two October-November cyclones together left it under 50 mm
            (State rain gauges, cyclone_arnab.json)
  monsoon   the monsoon recharge watch flagged a provisional shortfall
            (APWRIMS readings against the mandal's own seasons, monsoon_watch.json)
  tanks     its village tanks hold less water than usual for the time of year
            (Sentinel-2 over the tank beds, tank_fill.json)
  quality   its drinking-water sources already fail chemical tests at or above
            the State's rate, so the fallback sources are fewer
            (Jal Jeevan Mission tests, drinking_water.json)

First: heading past its record in a typical winter, and at least two of the four
agree. Next: heading past its record, with fewer signs. Watch: past its record
only in a winter as dry as its driest, more than 10 m down, and at least three
signs agree. Inside each band, more signs first, then more people.

Nothing here is a forecast of wells failing: the depth a well fails at depends
on how deep it was drilled, which no public record gives. It is an order to
start planning in, with the reasons beside each name.

Output: app/data/summer_priority.json
"""
import datetime
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(APP, "summer_priority.json")

STORM_DRY_MM = 50       # the cyclone page's "missed" line, both storms together
TANK_GAP = 0.10         # the tank page's "emptier than usual" rule: 10 points below its own median
MIN_TESTED = 20         # fewer tests than this cannot carry a rate
FIRST_SIGNS = 2
WATCH_SIGNS = 3
SIGNS = ("storms", "monsoon", "tanks", "quality")


def title(value):
    """The site's titleCase (app/lib/data.ts): initials and NTR stay capitals."""
    if re.search(r"[a-z]", value):
        return value
    parts = [p for p in re.split(r"[\s_]+", value) if p]
    return " ".join(p.upper() if re.fullmatch(r"([A-Za-z]\.)+[A-Za-z]?", p) or p.upper() == "NTR"
                    else p[:1].upper() + p[1:].lower() for p in parts)


def load(name):
    with open(os.path.join(APP, name)) as handle:
        return json.load(handle)


def deep(row, depth_m):
    """The outlook's own test: the projected May it is judged on is past depth_m."""
    return (row["typical"] if row["tier"] == "beyond" else row["dry"]) >= depth_m


def band_of(row, signs, depth_m):
    if row["tier"] == "beyond":
        return "first" if signs >= FIRST_SIGNS else "next"
    if row["tier"] == "dry" and deep(row, depth_m) and signs >= WATCH_SIGNS:
        return "watch"
    return None


def build(outlook, drinking, tanks, cyclones, monsoon, records, outlines):
    storm_mm = {row[0]: row[3] for row in (cyclones.get("together") or {}).get("map", [])}
    flags = {}
    for row in monsoon["mandals"]:
        if row.get("boundaryIndex") is not None and row.get("status") in ("short", "severe"):
            flags.setdefault(row["boundaryIndex"], []).append(row["status"])
    tested = sum(r["tested"] for r in drinking["mandals"] if r)
    failed = sum(r["chemical"] for r in drinking["mandals"] if r)
    state_rate = failed / tested if tested else None

    rows = []
    for index, row in enumerate(outlook["mandals"]):
        if not row:
            continue
        water = drinking["mandals"][index] if index < len(drinking["mandals"]) else None
        tank = tanks["mandals"][index] if index < len(tanks["mandals"]) else None
        rate = water["chemical"] / water["tested"] if water and water["tested"] >= MIN_TESTED else None
        storm = storm_mm.get(index)
        sign = {
            "storms": storm is not None and storm < STORM_DRY_MM,
            "monsoon": index in flags,
            "tanks": bool(tank and tank.get("now") is not None and tank.get("usual") is not None
                          and tank["now"] < tank["usual"] - TANK_GAP),
            "quality": rate is not None and state_rate is not None and rate >= state_rate,
        }
        count = sum(sign.values())
        band = band_of(row, count, outlook["deepM"])
        if band is None:
            continue
        identity = records[index]["identity"] if index < len(records) else {}
        rows.append({
            "index": index, "id": identity.get("mandalId"),
            # Named as the map names them, like the rest of the summer page.
            "mandal": title(outlines[index]["m"]), "district": title(outlines[index]["d"]),
            "band": band, "tier": row["tier"],
            "deep": deep(row, outlook["deepM"]),
            "nowM": row["anchor"], "typicalM": row["typical"], "dryM": row["dry"], "deepestMayM": row["deepestMay"],
            "pastRecordM": round((row["typical"] if row["tier"] == "beyond" else row["dry"]) - row["deepestMay"], 2),
            "people": row.get("people"),
            "sources": water["sources"] if water else None,
            "testedAboveLimitPct": None if rate is None else round(100 * rate, 1),
            "stormMm": storm,
            "monsoon": "severe" if "severe" in flags.get(index, []) else (flags[index][0] if index in flags else None),
            "tankNowPct": None if not tank or tank.get("now") is None else round(100 * tank["now"]),
            "tankUsualPct": None if not tank or tank.get("usual") is None else round(100 * tank["usual"]),
            "signs": [name for name in SIGNS if sign[name]],
        })

    order = {"first": 0, "next": 1, "watch": 2}
    rows.sort(key=lambda r: (order[r["band"]], -len(r["signs"]), -(r["people"] or 0)))

    def tally(band):
        part = [r for r in rows if r["band"] == band]
        return {"mandals": len(part), "people": sum(r["people"] or 0 for r in part),
                "sources": sum(r["sources"] or 0 for r in part),
                "deep": sum(1 for r in part if r["deep"]),
                "signs": {name: sum(1 for r in part if name in r["signs"]) for name in SIGNS}}

    districts = {}
    for r in rows:
        d = districts.setdefault(r["district"], {"district": r["district"], "first": 0, "next": 0, "watch": 0, "people": 0})
        d[r["band"]] += 1
        if r["band"] == "first":
            d["people"] += r["people"] or 0
    return {
        "contractVersion": "summer-priority-v1",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "targetMay": outlook["targetMay"], "anchor": outlook["anchor"], "deepM": outlook["deepM"],
        "inputs": {
            "outlook": outlook["generatedAt"], "drinkingWater": drinking.get("asOf"),
            "tanks": tanks.get("window"), "storms": (cyclones.get("together") or {}).get("rainWindow"),
            "monsoon": monsoon["season"]["latestMonth"],
        },
        "rules": {"stormDryMm": STORM_DRY_MM, "tankGapPoints": round(100 * TANK_GAP), "minTested": MIN_TESTED,
                  "stateAboveLimitPct": None if state_rate is None else round(100 * state_rate, 1),
                  "firstSigns": FIRST_SIGNS, "watchSigns": WATCH_SIGNS},
        "summary": {band: tally(band) for band in ("first", "next", "watch")},
        "districts": sorted(districts.values(), key=lambda d: (-d["first"], -d["next"], d["district"])),
        "mandals": rows,
    }


def main():
    payload = build(load("summer_outlook.json"), load("drinking_water.json"), load("tank_fill.json"),
                    load("cyclone_arnab.json"), load("monsoon_watch.json"),
                    load("mandal_groundwater_records_v2.json")["records"], load("ap_map_geometry.json")["mandals"])
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    for band, t in payload["summary"].items():
        print(f"  {band:<6} {t['mandals']:>3} mandals, {t['people']:>10,} people, {t['sources']:>7,} sources  {t['signs']}")
    print(f"  wrote app/data/{os.path.basename(OUT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
