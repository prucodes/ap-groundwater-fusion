"""The chart series must be shaped so the page can plot them honestly."""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")


@pytest.fixture(scope="module")
def watch():
    with open(WATCH) as handle:
        return json.load(handle)


def test_every_trajectory_starts_at_its_own_may_reading(watch):
    """Each line is change FROM May, so May must be exactly zero or the lines
    cannot be read against one another."""
    assert watch["trajectory"]
    for season in watch["trajectory"]:
        first = season["points"][0]
        assert first["month"] == 5
        assert first["changeM"] == 0


def test_exactly_one_trajectory_is_marked_current(watch):
    flagged = [s for s in watch["trajectory"] if s["current"]]
    assert len(flagged) == 1
    assert flagged[0]["year"] == watch["season"]["year"]


def test_the_current_season_stops_at_the_latest_month(watch):
    current = next(s for s in watch["trajectory"] if s["current"])
    latest = int(watch["season"]["latestMonth"][5:7])
    assert max(p["month"] for p in current["points"]) == latest


def test_rainfall_history_covers_every_year_and_classifies_each(watch):
    history = watch["rainfallHistory"]
    years = [row["year"] for row in history["years"]]
    assert years == sorted(years)
    assert len(years) == len(set(years))
    assert years[0] <= 1981
    for row in history["years"]:
        assert row["state"] in {"el_nino", "la_nina", "neutral"}


def test_rainfall_anomalies_are_consistent_with_the_stated_mean(watch):
    history = watch["rainfallHistory"]
    for row in history["years"]:
        expected = 100 * (row["mm"] / history["meanMm"] - 1)
        assert row["anomalyPct"] == pytest.approx(expected, abs=0.15)


def test_every_charted_year_uses_the_same_months(watch):
    """A part-season compared against full ones would read as a drought."""
    assert watch["rainfallHistory"]["months"] == watch["rainfall"]["months"]


def test_the_map_declares_the_flagged_mandals_it_cannot_draw(watch):
    """A mandal whose series never reached a polygon has nothing to shade. The
    count must be published, because a map that silently omits flagged mandals
    is worse than one that admits it."""
    flagged = [m for m in watch["mandals"] if m["status"] != "normal"]
    assert flagged
    unmappable = [m for m in flagged if m["boundaryIndex"] is None]
    assert watch["recharge"]["flaggedWithoutBoundary"] == len(unmappable)


def test_every_flagged_mandal_reaches_the_reader_somewhere(watch):
    """Off the map is acceptable; out of the list is not."""
    flagged = [m for m in watch["mandals"] if m["status"] != "normal"]
    assert len(flagged) == watch["recharge"]["flaggedShort"]


def test_the_mandal_list_is_ranked_by_severity(watch):
    severities = [m["severity"] for m in watch["mandals"]]
    assert severities == sorted(severities, reverse=True)
