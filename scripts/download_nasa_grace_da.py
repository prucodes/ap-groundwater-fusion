#!/usr/bin/env python3
"""Download current NASA/NDMC GRACE-DA percentile GeoTIFFs.

The downloaded rasters are satellite/model percentile inputs only. They are not
groundwater-depth measurements and must not be converted to mbgl.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import shutil
import ssl
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data/raw/nasa/grace_da/current"
DEFAULT_DOWNLOAD_MANIFEST = DEFAULT_OUTPUT_DIR / "download_manifest.csv"
SOURCE_MANIFEST = REPO_ROOT / "data/source_manifest.csv"
DEFAULT_URLS = {
    "gws_perc_025deg_GL.tif": "https://nasagrace.unl.edu/globaldata/current/gws_perc_025deg_GL.tif",
    "rtzsm_perc_025deg_GL.tif": "https://nasagrace.unl.edu/globaldata/current/rtzsm_perc_025deg_GL.tif",
    "sfsm_perc_025deg_GL.tif": "https://nasagrace.unl.edu/globaldata/current/sfsm_perc_025deg_GL.tif",
}
DOWNLOAD_MANIFEST_COLUMNS = [
    "local_path",
    "source_url",
    "fetch_date",
    "file_size_bytes",
    "sha256",
    "tls_verified",
    "tls_fallback_reason",
    "data_label",
    "official_flag",
    "notes",
]
SOURCE_MANIFEST_COLUMNS = [
    "source_name",
    "source_url",
    "license",
    "downloaded_or_created_date",
    "data_label",
    "official_flag",
    "notes",
]


@dataclass(frozen=True)
class DownloadResult:
    note: str
    tls_verified: bool
    tls_fallback_reason: str


def parse_name_url(values: list[str] | None) -> dict[str, str]:
    if not values:
        return {}
    parsed: dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise SystemExit("--url values must use filename=url format.")
        filename, url = value.split("=", 1)
        filename = filename.strip()
        url = url.strip()
        if not filename or not url:
            raise SystemExit("--url values must include both filename and URL.")
        parsed[filename] = url
    return parsed


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stream_download(url: str, destination: Path, context: ssl.SSLContext | None = None) -> None:
    request = Request(url, headers={"User-Agent": "groundwater-fusion-layer/0.1"})
    with urlopen(request, context=context, timeout=60) as response, destination.open("wb") as handle:
        shutil.copyfileobj(response, handle)


def download_file(url: str, destination: Path, overwrite: bool, allow_insecure_tls: bool = False) -> DownloadResult:
    if destination.exists() and not overwrite:
        print(f"Using existing file: {destination}")
        return DownloadResult(
            note="existing file reused; no network TLS verification performed in this run",
            tls_verified=False,
            tls_fallback_reason="existing file reused",
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = destination.with_suffix(destination.suffix + ".tmp")
    try:
        stream_download(url, tmp_path)
    except HTTPError as error:
        if tmp_path.exists():
            tmp_path.unlink()
        raise RuntimeError(f"HTTP {error.code}: {error.reason}") from error
    except URLError as error:
        reason = str(error.reason)
        if "CERTIFICATE_VERIFY_FAILED" not in reason:
            if tmp_path.exists():
                tmp_path.unlink()
            raise RuntimeError(f"URL error: {error.reason}") from error

        if not allow_insecure_tls:
            if tmp_path.exists():
                tmp_path.unlink()
            raise RuntimeError(
                "TLS certificate verification failed. Fix local Python certificates/certifi and retry, "
                "or pass --allow-insecure-tls only for local reproducibility testing."
            ) from error

        print("TLS certificate verification failed; --allow-insecure-tls set, retrying with unverified TLS.")
        try:
            stream_download(url, tmp_path, context=ssl._create_unverified_context())
        except Exception as retry_error:
            if tmp_path.exists():
                tmp_path.unlink()
            raise RuntimeError(f"URL error after TLS fallback: {retry_error}") from retry_error
        result = DownloadResult(
            note="downloaded with explicit insecure TLS fallback",
            tls_verified=False,
            tls_fallback_reason="CERTIFICATE_VERIFY_FAILED",
        )
    else:
        result = DownloadResult(
            note="downloaded with standard TLS verification",
            tls_verified=True,
            tls_fallback_reason="",
        )

    shutil.move(str(tmp_path), destination)
    return result


def build_manifest_row(
    local_path: Path,
    source_url: str,
    download_note: str = "downloaded",
    tls_verified: bool = True,
    tls_fallback_reason: str = "",
) -> dict[str, str]:
    try:
        local_path_text = str(local_path.relative_to(REPO_ROOT))
    except ValueError:
        local_path_text = str(local_path)

    return {
        "local_path": local_path_text,
        "source_url": source_url,
        "fetch_date": str(date.today()),
        "file_size_bytes": str(local_path.stat().st_size),
        "sha256": sha256_file(local_path),
        "tls_verified": str(tls_verified).lower(),
        "tls_fallback_reason": tls_fallback_reason,
        "data_label": "satellite-model",
        "official_flag": "false",
        "notes": (
            "NASA/NDMC GRACE-DA percentile GeoTIFF; supporting satellite/model signal only, "
            f"not groundwater depth; {download_note}."
        ),
    }


def write_download_manifest(rows: list[dict[str, str]], manifest_path: Path) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=DOWNLOAD_MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def read_source_manifest(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def update_source_manifest(download_rows: list[dict[str, str]], manifest_path: Path) -> None:
    rows = read_source_manifest(manifest_path)
    by_name = {row["source_name"]: row for row in rows if row.get("source_name")}
    ordered_names = [row["source_name"] for row in rows if row.get("source_name")]

    for row in download_rows:
        raster_name = Path(row["local_path"]).name
        source_name = f"NASA/NDMC GRACE-DA current {raster_name}"
        by_name[source_name] = {
            "source_name": source_name,
            "source_url": row["source_url"],
            "license": "Public NASA/NDMC data terms vary by product",
            "downloaded_or_created_date": row["fetch_date"],
            "data_label": "satellite-model",
            "official_flag": "false",
            "notes": (
                f"Local path: {row['local_path']}; sha256: {row['sha256']}; "
                "percentile raster only, not groundwater depth."
            ),
        }
        if source_name not in ordered_names:
            ordered_names.append(source_name)

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=SOURCE_MANIFEST_COLUMNS)
        writer.writeheader()
        for source_name in ordered_names:
            writer.writerow(by_name[source_name])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_DOWNLOAD_MANIFEST)
    parser.add_argument("--source-manifest", type=Path, default=SOURCE_MANIFEST)
    parser.add_argument(
        "--url",
        action="append",
        default=None,
        help="Override or add a raster URL using filename=url. Repeat for multiple files.",
    )
    parser.add_argument("--overwrite", action="store_true", help="Re-download files even if they already exist.")
    parser.add_argument(
        "--allow-insecure-tls",
        action="store_true",
        help="Retry with unverified TLS only if normal certificate verification fails. Use only for local reproducibility testing.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    urls = {**DEFAULT_URLS, **parse_name_url(args.url)}

    rows: list[dict[str, str]] = []
    for filename, url in urls.items():
        local_path = args.output_dir / filename
        try:
            download_result = download_file(url, local_path, args.overwrite, args.allow_insecure_tls)
        except Exception as error:
            raise SystemExit(
                f"Failed to download NASA/NDMC GRACE-DA raster {filename} from {url}.\n"
                f"Reason: {error}\n"
                "Check network access, the product URL, and local Python certificate configuration. "
                "No official APWRIMS data is involved in this download."
            ) from error
        row = build_manifest_row(
            local_path,
            url,
            download_result.note,
            tls_verified=download_result.tls_verified,
            tls_fallback_reason=download_result.tls_fallback_reason,
        )
        rows.append(row)
        print(f"Ready: {row['local_path']} ({row['file_size_bytes']} bytes)")

    write_download_manifest(rows, args.manifest)
    update_source_manifest(rows, args.source_manifest)
    print(f"Wrote NASA download manifest to {args.manifest}")
    print(f"Updated source manifest at {args.source_manifest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
