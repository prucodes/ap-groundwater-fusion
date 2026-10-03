"""Every figure on the site, rolled up by assembly constituency.

The State's mandal geography (AWARE, via the AI Living Labs data lake) names
each mandal's assembly and parliamentary constituency. That link, carried in
app/data/ap_map_display.json, lets the groundwater status, the State network's
latest reading, the drought-manual reading and gauge rain be summed per
constituency, and each constituency's outline be drawn as the union of its
mandals. A mandal belongs to one constituency here; towns split between two
are counted where the State's mandal record places them.

Writes app/data/constituencies.json.
"""
import collections
import datetime
import json
import os
import statistics

import shapely
from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "app", "data")
OUT = os.path.join(DATA, "constituencies.json")
CONTRACT_VERSION = "1.0.0"
OUTLINE_TOLERANCE = 0.004   # degrees: a state-scale map, about 440 m
STATE_ASSEMBLY = 175        # Andhra Pradesh Legislative Assembly seats
STATE_PARLIAMENT = 25       # Lok Sabha seats from Andhra Pradesh
DROUGHT_ACTIVE = {"severe", "moderate|severe", "moderate"}


def load(name):
    with open(os.path.join(DATA, name)) as handle:
        return json.load(handle)


def median(values):
    values = [v for v in values if v is not None]
    return round(statistics.median(values), 2) if values else None


def outline(features):
    parts = []
    for feature in features:
        for ring in feature["rings"]:
            if len(ring) >= 4:
                polygon = Polygon(ring)
                parts.append(polygon if polygon.is_valid else polygon.buffer(0))
    if not parts:
        return None
    # A small buffer closes the slivers between neighbouring prototype and
    # official outlines before the union, then is taken back.
    merged = shapely.unary_union([p.buffer(0.0015) for p in parts]).buffer(-0.0015).simplify(OUTLINE_TOLERANCE)
    polygons = [p for p in getattr(merged, "geoms", [merged]) if p.geom_type == "Polygon" and p.area > 2e-6]
    return [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in polygons]


def build():
    display = load("ap_map_display.json")["mandals"]
    records = load("mandal_groundwater_records_v2.json")["records"]
    drought = load("drought_watch.json")["mandals"]
    rain = load("water_context_mandals.json")["values"]
    state = load("gw_state_snapshot.json")["mandals"]

    status = {}
    for record in records:
        index = int(record["identity"]["boundaryId"].rsplit("-", 1)[1]) - 1
        status[index] = {"status": record["assessment"]["monitoringStatus"],
                         "depth": (record.get("observation") or {}).get("latestMeasuredValue")}
    drought_by_index = {row["i"]: row for row in drought}

    groups = collections.defaultdict(list)
    for index, feature in enumerate(display):
        if feature.get("ac"):
            groups[(feature["ac"], feature.get("acCode"))].append((index, feature))

    rows = []
    for (name, code), members in sorted(groups.items(), key=lambda item: item[0][0]):
        indexes = [i for i, _ in members]
        keys = [f'{f["d"]}|{f["m"]}' for _, f in members]
        statuses = [status[i]["status"] for i in indexes if i in status]
        readings = [state[k] for k in keys if k in state]
        dry = [drought_by_index[i] for i in indexes if i in drought_by_index]
        rains = [rain[k][0] for k in keys if k in rain and rain[k][0] is not None]
        rows.append({
            "ac": name, "code": code,
            "pc": collections.Counter(f.get("pc") for _, f in members).most_common(1)[0][0],
            "districts": sorted({f["d"] for _, f in members}),
            "mandals": [f["m"] for _, f in members],
            "officialOutlines": sum(1 for _, f in members if f.get("src") == "official"),
            "groundwater": {
                "assessed": sum(1 for s in statuses if s in ("stress", "watch", "stable")),
                "stress": statuses.count("stress"), "watch": statuses.count("watch"), "stable": statuses.count("stable"),
                "medianDepthM": median(status[i]["depth"] for i in indexes if i in status),
            },
            "stateReading": {
                "mandals": len(readings), "stations": sum(r["stations"] for r in readings),
                "medianSinceMayM": median(r["sinceMayM"] for r in readings),
                "deeperThanYearAgo": sum(1 for r in readings if (r["vsYearAgoM"] or 0) > 0),
            },
            "drought": {
                "assessed": sum(1 for r in dry if r["category"] not in ("insufficient",)),
                "active": sum(1 for r in dry if r["category"] in DROUGHT_ACTIVE),
                "severe": sum(1 for r in dry if r["category"] in ("severe", "moderate|severe")),
                "trigger1": sum(1 for r in dry if r["t1"]),
            },
            "rain": {"mandals": len(rains), "medianDeparturePct": median(rains)},
            "rings": outline([f for _, f in members]),
        })
    parliament = collections.defaultdict(list)
    for row in rows:
        parliament[row["pc"]].append(row["ac"])
    return {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "Constituency of each mandal from AP AWARE Mandal Geography (AI Living Labs data lake)",
        "note": ("Each mandal is counted in the one assembly constituency the State's mandal record names. Outlines are "
                 "the union of the mandals' outlines, so a town split between two constituencies is drawn with one."),
        "summary": {"constituencies": len(rows), "parliamentary": len(parliament),
                    "stateAssembly": STATE_ASSEMBLY, "stateParliament": STATE_PARLIAMENT,
                    "mandals": sum(len(r["mandals"]) for r in rows), "mandalsWithoutConstituency": sum(1 for f in display if not f.get("ac"))},
        "parliament": [{"pc": pc, "acs": sorted(acs)} for pc, acs in sorted(parliament.items())],
        "constituencies": rows,
    }


def main():
    payload = build()
    with open(OUT, "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    s = payload["summary"]
    print(f"  {s['constituencies']} assembly constituencies in {s['parliamentary']} parliamentary; "
          f"{s['mandals']} mandals placed, {s['mandalsWithoutConstituency']} without one; "
          f"{os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
