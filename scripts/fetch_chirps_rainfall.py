#!/usr/bin/env python3
"""Download the latest available CHIRPS monthly rainfall GeoTIFF.

CHIRPS (UCSB Climate Hazards Group) is an open, satellite + station blended
rainfall product. It is used here only as a recharge/supply context signal
(millimetres of monthly rainfall). It is NOT groundwater depth and carries no
official APWRIMS claim. No login is required.

The script walks backward from the current month to the most recent month that
exists on the server (CHIRPS monthly has a few weeks of latency), downloads the
gzipped GeoTIFF, decompresses it, and records a download manifest. On a network
failure it writes ``fetch_status=manual_required`` and exits 0 so the rest of
the pipeline can continue gracefully.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import shutil
import ssl
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data/raw/chirps/current"
DEFAULT_MANIFEST = DEFAULT_OUTPUT_DIR / "download_manifest.csv"
SOURCE_MANIFEST = REPO_ROOT / "data/source_manifest.csv"
BASE_URL = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs"
TARGET_TIF = "chirps_monthly_latest.tif"

MANIFEST_COLUMNS = [
    "local_path",
    "source_url",
    "data_period",
    "fetch_date",
    "file_size_bytes",
    "sha256",
    "tls_verified",
    "fetch_status",
    "data_label",
    "official_flag",
    "notes",
]


def candidate_months(max_back: int) -> list[tuple[int, int]]:
    today = date.today()
    year, month = today.year, today.month
    months: list[tuple[int, int]] = []
    for _ in range(max_back):
        months.append((year, month))
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return months


def make_context(insecure: bool) -> ssl.SSLContext | None:
    if not insecure:
        try:
            import certifi  # type: ignore

            return ssl.create_default_context(cafile=certifi.where())
        except Exception:
            return None
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def try_download(url: str, context: ssl.SSLContext | None) -> bytes | None:
    request = Request(url, headers={"User-Agent": "ap-groundwater-prototype/1.0"})
    try:
        with urlopen(request, timeout=90, context=context) as response:
            if response.status != 200:
                return None
            return response.read()
    except (HTTPError, URLError, TimeoutError, ssl.SSLError):
        return None


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(path: Path, row: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerow(row)


def append_source_manifest(period: str, url: str) -> None:
    columns = [
        "source_name",
        "source_url",
        "license",
        "downloaded_or_created_date",
        "data_label",
        "official_flag",
        "notes",
    ]
    exists = SOURCE_MANIFEST.exists()
    rows: list[dict[str, str]] = []
    if exists:
        with SOURCE_MANIFEST.open("r", encoding="utf-8-sig", newline="") as handle:
            rows = [dict(r) for r in csv.DictReader(handle)]
    rows = [r for r in rows if r.get("source_name") != "CHIRPS monthly rainfall"]
    rows.append(
        {
            "source_name": "CHIRPS monthly rainfall",
            "source_url": url,
            "license": "CHIRPS open data (UCSB Climate Hazards Group)",
            "downloaded_or_created_date": str(date.today()),
            "data_label": "satellite-gauge-rainfall",
            "official_flag": "False",
            "notes": f"monthly rainfall mm; recharge context only; data period {period}; not groundwater depth",
        }
    )
    with SOURCE_MANIFEST.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--max-months-back", type=int, default=8)
    parser.add_argument("--allow-insecure-tls", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output_dir / "download_manifest.csv"
    context = make_context(args.allow_insecure_tls)

    for year, month in candidate_months(args.max_months_back):
        period = f"{year}.{month:02d}"
        url = f"{BASE_URL}/chirps-v2.0.{period}.tif.gz"
        print(f"Trying CHIRPS {period} ...")
        payload = try_download(url, context)
        if payload is None:
            continue

        tif_path = args.output_dir / TARGET_TIF
        try:
            decompressed = gzip.decompress(payload)
        except OSError:
            # Some mirrors serve an uncompressed tif at the .gz path; fall back.
            decompressed = payload
        tif_path.write_bytes(decompressed)

        write_manifest(
            manifest_path,
            {
                "local_path": str(tif_path.relative_to(REPO_ROOT)),
                "source_url": url,
                "data_period": period,
                "fetch_date": str(date.today()),
                "file_size_bytes": tif_path.stat().st_size,
                "sha256": sha256_of(tif_path),
                "tls_verified": str(not args.allow_insecure_tls),
                "fetch_status": "ok",
                "data_label": "satellite-gauge-rainfall",
                "official_flag": "False",
                "notes": "CHIRPS monthly rainfall mm; recharge context; not groundwater depth",
            },
        )
        append_source_manifest(period, url)
        print(f"Downloaded CHIRPS monthly rainfall for {period} -> {tif_path}")
        return 0

    # Network/availability failure: stay graceful so the pipeline can continue.
    write_manifest(
        manifest_path,
        {
            "local_path": "",
            "source_url": BASE_URL,
            "data_period": "",
            "fetch_date": str(date.today()),
            "file_size_bytes": 0,
            "sha256": "",
            "tls_verified": str(not args.allow_insecure_tls),
            "fetch_status": "manual_required",
            "data_label": "satellite-gauge-rainfall",
            "official_flag": "False",
            "notes": "No CHIRPS month reachable. Place a chirps monthly GeoTIFF at "
            f"{(args.output_dir / TARGET_TIF).relative_to(REPO_ROOT)} manually, or retry with network access.",
        },
    )
    print("Could not reach CHIRPS; wrote fetch_status=manual_required (pipeline continues).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
