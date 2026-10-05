"""APWRIMS posts a month's groundwater within days; CHIRPS posts its rain about
three weeks after the month ends. On 5 October 2026 September's readings arrived
first, the Monsoon Watch dropped its whole rainfall section, the model read
September without rain, and the weekly refresh stopped. Both must carry on with
the months they have, and say which month is missing."""
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_monsoon_watch as watch  # noqa: E402
from build_phase0_foundation import rainfall_disclosure  # noqa: E402


def test_the_monsoon_watch_reads_the_rain_it_has_when_groundwater_runs_ahead(tmp_path, monkeypatch):
    latest = watch.build_frame().date.max()
    behind = []
    for path in watch.history_paths():
        table = pd.read_csv(path)
        copy = tmp_path / os.path.basename(path)
        table[table.date < latest].to_csv(copy, index=False)
        behind.append(str(copy))
    monkeypatch.setattr(watch, "history_paths", lambda: behind)
    payload = watch.build()
    rain = payload["rainfall"]
    assert rain is not None, "the rainfall section must not vanish while a month's rain is unpublished"
    assert payload["season"]["latestMonth"] == latest
    assert int(rain["months"][-2:]) == int(latest[5:7]) - 1, "rain should run to the month before the groundwater"
    assert rain["notYetPublished"] == [latest]
    assert payload["rainfallHistory"]["months"] == rain["months"], "every charted year must cover the same months"


def test_the_published_watch_names_only_a_real_gap():
    # Holds on any Monday: rain caught up (no gap), or one month behind (that month named).
    payload = watch.build()
    rain = payload["rainfall"]
    assert rain is not None
    year, latest = payload["season"]["year"], payload["season"]["latestMonth"]
    expected = [f"{year}-{m:02d}" for m in watch.SW_MONSOON if int(rain["months"][-2:]) < m <= int(latest[5:7])]
    assert rain["notYetPublished"] == expected
    assert len(expected) <= 1, f"satellite rain is more than a month behind the groundwater: {expected}"


def test_the_model_card_says_when_estimates_were_made_without_their_rain():
    caught_up = rainfall_disclosure({"throughPeriod": "2026-09", "targetsWithoutRainfall": 0, "periodsWithoutRainfall": []})
    assert "2026-09" in caught_up and "without" not in caught_up
    behind = rainfall_disclosure({"throughPeriod": "2026-08", "targetsWithoutRainfall": 657, "periodsWithoutRainfall": ["2026-09"]})
    assert "657 estimates for 2026-09" in behind
    assert "remade when it arrives" in behind
    assert "0.89 m to 1.04 m" in behind, "the measured cost of a month without rain travels with the disclosure"
    assert rainfall_disclosure(None)
