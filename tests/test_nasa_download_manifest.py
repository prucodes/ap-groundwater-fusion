from urllib.error import URLError

import pytest

from scripts import download_nasa_grace_da
from scripts.download_nasa_grace_da import build_manifest_row, download_file, write_download_manifest


def test_nasa_download_manifest_records_file_metadata(tmp_path):
    raster_path = tmp_path / "gws_perc_025deg_GL.tif"
    raster_path.write_bytes(b"small-test-raster-bytes")
    row = build_manifest_row(raster_path, "https://example.test/gws_perc_025deg_GL.tif")

    assert row["local_path"].endswith("gws_perc_025deg_GL.tif")
    assert row["source_url"] == "https://example.test/gws_perc_025deg_GL.tif"
    assert row["file_size_bytes"] == str(raster_path.stat().st_size)
    assert len(row["sha256"]) == 64
    assert row["tls_verified"] == "true"
    assert row["tls_fallback_reason"] == ""
    assert row["data_label"] == "satellite-model"
    assert row["official_flag"] == "false"
    assert "not groundwater depth" in row["notes"]


def test_write_download_manifest(tmp_path):
    manifest_path = tmp_path / "download_manifest.csv"
    row = {
        "local_path": "data/raw/nasa/grace_da/current/gws_perc_025deg_GL.tif",
        "source_url": "https://example.test/gws_perc_025deg_GL.tif",
        "fetch_date": "2026-06-13",
        "file_size_bytes": "12",
        "sha256": "0" * 64,
        "tls_verified": "true",
        "tls_fallback_reason": "",
        "data_label": "satellite-model",
        "official_flag": "false",
        "notes": "percentile only",
    }

    write_download_manifest([row], manifest_path)

    text = manifest_path.read_text(encoding="utf-8")
    assert "local_path,source_url,fetch_date,file_size_bytes,sha256,tls_verified,tls_fallback_reason,data_label,official_flag,notes" in text
    assert "satellite-model" in text


def test_tls_fallback_requires_explicit_flag(tmp_path, monkeypatch):
    destination = tmp_path / "gws_perc_025deg_GL.tif"

    def fail_cert(*args, **kwargs):
        raise URLError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed")

    monkeypatch.setattr(download_nasa_grace_da, "stream_download", fail_cert)

    with pytest.raises(RuntimeError, match="allow-insecure-tls"):
        download_file("https://example.test/gws.tif", destination, overwrite=True, allow_insecure_tls=False)
    assert not destination.exists()


def test_tls_fallback_runs_only_when_flag_is_set(tmp_path, monkeypatch):
    destination = tmp_path / "gws_perc_025deg_GL.tif"
    calls = {"count": 0}

    def fail_then_write(url, output_path, context=None):
        calls["count"] += 1
        if calls["count"] == 1:
            raise URLError("[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed")
        output_path.write_bytes(b"downloaded")

    monkeypatch.setattr(download_nasa_grace_da, "stream_download", fail_then_write)

    result = download_file("https://example.test/gws.tif", destination, overwrite=True, allow_insecure_tls=True)

    assert calls["count"] == 2
    assert destination.read_bytes() == b"downloaded"
    assert result.tls_verified is False
    assert result.tls_fallback_reason == "CERTIFICATE_VERIFY_FAILED"
