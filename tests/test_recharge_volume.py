"""Metres of water table are not water.

A metre lost from hard rock holds roughly a fifth of the water a metre lost from
the delta does, so a map coloured by metres ranks mandals differently from one
coloured by the water they actually hold. Both readings are wanted -- metres
answer whether a bore will still reach water, volume answers how much a place
has lost -- and the site published only the first.
"""
import json
import math
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")


@pytest.fixture(scope="module")
def watch():
    with open(WATCH) as handle:
        return json.load(handle)


def placed(watch):
    return [m for m in watch["mandals"] if m["shortfallMm3"] is not None]


def test_the_volume_is_the_product_it_claims_to_be(watch):
    """shortfall (m) x specific yield x area (km2) -> million cubic metres.

    The volume is computed at full precision and every column is published
    rounded, so multiplying what is on screen reproduces it only to within that
    rounding. The tolerance below is derived from the published precision rather
    than fitted to the data: half a unit in the last place of each input, times
    the other two, plus the volume's own last place. A wrong specific yield or a
    projection error misses by a factor and blows straight through it.
    """
    rows = placed(watch)
    assert rows
    for row in rows:
        shortfall, yield_, area = row["shortfallM"], row["specificYield"], row["areaKm2"]
        expected = shortfall * yield_ * area
        budget = (
            0.005 * yield_ * area          # shortfall published to 2 decimals
            + abs(shortfall) * 0.00005 * area  # yield published to 4
            + abs(shortfall) * yield_ * 0.05   # area published to 1
            + 0.05                             # the volume itself, to 1
        )
        assert abs(row["shortfallMm3"] - expected) <= budget, (
            f"{row['district']}/{row['mandal']}: published {row['shortfallMm3']}, "
            f"columns give {expected:.3f}, rounding allows {budget:.3f}"
        )


def test_a_volume_needs_all_three_inputs(watch):
    for row in watch["mandals"]:
        if row["shortfallMm3"] is None:
            assert row["areaKm2"] is None or row["specificYield"] is None
        else:
            assert row["areaKm2"] is not None and row["specificYield"] is not None


def test_the_total_counts_only_the_mandals_it_could_measure(watch):
    volume = watch["recharge"]["volume"]
    rows = placed(watch)
    assert volume["mandals"] == len(rows)
    assert volume["ofMandals"] == len(watch["mandals"])
    assert volume["shortfallMm3"] == pytest.approx(sum(r["shortfallMm3"] for r in rows), abs=2)
    assert volume["areaKm2"] == pytest.approx(sum(r["areaKm2"] for r in rows), abs=2)


def test_the_depth_equivalent_is_the_same_quantity_spread_over_its_own_ground(watch):
    """The one comparison that needs no outside figure."""
    volume = watch["recharge"]["volume"]
    expected_mm = 1000 * (volume["shortfallMm3"] * 1e6) / (volume["areaKm2"] * 1e6)
    assert volume["asDepthMm"] == pytest.approx(expected_mm, abs=0.2)


def test_the_mandal_areas_add_up_to_something_like_andhra_pradesh(watch):
    """A projection error would show as an area off by a factor, not a percent.
    The state is about 163,000 km2; the measured mandals are a subset of it."""
    total = sum(m["areaKm2"] for m in placed(watch))
    assert 80_000 < total < 163_000


def test_ranking_by_volume_is_not_the_same_as_ranking_by_metres(watch):
    """If the two agreed, the second view would be decoration."""
    rows = [m for m in placed(watch) if m["status"] != "normal"]
    assert len(rows) > 20
    by_metres = [m["mandalUuid"] for m in sorted(rows, key=lambda m: -m["shortfallM"])[:10]]
    by_volume = [m["mandalUuid"] for m in sorted(rows, key=lambda m: -m["shortfallMm3"])[:10]]
    assert by_metres != by_volume
    assert len(set(by_metres) & set(by_volume)) < 8


def test_specific_yield_stays_inside_what_an_aquifer_can_hold(watch):
    """Specific yield is a fraction of rock volume that drains; values outside
    roughly 0.1%-35% mean the table joined the wrong number."""
    for row in placed(watch):
        assert 0.001 <= row["specificYield"] <= 0.35


def test_the_aquifer_split_reports_both_readings(watch):
    for row in watch["recharge"]["byAquifer"]:
        assert row["medianShortfallM"] > 0
        assert row["medianSpecificYield"] > 0
        assert "shortfallMm3" in row
