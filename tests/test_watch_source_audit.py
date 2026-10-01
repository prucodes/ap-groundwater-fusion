import datetime
import importlib.util
import json
import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("audit_watch_sources", ROOT / "scripts/audit_watch_sources.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def test_source_reconciliation_does_not_certify_a_wrong_baseline():
    history = []
    for year in range(2016, 2027):
        for month, depth in [("05", 10), ("08", 12 if year == 2026 else 9)]:
            history.append({"mandal_uuid": "m", "date": f"{year}-{month}", "level_mbgl": depth})
    row = {"mandalUuid": "m", "latestDepthM": 12, "thisSeasonM": 2, "typicalM": -1,
           "shortfallM": 3, "comparableYears": 10, "status": "severe"}
    watch = {"season": {"year": 2026, "latestMonth": "2026-08"}, "mandals": [row]}
    assert audit.reconcile(watch, history)["mismatches"] == []
    row["typicalM"] = -2
    assert audit.reconcile(watch, history)["mismatches"][0]["fields"] == ["typicalM"]


def test_rainfall_refresh_advances_past_august_2026_and_handles_january():
    from fetch_chirps_history import last_complete_month
    assert last_complete_month(datetime.date(2026, 9, 30)) == "2026-08"
    assert last_complete_month(datetime.date(2026, 10, 1)) == "2026-09"
    assert last_complete_month(datetime.date(2027, 1, 1)) == "2026-12"


def test_latest_depths_are_not_relabelled_as_live():
    component = (ROOT / "app/components/WatchEvidenceStatus.tsx").read_text()
    assert "Not live telemetry" in component
    assert "receipt.snapshotHash === hash" in component
    assert "Baseline review required" in component
    assert "No allocation or farmer advisory" in component


def test_online_checks_cannot_be_transferred_to_a_different_snapshot():
    previous = {"snapshotHash": "watch", "historyHash": "history", "online": {"groundwater": {}}, "onlineCheckedAt": "2026-09-30"}
    assert audit.reuse_online_check(previous, "watch", "history") == (previous["online"], "2026-09-30")
    for inputs in (("new-watch", "history"), ("watch", "new-history")):
        with pytest.raises(ValueError, match="different inputs"):
            audit.reuse_online_check(previous, *inputs)


def test_apwrims_probe_does_not_invent_a_full_fetch_receipt(tmp_path):
    from fetch_apwrims_history import write_receipt
    history = tmp_path / "history.csv"
    receipt = tmp_path / "receipt.json"
    history.write_text("mandal_uuid,date,level_mbgl\nm,2026-08,5\n")
    write_receipt(history, "checked_no_new_month", receipt)
    probe = json.loads(receipt.read_text())
    assert probe["fetchedAt"] is None
    assert probe["scope"] == "sample_probe"
    assert probe["latestPeriod"] == "2026-08"
    write_receipt(history, "refreshed", receipt)
    full = json.loads(receipt.read_text())
    assert full["fetchedAt"]
    assert full["rowCount"] == 1
    write_receipt(history, "checked_no_new_month", receipt)
    assert json.loads(receipt.read_text())["fetchedAt"] == full["fetchedAt"]
    history.write_text("mandal_uuid,date,level_mbgl\nm,2026-09,6\n")
    write_receipt(history, "checked_no_new_month", receipt)
    assert json.loads(receipt.read_text())["fetchedAt"] is None


def test_apwrims_receipts_recover_from_invalid_prior_json(tmp_path):
    from fetch_apwrims_history import write_receipt
    history = tmp_path / "history.csv"
    receipt = tmp_path / "receipt.json"
    history.write_text("mandal_uuid,date,level_mbgl\nm,2026-08,5\n")
    for invalid in ("broken", "[]"):
        receipt.write_text(invalid)
        write_receipt(history, "checked_no_new_month", receipt)
        assert json.loads(receipt.read_text())["fetchedAt"] is None


def test_manifest_only_accepts_a_matching_dated_receipt(tmp_path):
    from build_phase0_foundation import apwrims_refresh_state
    receipt = tmp_path / "receipt.json"
    missing = {"status": "retained_local_input", "fetchDate": None}
    assert apwrims_refresh_state("abc", "2026-09-30", receipt) == missing
    payload = {"historySha256": "abc", "fetchedAt": "2026-09-28T02:00:00+00:00", "checkedAt": "2026-09-30T02:00:00+00:00"}
    receipt.write_text(json.dumps(payload))
    retained = apwrims_refresh_state("abc", "2026-09-30", receipt)
    assert retained == {**missing, "fetchDate": "2026-09-28", "checkedAt": payload["checkedAt"]}
    assert apwrims_refresh_state("changed", "2026-09-30", receipt) == missing
    assert apwrims_refresh_state("abc", "2026-09-28", receipt)["status"] == "refreshed"
    for invalid_date in ("not-a-date", "2027-01-01T00:00:00+00:00", 123):
        receipt.write_text(json.dumps({**payload, "fetchedAt": invalid_date}))
        assert apwrims_refresh_state("abc", "2026-09-30", receipt) == missing
    receipt.write_text("[]")
    assert apwrims_refresh_state("abc", "2026-09-30", receipt) == missing
