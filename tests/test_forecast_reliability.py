"""The forecast reliability notes: the rule, the rain measure, and the published file."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
import build_forecast_reliability as reliability  # noqa: E402

PUBLISHED = os.path.join(ROOT, "app", "data", "forecast_reliability.json")
RECORDS = os.path.join(ROOT, "app", "data", "mandal_groundwater_records_v2.json")


def cell(gain, rows=1000, years=8):
    return {"gain": gain, "rows": rows, "years": years}


def test_verdicts_follow_the_stated_thresholds():
    assert reliability.verdict(cell(0.10)) == "beats"
    assert reliability.verdict(cell(0.09)) == "level"
    assert reliability.verdict(cell(-0.04)) == "level"
    assert reliability.verdict(cell(-0.05)) == "worse"
    # Too few forecasts behind a cell: no verdict either way.
    assert reliability.verdict(cell(0.30, rows=200)) == "untested"
    assert reliability.verdict(cell(0.30, years=3)) == "untested"


def test_rain_conditions_split_at_twenty_percent():
    assert reliability.condition(-0.20) == "deficit"
    assert reliability.condition(-0.19) == "normal"
    assert reliability.condition(0.20) == "surplus"
    assert reliability.condition(None) is None


def test_rain_anomaly_is_the_three_months_to_the_origin_against_their_normal():
    series = {f"{year}-{month:02d}": 100.0 for year in range(1991, 2027) for month in range(1, 13)}
    for month in ("06", "07", "08"):
        series[f"2026-{month}"] = 50.0
    assert abs(reliability.rain_anomaly(series, "2026-08") + 0.5) < 1e-9
    # The month after the window is not part of it.
    series["2026-09"] = 0.0
    assert abs(reliability.rain_anomaly(series, "2026-08") + 0.5) < 1e-9
    # Too short a record for a normal: no anomaly rather than a guess.
    short = {key: value for key, value in series.items() if key >= "2020-01"}
    assert reliability.rain_anomaly(short, "2026-08") is None


def test_every_released_forecast_has_a_note_and_every_note_its_cell():
    published = json.load(open(PUBLISHED))
    records = json.load(open(RECORDS))["records"]
    released = {r["identity"]["mandalId"] for r in records if (r.get("forecast") or {}).get("releaseStatus") == "released"}
    assert set(published["mandals"]) == released
    for rain_pct, key in published["mandals"].values():
        assert key is None or key in published["cells"]
    assert sum(published["counts"].values()) == len(released)
    for key, entry in published["cells"].items():
        assert entry["verdict"] == reliability.verdict(entry), key
        assert key == f"{entry['originMonth']:02d}-{entry['rain']}"


def test_the_note_never_changes_a_forecast():
    source = open(os.path.join(ROOT, "phase3_levels", "build_forecast_reliability.py")).read()
    assert "mandal_groundwater_records_v2.json" in source
    assert 'open(os.path.join(APP, "mandal_groundwater_records_v2.json"), "w"' not in source
    assert "Nothing here changes a forecast" in json.load(open(PUBLISHED))["note"]
