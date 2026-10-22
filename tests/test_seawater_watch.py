"""The seawater watch is a check on an official map, so its claims stay narrow.

Each guard here stands for a way this produced a confident wrong answer while it
was being built, and none of them raised an error at the time.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAYLOAD = os.path.join(ROOT, "app", "data", "seawater_watch.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_seawater_watch.py")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")
RUNNER = os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")


def load():
    with open(PAYLOAD, encoding="utf-8") as handle:
        return json.load(handle)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_deep_wells_are_kept_off_the_watch_list():
    """A mandal-mean depth of 44 m is a confined aquifer or an inland table, and
    subtracting it from a ground elevation says nothing about intrusion. Unfiltered,
    the list opened with Vetapalem, Denduluru and Rajahmundry Rural."""
    data = load()
    limit = data["deepWellThresholdM"]
    for row in data["watch"]:
        assert row["depthM"] <= limit, row
    assert data["setAsideDeepWells"], "the set-aside list is the evidence this filter ran"
    for row in data["setAsideDeepWells"]:
        assert row["depthM"] > limit, row


def test_the_watch_list_is_only_what_the_assessment_has_not_flagged():
    data = load()
    for row in data["watch"]:
        assert row["category"] != "salinity", row
    for row in data["confirmed"]:
        assert row["category"] == "salinity", row


def test_a_mandal_is_low_on_its_lower_ground_too():
    """A mean can be dragged under zero by one deep pixel, so the tenth percentile
    has to agree before a mandal is called low."""
    for row in load()["watch"]:
        assert row["headM"] <= 0 and row["headP10M"] <= 0, row


def test_head_is_elevation_minus_depth():
    for row in load()["watch"]:
        assert abs(row["headM"] - (row["groundM"] - row["depthM"])) < 0.15, row


def test_the_gradient_that_justifies_the_method_still_holds():
    """The whole card rests on the official classification and this head agreeing.
    If that stops being true the page should stop making the claim."""
    bands = {b["band"]: b for b in load()["bands"]}
    shares = [bands[name]["salinityPct"] for name in
              ("at or below sea level", "0 to 5 m", "5 to 20 m", "above 20 m")]
    assert shares == sorted(shares, reverse=True), shares
    assert shares[0] > 10 * shares[-1], shares


def test_salinity_units_sit_far_lower_than_the_rest():
    data = load()
    assert data["medianHeadSalinityM"] < data["medianHeadOtherM"] / 5


def test_it_does_not_claim_to_have_measured_intrusion():
    data = load()
    assert "not co-located" in data["caveat"]
    assert "verify" in data["caveat"]
    # and the builder says so where the next reader will look
    assert "call anywhere intruded" in read(BUILDER)


def test_the_weekly_refresh_builds_and_commits_it():
    """It is derived from a depth that moves every week, so a static copy goes stale."""
    assert "build_seawater_watch.py" in read(RUNNER)
    assert "app/data/seawater_watch.json" in read(WORKFLOW)
