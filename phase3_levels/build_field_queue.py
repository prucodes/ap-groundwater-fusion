#!/usr/bin/env python3
"""Where a visit would be worth most: the mandals to measure first.

The platform has spent the year producing lists of places to check. Mandals whose
water table stands below sea level. Mandals the decade and the official assessment
describe differently. Mandals carried by a model rather than a reading. None of
them were ranked against each other, so a department with the time to visit twenty
places had no way to choose which twenty.

A reading is worth taking where it would settle something, and where what it
settles matters to a lot of people. So the queue multiplies three things:

  * how wide the published interval is, which is the model saying how unsure it is
  * how many people live there
  * how much irrigated land it holds

Each is turned into its rank among all mandals before they are multiplied, because
the three arrive in metres, people and square kilometres, and a product of raw
numbers would simply rank by population. Ranks also keep one freak value from
carrying a mandal up the list. The three raw figures travel with every row, so a
reader can see which of them put a mandal where it is.

What the queue deliberately does NOT do.

It does not fold the reasons into the score. A mandal below sea level, or one the
assessment and the decade disagree about, carries that as a label rather than as
extra points. They are different arguments for visiting and a reader should weigh
them, not have them silently priced in by a weight nobody chose.

It does not rank on stress. An over-exploited mandal is not automatically where a
reading is most useful: the ones already classified are the ones already watched.
The stage of extraction travels as a label for the same reason.

It is not a sampling design. It says where to look first, not how to measure, and
a village-level question needs several wells of one type in a mandal rather than
one visit to it (see build_village_offsets.py).
"""
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
POPULATION = os.path.join(ROOT, "phase3_levels", "data", "mandal_population.json")
OUT = os.path.join(APP, "field_queue.json")

PUBLISHED = 40          # rows the page shows; the full table is large and client-side
MIN_IRRIGATED_KM2 = 1.0  # below this a mandal has no irrigation worth weighing


def load(name):
    with open(os.path.join(APP, name), encoding="utf-8") as handle:
        return json.load(handle)


def geometry_index():
    """Boundary index -> mandal key, and the key -> every index it owns.

    Seventeen mandals are drawn as more than one polygon, so their people and
    their area arrive in pieces and have to be added up.
    """
    geometry = load("ap_map_geometry.json")
    by_index, by_key = {}, {}
    for index, entry in enumerate(geometry["mandals"]):
        key = f"{entry['d']}|{entry['m']}"
        by_index[index] = key
        by_key.setdefault(key, []).append(index)
    return by_index, by_key


def ranks(values):
    """Each value's position among the rest, 0 to 1, averaging ties."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    out = [0.0] * len(values)
    position = 0
    while position < len(order):
        stop = position
        while stop + 1 < len(order) and values[order[stop + 1]] == values[order[position]]:
            stop += 1
        share = (position + stop) / 2 / max(len(values) - 1, 1)
        for i in range(position, stop + 1):
            out[order[i]] = share
        position = stop + 1
    return out


def build():
    by_index, by_key = geometry_index()

    with open(POPULATION, encoding="utf-8") as handle:
        census = json.load(handle)
    people_at = census["people"]

    area_at = {}
    for row in load("monsoon_watch.json")["mandals"]:
        index, area = row.get("boundaryIndex"), row.get("areaKm2")
        if index is not None and area:
            area_at[int(index)] = float(area)

    signals = load("field_signals_mandals.json")
    irrigated_at = signals["fields"].index("irrigatedPct")
    stage_at = signals["fields"].index("stagePct")
    category_at = signals["fields"].index("category")
    categories = signals["codes"]["category"]

    trajectory = load("assessment_trajectory.json")
    disagrees = {}
    for row in trajectory.get("review", []):
        disagrees[by_index.get(row.get("boundaryIndex"))] = "safe but deepening"
    for row in trajectory.get("recovering", []):
        disagrees[by_index.get(row.get("boundaryIndex"))] = "stressed but rising"

    watch = {f"{row['district']}|{row['mandal']}" for row in load("seawater_watch.json")["watch"]}

    rows = []
    for record in load("mandal_groundwater_records_v2.json")["records"]:
        identity = record["identity"]
        key = f"{identity['districtName']}|{identity['mandalName']}"
        quality = record.get("quality") or {}
        width = quality.get("intervalWidthM")
        indices = by_key.get(key, [])
        if width is None or not indices:
            continue

        people = sum(people_at[i] for i in indices if i < len(people_at))
        area = sum(area_at.get(i, 0.0) for i in indices)
        values = signals["values"].get(key)
        irrigated_pct = values[irrigated_at] if values else None
        if not area or irrigated_pct is None:
            continue
        irrigated = area * float(irrigated_pct) / 100.0
        if irrigated < MIN_IRRIGATED_KM2:
            continue

        code = values[category_at]
        rows.append({
            "key": key,
            "district": identity["districtName"],
            "mandal": identity["mandalName"],
            "intervalWidthM": round(float(width), 2),
            "people": int(people),
            "irrigatedKm2": round(irrigated, 1),
            "areaKm2": round(area, 1),
            "irrigatedPct": round(float(irrigated_pct), 1),
            "stagePct": values[stage_at],
            "category": categories[code] if isinstance(code, int) and 0 <= code < len(categories) else None,
            "confidence": quality.get("confidenceClass"),
            "historyMonths": quality.get("observationHistoryMonths"),
            "belowSeaLevel": key in watch,
            "disagrees": disagrees.get(key),
        })

    width_rank = ranks([r["intervalWidthM"] for r in rows])
    people_rank = ranks([float(r["people"]) for r in rows])
    irrigated_rank = ranks([r["irrigatedKm2"] for r in rows])
    for row, a, b, c in zip(rows, width_rank, people_rank, irrigated_rank):
        row["index"] = round(100 * a * b * c, 1)
        row["rankParts"] = {"uncertainty": round(a, 3), "people": round(b, 3),
                            "irrigated": round(c, 3)}
    rows.sort(key=lambda r: -r["index"])
    for place, row in enumerate(rows, 1):
        row["rank"] = place

    top = rows[:PUBLISHED]
    return {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
            .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "method": "the rank of the published interval width, of population and of irrigated "
                  "area, multiplied; each mandal's three raw figures travel with its row",
        "scored": len(rows),
        "published": len(top),
        "populationSource": f"{census['source']} {census['year']}",
        "populationCaveat": census["caveat"],
        "minIrrigatedKm2": MIN_IRRIGATED_KM2,
        "totals": {
            "peopleInTopTwenty": sum(r["people"] for r in rows[:20]),
            "irrigatedKm2InTopTwenty": round(sum(r["irrigatedKm2"] for r in rows[:20]), 0),
            "belowSeaLevelInTop": sum(1 for r in top if r["belowSeaLevel"]),
            "disagreeInTop": sum(1 for r in top if r["disagrees"]),
        },
        "queue": [{k: r[k] for k in
                   ("rank", "index", "district", "mandal", "intervalWidthM", "people",
                    "irrigatedKm2", "irrigatedPct", "stagePct", "category", "confidence",
                    "belowSeaLevel", "disagrees", "rankParts")}
                  for r in top],
        "caveat": "A ranking of where a reading would be worth most, not a sampling design. "
                  "Population is a modelled estimate rather than a count, and the interval "
                  "width is the model's own uncertainty, not a measured error.",
    }


def main():
    payload = build()
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    totals = payload["totals"]
    print(f"  {payload['scored']} mandals ranked, top {payload['published']} published")
    print(f"  the first twenty cover {totals['peopleInTopTwenty']:,} people and "
          f"{totals['irrigatedKm2InTopTwenty']:,.0f} km2 of irrigated land")
    print(f"  in the published list: {totals['belowSeaLevelInTop']} below sea level, "
          f"{totals['disagreeInTop']} where the decade and the assessment disagree")
    for row in payload["queue"][:6]:
        tags = [t for t in (("below sea level" if row["belowSeaLevel"] else None),
                            row["disagrees"]) if t]
        print(f"    {row['rank']:>2}. {row['mandal'][:20]:<20} {row['district'][:16]:<16} "
              f"index {row['index']:>5}  band {row['intervalWidthM']:>5} m  "
              f"{row['people']:>7,} people  {row['irrigatedKm2']:>6.1f} km2"
              + (f"  [{', '.join(tags)}]" if tags else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
