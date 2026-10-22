"""The layer says where rainfall stopped explaining the water table. It must not
be allowed to drift into saying what replaced it, which the data cannot support.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAYLOAD = os.path.join(ROOT, "app", "data", "rain_governed.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_rain_governed.py")
LIB = os.path.join(ROOT, "app", "lib", "rainGoverned.ts")
RUNNER = os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")


def load():
    with open(PAYLOAD, encoding="utf-8") as handle:
        return json.load(handle)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_it_never_claims_to_measure_extraction():
    """R2 of 0.13 for the median mandal cannot carry an extraction figure, and the
    residual is not pumping. Both the data and the code have to keep saying so."""
    data = load()
    assert "measures extraction" in data["caveat"] or "measure extraction" in data["caveat"]
    assert "not pumping" in data["caveat"]
    assert "is NOT a measure of extraction" in read(BUILDER) or "not a measure of extraction" in read(BUILDER)
    assert "does not measure extraction" in read(LIB)


def test_a_table_that_falls_in_wetter_years_is_not_called_rain_governed():
    """A positive slope is not rainfall behaving, whatever the fit says."""
    data = load()
    governed = data["codes"]["class"].index("rain governed")
    for value in data["values"].values():
        if value[1] == governed:
            assert value[2] > 0, value          # rise per 100 mm must be positive
            assert value[0] >= data["thresholds"]["governedR2"], value


def test_every_fit_rests_on_enough_seasons():
    least = load()["window"]["minSeasons"]
    for value in load()["values"].values():
        assert value[3] >= least, value


def test_the_groups_separate_the_way_the_page_says_they_do():
    """Irrigated share rises and responsiveness falls across the three classes.
    If that stops holding, the page's claim has stopped being true."""
    groups = {g["class"]: g for g in load()["groups"]}
    order = ["rain governed", "partly", "not rain"]
    irrigated = [groups[c]["medianIrrigatedPct"] for c in order if c in groups]
    rise = [groups[c]["medianRisePer100mm"] for c in order if c in groups]
    assert irrigated == sorted(irrigated), irrigated
    assert rise == sorted(rise, reverse=True), rise


def test_rain_governed_mandals_are_mostly_hard_rock():
    groups = {g["class"]: g for g in load()["groups"]}
    aquifers = groups["rain governed"]["aquifers"]
    assert max(aquifers, key=aquifers.get) == "hard_rock", aquifers


def test_the_thinness_of_the_instrument_is_declared():
    limits = " ".join(load()["limits"])
    assert "thin instrument" in limits
    assert "uncertainty estimates and independent validation" in limits


def test_the_median_fit_is_reported_not_hidden():
    """Leading with the strong group while hiding that rain explains an eighth of
    the median mandal would be the flattering version of this."""
    assert 0.0 <= load()["medianR2"] <= 0.3


def test_the_weekly_refresh_builds_and_commits_it():
    """It rests on the depth record and the rain history, both of which move weekly."""
    assert "build_rain_governed.py" in read(RUNNER)
    assert "app/data/rain_governed.json" in read(WORKFLOW)
