"""The temperature panel may publish what two records agree on, and no more.

Written from docs/temperature_record_findings.md. Both products are certain
Andhra Pradesh is warming and both find El Nino years hotter here once the trend
is removed. They differ by nearly a factor of three on the rate, so the rate is
published as the range they span and never as a figure, and nothing is projected
forward: there is no climate model in this project.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "app", "data", "ap_temperature.json")
COMPONENT = os.path.join(ROOT, "app", "components", "TemperatureRecord.tsx")
PAGE = os.path.join(ROOT, "app", "app", "monsoon", "page.tsx")


@pytest.fixture(scope="module")
def data():
    with open(DATA) as handle:
        return json.load(handle)


def test_two_independent_records_are_carried(data):
    assert len(data["records"]) >= 2
    for record in data["records"].values():
        assert record["lastYear"] - record["firstYear"] >= 60, "not a long record"
        assert len(record["series"]) >= 60
        assert record["enso"] is not None


def test_only_a_record_finer_than_the_state_may_rank_a_year(data):
    """A five-degree cell is larger than Andhra Pradesh. Asked which single year
    was warmest, that product answered 2016 or 2024 depending on whether one
    cell or two were taken -- so it is not allowed to answer at all."""
    for record in data["records"].values():
        if record["gridDegrees"] > 1.0:
            assert record["canRankYears"] is False
    ranked = data["agreement"]["warmestYearFrom"]
    assert ranked, "no record is fine enough to name a warmest year"
    for label in ranked:
        match = next(r for r in data["records"].values() if r["label"] == label)
        assert match["canRankYears"] is True


def test_the_el_nino_finding_holds_in_every_record(data):
    """This is the one worth publishing: a heat cost on top of the rainfall
    cost, over dozens of events rather than the two the wells cover."""
    for record in data["records"].values():
        enso = record["enso"]
        assert enso["differenceC"] > 0, f'{record["label"]} does not find El Nino years hotter'
        assert enso["pValue"] < 0.05, f'{record["label"]} p = {enso["pValue"]}'
        assert enso["elNinoYears"] >= 10 and enso["laNinaYears"] >= 10
    assert data["agreement"]["bothHotterInElNino"] is True


def test_the_records_really_do_disagree_about_the_rate(data):
    """If they ever converge, the page's careful hedging becomes overwrought and
    should be revisited rather than left in place out of habit."""
    low, high = data["agreement"]["trendRangeCPerDecade"]
    assert low > 0 and high > 0, "both must still say warming"
    assert high / low > 1.5, (
        f"the records now agree within {high / low:.1f}x; the range framing may no longer be needed"
    )


def test_no_single_warming_rate_is_printed(data):
    """The component may print the range. It may not print one record's rate as
    though it were the answer."""
    source = open(COMPONENT).read()
    assert "trendRangeCPerDecade" in source
    assert "trendCPerDecade" not in source, "a single record's rate reached the component"


def test_nothing_is_projected_forward():
    """Looks for a projection, not for the word.

    Scanning for "projected" and "forecast" flagged the sentence that says the
    card does neither, which is the third time in this project a test has
    matched its own denial. A projection is a future year, or a promise about
    what a temperature will do -- so that is what is checked.
    """
    page = open(PAGE).read()
    start = page.index("The other cost: heat")
    block = page[start:start + 2200]

    future = re.findall(r"\b(20[3-9]\d|21\d\d)\b", block)
    assert not future, f"a future year appears on the heat card: {future}"

    for match in re.finditer(r"\bwill\b", block, re.I):
        window = block[match.start(): match.start() + 60]
        assert not re.search(r"°C|degree|hotter|warmer", window, re.I), (
            f"the card promises a future temperature: {window.strip()[:60]!r}"
        )

    # And it must still say why it does not.
    assert "no climate model" in block.lower()
    assert "not as a figure" in block.lower() or "never as a figure" in block.lower() \
        or "single figure" in block.lower()


def test_the_series_share_one_baseline(data):
    """Two records on different baselines would show a gap that is an artefact
    rather than a disagreement."""
    assert re.fullmatch(r"\d{4}-\d{4}", data["baseline"])
    for record in data["records"].values():
        first, last = int(data["baseline"][:4]), int(data["baseline"][5:])
        inside = [p["anomalyC"] for p in record["series"] if first <= p["year"] <= last]
        assert abs(sum(inside) / len(inside)) < 0.02, "baseline mean is not zero"
