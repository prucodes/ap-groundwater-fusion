"""This week in the fields: the crop water check, the cropland-weighted vegetation
index and the official groundwater assessment (phase3_levels/fetch_field_signals.py)."""
import json
import os
import re
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import crop_water  # noqa: E402
import fetch_field_signals as ffs  # noqa: E402

APP = os.path.join(ROOT, "app")
FIELD = os.path.join(APP, "data", "field_signals.json")


# --- the water balance, by hand ----------------------------------------------------

def test_available_fraction_reads_the_cumulative_columns():
    pct = [80, 60, 40, 20]
    assert crop_water.available_fraction(pct, 0.05) == pytest.approx(0.8)
    assert crop_water.available_fraction(pct, 0.30) == pytest.approx(0.6)
    assert crop_water.available_fraction(pct, 1.00) == pytest.approx(0.4)
    # 0-20 cm: the 5 cm column, then the 5-30 cm layer read evenly: (4 + 0.56 * 15) / 20.
    assert crop_water.available_fraction(pct, 0.20) == pytest.approx(0.62)


def test_capacity_adds_soilgrids_layers_over_the_root_zone():
    assert crop_water.capacity_mm([100] * 6, 1.5) == pytest.approx(150)
    assert crop_water.capacity_mm([100, 120, 140, 160, 180, 200], 0.2) == pytest.approx(5 + 12 + 7)


def run(pct, eto=5.0, rain=0.0, days=8, today=1, crop="maize", stage=1):
    return crop_water.check(pct, [100] * 6, [eto] * days, [rain] * days, 0, today, crop, stage)


def test_a_full_root_zone_is_comfortable_through_the_week():
    result = run([100, 100, 100, 100])
    # Maize mid-season: Kc 1.2, roots 1.5 m (Table 22's 1.7 m capped), TAW 150 mm,
    # p = 0.55 + 0.04 (5 - 6) = 0.51, so stress begins after 76.5 mm; 7 x 6 mm = 42 mm.
    assert result["zr"] == 1.5 and result["taw"] == pytest.approx(150)
    assert result["p"] == pytest.approx(0.51) and result["raw"] == pytest.approx(76.5)
    assert result["state"] == "ok" and result["ksNow"] == 1 and result["drEnd"] == pytest.approx(42)


def test_half_full_runs_short_on_the_first_outlook_day():
    result = run([50, 50, 50, 50])
    assert result["drNow"] == pytest.approx(75)
    assert result["state"] == "soon" and result["onset"] == 0


def test_below_the_line_is_short_now_with_eq_84():
    result = run([30, 30, 30, 30])
    assert result["state"] == "stressed"
    assert result["ksNow"] == pytest.approx((150 - 105) / ((1 - 0.51) * 150))
    assert not result["severe"]


def test_rain_under_a_fifth_of_eto_is_ignored_and_above_it_counts_in_full():
    assert run([100] * 4, rain=0.99)["rainUsed"] == 0
    assert run([100] * 4, rain=1.0)["rainUsed"] == pytest.approx(7.0)


def test_initial_stage_roots_are_twenty_centimetres():
    assert run([100] * 4, stage=0)["zr"] == 0.2


def test_missing_inputs_give_no_result_rather_than_a_guess():
    assert crop_water.check(None, [100] * 6, [5] * 8, [0] * 8, 0, 1, "maize", 1) is None
    assert crop_water.check([50] * 4, None, [5] * 8, [0] * 8, 0, 1, "maize", 1) is None
    assert crop_water.check([50] * 4, [100] * 6, [5] * 4, [0] * 4, 0, 1, "maize", 1) is None


def test_python_crop_table_mirrors_the_app():
    """Kc, root depth and p must be the same numbers in both copies of the calculation."""
    source = open(os.path.join(APP, "lib", "agriculture.ts")).read()
    for crop, spec in crop_water.CROPS.items():
        line = re.search(rf"\n  {crop}: \{{[^\n]*", source).group(0)
        kc = [float(v) for v in re.search(r"kc: \[([^\]]+)\]", line).group(1).split(",")]
        root = re.search(r"rootM: \{ min: ([\d.]+), max: ([\d.]+) \}", line)
        p = float(re.search(r"\bp: ([\d.]+)", line).group(1))
        assert tuple(kc) == spec["kc"], crop
        assert (float(root.group(1)), float(root.group(2))) == spec["root"], crop
        assert p == spec["p"], crop


# --- matching INGRES units to boundaries -------------------------------------------

def test_names_normalise_as_the_two_sources_write_them():
    assert ffs.full_name("KAKINADA (RURAL)") == "KAKINADARURAL"
    assert ffs.norm_name("NANDYAL_RURAL") == "NANDYAL"
    assert ffs.norm_name("ATMAKUR (NELLORE)") == "ATMAKUR"
    assert ffs.norm_name("CHERUKUPALLE H/O ARUMBAKA") == "CHERUKUPALLE"
    assert ffs.norm_district("TIRUPATHI") == ffs.norm_district("Tirupati")


def test_units_match_by_location_alias_and_pair_and_wards_stay_out():
    features = ffs.geometry()
    unit = lambda d, n: {"district": d, "unit": n, "resource": 1.0}  # noqa: E731
    matched, unmatched = ffs.match_units([
        unit("Sri Potti Sriramulu Nellore", "ATMAKUR (NELLORE)"), unit("Nandyal", "ATMAKUR (KURNOOL)"), unit("Ananthapuramu", "ATMAKUR"),
        unit("West Godavari", "AKIVEEDU"), unit("Kurnool", "KURNOOL RURAL"), unit("Kurnool", "KURNOOL URBAN"),
        unit("NTR", "VIJAYAWADA NORTH"),
    ], features)
    where = {u["unit"]: i for i, group in matched.items() for u in group}
    atmakurs = {where["ATMAKUR (NELLORE)"], where["ATMAKUR (KURNOOL)"], where["ATMAKUR"]}
    assert len(atmakurs) == 3 and all(features[i]["m"] == "ATMAKUR" for i in atmakurs)
    assert features[where["AKIVEEDU"]]["m"] == "AKIVIDU"
    assert where["KURNOOL RURAL"] == where["KURNOOL URBAN"]
    assert [u["unit"] for u in unmatched] == ["VIJAYAWADA NORTH"]
    assert ffs.headline(matched[where["KURNOOL RURAL"]])["unit"] == "KURNOOL RURAL"


def test_map_values_are_keyed_and_coded_like_the_water_layers():
    features = [{"d": "Kurnool", "m": "Orvakal"}, {"d": "Kurnool", "m": "Kallur"}]
    payload = {"generatedAt": "x", "vegetation": {"averaged": [], "mandals": [{"v": 33.2, "cls": "severe"}, None]},
               "assessment": {"year": "2025-2026", "mandals": [None, {"cat": "over_exploited", "stage": 104.0}]}}
    out = ffs.mandal_values(payload, features)
    assert out["values"] == {"KURNOOL|ORVAKAL": [33.2, 2, None, None], "KURNOOL|KALLUR": [None, None, 3, 104.0]}


# --- the committed file -------------------------------------------------------------

@pytest.fixture(scope="module")
def field():
    return json.load(open(FIELD))


def test_the_committed_counts_are_what_the_code_computes(field):
    context = json.load(open(os.path.join(APP, "data", "water_context.json")))
    fresh = ffs.cross_check(field["weather"], field["soilCapacity"], context)
    if field["crossCheck"].get("soilAsOf") != context["soilMoisture"]["asOf"]:
        pytest.skip("the soil moisture was refreshed after the field signals")
    assert fresh["counts"] == field["crossCheck"]["counts"]
    assert set(fresh["counts"]) == {f"{c}-{s}" for c in crop_water.CROPS for s in range(3)}


def test_the_forecast_window_holds_today_and_a_week_ahead(field):
    weather = field["weather"]
    today = weather["dates"].index(weather["issued"])
    assert len(weather["dates"]) - today >= crop_water.OUTLOOK_DAYS
    assert weather["mandals"] >= 600
    assert all(len(row) == len(weather["dates"]) for row in weather["eto"] if row)


def test_vegetation_classes_follow_the_drought_manual(field):
    veg = field["vegetation"]
    for row in veg["mandals"]:
        if row:
            assert 0 <= row["v"] <= 100
            assert row["cls"] == ("normal" if row["v"] >= 60 else "moderate" if row["v"] >= 40 else "severe")
    assert all(sum(week.values()) <= len(veg["mandals"]) for week in veg["byWeek"])


def test_the_assessment_is_matched_and_carries_its_own_state_figure(field):
    gw = field["assessment"]
    assert gw["state"]["matched"] >= 650
    assert set(gw["state"]["categories"]) == set(ffs.CATEGORIES)
    assert 0 < gw["state"]["stagePct"] < 100
    for row in gw["mandals"]:
        if row:
            assert row["cat"] in ffs.CATEGORIES and row["match"] in ffs.STEP_RANK
