"""Cyclone Arnab against the water table: the event record and last year's precedent."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app", "data", "cyclone_arnab.json")))


def test_storm_rain_is_the_difference_between_two_readings():
    capture = json.load(open(os.path.join(ROOT, "phase3_levels", "data", "cyclone_arnab_capture.json")))
    rain = [m["rainAfterMm"] - m["rainBeforeMm"] for m in capture["mandals"]]
    assert min(rain) >= 0, "a season total cannot fall between two readings"
    assert DATA["state"]["heavyMandals"] == sum(r >= DATA["heavyMm"] for r in rain)
    assert DATA["rainWindow"]["days"] == 4


def test_watch_list_is_deep_tables_that_got_heavy_rain():
    assert len(DATA["watch"]) == DATA["state"]["deepHeavyMandals"]
    for m in DATA["watch"]:
        assert m["depthM"] >= DATA["deepM"] and m["stormMm"] >= DATA["heavyMm"]


def test_precedent_rises_with_depth_and_is_not_called_a_forecast():
    rises = [b["extraRiseM"] for b in DATA["precedent"]["bands"]]
    assert rises == sorted(rises), "last year the deeper the table, the more it rose beyond the usual"
    assert "not a forecast" in DATA["caveat"]
    assert "not published yet" in DATA["caveat"]
