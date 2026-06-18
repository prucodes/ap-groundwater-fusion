import csv
import json
from pathlib import Path
from urllib.error import URLError

import pytest

from scripts import fetch_nwic_groundwater
from scripts.fetch_nwic_groundwater import fetch_public_groundwater
from scripts.standardize_nwic_groundwater import main as standardize_main


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, str]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return path


def test_ckan_resource_show_success_with_direct_file_url(tmp_path, monkeypatch):
    source = tmp_path / "source.csv"
    source.write_text("station_id,reading_date,groundwater_level_mbgl,latitude,longitude\nA,2024-01-01,5,16,80\n", encoding="utf-8")

    def fake_request_json(url, timeout):
        return {"result": {"url": source.as_uri(), "license_title": "Open"}}

    monkeypatch.setattr(fetch_nwic_groundwater, "request_json", fake_request_json)
    result = fetch_public_groundwater(tmp_path / "raw", timeout=2)

    assert result.status == "downloaded"
    assert result.local_path.endswith(".csv")
    assert result.license == "Open"


def test_ckan_timeout_produces_manual_required(tmp_path, monkeypatch):
    def timeout(url, timeout):
        raise URLError("timed out")

    monkeypatch.setattr(fetch_nwic_groundwater, "request_json", timeout)
    result = fetch_public_groundwater(tmp_path / "raw", timeout=1)

    assert result.status == "manual_required"
    assert "Manual step" in result.notes


def test_nwic_standardization_preserves_measured_public(tmp_path, monkeypatch):
    raw_dir = tmp_path / "raw"
    raw_file = write_csv(
        raw_dir / "public.csv",
        ["station_id", "station_name", "district", "mandal", "latitude", "longitude", "reading_date", "water_level"],
        [
            {
                "station_id": "PUB-1",
                "station_name": "Public Well",
                "district": "Guntur",
                "mandal": "Tenali",
                "latitude": "16.2",
                "longitude": "80.6",
                "reading_date": "2024-01-01",
                "water_level": "5.2",
            }
        ],
    )
    fetch_manifest = write_csv(
        raw_dir / "fetch_manifest.csv",
        ["source_url", "license", "fetch_status"],
        [{"source_url": "https://example.test/public.csv", "license": "Open", "fetch_status": "downloaded"}],
    )
    output = tmp_path / "standardized.csv"
    monkeypatch.setattr(
        "sys.argv",
        [
            "standardize_nwic_groundwater.py",
            "--raw-dir",
            str(raw_dir),
            "--fetch-manifest",
            str(fetch_manifest),
            "--output",
            str(output),
        ],
    )

    assert standardize_main() == 0
    rows = list(csv.DictReader(output.open()))
    assert rows[0]["data_label"] == "measured_public"
    assert rows[0]["measured_data_label"] == "measured_public"
    assert rows[0]["source_system"] == "NWIC National Water Data Portal"


def test_nwic_standardization_fails_missing_required_fields(tmp_path, monkeypatch):
    raw_dir = tmp_path / "raw"
    write_csv(raw_dir / "bad.csv", ["station_id", "latitude", "longitude"], [{"station_id": "A", "latitude": "16", "longitude": "80"}])
    output = tmp_path / "standardized.csv"
    monkeypatch.setattr(
        "sys.argv",
        ["standardize_nwic_groundwater.py", "--raw-dir", str(raw_dir), "--output", str(output)],
    )

    with pytest.raises(SystemExit, match="reading_date"):
        standardize_main()

