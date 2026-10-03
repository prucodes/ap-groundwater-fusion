"""The El Nino outlook parser, the weekly-changes comparison and the refresh
health report: each reads someone else's output and must fail loudly, or say
nothing, rather than guess."""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_weekly_changes as changes  # noqa: E402
import fetch_enso_outlook as outlook  # noqa: E402
import refresh_health as health  # noqa: E402

DATA = os.path.join(ROOT, "app", "data")


def row(code, *values):
    cells = "".join(f"<td>{v}</td>" for v in values)
    return f'<tr><th scope="row"><abbr>{code} <span class="tooltip" role="tooltip">x y z</span></abbr></th>{cells}</tr>'


SEASONS = ["ASO", "SON", "OND", "NDJ", "DJF", "JFM", "FMA", "MAM", "AMJ"]


def test_probabilities_parse_and_must_sum_to_a_hundred():
    page = "<table>" + "".join(row(s, 0, 10, 90) for s in SEASONS) + "</table>"
    rows = outlook.parse_probabilities(page)
    assert [r["season"] for r in rows] == SEASONS and rows[0]["elNino"] == 90
    with pytest.raises(RuntimeError, match="sum"):
        outlook.parse_probabilities("<table>" + "".join(row(s, 0, 10, 50) for s in SEASONS) + "</table>")


def test_a_changed_page_is_refused_not_guessed():
    with pytest.raises(RuntimeError, match="changed shape"):
        outlook.parse_probabilities("<table><tr><td>nothing here</td></tr></table>")
    with pytest.raises(RuntimeError, match="out of order"):
        outlook.parse_outlook("<table>" + "".join(row(s, 1, 2, 3, 4, 5, 6, 7) for s in reversed(SEASONS)) + "</table>")
    with pytest.raises(RuntimeError, match="changed shape"):
        outlook.parse_discussion("<p>No synopsis today</p>")


def test_seasons_carry_their_months_and_year_across_the_year_end():
    rows = outlook.label_seasons([{"season": s} for s in SEASONS], "2026-09-10")
    assert rows[0]["label"] == "Aug–Oct 2026"
    assert rows[3]["label"] == "Nov–Jan 2027"
    assert rows[-1]["label"] == "Apr–Jun 2027"


def test_the_published_outlook_is_whole_and_quotes_noaa():
    data = json.load(open(os.path.join(DATA, "enso_outlook.json")))
    assert data["kind"] == "forecast" and data["synopsis"].endswith(".")
    assert len(data["probabilities"]) == len(data["strengths"]) == len(data["outlook"]) >= 6
    for r in data["probabilities"]:
        assert abs(r["laNina"] + r["neutral"] + r["elNino"] - 100) <= 2
    assert data["peak"]["medianC"] == max(r["p50"] for r in data["outlook"])


def test_weekly_changes_compare_like_with_like_and_say_which_way_is_better():
    before = {"water_context_summary.json": {"rain": {"end": "2026-09-27", "deviationPct": -30.0}},
              "mandal_groundwater_records_v2.json": {"records": [
                  {"identity": {"mandalId": "a", "mandalName": "A", "districtName": "D"},
                   "assessment": {"monitoringStatus": "watch"}, "observation": {"observationPeriod": "2026-08"}}]}}
    after = {"water_context_summary.json": {"rain": {"end": "2026-10-04", "deviationPct": -33.0}},
             "mandal_groundwater_records_v2.json": {"records": [
                 {"identity": {"mandalId": "a", "mandalName": "A", "districtName": "D"},
                  "assessment": {"monitoringStatus": "stress"}, "observation": {"observationPeriod": "2026-09"}}]}}
    built = changes.build(load_before=before.get, load_after=after.get)
    rain = next(i for i in built["items"] if i["key"] == "rain")
    assert (rain["change"], rain["direction"], rain["refreshed"]) == (-3.0, "worse", True)
    assert built["groundwater"]["worse"] == 1 and built["groundwater"]["moved"][0]["to"] == "stress"
    assert next(i for i in built["items"] if i["key"] == "trigger1")["direction"] is None


def test_health_report_names_failed_steps_and_kept_feeds_and_is_silent_otherwise():
    assert health.problems({"steps": [{"step": "x", "ok": True}]}, {"sections": {"rainfall": {"status": "refreshed"}}}) == []
    lines = health.problems({"steps": [{"step": "build drought watch", "ok": False, "rc": 1, "secs": 3, "required": False}]},
                            {"sections": {"rainfall": {"status": "retained", "error": "portal looks mid-revision"}}})
    assert any("build drought watch" in line and "optional" in line for line in lines)
    assert any("mid-revision" in line for line in lines)
