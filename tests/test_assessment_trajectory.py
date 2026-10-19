"""The decade may disagree with the assessment; neither may be projected forward.

The trajectory card sets the official category against a least-squares slope
through each mandal's own May readings. Two things it must never become: a
forecast of the next assessment, and a restatement of this season.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "data", "assessment_trajectory.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_assessment_trajectory.py")
COMPONENT = os.path.join(ROOT, "app", "components", "AssessmentTrajectory.tsx")


@pytest.fixture(scope="module")
def trajectory():
    with open(DATA, encoding="utf-8") as handle:
        return json.load(handle)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_the_slope_runs_through_many_years_not_two(trajectory):
    # The record's own measuredTrendMPerYear is a single year-on-year difference
    # despite its name; on that field most of the safe category looks to be in
    # decline, which only says 2026 was bad. The builder names it to explain why it
    # is not used, so look for a read of it rather than for the word.
    source = read(BUILDER)
    for access in ('["measuredTrendMPerYear"]', '.get("measuredTrendMPerYear"',
                   "['measuredTrendMPerYear']", ".get('measuredTrendMPerYear'"):
        assert access not in source, access
    assert "MIN_YEARS = 7" in source
    for row in trajectory["review"] + trajectory["recovering"]:
        assert row["years"] >= 7, row["mandal"]
        assert row["lastYear"] - row["firstYear"] >= 6, row["mandal"]


def test_the_two_lists_match_the_matrix(trajectory):
    counts = trajectory["counts"]
    assert len(trajectory["review"]) == counts["safe"]["deepening"]
    stressed = sum(counts.get(key, {}).get("rising", 0)
                   for key in ("semi_critical", "critical", "over_exploited"))
    assert len(trajectory["recovering"]) == stressed


def test_each_list_is_the_disagreement_it_claims(trajectory):
    for row in trajectory["review"]:
        assert row["category"] == "safe" and row["band"] == "deepening" and row["driftMPerYear"] > 0
    for row in trajectory["recovering"]:
        assert row["category"] in {"semi_critical", "critical", "over_exploited"}
        assert row["band"] == "rising" and row["driftMPerYear"] < 0


def test_the_reason_for_not_projecting_is_published(trajectory):
    move = trajectory["officialMovement"]
    # The claim on the page is that the measure's own movement swamps the distance
    # to a threshold, so the figures behind that claim have to travel with it.
    assert move["medianSwingPct"] is not None
    assert move["overTwentyPoints"] > 0
    assert move["examples"], "the worst swing is the evidence; publish at least one"
    assert abs(move["examples"][0]["changePct"]) >= 20


def test_nothing_on_the_page_is_a_forecast(trajectory):
    page = read(COMPONENT)
    assert "projected forward" in page
    for word in ("will cross", "will reach", "forecast of", "expected to cross"):
        assert word not in page
    # No year beyond the assessment being reported may appear as a target.
    last = int(trajectory["assessmentYear"][-4:])
    assert str(last + 1) not in json.dumps(trajectory["counts"])
