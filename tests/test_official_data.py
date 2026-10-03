"""Official boundaries, the State groundwater snapshot and the constituency
roll-up: rebuilt from data lake extracts, published beside -- never in place
of -- the files the model reads."""
import json
import os
import random
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_constituencies as constituencies  # noqa: E402
import build_datalake_snapshot as snapshot  # noqa: E402
import build_official_boundaries as boundaries  # noqa: E402

DATA = os.path.join(ROOT, "app", "data")


def load(name):
    return json.load(open(os.path.join(DATA, name)))


def boundary_points(shape_xy, step):
    """Vertices along a closed outline every `step` metres, shuffled and doubled
    as the data lake returns them."""
    points = []
    for (x1, y1), (x2, y2) in zip(shape_xy, shape_xy[1:] + shape_xy[:1]):
        n = max(1, int(max(abs(x2 - x1), abs(y2 - y1)) / step))
        points += [(x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n) for k in range(n)]
    points = points * 2
    random.Random(4).shuffle(points)
    return list(dict.fromkeys(points))


@pytest.mark.parametrize("outline", [
    [(0, 0), (10000, 0), (10000, 10000), (0, 10000)],                               # a square
    [(0, 0), (12000, 0), (12000, 4000), (4000, 4000), (4000, 12000), (0, 12000)],   # an L: concave
])
def test_unordered_official_vertices_rebuild_to_the_official_area(outline):
    from shapely.geometry import Polygon
    official = Polygon(outline).area
    rebuilt = boundaries.rebuild(boundary_points(outline, 400), official)
    assert abs(rebuilt.area / official - 1) < 0.01


def test_feed_and_boundary_names_are_folded_the_same_way():
    assert snapshot.feed_name("Anantapur_Rural") == snapshot.feed_name("Anantapur Urban") == "anantapur"
    assert snapshot.feed_name("Kakinada (Urban)") == "kakinada"
    assert snapshot.our_name("CHILAKALURIPET H/O.PURUSHOTH*") == "chilakaluripet"
    assert snapshot.our_name("VIJAYAWADA (URBAN)") == "vijayawada"


def test_rural_and_urban_halves_combine_by_station_weight():
    halves = [
        {"stations": 3, "date": "2026-09-08", "currentM": 10.0, "preMonsoonM": 8.0, "postMonsoonM": 5.0, "yearAgoM": 9.0},
        {"stations": 1, "date": "2026-09-09", "currentM": 6.0, "preMonsoonM": 6.0, "postMonsoonM": 4.0, "yearAgoM": 5.0},
    ]
    combined = snapshot.combine(halves)
    assert combined["stations"] == 4 and combined["date"] == "2026-09-09"
    assert combined["currentM"] == 9.0 and combined["preMonsoonM"] == 7.5
    assert combined["sinceMayM"] == 1.5 and combined["vsYearAgoM"] == 1.0


def test_the_display_geometry_keeps_every_boundary_in_order():
    """Every join in the site is by boundary index and name; the display file may
    change an outline, never which mandal sits at which index."""
    pipeline = load("ap_map_geometry.json")
    display = load("ap_map_display.json")
    assert [(m["d"], m["m"]) for m in display["mandals"]] == [(m["d"], m["m"]) for m in pipeline["mandals"]]
    assert pipeline["boundary_source"] == "public_prototype"
    official = [m for m in display["mandals"] if m["src"] == "official"]
    assert display["official_summary"]["outlines"] == len(official) > 0
    for m in official:
        assert m["lgd"] and m["verdict"] not in ("rebuild not reliable",)
        assert all(len(ring) >= 4 and ring[0] == ring[-1] for ring in m["rings"])


def test_the_state_snapshot_matches_real_boundaries_and_agrees_with_our_may():
    data = load("gw_state_snapshot.json")
    keys = {f'{m["d"]}|{m["m"]}' for m in load("ap_map_geometry.json")["mandals"]}
    assert set(data["mandals"]) <= keys
    s = data["summary"]
    assert s["matched"] == len(data["mandals"]) and s["matched"] >= 0.9 * s["feedMandals"]
    # Same department figure: the feed's pre-monsoon value is our May reading.
    assert s["preMonsoonSameAsOurMay"] >= 0.97 * s["preMonsoonComparable"]
    for row in data["mandals"].values():
        if row["currentM"] is not None and row["preMonsoonM"] is not None:
            assert row["sinceMayM"] == pytest.approx(row["currentM"] - row["preMonsoonM"], abs=0.011)
    digest = load("gw_state_summary.json")
    assert "mandals" not in digest and digest["state"] == data["state"]


def test_every_constituency_mandal_is_counted_once_and_figures_add_up():
    data = load("constituencies.json")
    display = load("ap_map_display.json")["mandals"]
    placed = [m for c in data["constituencies"] for m in c["mandals"]]
    assert len(placed) == data["summary"]["mandals"] == sum(1 for m in display if m.get("ac"))
    for c in data["constituencies"]:
        g = c["groundwater"]
        assert g["stress"] + g["watch"] + g["stable"] == g["assessed"] <= len(c["mandals"])
        assert c["drought"]["severe"] <= c["drought"]["active"] <= c["drought"]["assessed"] <= len(c["mandals"])
    assert {p["pc"] for p in data["parliament"]} == {c["pc"] for c in data["constituencies"]}


def test_constituencies_rebuild_from_the_published_inputs():
    """The committed file is what the builder makes from the committed inputs."""
    fresh = constituencies.build()
    stored = load("constituencies.json")
    assert fresh["summary"] == stored["summary"]
    assert [c["ac"] for c in fresh["constituencies"]] == [c["ac"] for c in stored["constituencies"]]
