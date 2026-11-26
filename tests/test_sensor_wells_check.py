"""The sensors are tested against the monthly wells before any daily figure is shown."""
import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "phase3_levels", f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def payload(day, stations):
    return {"latestReading": f"{day}T10:00+00:00", "stations": stations}


def test_the_archive_keeps_each_station_in_its_place_and_never_carries_a_silent_one():
    a = load("sensor_archive")
    archive = a.empty()
    a.add_day(archive, payload("2026-11-11", [["S1", 1.0, 2.0, "D", "M", 5.0, 4.0, 3, 7]]))
    a.add_day(archive, payload("2026-11-12", [["S2", 1.5, 2.5, "D", "M", 9.0, 8.5, 2, 8],
                                              ["S1", 1.0, 2.0, "D", "M", 5.1, 4.0, 60, 7]]))
    assert [s[0] for s in archive["stations"]] == ["S1", "S2"]
    assert archive["days"]["2026-11-11"]["level"] == [500, None], "a station added later is null on earlier days"
    assert archive["days"]["2026-11-12"]["level"] == [None, 900], "a reading older than 48 hours is not carried forward"


def test_an_early_look_is_flagged_and_never_counts_toward_the_verdict():
    c = load("build_sensor_wells_check")
    archive = {"stations": [["S1", 0, 0, 0], ["S2", 0, 0, 1]],
               "days": {"2026-11-11": {"level": [600, 300], "yearAgo": [400, 250]}}}
    hand = {0: {"2025-10": 4.0, "2026-09": 6.5, "2026-10": 6.0}, 1: {"2025-10": 2.0, "2026-09": 3.2, "2026-10": 3.0}}
    out = c.build(archive, hand)
    assert [t["month"] for t in out["tests"]] == ["2026-10"] and out["tests"][0]["sameMonth"] is False
    year = out["tests"][0]["sensorYear"]
    assert year["mandals"] == 2 and year["maeM"] == 0.25 and year["carryMaeM"] == 0.35
    assert out["verdict"] == "awaiting" and out["nextTest"] == "2026-11"


def test_the_sensors_stand_in_only_after_two_same_month_wins():
    c = load("build_sensor_wells_check")
    days = {f"2026-{m:02d}-15": {"level": [500 + m, 300], "yearAgo": [480, 290]} for m in (11, 12)}
    archive = {"stations": [["S1", 0, 0, 0], ["S2", 0, 0, 1]], "days": days}
    # The wells move exactly as the sensors do: every sensor estimate is right, carrying forward is not.
    hand = {0: {"2025-11": 4.91, "2025-12": 4.92, "2026-10": 4.0, "2026-11": 5.11, "2026-12": 5.12},
            1: {"2025-11": 2.9, "2025-12": 2.9, "2026-10": 2.0, "2026-11": 3.0, "2026-12": 3.0}}
    out = c.build(archive, hand)
    same = [t for t in out["tests"] if t["sameMonth"]]
    assert [t["month"] for t in same] == ["2026-11", "2026-12"]
    assert out["verdict"] == "stands in"
    assert "sensorMonth" in same[1], "the month-on-month estimate needs the month before in the archive"


def test_the_published_check_reads_the_recorded_days():
    # The check is rebuilt weekly (fetch_weekly.py) and the archive gains a day every evening
    # (sensors_daily.yml), so between Mondays the archive runs ahead of the check. The check
    # must have read exactly the archive's days up to its own last one. A Monday that could
    # not rebuild it is reported by refresh_health.py, and must not fail the suite: a stale
    # check still names the days it read.
    check = json.load(open(os.path.join(ROOT, "app", "data", "sensor_wells_check.json")))
    archive = json.load(open(os.path.join(ROOT, "phase3_levels", "data", "sensor_station_daily.json")))
    read, days = check["sensorDays"], sorted(archive["days"])
    assert read["first"] == days[0] and read["last"] in archive["days"]
    assert read["count"] == sum(1 for day in days if day <= read["last"])
    assert check["verdict"] in {"awaiting", "not better", "stands in"}
    assert all(t["sameMonth"] or t["month"] < (read["first"] or "")[:7] for t in check["tests"])
