"""The district monitoring tier must carry information, not just fire everywhere.

All 28 districts sat in the top tier for as long as the rule used absolute cuts:
"any mandal in stress" was true everywhere because 386 of 670 mandals carry a
stress indicator, and "trend over 1.0 m/yr" was true for 24 of 28 because the
median district deepens 1.58 m/yr. Both quantities grow when the model improves,
so a fresh absolute cut would have saturated again at the next model change.

These tests are about the property, not the numbers: the rule must separate
districts, and it must do so against figures drawn from the same data.
"""
import json
import os
import re
import statistics
from collections import Counter, defaultdict

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RECORDS = os.path.join(ROOT, "app", "data", "mandal_groundwater_records_v2.json")
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")
IRRIGATION = os.path.join(ROOT, "app", "lib", "irrigation.ts")
DATA_TS = os.path.join(ROOT, "app", "lib", "data.ts")


@pytest.fixture(scope="module")
def records():
    with open(RECORDS) as handle:
        return json.load(handle)["records"]


@pytest.fixture(scope="module")
def watch():
    with open(WATCH) as handle:
        return json.load(handle)


def district_table(records, watch):
    """Reproduce the inputs the tier is computed from, from the published data."""
    by = defaultdict(list)
    for row in records:
        by[row["identity"]["districtName"].upper()].append(row)
    season = defaultdict(lambda: {"flagged": 0, "compared": 0})
    for row in watch["mandals"]:
        key = row["district"].upper()
        season[key]["compared"] += 1
        if row["status"] != "normal":
            season[key]["flagged"] += 1
    return by, season


def test_a_stress_indicator_is_too_common_to_escalate_on_its_own(records):
    """The exact condition that saturated the old rule."""
    stressed = sum(1 for r in records if r["assessment"]["monitoringStatus"] == "stress")
    assert stressed / len(records) > 0.4
    districts = {r["identity"]["districtName"].upper() for r in records}
    with_stress = {
        r["identity"]["districtName"].upper()
        for r in records
        if r["assessment"]["monitoringStatus"] == "stress"
    }
    assert with_stress == districts, "every district holds a stressed mandal"


def test_the_tier_rule_is_written_against_statewide_figures_not_fixed_metres():
    source = open(IRRIGATION).read()
    assert "stateNorms" in source
    # The absolute cuts that saturated must not come back.
    assert "trend > 1.0" not in source
    assert "verify > 0 ||" not in source
    for name in ("STRESS_POINTS_PER", "TREND_POINTS_PER", "SHORTFALL_POINTS_PER", "REVIEW_SCORE"):
        assert name in source


def test_the_score_separates_districts(records, watch):
    by, season = district_table(records, watch)
    state_stress = sum(
        1 for r in records if r["assessment"]["monitoringStatus"] == "stress"
    ) / len(records)
    trends = [
        r["assessment"].get("measuredTrendMPerYear")
        for r in records
        if isinstance(r["assessment"].get("measuredTrendMPerYear"), (int, float))
    ]
    state_trend = statistics.median(trends)
    compared = sum(v["compared"] for v in season.values())
    state_short = sum(v["flagged"] for v in season.values()) / compared

    scores = []
    for name, rows in by.items():
        stress = sum(1 for r in rows if r["assessment"]["monitoringStatus"] == "stress") / len(rows)
        own = [
            r["assessment"].get("measuredTrendMPerYear")
            for r in rows
            if isinstance(r["assessment"].get("measuredTrendMPerYear"), (int, float))
        ]
        score = max(0.0, stress - state_stress) * 10
        if own:
            score += max(0.0, statistics.median(own) - state_trend) / 0.5
        if season.get(name, {}).get("compared"):
            share = season[name]["flagged"] / season[name]["compared"]
            score += max(0.0, share - state_short) * 10
        scores.append(score)

    assert len(scores) > 20
    # A score that is zero for everyone, or identical for everyone, would be the
    # same failure in a new costume.
    assert len(set(round(s, 2) for s in scores)) > 5
    assert max(scores) > 2 * (statistics.median(scores) + 0.01)
    assert sum(1 for s in scores if s == 0) < len(scores) * 0.6


def test_every_component_of_the_score_is_relative_by_construction():
    """If every district worsened equally, no district should move up a tier."""
    source = open(IRRIGATION).read()
    for fragment in (
        "stressShare - norms.stressShare",
        "trend - norms.medianTrend",
        "shortShare - norms.shortShare",
    ):
        assert fragment in source, f"missing relative term: {fragment}"


def test_verify_count_counts_the_verify_bucket():
    """It counted Stress under the name verify, which is what saturated the tier
    and what made the district brief print a stress count beside verify names."""
    source = open(DATA_TS).read()
    match = re.search(r"verify_count:\s*rows\.filter\(\(r\)\s*=>\s*r\.status_bucket === \"(\w+)\"\)", source)
    assert match, "verify_count is no longer a simple bucket count; re-read this test"
    assert match.group(1) == "Verify"


def test_climate_context_still_cannot_create_a_category():
    """Rainfall and the ocean state are context. Only measured groundwater
    quantities may set an operational category.

    Scans the identifiers the branch reads, not its prose: the reason strings
    legitimately mention the season, and a substring search finds "oni" inside
    "Monitor".
    """
    source = open(IRRIGATION).read()
    rule = source[source.index("let action: IrrigationAction"): source.index("reason += status")]
    # Drop string and template literals; what remains is the code that decides.
    code = re.sub(r"`[^`]*`|\"[^\"]*\"|\'[^\']*\'", "", rule)
    identifiers = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", code))
    forbidden = {"rain", "rainfall", "oni", "enso", "elNino", "balance", "bal",
                 "gw", "precipitation", "monsoonWatch"}
    leaked = identifiers & forbidden
    assert not leaked, f"climate or satellite context reached the tier decision: {sorted(leaked)}"


def test_the_reader_is_told_the_tier_is_comparative():
    """A district below the line is nearer the middle, not safe. If the page
    stops saying so, the tier reads as an absolute all-clear."""
    page = open(os.path.join(ROOT, "app", "app", "irrigation", "page.tsx")).read()
    assert "comparative" in page.lower()
    assert "not safe" in page.lower()
