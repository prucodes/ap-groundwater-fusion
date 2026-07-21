"""Fail-closed integrity validation for active Phase 0 artifacts."""
import datetime
import hashlib
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
APP = os.path.join(ROOT, "app")
DATA = os.path.join(APP, "data")
VERSION = "2.0.0"
COVERAGE = {"modelled", "measured_only", "boundary_only", "no_data", "excluded"}
AGREEMENT = {
    "declining_despite_positive_climate_balance",
    "declining_without_positive_climate_balance",
    "stable_or_recovering",
    "unknown",
}
LEGACY_NAMES = {
    "mandal_dataset.json",
    "mandal_depth_series.json",
    "mandal_levels_estimated.json",
    "mandal_levels_current.json",
}
MONTH = re.compile(r"^\d{4}-\d{2}$")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition, message, errors):
    if not condition:
        errors.append(message)


def main():
    errors = []
    records_bundle = json.load(open(os.path.join(DATA, "mandal_groundwater_records_v2.json")))
    series_bundle = json.load(open(os.path.join(DATA, "mandal_observation_series_v2.json")))
    manifest = json.load(open(os.path.join(DATA, "dataset_manifest.json")))
    model_card = json.load(open(os.path.join(DATA, "model_card.json")))
    geometry = json.load(open(os.path.join(DATA, "ap_map_geometry.json")))
    records = records_bundle["records"]

    require(records_bundle.get("contractVersion") == VERSION, "record bundle contract version", errors)
    require(series_bundle.get("contractVersion") == VERSION, "series contract version", errors)
    require(manifest.get("dataContractVersion") == VERSION, "manifest contract version", errors)
    require(len(records) == len(geometry["mandals"]), "one V2 record per boundary feature", errors)

    ids = [record["identity"]["mandalId"] for record in records]
    boundaries = [record["identity"]["boundaryId"] for record in records]
    require(len(ids) == len(set(ids)), "mandal IDs must be unique", errors)
    require(len(boundaries) == len(set(boundaries)), "boundary IDs must be unique", errors)
    coverage = Counter()
    for index, record in enumerate(records):
        prefix = f"record[{index}]"
        identity = record.get("identity", {})
        status = identity.get("coverageStatus")
        coverage[status] += 1
        require(record.get("contractVersion") == VERSION, f"{prefix} version", errors)
        require(status in COVERAGE, f"{prefix} coverage enum", errors)
        require(identity.get("mandalId") and identity.get("districtId"), f"{prefix} stable identity", errors)
        require(record["assessment"]["contextAgreement"] in AGREEMENT, f"{prefix} agreement enum", errors)
        observation = record.get("observation")
        nowcast = record.get("nowcast")
        forecast = record.get("forecast")
        require(forecast is None, f"{prefix} forecast must be null until release gate passes", errors)
        if observation:
            require(observation.get("unit") == "m_bgl", f"{prefix} observation unit", errors)
            require(bool(MONTH.match(observation.get("observationPeriod", ""))), f"{prefix} observation period", errors)
            require(observation.get("physicalStationCount") is None, f"{prefix} unverifiable station count", errors)
        if nowcast:
            require(nowcast.get("unit") == "m_bgl", f"{prefix} nowcast unit", errors)
            require(bool(MONTH.match(nowcast.get("targetPeriod", ""))), f"{prefix} nowcast period", errors)
            require(nowcast.get("intervalType") == "model_quantile_p10_p90", f"{prefix} interval label", errors)
            require(nowcast["lower"] <= nowcast["value"] <= nowcast["upper"], f"{prefix} quantile order", errors)
        if status == "modelled":
            require(observation is not None and nowcast is not None, f"{prefix} modelled optional rules", errors)
        if status == "measured_only":
            require(observation is not None and nowcast is None, f"{prefix} measured-only optional rules", errors)
        if status in {"boundary_only", "no_data"}:
            require(observation is None and nowcast is None, f"{prefix} no-data optional rules", errors)

    counts = manifest["counts"]
    require(counts["boundaryFeatureCount"] == len(records), "manifest boundary count", errors)
    require(counts["modelledRecordCount"] == coverage["modelled"], "manifest modelled count", errors)
    require(counts["measuredOnlyCount"] == coverage["measured_only"], "manifest measured-only count", errors)
    require(counts["boundaryOnlyCount"] == coverage["boundary_only"], "manifest boundary-only count", errors)
    require(counts["historySeriesCount"] == len(series_bundle["series"]), "manifest history count", errors)
    require(model_card["forecastRelease"]["releasedHorizons"] == [], "forecast release gate", errors)
    require(
        model_card["evaluations"]["crossNetworkComparison"]["interpretation"]
        == "network comparability diagnostic; not model accuracy",
        "cross-network interpretation",
        errors,
    )

    for artifact in manifest["artifacts"]["active"]:
        path = os.path.join(ROOT, artifact["file"])
        require(os.path.exists(path), f"active artifact exists: {artifact['file']}", errors)
        if os.path.exists(path):
            require(sha256(path) == artifact["sha256"], f"active hash: {artifact['file']}", errors)
    for artifact in manifest["artifacts"]["legacy"]:
        require(artifact["status"] == "legacy_inactive", f"legacy status: {artifact['file']}", errors)

    for base, _, files in os.walk(APP):
        for filename in files:
            if not filename.endswith((".ts", ".tsx")):
                continue
            path = os.path.join(base, filename)
            text = open(path).read()
            for legacy in LEGACY_NAMES:
                require(legacy not in text, f"active UI imports/references legacy {legacy}: {path}", errors)

    generated = records_bundle.get("generatedAt")
    try:
        datetime.datetime.fromisoformat(generated)
    except (TypeError, ValueError):
        errors.append("record bundle generatedAt must be ISO-8601")

    if errors:
        print("Phase 0 validation failed:")
        for error in errors:
            print(f" - {error}")
        return 1
    print(
        "Phase 0 validation passed: "
        f"{len(records)} records; {dict(sorted(coverage.items()))}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
