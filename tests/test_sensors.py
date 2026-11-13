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


def test_a_sensor_is_only_ever_set_against_itself():
    # No field compares a sensor with the hand-read record: the two networks stand in different wells.
    assert all(len(m) == 4 for m in DATA["mandals"])
    assert "deepestMay" not in json.dumps(DATA) and "PastRecord" not in json.dumps(DATA["state"])


def test_the_history_keeps_one_point_a_day():
    days = [d[0] for d in HISTORY["days"]]
    assert days == sorted(set(days))
    assert HISTORY["days"][-1][2] == DATA["state"]["medianM"]
