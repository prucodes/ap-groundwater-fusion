import csv
from pathlib import Path

from scripts.generate_phase1c_reports import main as generate_reports_main


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_phase1c_report_generation(tmp_path, monkeypatch):
    download_manifest = write_csv(
        tmp_path / "download_manifest.csv",
        ["local_path", "source_url", "fetch_date", "file_size_bytes", "sha256", "tls_verified", "tls_fallback_reason", "data_label", "official_flag", "notes"],
        [
            {
                "local_path": "data/raw/nasa/grace_da/current/gws_perc_025deg_GL.tif",
                "source_url": "https://example.test/gws.tif",
                "fetch_date": "2026-06-13",
                "file_size_bytes": "10",
                "sha256": "0" * 64,
                "tls_verified": "true",
                "tls_fallback_reason": "",
                "data_label": "satellite-model",
                "official_flag": "false",
                "notes": "test",
            }
        ],
    )
    raster_inventory = write_csv(
        tmp_path / "raster_inventory.csv",
        ["raster_name", "local_path", "crs", "bounds", "width", "height", "resolution", "nodata", "dtype", "min_value", "max_value", "notes"],
        [
            {
                "raster_name": "gws_perc_025deg_GL.tif",
                "local_path": "data/raw/nasa/grace_da/current/gws_perc_025deg_GL.tif",
                "crs": "EPSG:4326",
                "bounds": "-180,-60,180,90",
                "width": "1440",
                "height": "600",
                "resolution": "0.25,0.25",
                "nodata": "-999",
                "dtype": "float32",
                "min_value": "1",
                "max_value": "100",
                "notes": "test",
            }
        ],
    )
    samples = write_csv(
        tmp_path / "samples.csv",
        ["station_id", "station_name", "district_name", "mandal_name", "latitude", "longitude", "groundwater_percentile", "rootzone_percentile", "surface_percentile", "satellite_sample_date_or_fetch_date", "gws_source_file", "rtzsm_source_file", "sfsm_source_file", "data_label", "notes"],
        [
            {
                "station_id": "APM-001",
                "station_name": "Test",
                "district_name": "Guntur",
                "mandal_name": "Tenali",
                "latitude": "16.2",
                "longitude": "80.6",
                "groundwater_percentile": "90",
                "rootzone_percentile": "80",
                "surface_percentile": "",
                "satellite_sample_date_or_fetch_date": "2026-06-13",
                "gws_source_file": "gws.tif",
                "rtzsm_source_file": "rtzsm.tif",
                "sfsm_source_file": "sfsm.tif",
                "data_label": "satellite-model",
                "notes": "test",
            }
        ],
    )
    fusion = write_csv(
        tmp_path / "fusion.csv",
        ["district_name", "mandal_name", "confidence_label", "status", "sensor_satellite_agreement", "groundwater_percentile", "rootzone_percentile", "surface_percentile", "median_groundwater_mbgl", "data_quality_notes", "boundary_source"],
        [
            {
                "district_name": "GUNTUR",
                "mandal_name": "TENALI",
                "confidence_label": "Low",
                "status": "monitor",
                "sensor_satellite_agreement": "partial_or_neutral",
                "groundwater_percentile": "90",
                "rootzone_percentile": "80",
                "surface_percentile": "",
                "median_groundwater_mbgl": "7.8",
                "data_quality_notes": "mock groundwater input; public prototype boundary; prototype-only output",
                "boundary_source": "public_prototype",
            }
        ],
    )
    report_dir = tmp_path / "reports"
    monkeypatch.setattr(
        "sys.argv",
        [
            "generate_phase1c_reports.py",
            "--download-manifest",
            str(download_manifest),
            "--raster-inventory",
            str(raster_inventory),
            "--samples",
            str(samples),
            "--fusion",
            str(fusion),
            "--report-dir",
            str(report_dir),
        ],
    )

    assert generate_reports_main() == 0
    assert (report_dir / "phase1c_nasa_sampling_summary.md").exists()
    assert (report_dir / "phase1c_nasa_sampling_summary.csv").exists()
    assert (report_dir / "phase1c_nasa_sampling_summary.json").exists()
    assert (report_dir / "phase1c_fusion_summary.md").exists()
