"""A historical composite may not contain the season it is used to explain.

The site and the film cite the El Nino composites as precedent: "this many of
this many El Nino summer monsoons were below average here". Once the current
season's June-September rain completed, it joined those composites, and the
film began offering the present El Nino as evidence that El Ninos have done
this before. The windows now stop at the year before the season.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_monsoon_watch.py")


@pytest.fixture(scope="module")
def watch():
    with open(WATCH, encoding="utf-8") as handle:
        return json.load(handle)


def test_every_composite_stops_before_the_season_it_explains(watch):
    season = watch["season"]["year"]
    blocks = watch["elNinoRainfall"]
    checked = 0
    for key in ("swMonsoon", "neMonsoon", "afterElNino"):
        block = blocks.get(key)
        if not block:
            continue
        assert block["lastYear"] < season, f"{key} reaches {block['lastYear']}, the season being reported"
        assert block["firstYear"] < block["lastYear"]
        checked += 1
    assert checked == 3


def test_this_year_still_appears_where_it_belongs(watch):
    # The rainfall chart is this season read against the others, so it must keep
    # the current year; only the composites that stand as precedent drop it.
    history = watch["rainfallHistory"]
    assert history is not None
    assert max(row["year"] for row in history["years"]) == watch["season"]["year"]


def test_the_builder_filters_rather_than_trusting_the_data_to_lag():
    source = open(BUILDER, encoding="utf-8").read()
    assert "past = lambda frame: frame[frame.year < year]" in source
    # Both monsoons and the after-an-El-Nino window, not only the one that failed.
    assert source.count("past(") >= 2
