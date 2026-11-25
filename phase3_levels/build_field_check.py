#!/usr/bin/env python3
"""The field check: a pilot with the Groundwater Department, planned and scored in public.

The site's figures are mandal figures. Officials ask about villages, and the honest
answer (build_village_offsets.py) is that a village's water table is reachable only by
reading wells there: the gap between a well and its mandal is 94% persistent, so a few
readings pin it, but no model predicts it. This is the pilot that tests that, and the
summer outlook with it, on the ground.

The plan (deterministic, from published data):
- two districts, one hard rock in the dry south and one alluvial delta in the wet north,
  each the largest set of existing observation wells of its kind that also holds a
  mandal the summer priority list names;
- in each, up to MANDALS_PER_DISTRICT rural mandals: every one on the priority list, then
  the rest by how many observation wells they hold;
- in each mandal WELLS_PER_MANDAL wells: the existing observation wells in its villages
  (CGWB records, fixed measuring points) and private wells added by the field team,
  three or more of one kind in a village, so each village forms its own reference;
- a reading every ROUND_DAYS days from FIRST_ROUND to the end of May.

The predictions, written down before the first reading (from village_offsets.json and
summer_outlook.json): how far the mandal figure alone misses a well, how far it misses
after three readings of that well, by well type and terrain, and how much deeper the
priority mandals' wells go by May than the others'.

Scoring, once readings are filed as CSV in phase3_levels/data/field_check/ (READING_FIELDS):
each reading against (a) the mandal's hand-read figure for that month, (b) that plus the
village's recorded offset where one exists, (c) that plus the well's own mean offset over
its previous three or more readings. Unscored until the mandal's month is published. A well
read "dry" is counted as an outcome and never scored as a depth.

Output: app/data/field_check.json. Weekly.
"""
import collections
import csv
import datetime
import glob
import hashlib
import json
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
VILLAGES = os.path.join(APP, "village_offsets.json")
GEOMETRY = os.path.join(APP, "ap_map_display.json")
PRIORITY = os.path.join(APP, "summer_priority.json")
OUTLOOK = os.path.join(APP, "summer_outlook.json")
READINGS = os.path.join(HERE, "data", "field_check")
OUT = os.path.join(APP, "field_check.json")
sys.path.insert(0, HERE)
from build_sensor_wells_check import hand_by_boundary  # noqa: E402

DISTRICTS = {
    "SRI SATHYA SAI": "Hard rock in the dry south: the northeast monsoon there is running about 60% short, and hard rock is where a well's own readings help most.",
    "EAST GODAVARI": "Alluvial delta in the wet north: the contrast case, where the mandal figure is already closest to the villages.",
}
MANDALS_PER_DISTRICT = 5
WELLS_PER_MANDAL = 10
FIRST_ROUND = "2026-12-01"
ROUND_DAYS = 14
LAST_DAY = "2027-05-31"
MIN_PREVIOUS = 3
READING_FIELDS = ["round_date", "district", "mandal", "village", "well_id", "well_type", "owner", "latitude", "longitude",
                  "mp_height_m", "water_below_mp_m", "hours_since_pumping", "well_depth_m", "observer", "note"]
WELL_TYPES = {"dug": "Dug well", "bore": "Bore well", "piezometer": "Piezometer"}


def norm(text):
    return re.sub(r"[^A-Z]", "", str(text).upper())


def rounds():
    day, last, out = datetime.date.fromisoformat(FIRST_ROUND), datetime.date.fromisoformat(LAST_DAY), []
    while day <= last:
        out.append(day.isoformat())
        day += datetime.timedelta(days=ROUND_DAYS)
    return out


def plan(villages, features, priority, outlook):
    where = {(norm(f["d"]), norm(f["m"])): i for i, f in enumerate(features)}
    band = {r["index"]: r["band"] for r in priority["mandals"]}
    by_mandal = collections.defaultdict(list)
    for v in villages["villages"]:
        by_mandal[(v["district"], v["mandal"])].append(v)
    chosen = []
    for district in DISTRICTS:
        candidates = []
        for (d, m), rows in by_mandal.items():
            index = where.get((norm(d), norm(m)))
            # Rural mandals only: a town's wells are pumped too hard to be read at rest.
            if norm(d) != norm(district) or index is None or "URBAN" in norm(m):
                continue
            wells = sum(r["wells"] for r in rows)
            candidates.append((band.get(index) is None, -wells, m, index, rows))
        for _, minus_wells, mandal, index, rows in sorted(candidates)[:MANDALS_PER_DISTRICT]:
            o = outlook["mandals"][index] or {}
            observed = -minus_wells
            chosen.append({
                "district": district, "mandal": mandal.title(), "index": index, "aquifer": rows[0]["aquifer"],
                "tier": o.get("tier"), "band": band.get(index),
                "nowM": o.get("anchor"), "mayTypicalM": o.get("typical"), "mayDryM": o.get("dry"), "deepestMayM": o.get("deepestMay"),
                "observationWells": observed, "privateWellsToAdd": max(0, WELLS_PER_MANDAL - observed),
                "villages": sorted(({"village": r["village"], "wellType": r["wellType"], "wells": r["wells"], "offsetM": r["offsetM"],
                                     "readings": r["readings"], "lastRead": r["lastRead"]} for r in rows), key=lambda r: r["village"]),
            })
    return chosen


def predictions(villages, mandals):
    v = villages["validation"]
    by_type = {w["wellType"]: w for w in v["byWellType"]}
    def after(wtype, n):
        rows = [d for d in by_type[wtype]["forwardDoseResponse"] if d["readings"] == n]
        return rows[0]["residualErrorM"] if rows else None
    aquifers = {a["aquifer"]: a for a in v["splitHalf"]["byAquifer"]}
    listed = [m for m in mandals if m["band"] and m["nowM"] is not None and m["mayTypicalM"] is not None]
    rest = [m for m in mandals if not m["band"] and m["nowM"] is not None and m["mayTypicalM"] is not None]
    drop = lambda rows: round(statistics.median(m["mayTypicalM"] - m["nowM"] for m in rows), 2) if rows else None
    return {
        "dugMandalOnlyM": round(by_type["Dug well"]["forwardBaselineM"], 1),
        "dugAfterThreeM": round(after("Dug well", 3), 1),
        "boreMandalOnlyM": round(by_type["Bore well"]["forwardBaselineM"], 1),
        "boreAfterThreeM": round(after("Bore well", 3), 1),
        "byAquifer": {name: {"mandalOnlyM": round(a["mandalMeanAppliedMaeM"], 1), "withOffsetM": round(a["withLearnedOffsetMaeM"], 1)}
                      for name, a in aquifers.items() if name in {m["aquifer"] for m in mandals}},
        "mayDropListedM": drop(listed), "mayDropOthersM": drop(rest),
        "source": "village_offsets.json forward test (each well's later readings, never the ones its offset was learned from) and summer_outlook.json",
    }


def read_readings(folder=READINGS):
    rows = []
    for path in sorted(glob.glob(os.path.join(folder, "*.csv"))):
        for row in csv.DictReader(open(path, newline="")):
            try:
                datetime.date.fromisoformat(row["round_date"])
                # A dry well is an outcome, not a gap: kept and counted, never scored as a depth.
                dry = str(row.get("water_below_mp_m", "")).strip().lower() == "dry"
                depth = None if dry else float(row["water_below_mp_m"]) - float(row.get("mp_height_m") or 0)
            except (KeyError, ValueError):
                continue
            rows.append({**row, "depthM": None if dry else round(depth, 2), "dry": dry, "file": os.path.basename(path)})
    return sorted(rows, key=lambda r: (r["well_id"], r["round_date"]))


def score(readings, mandals, villages, hand):
    """Each reading against the three estimates, once its mandal's month is published."""
    index = {(norm(m["district"]), norm(m["mandal"])): m["index"] for m in mandals}
    offsets = {(norm(v["district"]), norm(v["mandal"]), norm(v["village"]), v["wellType"]): v["offsetM"] for v in villages["villages"]}
    history = collections.defaultdict(list)       # well -> gaps to the mandal figure, in reading order
    scored, waiting = [], 0
    for r in readings:
        if r["dry"]:
            continue
        boundary = index.get((norm(r["district"]), norm(r["mandal"])))
        figure = hand.get(boundary, {}).get(r["round_date"][:7]) if boundary is not None else None
        if figure is None:
            waiting += 1
            continue
        wtype = WELL_TYPES.get(str(r.get("well_type", "")).strip().lower(), "Other")
        offset = offsets.get((norm(r["district"]), norm(r["mandal"]), norm(r["village"]), wtype))
        past = history[r["well_id"]]
        row = {"wellType": wtype, "aquifer": next((m["aquifer"] for m in mandals if m["index"] == boundary), None),
               "mandalOnly": abs(figure - r["depthM"]),
               "villageOffset": abs(figure + offset - r["depthM"]) if offset is not None else None,
               "ownThree": abs(figure + statistics.fmean(past) - r["depthM"]) if len(past) >= MIN_PREVIOUS else None}
        scored.append(row)
        past.append(r["depthM"] - figure)
    def block(rows):
        out = {"readings": len(rows)}
        for key in ("mandalOnly", "villageOffset", "ownThree"):
            values = [r[key] for r in rows if r[key] is not None]
            out[key] = {"readings": len(values), "maeM": round(statistics.fmean(values), 2)} if values else None
        return out
    groups = collections.defaultdict(list)
    for r in scored:
        groups[r["wellType"]].append(r)
        groups[r["aquifer"] or "unknown"].append(r)
    return {"readingsFiled": len(readings), "wells": len({r["well_id"] for r in readings}), "awaitingMandalFigure": waiting,
            "dryReadings": sum(r["dry"] for r in readings), "lastRound": max(r["round_date"] for r in readings),
            "all": block(scored) if scored else None, "by": {k: block(v) for k, v in sorted(groups.items())}}


def main():
    villages, features = json.load(open(VILLAGES)), json.load(open(GEOMETRY))["mandals"]
    mandals = plan(villages, features, json.load(open(PRIORITY)), json.load(open(OUTLOOK)))
    preds = predictions(villages, mandals)
    # The plan and its predictions, fingerprinted: once the first round is read, they are not revised.
    frozen = json.dumps({"mandals": mandals, "predictions": preds}, sort_keys=True).encode()
    previous = json.load(open(OUT)) if os.path.exists(OUT) else None
    readings = read_readings()
    if previous and previous.get("planSha256") and readings:
        mandals, preds, digest, planned = previous["mandals"], previous["predictions"], previous["planSha256"], previous["plannedAt"]
    else:
        digest, planned = hashlib.sha256(frozen).hexdigest(), datetime.date.today().isoformat()
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "status": "readings coming in" if readings else "proposed",
        "plannedAt": planned, "planSha256": digest,
        "districts": [{"district": d, "why": why} for d, why in DISTRICTS.items()],
        "wellsPerMandal": WELLS_PER_MANDAL, "rounds": rounds(), "roundDays": ROUND_DAYS,
        "readingFields": READING_FIELDS,
        "mandals": mandals,
        "predictions": preds,
        "results": score(readings, mandals, villages, hand_by_boundary()) if readings else None,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    wells = sum(m["observationWells"] + m["privateWellsToAdd"] for m in mandals)
    print(f"field check {payload['status']}: {len(mandals)} mandals, {wells} wells "
          f"({sum(m['observationWells'] for m in mandals)} observation wells), {len(payload['rounds'])} rounds; "
          f"{len(readings)} readings filed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
