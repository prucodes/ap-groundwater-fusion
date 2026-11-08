"""Mandal polygons must sit inside the district they are filed under.

Nineteen did not, plus a second Unguturu too close to be flagged by distance.
They stretched the district outlines, which are made of their mandals' rings --
KONASEEMA reached from 79.2E to 82.4E because a Ramachandrapuram belonging near
Tirupati was filed under it -- and they made the reconciler refuse mandals whose
district appeared to hold two polygons of one name. fix_misfiled_districts.py
refiled all twenty (Nov 2026), each on APWRIMS's own district list and the
polygon's neighbours. A rise from zero means a refreshed boundary file brought
new ones in unnoticed.
"""
import csv
import json
import math
import os
import statistics
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_boundary_misplacements as mis

LIST = os.path.join(ROOT, "phase3_levels", "data", "mandal_boundary_misplaced.csv")
KNOWN = 0
FIXES = os.path.join(ROOT, "phase3_levels", "data", "mandal_boundary_district_fixes.csv")
WATER = os.path.join(ROOT, "app", "data", "water_context.json")


@pytest.fixture(scope="module")
def features():
    return mis.centroids(os.path.join(ROOT, "app", "data", "ap_map_geometry.json"))


def test_the_reviewed_list_matches_what_the_geometry_says(features):
    with open(LIST) as handle:
        stored = {int(row["boundary_index"]) for row in csv.DictReader(handle)}
    assert set(mis.flag(features)) == stored


def test_no_new_misplacements_have_appeared(features):
    assert len(mis.flag(features)) <= KNOWN, (
        "a boundary refresh brought in polygons filed under the wrong district"
    )


def test_the_threshold_is_clear_of_ordinary_border_mandals(features):
    """The flag must not be a border effect. If the gap between a normal mandal
    and a flagged one ever closes, the threshold is measuring the wrong thing."""
    import collections

    by_district = collections.defaultdict(list)
    for f in features:
        by_district[f["key"]].append(f)
    flagged = mis.flag(features)
    distances = []
    for f in features:
        peers = [p for p in by_district[f["key"]] if p["index"] != f["index"]]
        if len(peers) < mis.MIN_PEERS or f["index"] in flagged:
            continue
        mid_x = statistics.median(p["x"] for p in peers)
        mid_y = statistics.median(p["y"] for p in peers)
        distances.append(mis.great_circle_km(f["x"], f["y"], mid_x, mid_y))
    distances.sort()
    ninetieth = distances[int(0.9 * len(distances))]
    assert statistics.median(distances) < 50
    # A clear gap between where ordinary mandals stop and the flag begins.
    assert ninetieth < mis.MIN_KM * 0.8


def test_every_flagged_polygon_carries_its_evidence():
    with open(LIST) as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        assert float(row["km_from_district_centre"]) >= mis.MIN_KM
        assert float(row["times_district_spread"]) >= mis.MIN_RATIO
        assert row["neighbours_say"] and row["neighbours_say"] != row["claimed_district"]
        assert row["confidence"] in {"high", "review"}


def test_the_district_outlines_carry_the_same_stray_pieces():
    """The propagation is the reason this matters: a district shape is made of
    its mandals' rings, so one misfiled polygon moves the whole outline."""
    from shapely.geometry import Polygon

    geo = json.load(open(os.path.join(ROOT, "app", "data", "ap_district_geometry.json")))
    stray = 0
    for district in geo["districts"]:
        points = []
        for ring in district.get("rings", []):
            if len(ring) < 4:
                continue
            polygon = Polygon(ring)
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            if polygon.is_empty:
                continue
            points.append((polygon.centroid.x, polygon.centroid.y))
        if len(points) < mis.MIN_PEERS:
            continue
        mid_x = statistics.median(p[0] for p in points)
        mid_y = statistics.median(p[1] for p in points)
        stray += sum(1 for x, y in points
                     if mis.great_circle_km(x, y, mid_x, mid_y) > mis.MIN_KM)
    assert stray <= KNOWN


def test_a_polygon_far_from_its_district_is_flagged_and_a_border_one_is_not():
    """Synthetic: a tight district, one mandal on its edge, one across the state."""
    base = [{"index": i, "key": "D", "district": "D", "mandal": f"m{i}",
             "x": 80.0 + 0.05 * i, "y": 16.0 + 0.05 * i} for i in range(8)]
    edge = {"index": 90, "key": "D", "district": "D", "mandal": "edge", "x": 80.6, "y": 16.6}
    far = {"index": 91, "key": "D", "district": "D", "mandal": "far", "x": 77.0, "y": 13.0}
    flagged = mis.flag(base + [edge, far])
    assert 91 in flagged
    assert 90 not in flagged


@pytest.fixture(scope="module")
def fixes():
    with open(FIXES) as handle:
        return list(csv.DictReader(handle))


def test_each_refiled_outline_is_where_the_fix_says(fixes):
    for name in ("ap_map_geometry.json", "ap_map_display.json"):
        mandals = json.load(open(os.path.join(ROOT, "app", "data", name)))["mandals"]
        for fix in fixes:
            feature = mandals[int(fix["boundary_index"])]
            assert (feature["d"], feature["m"]) == (fix["district"], fix["mandal"]), (name, fix)


def test_each_move_is_backed_by_apwrims_listing_that_mandal_in_that_district(fixes):
    """The state's own district list decides; the neighbours only corroborate."""
    water = json.load(open(WATER))
    listed = {(mis.norm(m["district"]), mis.norm(m["mandal"]))
              for section in ("soilMoisture", "rainfall") for m in water[section]["mandals"]}
    for fix in fixes:
        assert (mis.norm(fix["district"]), mis.norm(fix["apwrims_mandal"])) in listed, fix
        assert fix["district"] != fix["claimed_district"]


def test_no_district_holds_two_outlines_of_one_name():
    import collections

    mandals = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))["mandals"]
    counts = collections.Counter((m["d"], m["m"]) for m in mandals)
    assert not [key for key, count in counts.items() if count > 1]


def test_each_district_outline_holds_its_own_mandals_only():
    """A district's mandal count and outline come from the same refiled map."""
    import collections

    mandals = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))["mandals"]
    per = collections.Counter(m["d"] for m in mandals)
    for district in json.load(open(os.path.join(ROOT, "app", "data", "ap_district_geometry.json")))["districts"]:
        assert district["mandal_count"] == per[district["d"]], district["d"]
