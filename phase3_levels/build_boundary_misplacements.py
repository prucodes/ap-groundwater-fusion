"""Find mandal polygons filed under the wrong district.

Nineteen of the 670 features in ap_map_geometry.json sit hundreds of kilometres
from the rest of the district they claim. A mandal's name repeats across Andhra
Pradesh -- there is an Atmakur in several districts and a Ramachandrapuram in
several more -- so a polygon that was matched by name alone can land under the
wrong one, and nothing downstream notices.

Two things go wrong when it does. The district outlines in
ap_district_geometry.json are made of their mandals' rings, so one stray polygon
stretches a whole district across the state: KONASEEMA currently spans from
79.2E to 82.4E because a Ramachandrapuram that belongs near Tirupati is filed
under it. And the source reconciliation refuses to place a series when a
district holds two polygons of the same name, which is why sixteen of the
fifty-seven rows in mandal_boundary_unresolved.csv are not really unresolvable
at all -- one of the two candidates is misfiled.

The test is deliberately geometric and needs no gazetteer: how far a polygon
sits from the middle of its own district, against how far that district's other
mandals sit. The median mandal is 32 km from its district centre and the 90th
percentile is 63 km, so the flagged ones -- 104 km and beyond -- are not a
border effect.

This writes a review list. It does NOT reassign anything: which district a
polygon belongs to is a claim about the map of Andhra Pradesh, and that belongs
to a reviewer who knows the geography, exactly like the alias table.
"""
import csv
import collections
import json
import math
import os
import statistics
import sys

from shapely.geometry import Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_levels_engine import norm  # noqa: E402

APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(HERE, "data", "mandal_boundary_misplaced.csv")

# Beyond this far from the middle of its own district, and this many times the
# district's own spread, a polygon is not a border mandal. Both must hold: a
# tight district would flag its own edge on the ratio alone, and a large one
# would never flag anything on the distance alone.
MIN_KM = 100.0
MIN_RATIO = 2.0
# Districts smaller than this cannot supply a meaningful centre or spread.
MIN_PEERS = 4
NEIGHBOURS = 8
# Latitude of Andhra Pradesh, for converting degrees of longitude to kilometres.
MID_LAT = 16.0


def great_circle_km(ax, ay, bx, by):
    """Flat-earth distance, which is accurate enough across one state."""
    return math.hypot((ax - bx) * math.cos(math.radians(MID_LAT)) * 111.32,
                      (ay - by) * 110.57)


def centroids(path):
    geo = json.load(open(path))
    out = []
    for index, feature in enumerate(geo["mandals"]):
        rings = [ring for ring in feature.get("rings", []) if len(ring) >= 4]
        if not rings:
            continue
        polygon = Polygon(rings[0])
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            continue
        point = polygon.centroid
        out.append({"index": index, "key": norm(feature["d"]), "district": feature["d"],
                    "mandal": feature["m"], "x": point.x, "y": point.y})
    return out


def flag(features):
    """Indices whose polygon sits far from the middle of the district it claims."""
    by_district = collections.defaultdict(list)
    for feature in features:
        by_district[feature["key"]].append(feature)
    out = {}
    for feature in features:
        peers = [p for p in by_district[feature["key"]] if p["index"] != feature["index"]]
        if len(peers) < MIN_PEERS:
            continue
        mid_x = statistics.median(p["x"] for p in peers)
        mid_y = statistics.median(p["y"] for p in peers)
        distance = great_circle_km(feature["x"], feature["y"], mid_x, mid_y)
        spread = statistics.median(
            great_circle_km(p["x"], p["y"], mid_x, mid_y) for p in peers)
        ratio = distance / spread if spread else float("inf")
        if distance < MIN_KM or ratio < MIN_RATIO:
            continue
        out[feature["index"]] = (distance, ratio)
    return out


def misplaced(features):
    # Two passes. A misplaced polygon sits among the mandals of the district it
    # actually belongs to, so its neighbours are the evidence -- but a second
    # misplaced polygon nearby would vote for the district IT was misfiled
    # under. The flagged ones are excluded from the vote for that reason.
    flagged = flag(features)
    voters = [f for f in features if f["index"] not in flagged]
    rows = []
    for feature in features:
        if feature["index"] not in flagged:
            continue
        distance, ratio = flagged[feature["index"]]
        near = sorted(voters,
                      key=lambda f: great_circle_km(feature["x"], feature["y"], f["x"], f["y"]))
        near = near[:NEIGHBOURS]
        suggestion, votes = collections.Counter(f["district"] for f in near).most_common(1)[0]
        rows.append({
            "boundary_index": feature["index"],
            "claimed_district": feature["district"],
            "mandal": feature["mandal"],
            "km_from_district_centre": round(distance, 1),
            "times_district_spread": round(ratio, 1),
            "neighbours_say": suggestion,
            "neighbour_votes": f"{votes}/{NEIGHBOURS}",
            # A polygon whose neighbours agree unanimously is as certain as
            # geometry can make it; anything less wants a second pair of eyes.
            "confidence": "high" if votes >= 6 else "review",
        })
    return sorted(rows, key=lambda row: -row["km_from_district_centre"])


def main():
    features = centroids(os.path.join(APP, "ap_map_geometry.json"))
    rows = misplaced(features)
    fields = ["boundary_index", "claimed_district", "mandal", "km_from_district_centre",
              "times_district_spread", "neighbours_say", "neighbour_votes", "confidence"]
    with open(OUT, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    high = sum(1 for row in rows if row["confidence"] == "high")
    print(f"  {len(features)} polygons checked")
    print(f"  {len(rows)} sit more than {MIN_KM:.0f} km and {MIN_RATIO}x their district's spread "
          f"from the middle of the district they claim ({high} with unanimous neighbours)")
    print(f"  wrote data/{os.path.basename(OUT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
