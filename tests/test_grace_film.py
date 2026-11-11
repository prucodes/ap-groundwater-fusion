"""Andhra Pradesh's water from space (phase3_levels/build_grace_film.py)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app", "data", "grace_film.json")))


def test_one_value_per_month_and_the_gap_between_missions_is_empty():
    n = len(DATA["months"])
    assert len(DATA["stateCm"]) == len(DATA["wellsM"]) == n
    assert all(DATA["stateCm"][DATA["months"].index(m)] is None for m in DATA["missing"])
    # GRACE ended in 2017 and GRACE-FO began measuring in mid-2018.
    assert "2017-12" in DATA["missing"] and "2018-03" in DATA["missing"]


def test_the_satellite_and_the_wells_agree():
    a = DATA["agreement"]
    assert a["months"] >= 100
    assert a["r"] >= 0.7 and a["rSwings"] >= 0.6   # if this fails, one of the two records changed: look before shipping


def test_the_headline_months_are_the_record():
    values = [(m, v) for m, v in zip(DATA["months"], DATA["stateCm"]) if v is not None]
    assert min(values, key=lambda x: x[1])[0] == DATA["low"]["month"]
    assert max(values, key=lambda x: x[1])[0] == DATA["high"]["month"]
    assert values[-1][0] == DATA["latest"]["month"]
    assert os.path.exists(os.path.join(ROOT, "app", "public", DATA["video"]))
