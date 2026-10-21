"""The recharge map says where to spend money digging, so its limits are asserted.

Every guard here stands for a reading that looked authoritative and was wrong.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAYLOAD = os.path.join(ROOT, "app", "data", "recharge_efficiency.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_recharge_efficiency.py")
RUNNER = os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")


def load():
    with open(PAYLOAD, encoding="utf-8") as handle:
        return json.load(handle)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_deep_wells_are_set_aside_rather_than_ranked():
    """Water-table fluctuation assumes an unconfined aquifer. Unfiltered, share and
    depth correlated at 0.40 and Pedapadu led the table at 96% on a table 25 m down."""
    data = load()
    limit = data["thresholds"]["deepWellM"]
    classes = data["codes"]["class"]
    aside = classes.index("set aside")
    for row in data["strongest"] + data["weakest"]:
        assert row["class"] != "set aside", row
        if row["typicalDepthM"] is not None:
            assert row["typicalDepthM"] <= limit, row
    deep = [v for v in data["values"].values() if v[1] == aside]
    assert deep, "nothing set aside; the filter did not run"
    for value in deep:
        # The published depth is rounded to a tenth, so a mandal just over the
        # threshold prints as exactly it.
        assert value[3] is None or value[3] >= limit, value


def test_a_mandal_that_banked_more_than_fell_is_not_called_a_converter():
    """Above 100% the water arrived along a canal or from upslope. Ranking those at
    the top would site a recharge structure on somebody else's water."""
    data = load()
    classes = data["codes"]["class"]
    for row in data["strongest"]:
        assert row["class"] != "imports", row
        assert row["medianSharePct"] <= data["thresholds"]["importsPct"], row
    imports = classes.index("imports")
    for value in data["values"].values():
        if value[1] == imports:
            assert value[0] > data["thresholds"]["importsPct"], value


def test_every_scored_mandal_has_several_years_behind_it():
    data = load()
    least = data["window"]["minYears"]
    for value in data["values"].values():
        assert value[2] >= least, value


def test_the_state_median_sits_where_the_method_should_put_it():
    """GEC's own recharge coefficients run about 8 to 20% of rainfall for most
    formations. Outside that, the arithmetic has gone wrong rather than the State."""
    median = load()["stateMedianSharePct"]
    assert median is not None and 5 <= median <= 25, median


def test_the_residual_depth_bias_is_still_declared():
    """Setting the deepest aside reduced the bias; it did not remove it. The page
    must keep saying so, because a reader comparing across the table will be misled."""
    limits = " ".join(load()["limits"])
    assert "0.27" in limits and "0.40" in limits
    assert "similar depth" in limits


def test_it_says_the_figure_is_net_of_pumping():
    data = load()
    assert "Net of the season" in data["caveat"]
    assert "NET of the season" in read(BUILDER)


def test_it_does_not_present_itself_as_a_siting_decision():
    limits = " ".join(load()["limits"])
    assert "verified in the field" in limits


def test_the_payload_stays_small_enough_for_the_map():
    assert os.path.getsize(PAYLOAD) < 120 * 1024, os.path.getsize(PAYLOAD)


def test_the_weekly_refresh_builds_and_commits_it():
    assert "build_recharge_efficiency.py" in read(RUNNER)
    assert "app/data/recharge_efficiency.json" in read(WORKFLOW)
