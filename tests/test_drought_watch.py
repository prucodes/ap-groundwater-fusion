"""The Drought Watch reads every mandal by the Manual for Drought Management (2020), table by table."""
import json
import os
import sys
from collections import Counter

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_drought_watch as dw  # noqa: E402

DATA = os.path.join(ROOT, "app", "data", "drought_watch.json")


# --- Table 3.1, rainfall deviation -------------------------------------------

@pytest.mark.parametrize("deviation, expected", [
    (25, "excess"), (20, "excess"), (19.9, "normal"), (-19.9, "normal"), (-19.96, "deficient"),
    (-20, "deficient"), (-59, "deficient"), (-60, "largeDeficient"), (-99, "largeDeficient"), (-100, "noRain"),
])
def test_rainfall_categories_follow_imd(deviation, expected):
    assert dw.rain_class(deviation) == expected


# --- Table 3.11, trigger 1 -----------------------------------------------------

def test_a_dry_spell_alone_sets_trigger_one():
    assert dw.trigger_one(True, rain="normal") == (True, "drySpell")
    assert dw.trigger_one(True, rain="deficient")[0] is True


def test_without_a_dry_spell_only_a_large_deficit_sets_it():
    assert dw.trigger_one(False, rain="largeDeficient") == (True, "largeDeficient")
    assert dw.trigger_one(False, rain="noRain")[0] is True
    assert dw.trigger_one(False, rain="deficient") == (False, "deficitWithoutDrySpell")
    assert dw.trigger_one(False, rain="normal") == (False, "normalRainfall")


def test_the_spi_route_uses_minus_one_and_a_half():
    assert dw.trigger_one(False, spi=-1.6)[0] is True
    assert dw.trigger_one(False, spi=-1.4) == (False, "deficitWithoutDrySpell")
    assert dw.trigger_one(False, spi=-0.5) == (False, "normalRainfall")
    assert dw.trigger_one(True, spi=0.4)[0] is True


def test_missing_inputs_do_not_pass_for_a_verdict():
    assert dw.trigger_one(None, rain="deficient")[0] is None
    assert dw.trigger_one(False)[0] is None


# --- 3.2.1 B, dry spells -------------------------------------------------------

def test_dry_weeks_are_under_half_of_normal_and_the_first_week_is_not_counted():
    weeks = [(0, 20), (10, 30), (5, 30), (14, 30), (2, 30), (40, 30), (10, 30), (15, 30)]
    flags, runs, longest = dw.dry_spells(weeks)
    assert flags[:3] == [True, True, True]
    assert flags[3] is True and flags[5] is False
    assert flags[7] is False, "exactly half of normal is not under half"
    assert runs == [[1, 4], [6, 6]] and longest == 4, "week 0 precedes the onset and starts no run"


def test_a_missing_week_breaks_a_run():
    flags, runs, longest = dw.dry_spells([(0, 20), (0, 30), (None, None), (0, 30), (0, 30)])
    assert flags[2] is None and runs == [[1, 1], [3, 4]] and longest == 2


# --- impact classes, Tables 3.4, 3.6, 3.8, 3.9 and 3.2.3.1 -------------------

@pytest.mark.parametrize("value, expected", [(60, "normal"), (59.9, "moderate"), (40, "moderate"), (39.9, "severe"), (0, "severe")])
def test_vci_classes(value, expected):
    assert dw.vci_class(value) == expected


@pytest.mark.parametrize("value, expected", [(76, "normal"), (75.6, "normal"), (75.4, "moderate"), (51, "moderate"), (50.4, "severe"), (0, "severe")])
def test_pasm_classes_are_the_2020_ones(value, expected):
    assert dw.pasm_class(value) == expected


@pytest.mark.parametrize("value, band", [(-0.10, "normal"), (-0.15, "normal"), (-0.16, "mild"), (-0.30, "mild"),
                                          (-0.31, "moderate"), (-0.45, "moderate"), (-0.46, "severe"), (-0.60, "severe"), (-0.61, "extreme")])
def test_gwdi_bands(value, band):
    assert dw.gwdi_band(value) == band


@pytest.mark.parametrize("deficit, band", [(10, "normal"), (20, "mild"), (29.9, "mild"), (30, "moderate"), (40, "severe"), (60, "severe"), (60.1, "extreme")])
def test_reservoir_storage_bands(deficit, band):
    assert dw.rsi_band(deficit) == band


def test_five_hydrology_bands_fold_into_the_matrix_three():
    assert [dw.impact_of(b) for b in ("normal", "mild", "moderate", "severe", "extreme")] == \
        ["normal", "normal", "moderate", "severe", "severe"]


@pytest.mark.parametrize("pct, expected", [(90, "normal"), (85, "normal"), (84, "moderate"), (76, "moderate"), (75, "severe"), (26, "severe")])
def test_sown_area_classes(pct, expected):
    assert dw.sown_class(pct) == expected


def test_gwdi_is_the_mean_less_this_year_over_the_deepest():
    values = [4.0] * 9 + [10.0]
    assert dw.gwdi(values, 10.0) == pytest.approx((4.6 - 10.0) / 10.0)
    assert dw.gwdi(values[:9], 4.0) is None, "fewer than ten years of the month is not enough"


# --- 3.3.1 step 2, severity ------------------------------------------------------

@pytest.mark.parametrize("classes, expected", [
    (["severe", "severe", "moderate"], "severe"),
    (["severe", "severe", "severe"], "severe"),
    (["severe", "severe", "normal"], "moderate"),
    (["moderate", "moderate", "normal"], "moderate"),
    (["severe", "moderate", "normal"], "moderate"),
    (["severe", "normal", "normal"], "normal"),
    (["normal", "normal", "normal"], "normal"),
])
def test_the_severity_matrix(classes, expected):
    assert dw.decide(classes) == expected


def test_one_missing_indicator_is_tried_both_ways():
    assert dw.severity(["severe", "severe", None]) == "moderate|severe"
    assert dw.severity(["moderate", "moderate", None]) == "moderate"
    assert dw.severity(["normal", "moderate", None]) == "normal|moderate"
    assert dw.severity(["normal", "normal", None]) == "normal"
    assert dw.severity(["severe", None, None]) == "insufficient"


def test_trigger_two_is_only_reached_through_trigger_one():
    assert dw.overall(False, "severe") == "noTrigger"
    assert dw.overall(None, "severe") == "insufficient"
    assert dw.overall(True, "moderate") == "moderate"


def test_spi_sits_near_zero_for_a_median_season_and_low_for_a_dry_one():
    history = [300 + 10 * (i % 15) for i in range(40)]
    assert abs(dw.spi_value(history, sorted(history)[20])) < 0.4
    assert dw.spi_value(history, 120) < -2
    assert dw.spi_value(history[:20], 120) is None, "under 30 years is not enough"


# --- the published file ------------------------------------------------------

@pytest.fixture(scope="module")
def published():
    return json.load(open(DATA))


def test_every_boundary_has_one_row_in_map_order(published):
    geometry = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))["mandals"]
    assert [row["i"] for row in published["mandals"]] == list(range(len(geometry)))
    assert all(row["d"] == g["d"] and row["m"] == g["m"] for row, g in zip(published["mandals"], geometry))


def test_each_published_outcome_follows_from_its_own_values(published):
    """The outcome is recomputed from the row's stored values, so the page cannot disagree with its own numbers."""
    for row in published["mandals"]:
        dry = None if row["dry"] is None else row["dry"]["longest"] >= dw.DRY_SPELL_WEEKS
        t1, _ = dw.trigger_one(dry, rain=row["rain"]["cls"] if row["rain"] else None)
        assert t1 == row["t1"], row["m"]
        impact = [row["impact"]["rs"], row["impact"]["sm"], row["impact"]["hy"]]
        assert impact == [(row[k] or {}).get("cls") for k in ("vci", "pasm", "gwdi")], row["m"]
        assert row["category"] == dw.overall(t1, dw.severity(impact)), row["m"]


def test_the_counts_add_up(published):
    state = published["state"]
    assert sum(state["counts"].values()) == state["mandals"] == len(published["mandals"])
    assert state["counts"] == {k: Counter(r["category"] for r in published["mandals"]).get(k, 0) for k in state["counts"]}
    assert state["trigger1"] == sum(1 for r in published["mandals"] if r["t1"])
    summary = json.load(open(os.path.join(ROOT, "app", "data", "drought_watch_summary.json")))
    assert summary["categories"] == [r["category"] for r in published["mandals"]]
    assert summary["state"]["counts"] == state["counts"]


def test_the_page_states_its_sources_and_the_manual(published):
    assert published["manual"]["url"].startswith("https://")
    assert published["season"]["declareBy"].endswith("-10-31")
    for key in ("rain", "spi", "vci", "pasm", "gwdi", "rsi"):
        assert published["sources"][key], f"{key} source missing"
    assert published["sources"]["vci"]["caveat"]
    assert published["rules"]["interpretations"], "every reading of the manual that needed judgement is listed"


def test_reported_sowing_is_labelled_as_reported(published):
    sowing = published["sources"]["sowing"]
    assert sowing["kind"] == "reported" and sowing["reportedBy"] and sowing["url"].startswith("https://")
    districts = {g["d"] for g in json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))["mandals"]}
    assert all(entry["district"] in districts for entry in published["sowingDistricts"]), "reported names must match the map"
