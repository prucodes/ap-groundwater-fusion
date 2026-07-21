import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from phase3_levels.train_spatial import idw_predict


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
DATA = APP / "data"
RECORDS_BUNDLE = json.loads((DATA / "mandal_groundwater_records_v2.json").read_text())
SERIES_BUNDLE = json.loads((DATA / "mandal_observation_series_v2.json").read_text())
MANIFEST = json.loads((DATA / "dataset_manifest.json").read_text())
MODEL_CARD = json.loads((DATA / "model_card.json").read_text())
NOWCASTS = json.loads(
    (ROOT / "phase3_levels" / "outputs" / "mandal_nowcasts_v2.json").read_text()
)
EVALUATIONS = json.loads(
    (ROOT / "phase3_levels" / "outputs" / "phase0_evaluations.json").read_text()
)
GEOMETRY = json.loads((DATA / "ap_map_geometry.json").read_text())

VERSION = "2.0.0"
MONTH = re.compile(r"^\d{4}-\d{2}$")
COVERAGE = {"modelled", "measured_only", "boundary_only", "no_data", "excluded"}
AGREEMENT = {
    "declining_despite_positive_climate_balance",
    "declining_without_positive_climate_balance",
    "stable_or_recovering",
    "unknown",
}
LEGACY_AGREEMENT = {
    "drought_decline",
    "recharge_improving",
    "satellite_wet_but_falling",
    "climate_stress",
}


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def application_sources():
    for path in APP.rglob("*"):
        if path.suffix in {".ts", ".tsx"}:
            yield path, path.read_text()


def test_contract_identity_enums_units_and_dates():
    records = RECORDS_BUNDLE["records"]
    assert RECORDS_BUNDLE["contractVersion"] == VERSION
    assert len(records) == len(GEOMETRY["mandals"])
    assert len({r["identity"]["mandalId"] for r in records}) == len(records)
    assert len({r["identity"]["boundaryId"] for r in records}) == len(records)
    district_ids = {r["identity"]["districtId"] for r in records}
    assert len(district_ids) == MANIFEST["counts"]["districtCount"]

    for record in records:
        assert record["contractVersion"] == VERSION
        assert record["identity"]["coverageStatus"] in COVERAGE
        assert record["assessment"]["contextAgreement"] in AGREEMENT
        assert record["assessment"]["contextAgreement"] not in LEGACY_AGREEMENT
        observation = record["observation"]
        nowcast = record["nowcast"]
        assert record["forecast"] is None
        if observation:
            assert observation["unit"] == "m_bgl"
            assert MONTH.fullmatch(observation["observationPeriod"])
            assert observation["physicalStationCount"] is None
            assert observation["observationRecordCount"] >= observation["uniqueObservationMonthCount"]
        if nowcast:
            assert nowcast["unit"] == "m_bgl"
            assert MONTH.fullmatch(nowcast["targetPeriod"])
            assert nowcast["intervalType"] == "model_quantile_p10_p90"
            assert nowcast["lower"] <= nowcast["value"] <= nowcast["upper"]


def test_coverage_states_are_exclusive_and_missing_values_are_not_substituted():
    records = RECORDS_BUNDLE["records"]
    counts = Counter(r["identity"]["coverageStatus"] for r in records)
    assert counts["modelled"] == MANIFEST["counts"]["modelledRecordCount"]
    assert counts["measured_only"] == MANIFEST["counts"]["measuredOnlyCount"]
    assert counts["boundary_only"] == MANIFEST["counts"]["boundaryOnlyCount"]
    assert counts["no_data"] == MANIFEST["counts"]["noDataCount"]

    for record in records:
        status = record["identity"]["coverageStatus"]
        if status == "modelled":
            assert record["observation"] is not None
            assert record["nowcast"] is not None
        elif status == "measured_only":
            assert record["observation"] is not None
            assert record["nowcast"] is None
            assert record["forecast"] is None
        elif status in {"boundary_only", "no_data"}:
            assert record["observation"] is None
            assert record["nowcast"] is None
            assert record["forecast"] is None
            assert record["identity"]["boundaryId"]


def test_manifest_counts_are_derived_from_active_assets():
    records = RECORDS_BUNDLE["records"]
    coverage = Counter(r["identity"]["coverageStatus"] for r in records)
    counts = MANIFEST["counts"]
    raw_history = ROOT / "phase3_levels" / "apwrims" / "apwrims_gw_history.csv"
    with raw_history.open() as handle:
        raw_rows = sum(1 for _ in csv.DictReader(handle))

    assert counts["boundaryFeatureCount"] == len(records)
    assert counts["rawSourceSeriesCount"] == len(
        {
            row["mandal_uuid"]
            for row in csv.DictReader(raw_history.open())
            if row.get("mandal_uuid")
        }
    )
    assert counts["observationRowCount"] == raw_rows
    assert counts["historySeriesCount"] == len(SERIES_BUNDLE["series"])
    assert counts["modelledRecordCount"] == coverage["modelled"]
    assert counts["measuredOnlyCount"] == coverage["measured_only"]
    assert counts["boundaryOnlyCount"] == coverage["boundary_only"]
    assert counts["missingGroundwaterValueCount"] == sum(
        r["observation"] is None and r["nowcast"] is None for r in records
    )
    assert counts["rainfallContextCoverage"] == sum(
        r["signals"]["rainfall"]["amountMm"] is not None for r in records
    )
    assert counts["graceDistrictContextCoverage"] == sum(
        r["signals"]["graceDa"]["groundwaterPercentile"] is not None for r in records
    )


def test_manifest_hashes_and_legacy_lifecycle():
    assert MANIFEST["dataContractVersion"] == VERSION
    for artifact in MANIFEST["artifacts"]["active"]:
        path = ROOT / artifact["file"]
        assert path.exists()
        assert sha256(path) == artifact["sha256"]
        assert artifact["status"] == "active"
    for artifact in MANIFEST["artifacts"]["legacy"]:
        assert artifact["status"] == "legacy_inactive"


def test_model_card_separates_evaluation_tasks_and_gates_forecasts():
    evaluations = MODEL_CARD["evaluations"]
    assert evaluations["temporalNowcast"]["task"] == "rolling_temporal_holdout_nowcast"
    assert evaluations["spatialEstimation"]["task"] == "whole_mandal_spatial_estimation"
    assert evaluations["crossNetworkComparison"]["task"] == "cross_network_comparison"
    assert (
        evaluations["crossNetworkComparison"]["interpretation"]
        == "network comparability diagnostic; not model accuracy"
    )
    assert MODEL_CARD["forecastRelease"]["releasedHorizons"] == []
    assert MODEL_CARD["forecastRelease"]["status"] == "not_released"
    for horizon in evaluations["directForecast"]["horizons"]:
        assert set(horizon["baselines"]) == {"noChange", "seasonal"}
        assert horizon["sampleCount"] > 0
        assert horizon["releaseStatus"] == "research_only"
        assert horizon["rollingOriginValidated"] is False


def test_latest_targets_are_excluded_and_features_do_not_contain_target():
    assert NOWCASTS["schemaVersion"] == VERSION
    assert NOWCASTS["latestTargetsExcludedFromFit"] is True
    assert NOWCASTS["intervalType"] == "model_quantile_p10_p90"
    assert "target" not in {name.lower() for name in NOWCASTS["featureNames"]}
    assert len(NOWCASTS["mandals"]) == MANIFEST["counts"]["modelledRecordCount"]
    assert EVALUATIONS["directForecast"]["featureTiming"].startswith(
        "features available at forecast origin"
    )


def test_idw_excludes_training_self_neighbour():
    frame = pd.DataFrame(
        [
            {"date": "2026-01", "mandal": "A", "lat": 16.0, "lon": 80.0, "level_mbgl": 10.0},
            {"date": "2026-01", "mandal": "B", "lat": 16.1, "lon": 80.1, "level_mbgl": 20.0},
        ]
    )
    predicted = idw_predict(frame, frame.iloc[[0]], k=1)
    assert np.isclose(predicted[0], 20.0)


def test_active_ui_has_no_legacy_imports_or_unsupported_claims():
    forbidden_artifacts = {
        "mandal_dataset.json",
        "mandal_depth_series.json",
        "mandal_levels_estimated.json",
        "mandal_levels_current.json",
    }
    forbidden_copy = {
        "safe to draw",
        "forecast_next_month",
        "latest_sensor_date",
        "sensor_count",
        "confidence_score",
    }
    for path, text in application_sources():
        lower = text.lower()
        for artifact in forbidden_artifacts:
            assert artifact not in text, f"{path} imports/references inactive {artifact}"
        for phrase in forbidden_copy:
            assert phrase not in lower, f"{path} contains ambiguous/unsafe {phrase}"
        assert "±0.82" not in text
        assert "r 0.98" not in lower


def test_alert_engine_fails_closed_and_climate_is_not_a_severity_factor():
    alerts = (APP / "lib" / "alerts.ts").read_text()
    for key in AGREEMENT:
        assert f'"{key}"' in alerts
    for key in LEGACY_AGREEMENT:
        assert f'"{key}"' not in alerts
    assert 'state: "insufficient_data"' in alerts
    assert "Unsupported agreement key" in alerts
    assert "water_balance_mm" not in alerts
    assert "pumping" not in alerts.lower()
    assert "permit" not in alerts.lower()
