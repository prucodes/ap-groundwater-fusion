"""Every figure on the site, rolled up by assembly constituency.

The State's geography (AWARE, via the AI Living Labs data lake) gives each
mandal record its assembly and parliamentary constituency, and gives each
constituency its own boundary. A mandal is counted in the constituency its
record names; a mandal with no such record (most are town halves the data lake
could not return) is placed in the official constituency its centre falls in.
Each constituency is drawn with its official outline where that rebuilt within
tolerance (app/data/official_regions.json), else as the union of its mandals.
A town split between two constituencies is counted once, where it is placed.

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
CONTRACT_VERSION = "1.1.0"
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


def mandal_shape(feature):
    parts = [Polygon(ring) for ring in feature["rings"] if len(ring) >= 4]
    parts = [p if p.is_valid else p.buffer(0) for p in parts]
    return shapely.unary_union(parts) if parts else None


def outline(shapes):
    shapes = [s for s in shapes if s is not None and not s.is_empty]
    if not shapes:
        return None
    # A small buffer closes the slivers between neighbouring prototype and
    # official outlines before the union, then is taken back.
    merged = shapely.unary_union([s.buffer(0.0015) for s in shapes]).buffer(-0.0015).simplify(OUTLINE_TOLERANCE)
    polygons = [p for p in getattr(merged, "geoms", [merged]) if p.geom_type == "Polygon" and p.area > 2e-6]
    return [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in polygons]


def official_seats():
    """{code: official assembly row} with a polygon where its outline rebuilt."""
    try:
        regions = load("official_regions.json")
    except OSError:
        return {}
    seats = {}
    for row in regions["assemblies"]:
        polygon = shapely.unary_union([Polygon(ring) for ring in row["rings"]]) if row.get("rings") else None
        seats[str(row["code"])] = {**row, "polygon": polygon}
    return seats


def build():
    display = load("ap_map_display.json")["mandals"]
    records = load("mandal_groundwater_records_v2.json")["records"]
    drought = load("drought_watch.json")["mandals"]
    rain = load("water_context_mandals.json")["values"]
    state = load("gw_state_snapshot.json")["mandals"]
    seats = official_seats()

    status = {}
    for record in records:
        index = int(record["identity"]["boundaryId"].rsplit("-", 1)[1]) - 1
        status[index] = {"status": record["assessment"]["monitoringStatus"],
                         "depth": (record.get("observation") or {}).get("latestMeasuredValue")}
    drought_by_index = {row["i"]: row for row in drought}

    # Place every mandal: by its State record, else by location.
    with_outline = [(code, seat["polygon"]) for code, seat in seats.items() if seat["polygon"] is not None]
    tree = shapely.STRtree([polygon for _, polygon in with_outline])
    groups, placed_by, names = collections.defaultdict(list), collections.Counter(), {}
    for index, feature in enumerate(display):
        shape = mandal_shape(feature)
        code = str(feature.get("acCode") or "")
        if code:
            placed_by["record"] += 1
            names.setdefault(code, (feature.get("ac"), feature.get("pc")))
        elif shape is not None and with_outline:
            point = shape.representative_point()
            hits = [with_outline[j][0] for j in tree.query(point, predicate="within")]
            code = hits[0] if len(hits) == 1 else ""
            if code:
                placed_by["location"] += 1
        if not code:
            placed_by["unplaced"] += 1
            continue
        groups[code].append((index, feature, shape, "record" if feature.get("acCode") else "location"))

    rows = []
    for code in sorted(set(groups) | set(seats), key=lambda c: int(c) if c.isdigit() else 10 ** 6):
        members = groups.get(code, [])
        seat = seats.get(code, {})
        name = seat.get("name") or names.get(code, (None, None))[0]
        pc = seat.get("parliament") or names.get(code, (None, None))[1] or \
            collections.Counter(f.get("pc") for _, f, _, _ in members).most_common(1)[0][0]
        indexes = [i for i, _, _, _ in members]
        keys = [f'{f["d"]}|{f["m"]}' for _, f, _, _ in members]
        statuses = [status[i]["status"] for i in indexes if i in status]
        readings = [state[k] for k in keys if k in state]
        dry = [drought_by_index[i] for i in indexes if i in drought_by_index]
        rains = [rain[k][0] for k in keys if k in rain and rain[k][0] is not None]
        official_rings = seat.get("rings")
        rows.append({
            "ac": name, "code": code, "pc": pc, "reserved": seat.get("reserved"),
            "districts": sorted({f["d"] for _, f, _, _ in members}) or ([seat["district"].upper()] if seat.get("district") else []),
            "mandals": [f["m"] for _, f, _, _ in members],
            "placedByLocation": [f["m"] for _, f, _, how in members if how == "location"],
            "officialOutlines": sum(1 for _, f, _, _ in members if f.get("src") == "official"),
            "outline": "official" if official_rings else ("mandals" if members else None),
            "officialKm2": seat.get("officialKm2"),
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
            "rings": official_rings or outline([shape for _, _, shape, _ in members]),
        })
    parliament = collections.defaultdict(list)
    for row in rows:
        parliament[row["pc"]].append(row["ac"])
    return {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "AP AWARE Mandal and Assembly Geography (AI Living Labs data lake)",
        "note": ("Each mandal is counted in the constituency its State record names, or, without one, the official "
                 "constituency its centre falls in. A town split between two constituencies is counted once. "
                 "Outlines are the State's own where they rebuilt within 3% of the official area, else the union of the mandals."),
        "summary": {
            "constituencies": len(rows), "withMandals": sum(1 for r in rows if r["mandals"]),
            "officialOutlines": sum(1 for r in rows if r["outline"] == "official"),
            "parliamentary": len(parliament), "stateAssembly": STATE_ASSEMBLY, "stateParliament": STATE_PARLIAMENT,
            "mandals": sum(len(r["mandals"]) for r in rows), "placedByRecord": placed_by["record"],
            "placedByLocation": placed_by["location"], "mandalsWithoutConstituency": placed_by["unplaced"],
        },
        "parliament": [{"pc": pc, "acs": sorted(acs)} for pc, acs in sorted(parliament.items())],
        "constituencies": rows,
    }


def main():
    payload = build()
    with open(OUT, "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    s = payload["summary"]
    print(f"  {s['constituencies']} of {s['stateAssembly']} assembly constituencies ({s['withMandals']} with mandals, "
          f"{s['officialOutlines']} official outlines) in {s['parliamentary']} parliamentary; mandals placed "
          f"{s['placedByRecord']} by record, {s['placedByLocation']} by location, {s['mandalsWithoutConstituency']} not placed; "
          f"{os.path.getsize(OUT) // 1024} KB")


if __name__ == "__main__":
    main()
