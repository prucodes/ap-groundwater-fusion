#!/usr/bin/env python3
"""Where the decade disagrees with the official assessment.

The Dynamic Ground Water Resources assessment gives every mandal a category
once a year from a balance of volumes. The site holds something the assessment
does not: twelve years of measured pre-monsoon depth. Setting one against the
other says where a category and the record point different ways, which is a
question for the department rather than an answer from us.

Two things this deliberately does NOT do.

It does not project the next assessment. Between 2024-25 and 2025-26 the median
unit moved 4.5 stage points, but fifty moved more than twenty and seven more
than forty -- Visakhapatnam Rural went from 95.1 to 47.9 and Gajuwaka from 60.5
to 89.4. The measure's own year-to-year movement exceeds most units' distance to
a threshold, so a one-year extrapolation would be noise wearing a number.

It does not use the record's `measuredTrendMPerYear`, which despite its name is
a single year-on-year difference. On that field 466 of 573 safe mandals look to
be deepening, which only restates that 2026 was a bad season. The slope here is
taken through each mandal's own May readings, so a drought year is one point in
a line rather than the whole signal.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(APP, "assessment_trajectory.json")

PRE_MONSOON = "05"
MIN_YEARS = 7
# Either side of this, in metres a year, a mandal is called steady. A decade of
# drift at 0.2 m/yr is two metres, which is a change a district would notice.
BAND_M = 0.2


def load(name):
    with open(os.path.join(APP, name), encoding="utf-8") as handle:
        return json.load(handle)


def slope(points):
    """Least squares metres per year through (year, depth). Depth is below ground,
    so a positive slope is a falling water table."""
    count = len(points)
    mean_x = sum(x for x, _ in points) / count
    mean_y = sum(y for _, y in points) / count
    denominator = sum((x - mean_x) ** 2 for x, _ in points)
    if not denominator:
        return None
    return sum((x - mean_x) * (y - mean_y) for x, y in points) / denominator


def build():
    series = load("mandal_observation_series_v2.json")["series"]
    records = load("mandal_groundwater_records_v2.json")
    rows = records if isinstance(records, list) else next(v for v in records.values() if isinstance(v, list))
    identity = {row["identity"]["mandalId"]: row["identity"] for row in rows}

    field = load("field_signals_mandals.json")
    categories, values = field["codes"]["category"], field["values"]
    assessment = load("field_signals.json")["assessment"]

    geometry = load("ap_map_geometry.json")["mandals"]
    position = {}
    for index, feature in enumerate(geometry):
        position.setdefault(f"{feature['d']}|{feature['m']}".upper(), index)

    counts, mandals = {}, []
    for mandal_id, record in series.items():
        pre = [(int(o["period"][:4]), o["value"]) for o in record["observations"]
               if o["period"][5:7] == PRE_MONSOON and o["value"] is not None]
        if len(pre) < MIN_YEARS:
            continue
        drift = slope(pre)
        if drift is None:
            continue
        who = identity.get(mandal_id)
        if not who:
            continue
        key = f"{who['districtName']}|{who['mandalName']}".upper().replace("_", " ")
        row = values.get(key)
        if not row or row[2] is None:
            continue
        category = categories[row[2]]
        band = "deepening" if drift > BAND_M else "rising" if drift < -BAND_M else "steady"
        counts.setdefault(category, {"deepening": 0, "steady": 0, "rising": 0})[band] += 1
        mandals.append({
            "district": who["districtName"], "mandal": who["mandalName"],
            "boundaryIndex": position.get(key),
            "category": category, "stagePct": None if row[3] is None or row[3] < 0 else row[3],
            "driftMPerYear": round(drift, 2), "band": band,
            "years": len(pre), "firstYear": pre[0][0], "lastYear": pre[-1][0],
        })

    # What the official measure did between its own two years, and how far it moves
    # on its own -- the reason nothing here is extrapolated.
    moves = []
    for unit in assessment["mandals"]:
        if not unit or unit.get("stage") is None:
            continue
        previous = unit.get("prev")
        if not previous or previous.get("stage") is None:
            continue
        moves.append({"unit": unit["unit"], "from": previous["cat"], "to": unit["cat"],
                      "fromPct": previous["stage"], "toPct": unit["stage"],
                      "changePct": round(unit["stage"] - previous["stage"], 1)})
    swing = sorted(abs(move["changePct"]) for move in moves)
    changed = [move for move in moves if move["from"] != move["to"]]

    review = sorted((m for m in mandals if m["category"] == "safe" and m["band"] == "deepening"),
                    key=lambda m: -m["driftMPerYear"])
    recovering = sorted((m for m in mandals
                         if m["category"] in ("semi_critical", "critical", "over_exploited")
                         and m["band"] == "rising"),
                        key=lambda m: m["driftMPerYear"])
    return {
        "contractVersion": "assessment-trajectory-v1",
        "assessmentYear": assessment["year"],
        "previousYear": assessment["previousYear"],
        "rule": (f"Least-squares slope through each mandal's own May readings, {MIN_YEARS} years or more. "
                 f"Steady is within {BAND_M} m a year either way; positive is a falling table."),
        "mandalsScored": len(mandals),
        "counts": counts,
        "officialMovement": {
            "units": len(moves),
            "changedCategory": len(changed),
            "medianSwingPct": swing[len(swing) // 2] if swing else None,
            "overTwentyPoints": sum(1 for value in swing if value > 20),
            "overFortyPoints": sum(1 for value in swing if value > 40),
            "examples": sorted(changed, key=lambda m: -abs(m["changePct"]))[:6],
        },
        "review": review,
        "recovering": recovering,
        # The full per-mandal table is deliberately not published. The page that
        # reads this is a client page, and all 605 rows would be shipped to the
        # browser for a card that shows the counts and two short lists. A map over
        # these would want its own slim file keyed by boundary index.
    }


def main():
    payload = build()
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"  {payload['mandalsScored']} mandals scored on {MIN_YEARS}+ pre-monsoon years")
    print(f"  {len(payload['review'])} assessed safe but deepening; "
          f"{len(payload['recovering'])} assessed stressed but rising")
    movement = payload["officialMovement"]
    print(f"  official: {movement['changedCategory']} of {movement['units']} changed category; "
          f"median swing {movement['medianSwingPct']} points, {movement['overTwentyPoints']} moved over 20")
    return 0


if __name__ == "__main__":
    sys.exit(main())
