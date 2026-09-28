"""The monsoon watch must answer one question honestly: is this season recharging?"""
import os
import sys

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "phase3_levels"))

import build_monsoon_watch as watch
import fetch_enso_index as enso


def levels_for(changes_by_year, mandal="m1", may_depth=10.0):
    """A mandal whose May-to-August change is given per year."""
    row = {}
    for year, change in changes_by_year.items():
        row[f"{year}-05"] = may_depth
        row[f"{year}-08"] = may_depth + change
    return pd.DataFrame([row], index=[mandal])


META = pd.DataFrame([{"district": "Kurnool", "mandal": "Orvakal", "aquifer_type": "hard_rock"}],
                    index=["m1"])


def test_a_mandal_that_recharges_as_usual_is_not_flagged():
    history = {year: -1.0 for year in range(2016, 2026)}
    history[2026] = -1.0
    table = watch.score_recharge(levels_for(history), META, 2026, 8)
    assert table.loc["m1", "shortfallM"] == pytest.approx(0.0)
    assert not bool(table.loc["m1", "short"])


def test_a_season_that_falls_instead_of_rising_is_flagged_severe():
    history = {year: -1.0 + 0.05 * (year % 3) for year in range(2016, 2026)}
    history[2026] = +1.5
    table = watch.score_recharge(levels_for(history), META, 2026, 8)
    assert table.loc["m1", "shortfallM"] > 2.0
    assert bool(table.loc["m1", "severe"])


def test_the_comparison_is_immune_to_a_mandal_drifting_deeper_every_year():
    """A mandal falling one metre a year still recharges normally each monsoon."""
    rows = {}
    for offset, year in enumerate(range(2016, 2027)):
        may = 10.0 + offset          # deeper every single year
        rows[f"{year}-05"] = may
        rows[f"{year}-08"] = may - 1.0
    table = watch.score_recharge(pd.DataFrame([rows], index=["m1"]), META, 2026, 8)
    assert table.loc["m1", "shortfallM"] == pytest.approx(0.0)
    assert not bool(table.loc["m1", "short"])


def test_a_mandal_without_enough_comparable_years_is_dropped():
    history = {year: -1.0 for year in range(2022, 2026)}   # four prior years only
    history[2026] = +3.0
    table = watch.score_recharge(levels_for(history), META, 2026, 8)
    assert "m1" not in table.index


def test_a_metre_of_shortfall_alone_does_not_flag_a_wildly_variable_mandal():
    """Hard-rock mandals swing metres between years; one more metre is not news."""
    history = {2016: -6.0, 2017: +4.0, 2018: -5.0, 2019: +3.0, 2020: -4.0,
               2021: +2.0, 2022: -3.0, 2023: +1.0, 2024: -2.0, 2025: 0.0}
    history[2026] = history[2025] + 1.2
    table = watch.score_recharge(levels_for(history), META, 2026, 8)
    assert table.loc["m1", "shortfallM"] >= watch.SHORTFALL_M
    assert table.loc["m1", "z"] < watch.SHORTFALL_Z
    assert not bool(table.loc["m1", "short"])


def test_a_tiny_move_in_a_steady_mandal_does_not_flag_on_spread_alone():
    """The delta mandals barely move; 20 cm is many spreads but is not a drought."""
    history = {year: -1.0 + 0.001 * year for year in range(2016, 2026)}
    history[2026] = history[2025] + 0.2
    table = watch.score_recharge(levels_for(history), META, 2026, 8)
    assert table.loc["m1", "z"] > 0
    assert table.loc["m1", "shortfallM"] < watch.SHORTFALL_M
    assert not bool(table.loc["m1", "short"])


def test_severity_ranks_past_both_gates_not_either_one():
    steady = levels_for({**{y: -1.0 for y in range(2016, 2026)}, 2026: +0.6}, "steady")
    swingy = levels_for({2016: -6.0, 2017: +4.0, 2018: -5.0, 2019: +3.0, 2020: -4.0,
                         2021: +2.0, 2022: -3.0, 2023: +1.0, 2024: -2.0, 2025: 0.0,
                         2026: +4.0}, "swingy")
    meta = pd.DataFrame([{"district": "d", "mandal": "a", "aquifer_type": "hard_rock"},
                         {"district": "d", "mandal": "b", "aquifer_type": "hard_rock"}],
                        index=["steady", "swingy"])
    table = watch.score_recharge(pd.concat([steady, swingy]), meta, 2026, 8)
    # The swingy mandal has far more metres; the steady one far more spread.
    assert table.loc["swingy", "shortfallM"] > table.loc["steady", "shortfallM"]
    assert table.loc["steady", "z"] > table.loc["swingy", "z"]
    # Severity must not simply follow either of those.
    assert table.severity.max() == pytest.approx(
        min(table.loc[table.severity.idxmax(), "shortfallM"] / watch.SHORTFALL_M,
            table.loc[table.severity.idxmax(), "z"] / watch.SHORTFALL_Z))


def test_one_displaced_well_in_the_history_does_not_hide_the_current_season():
    """A standard deviation would be inflated by the 30 m step; the MAD is not."""
    history = {year: -1.0 for year in range(2016, 2026)}
    history[2019] = -30.0                      # the well was deepened that year
    history[2026] = +1.5
    table = watch.score_recharge(levels_for(history), META, 2026, 8)
    assert bool(table.loc["m1", "short"])


def test_enso_classification_matches_the_published_thresholds():
    assert enso.classify(0.5) == "el_nino"
    assert enso.classify(0.49) == "neutral"
    assert enso.classify(-0.5) == "la_nina"
    assert watch.strength(1.8) == "strong"
    assert watch.strength(2.1) == "very strong"
    assert watch.strength(0.4) == "neutral"


def test_an_event_needs_five_overlapping_seasons():
    warm = [{"date": f"2026-{m:02d}", "oni_c": 1.0} for m in range(1, 5)]
    assert enso.events(warm, "el_nino") == []
    warm.append({"date": "2026-05", "oni_c": 1.0})
    assert len(enso.events(warm, "el_nino")) == 1


def test_enso_context_reports_the_latest_season_and_its_three_month_trend():
    oni = {"2026-04": ("MAM", 0.11), "2026-05": ("AMJ", 0.46),
           "2026-06": ("MJJ", 1.39), "2026-07": ("JJA", 1.80)}
    context = watch.enso_context(oni)
    assert context["asOf"] == "2026-07"
    assert context["state"] == "el_nino"
    assert context["trend3moC"] == pytest.approx(1.69)


def test_the_el_nino_composite_measures_the_deficit_and_says_how_many_years_it_saw():
    warm_years = {y for y in range(1981, 2026) if y % 5 == 0}
    # El Nino years get 800 mm, every other year 1000 mm: a 20% deficit on those
    # years, which is a 17.8% deficit against the mean of all of them.
    totals = pd.DataFrame([{"boundary_index": 0, "year": year,
                            "mm": 800.0 if year in warm_years else 1000.0}
                           for year in range(1981, 2026)])
    oni = {f"{year}-07": ("JJA", 1.0 if year in warm_years else 0.0)
           for year in range(1981, 2026)}
    out = watch.composite(totals, "mm", oni, 6, {0: "Kurnool"})
    assert out["years"] == 45
    assert out["elNinoYears"] == len(warm_years)
    overall = (800.0 * len(warm_years) + 1000.0 * (45 - len(warm_years))) / 45
    assert out["elNinoAnomalyPct"] == pytest.approx(100 * (800.0 / overall - 1), abs=0.1)
    assert out["byDistrict"][0]["district"] == "Kurnool"


def test_seasonal_totals_refuse_a_part_season():
    rain = pd.DataFrame([{"boundary_index": 0, "year": 2026, "mon": m, "rain_mm": 10.0}
                         for m in (6, 7, 8)])
    assert watch.seasonal_totals(rain, (6, 7, 8, 9), "mm").empty
    assert len(watch.seasonal_totals(rain, (6, 7, 8), "mm")) == 1


def test_the_rainfall_archive_and_the_live_tail_do_not_overlap():
    """The weekly refresh appends to the tail only; a shared file would commit
    two megabytes of 1981 rainfall every Monday."""
    import csv as _csv

    import fetch_chirps_history as chirps

    paths = chirps.history_paths()
    if len(paths) < 2:
        pytest.skip("archive not present in this checkout")
    archive, tail = paths
    archive_months = {row["date"] for row in _csv.DictReader(open(archive))}
    tail_months = {row["date"] for row in _csv.DictReader(open(tail))}
    assert not archive_months & tail_months
    assert max(archive_months) < chirps.ARCHIVE_BEFORE
    assert min(tail_months) >= chirps.ARCHIVE_BEFORE
