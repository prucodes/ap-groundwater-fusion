"""The forecast checked on CGWB's wells: the committed result must say what it measured.

validate_cross_network.py needs the git-ignored backtest rows, so CI checks the
committed outcome rather than re-running it.
"""
import csv
import json
import os

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHECK = os.path.join(ROOT, "app", "data", "cross_network_check.json")
WELLS = os.path.join(ROOT, "phase3_levels", "cgwb", "cgwb_manual_levels.csv")
WINDOW_MONTHS = {"may_aug": (5, 8), "aug_nov": (8, 11)}


def load():
    with open(CHECK) as handle:
        return json.load(handle)


def test_every_share_is_a_share_and_every_count_adds_up():
    check = load()
    overall = check["overall"]
    assert 0 < overall["clearMoves"] <= overall["mandalWindows"]
    for value in [*overall["direction"].values(), *(v for s in overall["bySeason"].values() for k, v in s.items() if k != "clearMoves")]:
        assert 0.0 <= value <= 1.0
    assert overall["bySeason"]["usual"]["clearMoves"] + overall["bySeason"]["broke"]["clearMoves"] == overall["clearMoves"]
    assert sum(w["clearMoves"] for w in check["windows"].values()) == overall["clearMoves"]
    assert check["stations"] > 100 and check["mandals"] > 100


def test_no_window_spans_a_month_the_state_carried_forward():
    check = load()
    frozen = set(check["frozenMonths"])
    assert frozen, "the 2021 carried-forward months should be named"
    for name, window in check["windows"].items():
        start, end = WINDOW_MONTHS[name]
        for year in window["years"]:
            months = {f"{year}-{m:02d}" for m in range(start, end + 1)}
            assert not (months & frozen), f"{window['label']} {year} spans a carried-forward month"


def test_depths_are_not_compared_and_the_benchmark_is_stated():
    check = load()
    assert "only the change" in check["caveat"]
    assert "benchmark" in check["caveat"]


def test_the_wells_are_cgwb_readings_inside_the_state():
    wells = pd.read_csv(WELLS)
    assert list(wells.columns) == ["station_code", "station_name", "lat", "lon", "well_type", "well_depth_m", "date", "level_mbgl"]
    assert wells.lat.between(12.6, 19.95).all() and wells.lon.between(76.7, 84.8).all()
    assert wells.station_code.nunique() > 500
    assert wells.date.min() >= "2013-01-01"
