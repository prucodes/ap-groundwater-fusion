"""The Crystal 3D view embeds its own dataset. It must be the measured
pre-monsoon (May) readings from the active V2 series — not a model fit, never a
forecast — and it must not fall behind when a new pre-monsoon year arrives."""
import json
import re
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DATA = REPO_ROOT / "app" / "data"
HTML = REPO_ROOT / "app" / "public" / "water-crystal-3d.html"


def _crystal():
    match = re.search(r"^const GW = (.*);$", HTML.read_text(), re.M)
    assert match, "water-crystal-3d.html has no single-line `const GW = ...;` dataset"
    return json.loads(match.group(1))


def _may_readings():
    """{boundary ordinal: {year: mean May value}} from the active series.

    Keyed by boundary, not name: some district/mandal names occur twice."""
    records = json.loads((APP_DATA / "mandal_groundwater_records_v2.json").read_text())["records"]
    series = json.loads((APP_DATA / "mandal_observation_series_v2.json").read_text())["series"]
    names = {r["identity"]["mandalId"]: int(re.search(r"-(\d+)$", r["identity"]["boundaryId"]).group(1))
             for r in records}
    readings = {}
    for mandal_id, entry in series.items():
        by_year = defaultdict(list)
        for obs in entry["observations"]:
            if obs["period"][5:7] == "05" and obs.get("value") is not None:
                by_year[obs["period"][:4]].append(obs["value"])
        readings[names[mandal_id]] = {y: sum(v) / len(v) for y, v in by_year.items()}
    return readings, len(series)


def test_crystal_carries_no_forecast():
    gw = _crystal()
    latest = json.loads((APP_DATA / "dataset_manifest.json").read_text())["periods"]["latestObservationPeriod"]
    assert gw["nForecast"] == 0
    assert gw["basis"] == "measured_pre_monsoon_may"
    assert int(gw["years"][-1]) <= int(latest[:4]), "a year beyond the latest observation is displayed"


def test_every_displayed_year_is_the_measured_may_reading():
    gw = _crystal()
    readings, _ = _may_readings()
    checked = 0
    for mandal in gw["mandals"]:
        own = readings[mandal["b"]]
        for i, year in enumerate(gw["years"]):
            if i in mandal["gap"]:
                assert year not in own, f"{mandal['n']} {year} is flagged interpolated but was measured"
                continue
            assert mandal["lvl"][i] == round(own[year], 1), f"{mandal['n']} {year} is not its May reading"
            checked += 1
    assert checked > 5000, f"too few measured values checked ({checked})"


def test_each_mandal_is_drawn_on_its_own_boundary():
    gw = _crystal()
    ordinals = [m["b"] for m in gw["mandals"]]
    assert len(ordinals) == len(set(ordinals)), "two mandals share one boundary polygon"
    geometry = json.loads((APP_DATA / "ap_map_geometry.json").read_text())["mandals"]
    for mandal in gw["mandals"]:
        feature = geometry[mandal["b"] - 1]
        assert (feature["d"].title(), feature["m"].title()) == (mandal["d"], mandal["n"])


def test_interpolation_never_carries_most_of_a_line():
    gw = _crystal()
    for mandal in gw["mandals"]:
        assert len(mandal["gap"]) <= len(gw["years"]) / 2, f"{mandal['n']} is mostly interpolated"


def test_crystal_includes_the_latest_pre_monsoon_year():
    # Catches a weekly run where the rebuild step failed after a new May arrived.
    gw = _crystal()
    readings, series_count = _may_readings()
    per_year = defaultdict(int)
    for own in readings.values():
        for year in own:
            per_year[year] += 1
    covered = [y for y, n in per_year.items() if n >= 0.5 * series_count]
    assert gw["years"][-1] == max(covered), (
        f"Crystal view ends at {gw['years'][-1]} but May {max(covered)} readings are published; "
        "run phase3_levels/build_crystal_data.py"
    )
