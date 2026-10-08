"""Months the State carried forward are missing, not readings."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

from series_quality import carried_forward_months, history_carried_forward  # noqa: E402


def rows(month, values):
    return [{"mandal_uuid": f"m{i}", "date": month, "level_mbgl": str(v)} for i, v in enumerate(values)]


def test_a_month_most_mandals_repeat_is_carried_forward():
    history = rows("2021-08", [5.0, 6.0, 7.0, 8.0]) + rows("2021-09", [5.0, 6.0, 7.0, 8.5])
    assert carried_forward_months(history) == ["2021-09"]


def test_an_ordinary_month_with_a_few_repeats_is_kept():
    history = rows("2023-08", [5.0, 6.0, 7.0, 8.0]) + rows("2023-09", [5.0, 6.2, 7.3, 8.4])
    assert carried_forward_months(history) == []


def test_only_the_calendar_month_before_counts():
    # A reading two months later that happens to match is not a carried-forward copy.
    history = rows("2023-07", [5.0, 6.0]) + rows("2023-09", [5.0, 6.0])
    assert carried_forward_months(history) == []


def test_the_states_2021_copies_are_found_and_nothing_else():
    months = history_carried_forward()
    assert months, "the 2021 carried-forward months should be found in the committed history"
    assert all(month.startswith("2021-") for month in months), months
