#!/usr/bin/env python3
"""Fetch NWIC/NWDP public measured AP groundwater data when safely available."""

from __future__ import annotations

import argparse
import csv
import json
import shutil
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
RESOURCE_ID = "305c8531-759d-4fb9-abf6-7cf4341ec318"
PACKAGE_ID = "ground-water-level-manual-quarterly-andhra-pradesh-ground-water-departments"
RESOURCE_SHOW_URL = f"https://nwdp.nwic.gov.in/api/3/action/resource_show?id={RESOURCE_ID}"
PACKAGE_SHOW_URL = f"https://nwdp.nwic.gov.in/api/3/action/package_show?id={PACKAGE_ID}"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data/raw/nwic/andhra_pradesh_groundwater"
DEFAULT_FETCH_MANIFEST = DEFAULT_OUTPUT_DIR / "fetch_manifest.csv"
DEFAULT_SOURCE_MANIFEST = REPO_ROOT / "data/source_manifest.csv"
STABLE_EXTENSIONS = {".csv", ".json", ".xls", ".xlsx"}
FETCH_COLUMNS = [
    "source_name",
    "source_url",
    "source_resource_id",
    "package_url",
    "fetch_date",
    "fetch_status",
    "local_path",
    "license",
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
class FetchResult:
    status: str
    source_url: str
    local_path: str
    license: str
    notes: str


def request_json(url: str, timeout: int) -> dict[str, object]:
    request = Request(url, headers={"User-Agent": "groundwater-fusion-layer/0.1"})
    with urlopen(request, timeout=timeout) as response:
        payload = response.read().decode("utf-8")
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise RuntimeError("metadata response is not a JSON object")
    return data


def stable_download_url(resource: dict[str, object]) -> str:
    for key in ["url", "download_url"]:
        value = resource.get(key)
        if not value:
            continue
        url = str(value)
        parsed_path = Path(urlparse(url).path)
        if parsed_path.suffix.lower() in STABLE_EXTENSIONS:
            return url
    return ""


def filename_from_url(url: str, fallback: str = "nwic_groundwater_public_data") -> str:
    name = Path(urlparse(url).path).name
    if name:
        return name
    return fallback + ".dat"


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def download_file(url: str, output_dir: Path, timeout: int) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    local_path = output_dir / filename_from_url(url)
    tmp_path = local_path.with_suffix(local_path.suffix + ".tmp")
    request = Request(url, headers={"User-Agent": "groundwater-fusion-layer/0.1"})
    with urlopen(request, timeout=timeout) as response, tmp_path.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    shutil.move(str(tmp_path), local_path)
    return local_path


def extract_resource(metadata: dict[str, object]) -> dict[str, object]:
    result = metadata.get("result")
    if isinstance(result, dict):
        return result
    return {}


def license_from_metadata(resource_metadata: dict[str, object], package_metadata: dict[str, object]) -> str:
    resource = extract_resource(resource_metadata)
    package = extract_resource(package_metadata)
    for mapping in [resource, package]:
        for key in ["license_title", "license_id", "license"]:
            value = mapping.get(key)
            if value:
                return str(value)
    return "Unknown"


def manual_required(reason: str) -> FetchResult:
    return FetchResult(
        status="manual_required",
        source_url=RESOURCE_SHOW_URL,
        local_path="",
        license="Unknown",
        notes=(
            f"{reason} Manual step: open the NWIC/NWDP resource page, download a stable CSV/XLS/XLSX/JSON file "
            f"for resource {RESOURCE_ID}, and place it under data/raw/nwic/andhra_pradesh_groundwater/."
        ),
    )


def fetch_public_groundwater(output_dir: Path, timeout: int) -> FetchResult:
    try:
        resource_metadata = request_json(RESOURCE_SHOW_URL, timeout)
    except (HTTPError, TimeoutError, URLError, json.JSONDecodeError, RuntimeError) as error:
        return manual_required(f"Could not fetch CKAN resource metadata: {error}.")

    try:
        package_metadata = request_json(PACKAGE_SHOW_URL, timeout)
    except (HTTPError, TimeoutError, URLError, json.JSONDecodeError, RuntimeError) as error:
        package_metadata = {}
        package_note = f" Package metadata unavailable: {error}."
    else:
        package_note = ""

    resource = extract_resource(resource_metadata)
    download_url = stable_download_url(resource)
    if not download_url:
        return manual_required("CKAN metadata did not expose a stable CSV/XLS/XLSX/JSON file URL." + package_note)

    try:
        local_path = download_file(download_url, output_dir, timeout)
    except (HTTPError, TimeoutError, URLError, OSError) as error:
        return manual_required(f"Stable file URL was present but could not be downloaded: {error}." + package_note)

    return FetchResult(
        status="downloaded",
        source_url=download_url,
        local_path=display_path(local_path),
        license=license_from_metadata(resource_metadata, package_metadata),
        notes="Downloaded stable public measured groundwater file from NWIC/NWDP metadata." + package_note,
    )


def fetch_row(result: FetchResult) -> dict[str, str]:
    return {
        "source_name": "NWIC Ground Water Level Manual Quarterly Andhra Pradesh Ground Water Departments",
        "source_url": result.source_url,
        "source_resource_id": RESOURCE_ID,
        "package_url": PACKAGE_SHOW_URL,
        "fetch_date": str(date.today()),
        "fetch_status": result.status,
        "local_path": result.local_path,
        "license": result.license,
        "data_label": "measured_public",
        "official_flag": "false",
        "notes": result.notes,
    }


def write_fetch_manifest(row: dict[str, str], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FETCH_COLUMNS)
        writer.writeheader()
        writer.writerow(row)


def read_source_manifest(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def update_source_manifest(row: dict[str, str], path: Path) -> None:
    rows = read_source_manifest(path)
    source_name = row["source_name"]
    notes = (
        f"source_resource_id={row['source_resource_id']}; fetch_status={row['fetch_status']}; "
        f"local_path={row['local_path']}; {row['notes']}"
    )
    replacement = {
        "source_name": source_name,
        "source_url": row["source_url"],
        "license": row["license"],
        "downloaded_or_created_date": row["fetch_date"],
        "data_label": "measured_public",
        "official_flag": "false",
        "notes": notes,
    }

    updated = False
    output_rows: list[dict[str, str]] = []
    for existing in rows:
        if existing.get("source_name") == source_name:
            output_rows.append(replacement)
            updated = True
        else:
            output_rows.append(existing)
    if not updated:
        output_rows.append(replacement)

    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=SOURCE_MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerows(output_rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--fetch-manifest", type=Path, default=DEFAULT_FETCH_MANIFEST)
    parser.add_argument("--source-manifest", type=Path, default=DEFAULT_SOURCE_MANIFEST)
    parser.add_argument("--timeout-seconds", type=int, default=8)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = fetch_public_groundwater(args.output_dir, args.timeout_seconds)
    row = fetch_row(result)
    write_fetch_manifest(row, args.fetch_manifest)
    update_source_manifest(row, args.source_manifest)
    print(f"NWIC fetch_status={row['fetch_status']}")
    if row["fetch_status"] == "manual_required":
        print(row["notes"])
    else:
        print(f"Downloaded public measured groundwater file to {row['local_path']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
