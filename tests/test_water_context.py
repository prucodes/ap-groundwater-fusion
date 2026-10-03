"""The APWRIMS water context must say what it measured, when, and never pass a stale or partial answer off as current."""
import datetime
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import fetch_apwrims_context as context  # noqa: E402

PUBLISHED = os.path.join(ROOT, "app", "data", "water_context.json")


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch):
    monkeypatch.setattr(context, "PAUSE_S", 0)


def snapshot(value, mandals=700):
    return {f"m{i}": {"name": f"M{i}", "pct": [value, value + 1, value + 2, value + 3]} for i in range(mandals)}


def test_the_as_of_date_is_the_model_run_not_the_request_date():
    run = datetime.date(2026, 10, 1)
    # Dates after the run are answered with the run's values; earlier dates differ.
    fetch = lambda day: snapshot(40.0 if day >= run else 40.0 + (run - day).days)
    latest, as_of = context.soil_as_of(datetime.date(2026, 10, 4), fetch)
    assert as_of == run
    assert latest["m0"]["pct"][1] == 41.0


def test_an_answer_unchanged_for_the_whole_lookback_has_no_date():
    _, as_of = context.soil_as_of(datetime.date(2026, 10, 4), lambda day: snapshot(40.0))
    assert as_of is None


def test_a_truncated_soil_answer_is_refused():
    with pytest.raises(RuntimeError, match="mandals"):
        context.soil_as_of(datetime.date(2026, 10, 4), lambda day: snapshot(40.0, mandals=50))


def test_baseline_years_skip_empty_years_and_drop_identical_fills():
    answers = {2016: {}, 2017: snapshot(10.0), 2018: snapshot(20.0), 2019: snapshot(20.0), 2020: snapshot(30.0)}
    past, skipped, duplicated = context.baseline_years(datetime.date(2021, 10, 1), lambda day: answers.get(day.year, {}),
                                                       first_year=2016)
    assert skipped == [2016]
    assert duplicated == [2018, 2019]
    assert sorted(past) == [2017, 2020]


def test_29_february_compares_with_28_february():
    assert context.same_day(2025, 2, 29) == datetime.date(2025, 2, 28)


def test_baseline_stats_rank_one_is_the_driest_on_record():
    assert context.baseline_stats(5.0, [10, 20, 30, 40, 50])["rankDriest"] == 1
    stats = context.baseline_stats(35.0, [10, 20, 30, 40, 50])
    assert stats == {"years": 5, "median": 30, "min": 10, "max": 50, "rankDriest": 4, "ofYears": 6}
    assert context.baseline_stats(35.0, [10, 20, 30, 40]) is None, "too few years to call anything usual"


@pytest.mark.parametrize("actual,normal,expected", [
    (0, 100, "noRain"), (39, 100, "scanty"), (40.1, 100, "deficient"), (80, 100, "deficient"),
    (80.1, 100, "normal"), (119.9, 100, "normal"), (120, 100, "excess"), (50, 0, None), (None, 100, None),
])
def test_rain_categories_follow_imd_departure_bands(actual, normal, expected):
    assert context.rain_category(actual, normal) == expected


def rain_row(uid, actual, normal, rfs, rfns):
    return {"locUuid": uid, "locName": uid, "lgdCode": "1", "responseMap": {
        "monm": {"actual": actual, "normal": normal, "rfs": rfs, "rfns": rfns, "rd": 10, "nst": 2},
        "l1m": {"actual": 1.0, "normal": 2.0}}}


def district_rows():
    return [dict(rain_row("d1", 40.0, 100.0, 1.0, 2.0), locName="Kurnool"), dict(rain_row("TOTAL", 1, 2, 1, 2), locName="TOTAL")]


def test_the_portals_total_row_is_a_check_not_a_mandal():
    rows = [rain_row(f"u{i}", 50.0, 100.0, 1.0, 2.0) for i in range(650)]
    tree = {f"u{i}": ("D", f"M{i}") for i in range(650)}
    good = rows + [rain_row("TOTAL", 50.0, 100.0, 650.0, 1300.0)]
    built = context.build_rainfall(datetime.date(2026, 10, 3), tree, {},
                                   fetch=lambda start, end, child="MANDAL": district_rows() if child == "DISTRICT" else good)
    assert built["districts"] == [{"district": "Kurnool", "actualMm": 40.0, "normalMm": 100.0, "deviationPct": -60.0,
                                   "category": "scanty", "rainyDays": 10, "gauges": 2}]
    assert built["summary"]["mandals"] == 650
    assert all(m["mandal"] != "TOTAL" for m in built["mandals"])
    assert built["state"]["deviationPct"] == -50.0
    assert built["state"]["actualTmc"] == 650.0
    assert built["window"] == {"start": "2026-06-01", "end": "2026-10-01", "label": "water year to date", "lastMonth": "2026-09"}
    bad = rows + [rain_row("TOTAL", 50.0, 100.0, 900.0, 1300.0)]
    with pytest.raises(RuntimeError, match="portal's total"):
        context.build_rainfall(datetime.date(2026, 10, 3), tree, {},
                               fetch=lambda start, end, child="MANDAL": district_rows() if child == "DISTRICT" else bad)


def test_the_water_year_starts_in_june():
    assert context.water_year_start(datetime.date(2026, 2, 15)) == datetime.date(2025, 6, 1)
    assert context.water_year_start(datetime.date(2026, 6, 1)) == datetime.date(2026, 6, 1)


def test_outlets_strip_the_reservoir_prefix_and_leave_inflows_out():
    splits = {"OWK RESERVOIR-GNSS": 2500.0, "OWK RESERVOIR-Spillway": 5.0, "OWK RESERVOIR-Inflow_split": 2500.0,
              "OWK RESERVOIR-inflow from catchment": 0.0, "OWK RESERVOIR-Drinking": 2.0, "Losses": 5.0, "OWK RESERVOIR-SRBC": None}
    out = context.outlets(splits, "OWK RESERVOIR")
    assert out[0] == {"outlet": "GNSS", "kind": "canal", "cusecs": 2500.0}
    assert {o["outlet"]: o["kind"] for o in out} == {"GNSS": "canal", "Spillway": "spill", "Drinking": "drinking", "Losses": "losses"}


def reservoir(name, capacity, storage, last_year, kind_total=None):
    return {"locationName": name, "locationDistrictName": "D", "basin": "Krishna", "totalCapacity1": capacity,
            "reservoirDataMap": {"current": {"totalStorage1": storage, "eventGenTs": 1790904642718, "splitsDataMap": {}},
                                 "previousYearCurrent": {"totalStorage1": last_year}}}


def test_reservoir_sums_must_agree_with_the_portals_own_storage_totals():
    rows = [context.reservoir_row(reservoir(f"R{i}", 10.0, 5.0, 8.0), "major") for i in range(3)]
    total = {"totalCapacity1": 999.0, "reservoirDataMap": {"current": {"totalStorage1": 15.0}, "previousYearCurrent": {"totalStorage1": 24.0}}}
    context.check_against_portal(rows, total, "major")  # capacity is not compared; storage agrees
    total["reservoirDataMap"]["current"]["totalStorage1"] = 16.0
    with pytest.raises(RuntimeError, match="storage"):
        context.check_against_portal(rows, total, "major")


def test_a_failed_feed_keeps_its_previous_section_and_says_so():
    previous = {"rainfall": {"window": {"end": "2026-09-20"}}}

    def broken():
        raise RuntimeError("portal down")

    sections, status = context.assemble(datetime.date(2026, 10, 3), [
        ("rainfall", broken), ("soilMoisture", broken), ("reservoirs", lambda: {"asOf": "x"})], previous)
    assert sections["rainfall"] == previous["rainfall"]
    assert status["rainfall"]["status"] == "retained"
    assert sections["soilMoisture"] is None and status["soilMoisture"]["status"] == "unavailable"
    assert status["reservoirs"] == {"status": "refreshed"}


def test_rendering_keeps_one_row_per_line_and_round_trips():
    payload = {"a": 1, "soilMoisture": {"mandals": [{"uuid": "x", "pct": [1.5, 2]}, {"uuid": "y", "pct": [3, 4]}]},
               "reservoirs": {"reservoirs": [], "upstreamOutsideAp": [{"name": "Z"}]}}
    text = context.render(payload)
    assert json.loads(text) == payload
    assert '  {"uuid":"x","pct":[1.5,2]},' in text.splitlines()


# --- the published file --------------------------------------------------------

def published():
    with open(PUBLISHED) as handle:
        return json.load(handle)


def iso_day(value):
    return datetime.date.fromisoformat(value[:10])


def test_every_section_carries_its_date_and_source():
    water = published()
    assert water["authorizationStatus"] == "research_pending"
    soil, rain, store = water["soilMoisture"], water["rainfall"], water["reservoirs"]
    assert soil["kind"] == "modelled" and rain["kind"] == "measured" and store["kind"] == "measured"
    assert soil["asOf"] is None or iso_day(soil["asOf"]) <= iso_day(water["generatedAt"])
    assert iso_day(rain["window"]["start"]) <= iso_day(rain["window"]["end"]) <= iso_day(water["generatedAt"])
    assert iso_day(store["asOf"]) <= iso_day(water["generatedAt"]) + datetime.timedelta(days=1)
    for section in (soil, rain, store):
        assert section["url"].startswith("https://apwrims.ap.gov.in/")


def test_soil_values_are_shares_and_baselines_are_consistent():
    soil = published()["soilMoisture"]
    assert soil["depthsCm"].index(soil["headlineDepthCm"]) >= 0
    for mandal in soil["mandals"]:
        assert len(mandal["pct"]) == len(soil["depthsCm"])
        assert all(0 <= value <= 100 for value in mandal["pct"])
        base = mandal["baseline"]
        if base:
            assert base["years"] >= soil["baseline"]["minYears"]
            assert base["min"] <= base["median"] <= base["max"]
            assert 1 <= base["rankDriest"] <= base["ofYears"] == base["years"] + 1


def test_rainfall_rows_are_mandals_with_consistent_departures():
    rain = published()["rainfall"]
    uuids = [m["uuid"] for m in rain["mandals"]]
    assert len(uuids) == len(set(uuids)) >= context.MIN_MANDALS
    assert "TOTAL" not in {str(u).upper() for u in uuids}
    for mandal in rain["mandals"]:
        assert mandal["normalMm"] > 0
        assert abs(mandal["deviationPct"] - 100 * (mandal["actualMm"] / mandal["normalMm"] - 1)) < 0.2
    assert sum(rain["categories"].values()) == len(rain["mandals"])


def test_boundary_indexes_point_at_real_boundaries():
    geometry = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))
    water = published()
    for section in ("soilMoisture", "rainfall"):
        for mandal in water[section]["mandals"]:
            index = mandal["boundaryIndex"]
            assert index is None or 0 <= index < len(geometry["mandals"])
            assert (index is None) == (mandal["boundaryMatch"] is None)


def test_the_digests_are_the_full_file_summarised_not_a_second_source():
    water = published()
    geometry = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))
    summary = json.load(open(os.path.join(ROOT, "app", "data", "water_context_summary.json")))
    mandals = json.load(open(os.path.join(ROOT, "app", "data", "water_context_mandals.json")))
    assert summary == json.loads(json.dumps(context.summarize(water)))
    assert mandals == json.loads(json.dumps(context.mandal_values(water, geometry)))
    assert summary["rain"]["deviationPct"] == water["rainfall"]["state"]["deviationPct"]
    assert summary["reservoirs"]["storagePct"] == water["reservoirs"]["state"]["storagePct"]


def test_the_digests_stay_small_enough_for_every_page():
    for name, limit in (("water_context_summary.json", 40_000), ("water_context_mandals.json", 60_000)):
        assert os.path.getsize(os.path.join(ROOT, "app", "data", name)) < limit, name


def test_map_values_never_land_on_a_repeated_or_unknown_polygon():
    geometry = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_geometry.json")))
    keys = [f"{f['d']}|{f['m']}" for f in geometry["mandals"]]
    repeated = {k for k in keys if keys.count(k) > 1}
    values = json.load(open(os.path.join(ROOT, "app", "data", "water_context_mandals.json")))["values"]
    assert not set(values) & repeated
    assert set(values) <= set(keys)
    for rain, soil, rank, years in values.values():
        assert rain is None or -100 <= rain <= 1000
        assert soil is None or 0 <= soil <= 100
        assert (rank is None) == (years is None)
        assert rank is None or 1 <= rank <= years


def test_every_district_digest_names_a_real_district_or_says_where_it_is():
    geometry = json.load(open(os.path.join(ROOT, "app", "data", "ap_district_geometry.json")))
    known = {context.district_key(d["d"]) for d in geometry["districts"]}
    summary = json.load(open(os.path.join(ROOT, "app", "data", "water_context_summary.json")))
    for row in summary["districts"]:
        # A reservoir outside AP's districts (one sits in Karnataka) carries only storage.
        assert row["key"] in known or set(row) == {"district", "key", "reservoirs"}, row["district"]
    assert sum(1 for row in summary["districts"] if "rain" in row) == len(known)


def test_reservoir_totals_add_up_and_upstream_dams_are_kept_out():
    store = published()["reservoirs"]
    rows = store["reservoirs"]
    assert len(rows) >= context.MIN_RESERVOIRS
    assert all(row["type"] in ("major", "medium") for row in rows)
    assert abs(sum(row["storageTmc"] or 0 for row in rows) - store["state"]["storageTmc"]) < 0.01
    assert abs(sum(b["capacityTmc"] for b in store["byBasin"]) - store["state"]["capacityTmc"]) < 0.01
    assert all(row["type"] == "outside_ap" for row in store["upstreamOutsideAp"])
    assert store["staleCount"] == sum(1 for row in rows if row["stale"])
