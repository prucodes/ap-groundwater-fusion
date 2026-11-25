"""Today's water table from the State's sensors (phase3_levels/fetch_apwrims_sensors.py)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app", "data", "gw_sensors.json")))
HISTORY = json.load(open(os.path.join(ROOT, "app", "data", "gw_sensors_history.json")))


def test_the_state_figures_add_up_from_the_stations():
    st = DATA["state"]
    active = [s for s in DATA["stations"] if s[7] is not None and s[7] <= DATA["activeHours"]]
    assert len(active) == st["active"] and len(DATA["stations"]) == st["stations"]
    assert st["deeperThanYearAgo"] + st["shallowerThanYearAgo"] <= st["compared"] <= st["active"]


def test_the_counts_are_what_the_page_recounts_from_the_published_figures():
    # This Week's map recounts the stations it draws; a sensor exactly 0.10 m from its year-ago
    # reading must land on the same side in both, whatever floating point makes of the subtraction.
    import sys
    sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
    from fetch_apwrims_sensors import moved
    assert moved(1.23, 1.13) == 0 and moved(1.56, 1.46) == 0 and moved(2.18, 2.28) == 0
    assert moved(1.24, 1.13) == 1 and moved(1.12, 1.23) == -1
    active = [s for s in DATA["stations"] if s[7] is not None and s[7] <= DATA["activeHours"] and s[6] is not None]
    sides = [moved(s[5], s[6]) for s in active]
    st = DATA["state"]
    assert (sides.count(1), sides.count(-1), len(sides)) == (st["deeperThanYearAgo"], st["shallowerThanYearAgo"], st["compared"])
    mandals = sum(1 for m in DATA["mandals"] if m[3] is not None and moved(m[2], m[3]) > 0)
    assert mandals == st["mandalsDeeperThanYearAgo"]


def test_a_sensor_is_only_ever_set_against_itself():
    # No field compares a sensor with the hand-read record: the two networks stand in different wells.
    assert all(len(m) == 4 for m in DATA["mandals"])
    assert "deepestMay" not in json.dumps(DATA) and "PastRecord" not in json.dumps(DATA["state"])


def test_the_history_keeps_one_point_a_day():
    days = [d[0] for d in HISTORY["days"]]
    assert days == sorted(set(days))
    assert HISTORY["days"][-1][2] == DATA["state"]["medianM"]


def test_the_compact_summary_is_the_same_reading_as_the_full_file():
    # The sidebar and page briefs read the compact file; both must describe one fetch.
    compact = json.load(open(os.path.join(ROOT, "app", "data", "gw_sensors_state.json")))
    assert compact["latestReading"] == DATA["latestReading"]
    assert compact["state"] == DATA["state"]
