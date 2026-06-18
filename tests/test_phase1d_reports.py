import csv
from pathlib import Path

from scripts.generate_phase1d_reports import main as reports_main


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_phase1d_reports_generate_from_fixtures(tmp_path, monkeypatch):
    fetch = write_csv(
        tmp_path / "fetch.csv",
        ["source_url", "source_resource_id", "fetch_status"],
        [{"source_url": "https://example.test", "source_resource_id": "rid", "fetch_status": "downloaded"}],
    )
    public = write_csv(
        tmp_path / "public.csv",
        ["station_id", "district_name", "mandal_name", "latitude", "longitude", "reading_date", "groundwater_level_mbgl", "validation_notes"],
        [{"station_id": "A", "district_name": "GUNTUR", "mandal_name": "TENALI", "latitude": "16", "longitude": "80", "reading_date": "2024-01-01", "groundwater_level_mbgl": "5", "validation_notes": "schema checks passed"}],
    )
    joined = write_csv(
        tmp_path / "joined.csv",
        ["station_id", "boundary_mandal_name"],
        [{"station_id": "A", "boundary_mandal_name": "TENALI"}],
    )
    fusion = write_csv(
        tmp_path / "fusion.csv",
        ["district_name", "mandal_name", "latest_sensor_date", "confidence_label", "status", "sensor_satellite_agreement", "groundwater_percentile", "median_groundwater_mbgl", "data_quality_notes"],
        [{"district_name": "GUNTUR", "mandal_name": "TENALI", "latest_sensor_date": "2024-01-01", "confidence_label": "Low", "status": "monitor", "sensor_satellite_agreement": "partial_or_neutral", "groundwater_percentile": "80", "median_groundwater_mbgl": "5", "data_quality_notes": "public measured groundwater input; not official APWRIMS"}],
    )
    satellite = write_csv(
        tmp_path / "satellite.csv",
        ["satellite_sample_date_or_fetch_date"],
        [{"satellite_sample_date_or_fetch_date": "2024-02-01"}],
    )
    report_dir = tmp_path / "reports"
    monkeypatch.setattr(
        "sys.argv",
        [
            "generate_phase1d_reports.py",
            "--fetch-manifest",
            str(fetch),
            "--public",
            str(public),
            "--joined-public",
            str(joined),
            "--fusion",
            str(fusion),
            "--satellite",
            str(satellite),
            "--report-dir",
            str(report_dir),
        ],
    )

    assert reports_main() == 0
    assert (report_dir / "phase1d_public_measured_data_summary.md").exists()
    assert (report_dir / "phase1d_public_vs_satellite_fusion_summary.md").exists()

