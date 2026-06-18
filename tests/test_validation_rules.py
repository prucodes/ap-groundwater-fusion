import csv
from pathlib import Path

from scripts.validate_fusion_outputs import validate_all


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return path


def fusion_fixture(path: Path, notes: str = "prototype caveat present", official: str = "false") -> Path:
    return write_csv(
        path,
        ["mandal_name", "boundary_source", "boundary_official_flag", "data_quality_notes"],
        [
            {
                "mandal_name": "TENALI",
                "boundary_source": "public_prototype",
                "boundary_official_flag": official,
                "data_quality_notes": notes,
            }
        ],
    )


def test_validation_rejects_mock_as_measured(tmp_path):
    groundwater = write_csv(
        tmp_path / "groundwater.csv",
        ["station_id", "source_system", "data_label", "official_flag"],
        [{"station_id": "APM-001", "source_system": "APWRIMS-like mock", "data_label": "measured", "official_flag": "false"}],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv")

    errors = validate_all(fusion, [groundwater], [], tmp_path / "missing_manifest.csv")

    assert any("labels mock-like data as measured" in error for error in errors)


def test_validation_rejects_prototype_boundary_as_official(tmp_path):
    fusion = fusion_fixture(tmp_path / "fusion.csv", official="true")

    errors = validate_all(fusion, [], [], tmp_path / "missing_manifest.csv")

    assert any("marks prototype boundary source as official" in error for error in errors)


def test_validation_rejects_satellite_model_depth_columns(tmp_path):
    satellite = write_csv(
        tmp_path / "satellite.csv",
        ["station_id", "satellite_groundwater_mbgl", "data_label"],
        [{"station_id": "APM-001", "satellite_groundwater_mbgl": "12.1", "data_label": "satellite-model"}],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv")

    errors = validate_all(fusion, [], [satellite], tmp_path / "missing_manifest.csv")

    assert any("prohibited satellite/model depth column" in error for error in errors)


def test_validation_rejects_percentiles_outside_range(tmp_path):
    satellite = write_csv(
        tmp_path / "satellite.csv",
        ["station_id", "groundwater_percentile", "rootzone_percentile", "surface_percentile", "data_label"],
        [
            {
                "station_id": "APM-001",
                "groundwater_percentile": "101",
                "rootzone_percentile": "50",
                "surface_percentile": "",
                "data_label": "satellite-model",
            }
        ],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv")

    errors = validate_all(fusion, [], [satellite], tmp_path / "missing_manifest.csv")

    assert any("groundwater_percentile outside 0-100" in error for error in errors)


def test_validation_requires_notes_for_mock_or_prototype_outputs(tmp_path):
    groundwater = write_csv(
        tmp_path / "groundwater.csv",
        ["station_id", "source_system", "data_label", "official_flag"],
        [{"station_id": "APM-001", "source_system": "APWRIMS-like mock", "data_label": "mock", "official_flag": "false"}],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv", notes="")

    errors = validate_all(fusion, [groundwater], [], tmp_path / "missing_manifest.csv")

    assert any("missing data_quality_notes" in error for error in errors)


def test_validation_requires_prototype_only_caveat(tmp_path):
    fusion = fusion_fixture(tmp_path / "fusion.csv", notes="public prototype boundary")

    errors = validate_all(fusion, [], [], tmp_path / "missing_manifest.csv")

    assert any("missing prototype-only caveat" in error for error in errors)


def test_validation_rejects_bad_satellite_sample_schema(tmp_path):
    satellite = write_csv(
        tmp_path / "satellite_samples_at_station_points.csv",
        ["station_id", "groundwater_percentile", "data_label"],
        [{"station_id": "APM-001", "groundwater_percentile": "80", "data_label": "satellite-model"}],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv")

    errors = validate_all(fusion, [], [satellite], tmp_path / "missing_manifest.csv")

    assert any("incorrect satellite sample schema" in error for error in errors)


def test_validation_rejects_public_measured_marked_official(tmp_path):
    groundwater = write_csv(
        tmp_path / "public.csv",
        ["station_id", "reading_date", "latitude", "longitude", "groundwater_level_mbgl", "data_label", "measured_data_label", "official_flag", "validation_notes"],
        [{"station_id": "A", "reading_date": "2024-01-01", "latitude": "16", "longitude": "80", "groundwater_level_mbgl": "5", "data_label": "measured_public", "measured_data_label": "measured_public", "official_flag": "true", "validation_notes": "schema checks passed"}],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv")

    errors = validate_all(fusion, [groundwater], [], tmp_path / "missing_manifest.csv")

    assert any("public measured row is marked official" in error for error in errors)


def test_validation_reports_public_measured_duplicate_station_date(tmp_path):
    groundwater = write_csv(
        tmp_path / "public.csv",
        ["station_id", "reading_date", "latitude", "longitude", "groundwater_level_mbgl", "data_label", "measured_data_label", "official_flag", "validation_notes"],
        [
            {"station_id": "A", "reading_date": "2024-01-01", "latitude": "16", "longitude": "80", "groundwater_level_mbgl": "5", "data_label": "measured_public", "measured_data_label": "measured_public", "official_flag": "false", "validation_notes": "schema checks passed"},
            {"station_id": "A", "reading_date": "2024-01-01", "latitude": "16", "longitude": "80", "groundwater_level_mbgl": "6", "data_label": "measured_public", "measured_data_label": "measured_public", "official_flag": "false", "validation_notes": "schema checks passed"},
        ],
    )
    fusion = fusion_fixture(tmp_path / "fusion.csv")

    errors = validate_all(fusion, [groundwater], [], tmp_path / "missing_manifest.csv")

    assert any("duplicate station/date" in error for error in errors)
