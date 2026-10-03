"""The rainfall record must come from one CHIRPS product, end to end.

CHIRPS v3 is not a continuation of v2: it corrects gauges for wind undercatch
and uses about four times the station sources, so the same month reads
differently. Over Andhra Pradesh the annual total barely moves, but rain shifts
between seasons and places, and June-August 2026 reads 22% lower. A history
that splices one into the other would compare two estimates as if they were one.
"""
import csv
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import fetch_chirps_history as chirps  # noqa: E402


def test_the_stored_history_is_one_product_from_1981():
    manifest = chirps.history_manifest()
    assert manifest["product"] == chirps.PRODUCT == "CHIRPS v3.0"
    months = set()
    for path in chirps.history_paths():
        with open(path) as handle:
            months |= {row["date"] for row in csv.DictReader(handle)}
    assert min(months) == manifest["firstMonth"] == "1981-01"
    assert max(months) == manifest["lastMonth"]
    assert len(months) == manifest["months"]


def test_an_incremental_run_refuses_to_append_to_another_product(monkeypatch):
    monkeypatch.setattr(chirps, "history_product", lambda: "CHIRPS v2.0")
    monkeypatch.setattr(sys, "argv", ["fetch_chirps_history.py"])
    monkeypatch.setattr(chirps, "fetch_month", lambda *a: pytest.fail("must not fetch before refusing"))
    assert chirps.main() == 1


def test_a_rebuild_must_include_the_archive(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["fetch_chirps_history.py", "--rebuild", "--start-year", "2014"])
    with pytest.raises(SystemExit):
        chirps.main()


def test_a_history_without_a_manifest_is_v2(monkeypatch, tmp_path):
    monkeypatch.setattr(chirps, "MANIFEST", str(tmp_path / "missing.json"))
    monkeypatch.setattr(chirps, "history_paths", lambda: ["somewhere.csv"])
    assert chirps.history_product() == "CHIRPS v2.0"


def test_only_the_newest_months_may_be_missing_from_a_rebuild():
    missing = [(2026, 9, "404"), (2026, 8, "404")]
    assert chirps.blocking_gaps(missing, 2026, 9) == []
    assert chirps.blocking_gaps(missing + [(2026, 7, "timeout")], 2026, 9) == [(2026, 7, "timeout")]
    assert chirps.blocking_gaps([(2025, 12, "404")], 2026, 1) == []


def test_the_monsoon_watch_names_the_product_that_built_it():
    watch = json.load(open(os.path.join(ROOT, "app", "data", "monsoon_watch.json")))
    assert watch["rainfall"]["product"].startswith(chirps.history_product())
    assert watch["rainfall"]["source"] == chirps.history_manifest()["source"]
