"""The third cyclone (phase3_levels/build_cyclone_akvan.py), counted against baselines frozen before it."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
import build_cyclone_akvan as akvan  # noqa: E402

DATA = json.load(open(akvan.OUT))
RAIN_BEFORE = json.load(open(akvan.RAIN_BEFORE))
SENSORS_BEFORE = json.load(open(akvan.SENSORS_BEFORE))


def test_the_baselines_were_frozen_before_the_storm():
    assert RAIN_BEFORE["to"] <= akvan.BASELINE_RAIN_TO < akvan.LANDFALL
    assert SENSORS_BEFORE["reading"][:10] < akvan.LANDFALL
    assert DATA["rainWindow"]["from"] > RAIN_BEFORE["to"]


def test_rain_is_counted_only_inside_the_window_and_never_below_zero():
    w = DATA["rainWindow"]
    if w["to"] is not None:
        assert w["from"] <= w["to"] <= w["closes"]
        assert all(row[3] >= 0 for row in DATA["map"])
    else:
        assert DATA["state"] is None and DATA["map"] == []


def test_the_missed_mandals_are_the_first_two_storms_own_count():
    m = DATA["missedBefore"]
    assert 0 <= m["reached"] <= m["mandals"] == len(DATA["missed"])
    assert all(row[4] == (row[0] in set(DATA["missed"])) for row in DATA["map"])


def test_each_sensor_is_set_only_against_its_own_baseline():
    s = DATA["sensors"]
    assert s["baseline"] == SENSORS_BEFORE["reading"]
    assert s["compared"] == len(s["stations"]) <= len(SENSORS_BEFORE["stations"])
    assert s["risen"] == sum(1 for r in s["stations"] if r[4] > akvan.RISE_M)


def test_a_forecast_is_never_shown_as_confirmed():
    assert DATA["nameConfirmed"] == akvan.NAME_CONFIRMED and DATA["landfallConfirmed"] == akvan.LANDFALL_CONFIRMED


def test_the_timeline_keeps_one_point_a_day_and_the_last_reading_wins(tmp_path, monkeypatch):
    out = tmp_path / "akvan.json"
    out.write_text(json.dumps({"timeline": [{"day": "2026-11-16", "compared": 10, "risen": 0, "medianRiseM": 0.0, "rainTmc": None},
                                            {"day": "2026-11-17", "compared": 10, "risen": 1, "medianRiseM": 0.0, "rainTmc": None}]}))
    monkeypatch.setattr(akvan, "OUT", str(out))
    rises = [["a", 0, 0, 1, 0.5, "X"], ["b", 0, 0, 2, 0.0, "X"]]
    # 17 Nov, 20:00 IST: replaces that day's morning point and keeps the 16th.
    points = akvan.timeline("2026-11-17T14:30+00:00", rises, 12.0)
    assert [p["day"] for p in points] == ["2026-11-16", "2026-11-17"]
    assert points[-1] == {"day": "2026-11-17", "compared": 2, "risen": 1, "medianRiseM": 0.25, "rainTmc": 12.0}


def test_districts_are_ranked_by_the_share_of_their_own_sensors_risen():
    rises = [["s", 0, 0, 1, 0.4, "A"]] * 6 + [["s", 0, 0, 1, 0.0, "A"]] * 4 + [["s", 0, 0, 1, 0.3, "B"]] * 9 + [["s", 0, 0, 1, 0.0, "B"]] * 1 \
        + [["s", 0, 0, 1, 2.0, "Small"]] * 3
    rows = akvan.district_response(rises)
    assert [r["district"] for r in rows] == ["B", "A"]  # too few sensors in Small to rank
    assert rows[0] == {"district": "B", "compared": 10, "risen": 9, "medianRiseM": 0.3}
