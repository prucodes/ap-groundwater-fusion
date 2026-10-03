"""IMD stays honestly unconnected without a key, and private unless publishing is chosen."""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import fetch_imd_context as imd  # noqa: E402

KNOWN = {imd.key(name): name for name in ("KURNOOL", "ANANTHAPURAMU", "SRI POTTI SRIRAMULU NELLORE")}


def test_without_a_key_nothing_is_fetched_or_written(monkeypatch, tmp_path):
    monkeypatch.delenv("IMD_API_KEY", raising=False)
    monkeypatch.setattr(imd, "PRIVATE_OUT", str(tmp_path / "private.json"))
    monkeypatch.setattr(imd, "PUBLIC_OUT", str(tmp_path / "public.json"))
    monkeypatch.setattr(imd, "get", lambda *a: (_ for _ in ()).throw(AssertionError("must not call IMD")))
    assert imd.main() == 0
    assert not os.listdir(tmp_path)


def test_the_key_travels_the_way_the_dashboard_says():
    url, headers = imd.auth_request("districtwarning", "k123", "header:Authorization:Bearer")
    assert headers["Authorization"] == "Bearer k123" and "k123" not in url
    url, headers = imd.auth_request("districtwarning", "k123", "header:x-api-key")
    assert headers["x-api-key"] == "k123"
    url, headers = imd.auth_request("aws_data?sid=2", "k123", "query:api_key")
    assert url.endswith("aws_data?sid=2&api_key=k123") and "Authorization" not in headers


def test_an_empty_workflow_variable_means_the_default(monkeypatch):
    monkeypatch.setenv("IMD_AUTH", "")
    _, headers = imd.auth_request("districtwarning", "k123")
    assert headers["Authorization"] == "Bearer k123"


def test_forecasts_keep_ap_only_and_flag_unmatched_district_names():
    payload = [
        {"date_obs": "2026-10-03", "Obj_id": "1", "District": "KURNOOL", "State": "ANDHRA PRADESH",
         "day1_color": "#004de6", "day1_distribution": "Widespread", "day1_distribution_percentage": "Stations [76-100]%"},
        {"date_obs": "2026-10-03", "Obj_id": "2", "District": "ANANTAPUR", "State": "ANDHRA PRADESH", "day1_distribution": "Isolated"},
        {"date_obs": "2026-10-03", "Obj_id": "3", "District": "BIDAR", "State": "KARNATAKA", "day1_distribution": "Scattered"},
    ]
    rows = imd.parse_forecast(payload, KNOWN)
    assert [row["district"] for row in rows] == ["KURNOOL", "ANANTAPUR"]
    assert rows[0]["matchedDistrict"] == "KURNOOL" and rows[0]["days"][0]["distribution"] == "Widespread"
    assert rows[1]["matchedDistrict"] is None, "an older district name is listed for review, never guessed"


def test_warning_codes_become_words_and_colours():
    payload = {"data": [{"Obj_id": "9", "Date": "2026-10-03", "District": "Kurnool", "Day_1": "2,4", "Day1_Color": "2",
                         "Day_2": "1", "Day2_Color": "4"}]}
    row = imd.parse_warnings(payload, KNOWN)[0]
    assert row["days"][0]["warnings"] == ["Heavy rain", "Thunderstorm, lightning, squall"]
    assert row["days"][0]["colour"] == "orange" and row["days"][1]["colour"] == "green"


def test_district_rainfall_reads_departures_and_basins_keep_ap_rivers():
    rain = imd.parse_rainfall([{"District": "KURNOOL", "Date": "2026-10-02", "Cumulative Actual": "227.00",
                                "Cumulative Normal": "415.90", "Cumulative Departure Per": "-45%", "Cumulative Category": "D"}], KNOWN)
    assert rain[0]["cumulative"]["departurePct"] == -45.0 and rain[0]["cumulative"]["category"] == "D"
    basins = imd.parse_basins([{"Basin": "Krishna", "SubBasin": "Lower Krishna", "Day1": "12.5"}, {"Basin": "Narmada", "Day1": "3"}])
    assert [b["basin"] for b in basins] == ["Krishna"] and basins[0]["daysMm"][0] == 12.5


def test_publishing_to_the_site_needs_an_explicit_choice(monkeypatch, tmp_path):
    monkeypatch.setenv("IMD_API_KEY", "k123")
    monkeypatch.delenv("IMD_PUBLISH", raising=False)
    monkeypatch.setattr(imd, "PRIVATE_OUT", str(tmp_path / "private" / "imd.json"))
    monkeypatch.setattr(imd, "PUBLIC_OUT", str(tmp_path / "public.json"))
    monkeypatch.setattr(imd, "get", lambda path, api_key, context: [])
    assert imd.main() == 0
    assert (tmp_path / "private" / "imd.json").exists() and not (tmp_path / "public.json").exists()
    assert json.load(open(tmp_path / "private" / "imd.json"))["published"] is False
    monkeypatch.setenv("IMD_PUBLISH", "1")
    assert imd.main() == 0 and (tmp_path / "public.json").exists()


def test_the_private_cache_is_never_committed():
    ignore = open(os.path.join(ROOT, ".gitignore")).read()
    assert "data/private/" in ignore
