#!/usr/bin/env python3
"""Build a prototype AP admin-name crosswalk from public source files."""

from __future__ import annotations

import argparse
import csv
import json
import re
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = REPO_ROOT / "data/raw/boundaries/satishvmadala_ap_open_data"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/boundaries/ap_admin_name_crosswalk.csv"
OUTPUT_COLUMNS = [
    "raw_name",
    "standardized_name",
    "admin_level",
    "district_name",
    "source",
    "confidence",
    "notes",
]
SUPPORTED_EXTENSIONS = {".csv", ".json", ".geojson"}


def normalize_name(value: Any) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"\s+", " ", text.strip())
    return text.upper()


def infer_admin_level(field_name: str, path: Path) -> str:
    text = f"{field_name} {path.name}".lower()
    if "village" in text:
        return "village"
    if any(token in text for token in ["mandal", "subdistrict", "sub_district", "tehsil", "taluk"]):
        return "mandal"
    if any(token in text for token in ["district", "dist"]):
        return "district"
    return "unknown"


def is_name_field(field_name: str) -> bool:
    lowered = field_name.lower()
    return any(
        token in lowered
        for token in ["name", "district", "dist", "mandal", "village", "subdistrict", "tehsil", "taluk"]
    )


def iter_source_files(source_dir: Path) -> Iterable[Path]:
    if not source_dir.exists():
        return []
    return (path for path in sorted(source_dir.rglob("*")) if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS)


def read_csv_rows(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            yield dict(row)


def read_json_rows(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        for feature in payload["features"]:
            properties = feature.get("properties") or {}
            if isinstance(properties, dict):
                yield properties
        return

    if isinstance(payload, list):
        for item in payload:
            if isinstance(item, dict):
                yield item
        return

    if isinstance(payload, dict):
        yield payload


def extract_rows(path: Path) -> Iterable[dict[str, Any]]:
    if path.suffix.lower() == ".csv":
        yield from read_csv_rows(path)
    else:
        yield from read_json_rows(path)


def district_context(row: dict[str, Any]) -> str:
    for key, value in row.items():
        if "district" in key.lower() or key.lower() in {"dist", "dt_name", "dtname"}:
            normalized = normalize_name(value)
            if normalized:
                return normalized
    return ""


def build_crosswalk(source_dir: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str, str, str]] = set()

    for path in iter_source_files(source_dir):
        try:
            source_rows = list(extract_rows(path))
        except Exception as error:
            rows.append(
                {
                    "raw_name": "",
                    "standardized_name": "",
                    "admin_level": "unknown",
                    "district_name": "",
                    "source": str(path.relative_to(REPO_ROOT)),
                    "confidence": "low",
                    "notes": f"Could not parse source file: {error}",
                }
            )
            continue

        for source_row in source_rows:
            district_name = district_context(source_row)
            for field_name, value in source_row.items():
                raw_name = "" if value is None else str(value).strip()
                standardized_name = normalize_name(raw_name)
                if not raw_name or not standardized_name or not is_name_field(field_name):
                    continue
                admin_level = infer_admin_level(field_name, path)
                key = (raw_name, standardized_name, admin_level, district_name)
                if key in seen:
                    continue
                seen.add(key)
                rows.append(
                    {
                        "raw_name": raw_name,
                        "standardized_name": standardized_name,
                        "admin_level": admin_level,
                        "district_name": district_name,
                        "source": str(path.relative_to(REPO_ROOT)),
                        "confidence": "medium" if admin_level != "unknown" else "low",
                        "notes": "Prototype-public-source name extracted for normalization; verify before official use.",
                    }
                )

    return rows


def write_crosswalk(rows: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = build_crosswalk(args.source_dir)
    write_crosswalk(rows, args.output)
    print(f"Wrote {len(rows)} admin-name crosswalk rows to {args.output}")
    if not rows:
        print("No usable satishvmadala prototype source files found; wrote headers only.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

