"""The forecast's soil moisture: known at the origin, fills dropped, joined by source UUID."""
import datetime
import json
import os
import sys

import pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "phase3_levels"))
import fetch_soil_moisture_history as soil  # noqa: E402
import train_multihorizon as tm  # noqa: E402


def snapshot(value):
    # Enough mandals to count as an answer; the 150 cm layer is the fourth.
    return {f"u{i}": {"name": f"m{i}", "pct": [1.0, 2.0, 3.0, value + i / 1000]} for i in range(400)}


def test_a_month_is_taken_only_once_its_28th_has_passed():
    assert soil.last_snapshot_month(datetime.date(2026, 11, 16)) == (2026, 10)
    assert soil.last_snapshot_month(datetime.date(2026, 11, 28)) == (2026, 11)
    assert soil.last_snapshot_month(datetime.date(2027, 1, 3)) == (2026, 12)


def test_a_snapshot_the_portal_repeats_is_a_fill_and_every_copy_goes(tmp_path, monkeypatch):
    monkeypatch.setattr(soil, "OUT", str(tmp_path / "soil.json"))
    answers = {"2026-08": 40.0, "2026-09": 55.0, "2026-10": 55.0}
    fetch = lambda day: snapshot(answers[f"{day.year}-{day.month:02d}"])  # noqa: E731
    monkeypatch.setattr(soil, "FIRST", (2026, 8))
    soil.main(today=datetime.date(2026, 11, 16), fetch=fetch, pause=0)
    d = json.load(open(tmp_path / "soil.json"))
    assert d["months"] == ["2026-08"]
    assert d["mandals"]["u0"] == [40.0]


def test_the_model_takes_the_origin_months_soil_by_source_uuid():
    frame = pd.DataFrame({"mkey": ["a", "a", "b"], "date": ["2026-09", "2026-10", "2026-10"]}, index=[5, 6, 7])
    table = pd.DataFrame({"mkey": ["a", "b"], "date": ["2026-10", "2026-09"], "sm150": [61.5, 20.0]})
    out = tm.add_soil(frame, table)
    assert list(out.index) == [5, 6, 7]
    assert out.sm150.isna().tolist() == [True, False, True]
    assert out.sm150[6] == 61.5
    assert "sm150" in tm.NUM


def test_the_held_history_reaches_the_latest_month_and_covers_the_mandals():
    d = json.load(open(soil.OUT))
    assert d["depthCm"] == 150 and d["months"][0] == "2014-01"
    assert len(d["mandals"]) >= 600
    assert all(len(values) == len(d["months"]) for values in d["mandals"].values())
