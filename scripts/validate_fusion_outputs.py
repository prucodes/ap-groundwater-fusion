#!/usr/bin/env python3
"""Validate V0 fusion outputs and source-label guardrails."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FUSION_OUTPUT = REPO_ROOT / "data/processed/fusion/mandal_groundwater_fusion_v0.csv"
DEFAULT_SOURCE_MANIFEST = REPO_ROOT / "data/source_manifest.csv"
DEFAULT_GROUNDWATER_INPUTS = [
    REPO_ROOT / "data/mock/apwrims/mock_groundwater_readings.csv",
    REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv",
    REPO_ROOT / "data/processed/groundwater/stations_joined_to_boundaries.csv",
    REPO_ROOT / "data/processed/groundwater/standardized_public_groundwater_readings.csv",
    REPO_ROOT / "data/processed/groundwater/stations_joined_public_measured_to_boundaries.csv",
]
DEFAULT_SATELLITE_INPUTS = [
    REPO_ROOT / "data/processed/satellite/satellite_samples_at_station_points.csv",
    REPO_ROOT / "data/processed/satellite/station_satellite_samples.csv",
]
PROTOTYPE_BOUNDARY_VALUES = {"public_prototype", "prototype-public-source"}
PERCENTILE_COLUMNS = {"groundwater_percentile", "rootzone_percentile", "surface_percentile"}
REQUIRED_SOURCE_NAMES = {
    "Mock APWRIMS-like groundwater readings",
    "satishvmadala/andhrapradesh_opendata_locations",
    "datta07/INDIAN-SHAPEFILES",
    "Official APWRIMS/APSAC/RTGS pending",
    "NASA/NDMC GRACE-DA current gws_perc_025deg_GL.tif",
    "NASA/NDMC GRACE-DA current rtzsm_perc_025deg_GL.tif",
    "NASA/NDMC GRACE-DA current sfsm_perc_025deg_GL.tif",
}
SATELLITE_SAMPLE_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "latitude",
    "longitude",
    "groundwater_percentile",
    "rootzone_percentile",
    "surface_percentile",
    "satellite_sample_date_or_fetch_date",
    "gws_source_file",
    "rtzsm_source_file",
    "sfsm_source_file",
    "data_label",
    "notes",
]


def parse_bool(value: object) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def read_csv_rows(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def row_text(row: dict[str, str]) -> str:
    return " ".join(str(value).lower() for value in row.values())


def validate_mock_not_measured(path: Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    path_is_mock = "mock" in str(path).lower()
    for index, row in enumerate(rows, start=2):
        label = row.get("data_label", "").strip().lower()
        text = row_text(row)
        source_system = row.get("source_system", "").strip().lower()
        if label == "measured" and (path_is_mock or "mock" in text or "apwrims-like mock" in source_system):
            errors.append(f"{path}:{index} labels mock-like data as measured")
        if label == "mock" and parse_bool(row.get("official_flag", "false")):
            errors.append(f"{path}:{index} marks mock data as official")
        if "mock" in source_system and label != "mock":
            errors.append(f"{path}:{index} has mock source_system but data_label is {label or 'blank'}")
    return errors


def validate_public_measured_rows(path: Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    seen_station_dates: set[tuple[str, str]] = set()
    for index, row in enumerate(rows, start=2):
        label = row.get("data_label", "").strip().lower()
        measured_label = row.get("measured_data_label", "").strip().lower()
        is_public = label == "measured_public" or measured_label == "measured_public"
        if label == "official_apwrims" and measured_label == "measured_public":
            errors.append(f"{path}:{index} public measured row is labeled official_apwrims")
        if not is_public:
            continue
        if parse_bool(row.get("official_flag", "false")):
            errors.append(f"{path}:{index} public measured row is marked official")
        if label in {"mock", "official_apwrims"}:
            errors.append(f"{path}:{index} public measured row has invalid data_label={label}")
        for coord_column, low, high in [("latitude", -90, 90), ("longitude", -180, 180)]:
            value = row.get(coord_column, "")
            try:
                numeric = float(value)
            except ValueError:
                errors.append(f"{path}:{index} invalid {coord_column}: {value}")
                continue
            if numeric < low or numeric > high:
                errors.append(f"{path}:{index} {coord_column} outside WGS84 range: {value}")
        mbgl_value = row.get("groundwater_level_mbgl", "")
        try:
            mbgl = float(mbgl_value)
        except ValueError:
            errors.append(f"{path}:{index} nonnumeric groundwater_level_mbgl: {mbgl_value}")
        else:
            if mbgl < 0 or mbgl > 100:
                notes = row.get("validation_notes", "").lower()
                if "review" not in notes and "outside default plausible" not in notes:
                    errors.append(f"{path}:{index} implausible groundwater_level_mbgl lacks review note: {mbgl_value}")
        key = (row.get("station_id", ""), row.get("reading_date", ""))
        if key[0] and key[1]:
            if key in seen_station_dates:
                errors.append(f"{path}:{index} duplicate station/date record: {key[0]} {key[1]}")
            seen_station_dates.add(key)
    return errors


def validate_prototype_not_official(path: Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    for index, row in enumerate(rows, start=2):
        boundary_source = row.get("boundary_source", row.get("data_label", "")).strip().lower()
        data_label = row.get("data_label", "").strip().lower()
        official_value = row.get("boundary_official_flag", row.get("official_flag", "false"))
        if boundary_source in PROTOTYPE_BOUNDARY_VALUES and parse_bool(official_value):
            errors.append(f"{path}:{index} marks prototype boundary source as official")
        if data_label == "prototype-public-source" and parse_bool(row.get("official_flag", "false")):
            errors.append(f"{path}:{index} marks prototype-public-source data as official")
    return errors


def validate_no_satellite_depth_columns(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    is_satellite_file = any(row.get("data_label", "").strip().lower() == "satellite-model" for row in rows)
    for column in fieldnames:
        lowered = column.lower()
        satellite_depth_name = (
            ("satellite" in lowered or "grace" in lowered or "model" in lowered or is_satellite_file)
            and ("mbgl" in lowered or "depth" in lowered)
        )
        if satellite_depth_name:
            errors.append(f"{path} has prohibited satellite/model depth column: {column}")
    return errors


def validate_percentile_values(path: Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    for index, row in enumerate(rows, start=2):
        for column in PERCENTILE_COLUMNS:
            value = row.get(column, "")
            if value is None or str(value).strip() == "":
                continue
            try:
                value_float = float(value)
            except ValueError:
                errors.append(f"{path}:{index} has non-numeric {column}: {value}")
                continue
            if value_float < 0 or value_float > 100:
                errors.append(f"{path}:{index} has {column} outside 0-100: {value}")
    return errors


def validate_satellite_sample_schema(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    if path.name != "satellite_samples_at_station_points.csv":
        return errors
    if fieldnames != SATELLITE_SAMPLE_COLUMNS:
        errors.append(f"{path} has incorrect satellite sample schema")
    for index, row in enumerate(rows, start=2):
        if row.get("data_label", "").strip().lower() != "satellite-model":
            errors.append(f"{path}:{index} data_label must be satellite-model")
    return errors


def validate_source_manifest_quality(path: Path, rows: list[dict[str, str]]) -> list[str]:
    errors: list[str] = []
    source_names = {row.get("source_name", "") for row in rows}
    missing_sources = sorted(REQUIRED_SOURCE_NAMES - source_names)
    for source_name in missing_sources:
        errors.append(f"{path} missing required source manifest row: {source_name}")
    for index, row in enumerate(rows, start=2):
        if not row.get("data_label", "").strip():
            errors.append(f"{path}:{index} missing data_label")
        if row.get("official_flag", "").strip().lower() not in {"true", "false"}:
            errors.append(f"{path}:{index} official_flag must be true or false")
    return errors


def validate_fusion_notes(
    fusion_path: Path,
    fusion_rows: list[dict[str, str]],
    mock_inputs_present: bool,
) -> list[str]:
    errors: list[str] = []
    for index, row in enumerate(fusion_rows, start=2):
        boundary_source = row.get("boundary_source", "").strip().lower()
        uses_prototype = any(value in boundary_source for value in PROTOTYPE_BOUNDARY_VALUES) or boundary_source == "none"
        notes = row.get("data_quality_notes", "").strip()
        needs_prototype_note = mock_inputs_present or uses_prototype
        if needs_prototype_note and not notes:
            errors.append(f"{fusion_path}:{index} missing data_quality_notes for mock/prototype inputs")
        if needs_prototype_note and "prototype-only" not in notes.lower():
            errors.append(f"{fusion_path}:{index} missing prototype-only caveat in data_quality_notes")
        if "public measured" in notes.lower() and "not official apwrims" not in notes.lower():
            errors.append(f"{fusion_path}:{index} missing not official APWRIMS caveat for public measured fusion")
        if uses_prototype and parse_bool(row.get("boundary_official_flag", "false")):
            errors.append(f"{fusion_path}:{index} has official boundary flag despite prototype boundary source")
    return errors


def existing_paths(paths: list[Path]) -> list[Path]:
    return [path for path in paths if path.exists()]


def validate_all(
    fusion_output: Path,
    groundwater_inputs: list[Path],
    satellite_inputs: list[Path],
    source_manifest: Path,
) -> list[str]:
    errors: list[str] = []
    mock_inputs_present = False

    for path in groundwater_inputs:
        if not path.exists():
            continue
        fieldnames, rows = read_csv_rows(path)
        mock_inputs_present = mock_inputs_present or any(row.get("data_label", "").strip().lower() == "mock" for row in rows)
        errors.extend(validate_mock_not_measured(path, rows))
        errors.extend(validate_public_measured_rows(path, rows))
        errors.extend(validate_prototype_not_official(path, rows))
        errors.extend(validate_no_satellite_depth_columns(path, fieldnames, rows))
        errors.extend(validate_percentile_values(path, rows))

    for path in satellite_inputs:
        if not path.exists():
            continue
        fieldnames, rows = read_csv_rows(path)
        errors.extend(validate_no_satellite_depth_columns(path, fieldnames, rows))
        errors.extend(validate_prototype_not_official(path, rows))
        errors.extend(validate_percentile_values(path, rows))
        errors.extend(validate_satellite_sample_schema(path, fieldnames, rows))

    if source_manifest.exists():
        fieldnames, rows = read_csv_rows(source_manifest)
        errors.extend(validate_mock_not_measured(source_manifest, rows))
        errors.extend(validate_prototype_not_official(source_manifest, rows))
        errors.extend(validate_no_satellite_depth_columns(source_manifest, fieldnames, rows))
        errors.extend(validate_percentile_values(source_manifest, rows))
        errors.extend(validate_source_manifest_quality(source_manifest, rows))

    if not fusion_output.exists():
        errors.append(f"Fusion output does not exist: {fusion_output}")
        return errors

    fusion_fieldnames, fusion_rows = read_csv_rows(fusion_output)
    errors.extend(validate_prototype_not_official(fusion_output, fusion_rows))
    errors.extend(validate_no_satellite_depth_columns(fusion_output, fusion_fieldnames, fusion_rows))
    errors.extend(validate_percentile_values(fusion_output, fusion_rows))
    errors.extend(validate_fusion_notes(fusion_output, fusion_rows, mock_inputs_present))
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fusion-output", type=Path, default=DEFAULT_FUSION_OUTPUT)
    parser.add_argument("--groundwater-input", type=Path, action="append", default=None)
    parser.add_argument("--satellite-input", type=Path, action="append", default=None)
    parser.add_argument("--source-manifest", type=Path, default=DEFAULT_SOURCE_MANIFEST)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    groundwater_inputs = args.groundwater_input if args.groundwater_input is not None else DEFAULT_GROUNDWATER_INPUTS
    satellite_inputs = args.satellite_input if args.satellite_input is not None else DEFAULT_SATELLITE_INPUTS
    errors = validate_all(args.fusion_output, groundwater_inputs, satellite_inputs, args.source_manifest)

    if errors:
        print("Validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
