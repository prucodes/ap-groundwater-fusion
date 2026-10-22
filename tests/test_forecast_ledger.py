"""The forecast ledger keeps what the site published and scores it honestly."""
import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILDER = os.path.join(ROOT, "phase3_levels", "build_forecast_ledger.py")
SUMMARY = os.path.join(ROOT, "app", "data", "forecast_ledger.json")
LEDGER = os.path.join(ROOT, "phase3_levels", "data", "forecast_ledger")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")
WEEKLY = os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")


def builder():
    spec = importlib.util.spec_from_file_location("ledger_builder", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def week(issued, forecasts):
    return ({"issued": issued, "source": "test", "model": "m", "forecasts": forecasts}, "hash")


def test_a_frozen_week_is_never_rewritten(tmp_path, monkeypatch):
    b = builder()
    monkeypatch.setattr(b, "LEDGER", str(tmp_path))
    payload = {"issued": "2026-10-19", "source": "weekly refresh", "model": "m", "fields": [],
               "forecasts": {"a": ["2026-09", "2026-12", 5.0, 4.0, 6.0]}}
    assert b.write_once(payload)
    changed = dict(payload, forecasts={"a": ["2026-09", "2026-12", 9.9, 9.0, 11.0]})
    assert not b.write_once(changed)
    stored = json.load(open(tmp_path / "2026-10-19.json"))
    assert stored["forecasts"]["a"][2] == 5.0


def test_the_earliest_issued_forecast_is_the_one_scored():
    b = builder()
    weeks = [week("2026-10-19", {"a": ["2026-09", "2026-12", 7.0, 6.0, 8.0]}),
             week("2026-09-28", {"a": ["2026-09", "2026-12", 5.0, 4.0, 6.0]})]
    observed = {"a": {"2026-09": 5.5, "2026-12": 5.2}}
    s = b.summarise(sorted(weeks, key=lambda w: w[0]["issued"]), observed)
    assert s["forecastsTracked"] == 1
    assert s["scored"]["forecasts"] == 1
    assert abs(s["scored"]["maeM"] - 0.2) < 1e-9          # 5.0 against 5.2, not 7.0
    assert s["scored"]["biasM"] < 0                         # forecast shallower: more water than came
    assert abs(s["scored"]["noChangeMaeM"] - 0.3) < 1e-9     # 5.5 at origin against 5.2
    assert s["scored"]["bandCoveragePct"] == 100.0


def test_unmeasured_targets_wait_rather_than_score():
    b = builder()
    s = b.summarise([week("2026-10-19", {"a": ["2026-09", "2026-12", 5.0, 4.0, 6.0]})], {"a": {"2026-09": 5.5}})
    assert s["scored"] is None
    assert s["pendingByTarget"] == {"2026-12": 1}


def test_the_published_summary_lists_every_frozen_week_with_its_hash():
    summary = json.load(open(SUMMARY))
    files = sorted(n for n in os.listdir(LEDGER) if n.endswith(".json"))
    assert summary["weeksFrozen"] == len(files) and summary["kind"] == "prospective_track_record"
    assert [w["issued"] + ".json" for w in summary["weeks"]] == files
    assert all(len(w["sha256"]) == 64 for w in summary["weeks"])
    assert summary["forecastsTracked"] > 0


def test_the_weekly_refresh_keeps_and_commits_the_ledger():
    assert "build_forecast_ledger.py" in open(WEEKLY).read()
    workflow = open(WORKFLOW).read()
    assert "app/data/forecast_ledger.json" in workflow
    assert "phase3_levels/data \\" in workflow  # the frozen weeks live under phase3_levels/data
