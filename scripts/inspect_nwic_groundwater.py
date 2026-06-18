#!/usr/bin/env python3
"""Inspect raw NWIC/AP public measured groundwater files."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW_DIR = REPO_ROOT / "data/raw/nwic/andhra_pradesh_groundwater"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/groundwater/nwic_groundwater_inventory.csv"
SUPPORTED_EXTENSIONS = {".csv", ".json", ".xls", ".xlsx"}
OUTPUT_COLUMNS = [
    "file_path",
    "status",
    "row_count",
    "column_names",
    "likely_station_fields",
    "likely_date_fields",
    "likely_depth_fields",
    "likely_latitude_fields",
    "likely_longitude_fields",
    "likely_district_fields",
    "likely_mandal_fields",
    "date_range_if_parseable",
    "missing_coordinate_count",
    "notes",
]


def candidate_fields(columns: Iterable[str], tokens: list[str]) -> list[str]:
    found = []
    for column in columns:
        lowered = column.lower().replace(" ", "_")
        if any(token in lowered for token in tokens):
            found.append(column)
    return found


def raw_files(raw_dir: Path) -> list[Path]:
    if not raw_dir.exists():
        return []
    return [
        path
        for path in sorted(raw_dir.iterdir())
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS and path.name != "fetch_manifest.csv"
    ]


def load_table(path: Path):
    import pandas as pd

    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".json":
        return pd.read_json(path)
    if suffix in {".xls", ".xlsx"}:
        return pd.read_excel(path)
    raise ValueError(f"Unsupported file type: {path.suffix}")


def inspect_file(path: Path) -> dict[str, str]:
    import pandas as pd

    try:
        df = load_table(path)
    except Exception as error:
        return {
            "file_path": str(path.relative_to(REPO_ROOT)),
            "status": "inspect_failed",
            "row_count": "0",
            "column_names": "",
            "likely_station_fields": "",
            "likely_date_fields": "",
            "likely_depth_fields": "",
            "likely_latitude_fields": "",
            "likely_longitude_fields": "",
            "likely_district_fields": "",
            "likely_mandal_fields": "",
            "date_range_if_parseable": "",
            "missing_coordinate_count": "",
            "notes": f"Could not inspect file: {error}",
        }

    columns = [str(column) for column in df.columns]
    station_fields = candidate_fields(columns, ["station", "well", "site", "location", "observation"])
    date_fields = candidate_fields(columns, ["date", "year", "month", "quarter", "season"])
    depth_fields = candidate_fields(columns, ["mbgl", "water_level", "ground_water_level", "groundwater_level", "depth", "level"])
    lat_fields = candidate_fields(columns, ["lat", "latitude"])
    lon_fields = candidate_fields(columns, ["lon", "long", "longitude"])
    district_fields = candidate_fields(columns, ["district", "dist"])
    mandal_fields = candidate_fields(columns, ["mandal", "subdistrict", "sub_district", "taluk", "tehsil"])

    date_range = ""
    for field in date_fields:
        parsed = pd.to_datetime(df[field], errors="coerce")
        if parsed.notna().any():
            date_range = f"{parsed.min().date()} to {parsed.max().date()}"
            break

    missing_coordinate_count = ""
    if lat_fields and lon_fields:
        lat = pd.to_numeric(df[lat_fields[0]], errors="coerce")
        lon = pd.to_numeric(df[lon_fields[0]], errors="coerce")
        missing_coordinate_count = str(int((lat.isna() | lon.isna()).sum()))

    return {
        "file_path": str(path.relative_to(REPO_ROOT)),
        "status": "inspected",
        "row_count": str(len(df)),
        "column_names": ";".join(columns),
        "likely_station_fields": ";".join(station_fields),
        "likely_date_fields": ";".join(date_fields),
        "likely_depth_fields": ";".join(depth_fields),
        "likely_latitude_fields": ";".join(lat_fields),
        "likely_longitude_fields": ";".join(lon_fields),
        "likely_district_fields": ";".join(district_fields),
        "likely_mandal_fields": ";".join(mandal_fields),
        "date_range_if_parseable": date_range,
        "missing_coordinate_count": missing_coordinate_count,
        "notes": "Public measured source inspection only; not official APWRIMS data.",
    }


def write_inventory(rows: list[dict[str, str]], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = raw_files(args.raw_dir)
    if not files:
        rows = [
            {
                "file_path": "",
                "status": "no_public_file_available",
                "row_count": "0",
                "column_names": "",
                "likely_station_fields": "",
                "likely_date_fields": "",
                "likely_depth_fields": "",
                "likely_latitude_fields": "",
                "likely_longitude_fields": "",
                "likely_district_fields": "",
                "likely_mandal_fields": "",
                "date_range_if_parseable": "",
                "missing_coordinate_count": "",
                "notes": "No stable NWIC public measured groundwater file is available locally. Run fetch or manually place a downloaded file in the raw NWIC folder.",
            }
        ]
    else:
        rows = [inspect_file(path) for path in files]
    write_inventory(rows, args.output)
    print(f"Wrote NWIC groundwater inventory to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

