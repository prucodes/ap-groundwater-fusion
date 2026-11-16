"""The third cyclone (phase3_levels/build_cyclone_akvan.py), counted against baselines frozen before it."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
import build_cyclone_akvan as akvan  # noqa: E402

DATA = json.load(open(akvan.OUT))
RAIN_BEFORE = json.load(open(akvan.RAIN_BEFORE))
SENSORS_BEFORE = json.load(open(akvan.SENSORS_BEFORE))


def test_the_baselines_were_frozen_before_the_storm():
    assert RAIN_BEFORE["to"] <= akvan.BASELINE_RAIN_TO < akvan.LANDFALL
    assert SENSORS_BEFORE["reading"][:10] < akvan.LANDFALL
    assert DATA["rainWindow"]["from"] > RAIN_BEFORE["to"]


def test_rain_is_counted_only_inside_the_window_and_never_below_zero():
    w = DATA["rainWindow"]
    if w["to"] is not None:
        assert w["from"] <= w["to"] <= w["closes"]
        assert all(row[3] >= 0 for row in DATA["map"])
    else:
        assert DATA["state"] is None and DATA["map"] == []


def test_the_missed_mandals_are_the_first_two_storms_own_count():
    m = DATA["missedBefore"]
    assert 0 <= m["reached"] <= m["mandals"] == len(DATA["missed"])
    assert all(row[4] == (row[0] in set(DATA["missed"])) for row in DATA["map"])


def test_each_sensor_is_set_only_against_its_own_baseline():
    s = DATA["sensors"]
    assert s["baseline"] == SENSORS_BEFORE["reading"]
    assert s["compared"] == len(s["stations"]) <= len(SENSORS_BEFORE["stations"])
    assert s["risen"] == sum(1 for r in s["stations"] if r[4] > akvan.RISE_M)


def test_a_forecast_is_never_shown_as_confirmed():
    assert DATA["nameConfirmed"] == akvan.NAME_CONFIRMED and DATA["landfallConfirmed"] == akvan.LANDFALL_CONFIRMED
