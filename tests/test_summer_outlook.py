"""The summer drinking-water outlook (phase3_levels/build_summer_outlook.py)."""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_summer_outlook as summer  # noqa: E402


def series(augusts, mays):
    """{YYYY-MM: depth} from {year: August depth} and {year: May depth}."""
    out = {f"{y}-08": d for y, d in augusts.items()}
    out.update({f"{y}-05": d for y, d in mays.items()})
    return out


def test_may_is_projected_from_the_mandals_own_winters():
    # Four past winters: August 10 m each year, the following May 11, 12, 13 and 15 m.
    s = series({2020: 10, 2021: 10, 2022: 10, 2023: 10, 2024: 9}, {2021: 11, 2022: 12, 2023: 13, 2024: 15})
    result = summer.project(s, "2024-08")
    # Drawdowns 1, 2, 3, 5: typical 9 + 2.5, dry 9 + 5; deepest May on record 15 m.
    assert (result["typical"], result["dry"], result["deepestMay"], result["winters"]) == (11.5, 14.0, 15, 4)
    assert result["tier"] == "within"
    assert summer.project({**s, "2024-08": 13.0}, "2024-08")["tier"] == "beyond"     # 13 + 2.5 > 15
    assert summer.project({**s, "2024-08": 11.0}, "2024-08")["tier"] == "dry"        # 13.5 < 15 < 16


def test_too_short_a_record_is_not_projected():
    s = series({2021: 10, 2022: 10, 2023: 10}, {2022: 11, 2023: 12})
    assert summer.project(s, "2023-08") is None


def test_the_backtest_only_uses_what_was_known_at_the_time():
    s = series({y: 10 for y in range(2015, 2026)}, {y: 10 + (y - 2015) * 0.5 for y in range(2016, 2026)})
    # Projecting May 2020 from August 2019 sees the Mays up to 2019 and the winters that ended by then.
    result = summer.project(s, "2019-08", skip_year=2019, before=2020)
    assert result["deepestMay"] == 12.0 and result["winters"] == 4
    report = summer.backtest({"a": s})
    assert report["comparisons"] == len(report["years"])
    # A steadily deepening series sets a new record every May, and the typical projection runs shallow.
    assert report["baseRatePct"] == 100.0
    assert all(year["medianErrorM"] > 0 for year in report["byYear"])


def test_the_committed_outlook_is_consistent():
    path = os.path.join(ROOT, "app", "data", "summer_outlook.json")
    if not os.path.exists(path):
        pytest.skip("no outlook built yet")
    outlook = json.load(open(path))
    s = outlook["summary"]
    assert s["beyond"] + s["dry"] + s["within"] == s["mandals"]
    rows = [r for r in outlook["mandals"] if r]
    assert len(rows) == s["boundaries"]
    for r in rows:
        assert r["typical"] <= r["dry"] + 1e-9
        expected = "beyond" if r["typical"] > r["deepestMay"] else "dry" if r["dry"] > r["deepestMay"] else "within"
        assert r["tier"] == expected
    bt = outlook["backtest"]
    assert sum(bt["tierCounts"].values()) == bt["comparisons"]
