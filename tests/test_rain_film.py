"""The season's rain from space (phase3_levels/build_rain_film.py)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app", "data", "rain_film.json")))


def test_a_value_for_every_day_of_the_season():
    assert len(DATA["days"]) == len(DATA["stateMm"])
    assert DATA["days"][0] == "2026-06-01" and DATA["days"][-1] >= "2026-11-06"   # through Murasu's rain
    assert DATA["satelliteSeasonMm"] == round(sum(DATA["stateMm"]))


def test_the_satellite_agrees_with_the_gauges_before_it_is_shown():
    # IMERG and the State's gauges over the same season: within a fifth of each other, or the decoding is wrong.
    assert abs(DATA["satelliteSeasonMm"] / DATA["gauges"]["mm"] - 1) < 0.2
    assert os.path.exists(os.path.join(ROOT, "app", "public", DATA["video"]))
