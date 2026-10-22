"""What the season banked, by the water-table fluctuation method.

GEC-2015's own arithmetic: rise x specific yield x area. The figures have to
multiply out from the columns beside them, no share may be published where the
rain was too thin to form one, and the method has to keep saying that the rise
is net of the season's own pumping.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")


@pytest.fixture(scope="module")
def watch():
    with open(WATCH, encoding="utf-8") as handle:
        return json.load(handle)


def test_the_volume_multiplies_out_from_its_own_columns(watch):
    checked = 0
    for row in watch["mandals"]:
        if row.get("bankedMm3") is None or row["specificYield"] is None or row["areaKm2"] is None:
            continue
        expected = max(row["riseM"], 0.0) * row["specificYield"] * row["areaKm2"]
        # Half a unit in the last published place of each input, carried through.
        tolerance = (0.005 * row["specificYield"] * row["areaKm2"]
                     + 0.00005 * max(row["riseM"], 0.0) * row["areaKm2"]
                     + 0.05 * max(row["riseM"], 0.0) * row["specificYield"] + 0.005)
        assert abs(row["bankedMm3"] - expected) <= tolerance, row["mandal"]
        checked += 1
    assert checked > 400


def test_a_mandal_whose_table_fell_banked_nothing(watch):
    for row in watch["mandals"]:
        if row.get("bankedMm3") is None:
            continue
        assert row["bankedMm3"] >= 0
        if row["riseM"] <= 0:
            assert row["bankedMm3"] == 0, row["mandal"]


def test_no_share_is_published_on_rain_too_thin_to_make_one(watch):
    floor = watch["banked"]["shareFloorMm"]
    thin = 0
    for row in watch["mandals"]:
        rain = row.get("seasonRainMm")
        if rain is None:
            continue
        if rain < floor:
            assert row["bankedSharePct"] is None, row["mandal"]
            thin += 1
    assert thin == watch["banked"]["thinRain"]


def test_the_state_total_is_a_ratio_of_volumes_not_a_mean_of_ratios(watch):
    banked = watch["banked"]
    assert banked["sharePct"] == pytest.approx(100 * banked["bankedMm3"] / banked["rainMm3"], abs=0.1)
    # More than half the mandals banked nothing, so a mean of per-mandal shares
    # would read far higher than the state actually kept.
    assert banked["medianSharePct"] < banked["sharePct"]


def test_the_method_says_the_rise_is_net(watch):
    method = watch["banked"]["method"]
    assert "Water-table fluctuation" in method and "GEC-2015" in method
    assert "Net of" in method and "not a GEC-2015 gross recharge assessment" in method
