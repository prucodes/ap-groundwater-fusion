"""Cyclone Arnab against the water table: the event record and last year's precedent."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app", "data", "cyclone_arnab.json")))


def test_storm_rain_is_the_difference_between_two_readings():
    capture = json.load(open(os.path.join(ROOT, "phase3_levels", "data", "cyclone_arnab_capture.json")))
    rain = [m["rainAfterMm"] - m["rainBeforeMm"] for m in capture["mandals"]]
    assert min(rain) >= 0, "a season total cannot fall between two readings"
    assert DATA["state"]["heavyMandals"] == sum(r >= DATA["heavyMm"] for r in rain)
    assert DATA["rainWindow"]["days"] == 4


def test_watch_list_is_deep_tables_that_got_heavy_rain():
    assert len(DATA["watch"]) == DATA["state"]["deepHeavyMandals"]
    for m in DATA["watch"]:
        assert m["depthM"] >= DATA["deepM"] and m["stormMm"] >= DATA["heavyMm"]


def test_precedent_rises_with_depth_and_is_not_called_a_forecast():
    rises = [b["extraRiseM"] for b in DATA["precedent"]["bands"]]
    assert rises == sorted(rises), "last year the deeper the table, the more it rose beyond the usual"
    assert "not a forecast" in DATA["caveat"]
    assert "not published yet" in DATA["caveat"]


def test_daily_log_runs_in_date_order_and_the_page_reads_its_last_day():
    log = json.load(open(os.path.join(ROOT, "phase3_levels", "data", "cyclone_arnab_daily.json")))
    dates = [d["date"] for d in log["days"]]
    assert dates == sorted(dates) and len(dates) == len(set(dates))
    since = DATA["since"]
    assert since["days"][-1]["date"] == dates[-1] == DATA["updatedAt"]
    assert since["days"][0]["rainSinceTmc"] == 0, "the log starts from the reading before the storm"


def test_groundwater_check_waits_for_the_readings():
    published = DATA["follow"]["published"]
    for m in DATA["watch"]:
        assert ("octRiseM" in m) <= ("2026-10" in published)
        assert ("novExtraRiseM" in m) <= ("2026-11" in published)
    assert DATA["groundwaterLatest"] == "2026-09", "depth before the storm stays September's"


def test_drought_overlay_counts_only_settled_flags_and_says_it_is_not_a_declaration():
    watch = json.load(open(os.path.join(ROOT, "app", "data", "drought_watch.json")))
    settled = [m for m in watch["mandals"] if m["category"] in {"severe", "moderate|severe", "moderate"}]
    drought = DATA["drought"]
    assert drought["flagged"] == len(settled), "a normal-or-moderate range is undecided, so it is not a flag"
    rain = {row[0]: row[3] for row in DATA["map"]}
    assert drought["flaggedHeavy"] == sum(rain[m["i"]] >= DATA["heavyMm"] for m in settled if m["i"] in rain)
    assert drought["severeHeavy"] <= drought["severe"] <= drought["flagged"]
    page = open(os.path.join(ROOT, "app", "app", "arnab", "page.tsx")).read()
    assert "not a declaration" in page
