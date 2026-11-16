"""The weekly refresh's two modes and its parallel download lanes (phase3_levels/fetch_weekly.py)."""
import csv
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import fetch_weekly as weekly  # noqa: E402
import fetch_chirps_rainfall as chirps  # noqa: E402


def stub(name, seconds=0.0, required=False):
    return (name, [sys.executable, "-c", f"import time; time.sleep({seconds}); print('{name} done')"], required)


def run(monkeypatch, tmp_path, mode, lanes, steps):
    monkeypatch.setattr(weekly, "FETCH_LANES", lanes)
    monkeypatch.setattr(weekly, "STEPS", steps)
    monkeypatch.setattr(weekly, "HERE", str(tmp_path))
    monkeypatch.setenv("REFRESH_MODE", mode)
    weekly.main()
    return json.load(open(tmp_path / "outputs" / "weekly_run_log.json"))


def test_a_rebuild_downloads_nothing_and_still_builds(monkeypatch, tmp_path):
    lanes = [[stub("fetch APWRIMS sensor history")], [stub("fetch CHIRPS rain")]]
    steps = [stub("build released 3-month forecast", required=True), stub("build drought watch"),
             ("audit Monsoon Watch against its sources", [sys.executable, "-c", "import sys; assert '--online' not in sys.argv", "--online"], False)]
    log = run(monkeypatch, tmp_path, "rebuild", lanes, steps)
    by = {s["step"]: s for s in log["steps"]}
    assert log["mode"] == "rebuild"
    assert by["fetch APWRIMS sensor history"]["skipped"] == "rebuild" and by["fetch CHIRPS rain"]["skipped"] == "rebuild"
    assert by["build drought watch"]["skipped"] == "rebuild"
    assert by["build released 3-month forecast"]["ok"] and "skipped" not in by["build released 3-month forecast"]
    # The audit runs, without its public requests.
    assert by["audit Monsoon Watch against its sources"]["ok"]


def test_a_full_run_waits_for_the_longest_lane_not_the_sum(monkeypatch, tmp_path):
    lanes = [[stub("a1", 1.0), stub("a2", 0.2)], [stub("b1", 1.0)], [stub("c1", 1.0)]]
    started = time.time()
    log = run(monkeypatch, tmp_path, "full", lanes, [stub("build", 0)])
    assert time.time() - started < 2.6  # one lane's 1.2 s plus start-up, not 3.2 s in series
    assert [s["step"] for s in log["steps"]] == ["a1", "a2", "b1", "c1", "build"]
    assert all(s["ok"] for s in log["steps"])


def test_chirps_skips_a_month_it_already_holds(tmp_path):
    tif = tmp_path / chirps.TARGET_TIF
    tif.write_bytes(b"raster")
    manifest = tmp_path / "download_manifest.csv"
    with manifest.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=chirps.MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerow({**{c: "" for c in chirps.MANIFEST_COLUMNS}, "data_period": "2026.10", "fetch_status": "ok"})
    assert chirps.held_period(manifest, tif) == "2026.10"
    tif.unlink()
    assert chirps.held_period(manifest, tif) is None
