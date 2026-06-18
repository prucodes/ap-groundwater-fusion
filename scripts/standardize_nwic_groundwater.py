#!/usr/bin/env python3
"""Standardize NWIC/AP public measured groundwater readings."""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = REPO_ROOT / "data/raw/nwic/andhra_pradesh_groundwater"
FETCH_MANIFEST = RAW_DIR / "fetch_manifest.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/groundwater/standardized_public_groundwater_readings.csv"
SUPPORTED_EXTENSIONS = {".csv", ".json", ".xls", ".xlsx"}
RESOURCE_ID = "305c8531-759d-4fb9-abf6-7cf4341ec318"
OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "village_name",
    "latitude",
    "longitude",
    "reading_date",
    "groundwater_level_mbgl",
    "groundwater_level_unit",
    "depth_reference",
    "measurement_parameter",
    "source_type",
    "source_system",
    "source_resource_id",
    "measured_data_label",
    "data_label",
    "observation_method",
    "quality_flag",
    "validation_notes",
    "source_file",
    "source_url",
    "source_license",
    "fetch_status",
    "raw_station_id",
    "raw_station_name",
    "raw_district_name",
    "raw_groundwater_level_field",
    "raw_date_field",
]


def normalize_name(value: object) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value).strip()).upper()


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def candidate_field(columns: Iterable[str], candidates: list[str]) -> str | None:
    lowered = {column.lower().replace(" ", "_"): column for column in columns}
    for candidate in candidates:
        if candidate in lowered:
            return lowered[candidate]
    for column in columns:
        key = column.lower().replace(" ", "_")
        if any(candidate in key for candidate in candidates):
            return column
    return None


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


def read_fetch_metadata(fetch_manifest: Path) -> dict[str, str]:
    if not fetch_manifest.exists():
        return {
            "source_url": "",
            "license": "Unknown",
            "fetch_status": "unknown",
        }
    with fetch_manifest.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        return {"source_url": "", "license": "Unknown", "fetch_status": "unknown"}
    row = rows[0]
    return {
        "source_url": row.get("source_url", ""),
        "license": row.get("license", "Unknown"),
        "fetch_status": row.get("fetch_status", "unknown"),
    }


def require_field(name: str, value: str | None, columns: list[str]) -> str:
    if not value:
        raise SystemExit(f"Could not identify required NWIC field: {name}. Available columns: {', '.join(columns)}")
    return value


def validation_notes(row: object) -> str:
    notes: list[str] = []
    lat = getattr(row, "latitude")
    lon = getattr(row, "longitude")
    mbgl = getattr(row, "groundwater_level_mbgl")
    if lat != lat or not (-90 <= lat <= 90):
        notes.append("invalid latitude")
    if lon != lon or not (-180 <= lon <= 180):
        notes.append("invalid longitude")
    if mbgl != mbgl:
        notes.append("invalid groundwater_level_mbgl")
    elif mbgl < 0 or mbgl > 100:
        notes.append("groundwater_level_mbgl outside default plausible 0-100 review range")
    if not notes:
        notes.append("schema checks passed")
    return "; ".join(notes)


def standardize_file(path: Path, args: argparse.Namespace, metadata: dict[str, str]):
    import pandas as pd

    df = load_table(path)
    columns = [str(column) for column in df.columns]

    station_id_field = args.station_id_field or candidate_field(columns, ["station_id", "site_id", "well_id", "stationcode", "station_code"])
    station_name_field = args.station_name_field or candidate_field(columns, ["station_name", "site_name", "well_name", "location", "station"])
    district_field = args.district_field or candidate_field(columns, ["district_name", "district", "dist"])
    mandal_field = args.mandal_field or candidate_field(columns, ["mandal_name", "mandal", "subdistrict", "sub_district", "taluk", "tehsil"])
    village_field = args.village_field or candidate_field(columns, ["village_name", "village"])
    lat_field = args.latitude_field or candidate_field(columns, ["latitude", "lat"])
    lon_field = args.longitude_field or candidate_field(columns, ["longitude", "long", "lon"])
    date_field = args.date_field or candidate_field(columns, ["reading_date", "observation_date", "date", "datetime"])
    depth_field = args.depth_field or candidate_field(columns, ["groundwater_level_mbgl", "water_level", "ground_water_level", "depth_to_water", "depth", "level"])

    station_identity_field = station_id_field or station_name_field
    require_field("station_id or station_name", station_identity_field, columns)
    require_field("reading_date", date_field, columns)
    require_field("groundwater_level_mbgl", depth_field, columns)
    require_field("latitude", lat_field, columns)
    require_field("longitude", lon_field, columns)

    output = df.copy()
    output["raw_station_id"] = output[station_id_field] if station_id_field else ""
    output["raw_station_name"] = output[station_name_field] if station_name_field else output[station_identity_field]
    output["raw_district_name"] = output[district_field] if district_field else ""
    output["raw_groundwater_level_field"] = depth_field
    output["raw_date_field"] = date_field

    output["station_id"] = output[station_id_field].astype(str) if station_id_field else output[station_name_field].astype(str)
    output["station_name"] = output[station_name_field].astype(str) if station_name_field else output["station_id"]
    output["district_name"] = output[district_field].map(normalize_name) if district_field else ""
    output["mandal_name"] = output[mandal_field].map(normalize_name) if mandal_field else ""
    output["village_name"] = output[village_field].map(normalize_name) if village_field else ""
    output["latitude"] = pd.to_numeric(output[lat_field], errors="coerce")
    output["longitude"] = pd.to_numeric(output[lon_field], errors="coerce")
    output["reading_date"] = pd.to_datetime(output[date_field], errors="coerce").dt.date.astype("string")
    output["groundwater_level_mbgl"] = pd.to_numeric(output[depth_field], errors="coerce")
    output["groundwater_level_unit"] = "mbgl"
    output["depth_reference"] = "meters_below_ground_level"
    output["measurement_parameter"] = "depth_to_water"
    output["source_type"] = "public_measured"
    output["source_system"] = args.source_system
    output["source_resource_id"] = RESOURCE_ID
    output["measured_data_label"] = "measured_public"
    output["data_label"] = "measured_public"
    output["observation_method"] = args.observation_method
    output["quality_flag"] = "review"
    output["source_file"] = display_path(path)
    output["source_url"] = metadata["source_url"]
    output["source_license"] = metadata["license"]
    output["fetch_status"] = metadata["fetch_status"]
    output["validation_notes"] = [validation_notes(row) for row in output.itertuples(index=False)]
    output.loc[output["validation_notes"] == "schema checks passed", "quality_flag"] = "ok"

    output = output.sort_values(
        by=["source_resource_id", "station_id", "reading_date", "quality_flag"],
        ascending=[True, True, True, True],
    )
    output = output.drop_duplicates(subset=["source_resource_id", "station_id", "reading_date"], keep="first")
    return output[OUTPUT_COLUMNS]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-dir", type=Path, default=RAW_DIR)
    parser.add_argument("--fetch-manifest", type=Path, default=FETCH_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--station-id-field")
    parser.add_argument("--station-name-field")
    parser.add_argument("--district-field")
    parser.add_argument("--mandal-field")
    parser.add_argument("--village-field")
    parser.add_argument("--latitude-field")
    parser.add_argument("--longitude-field")
    parser.add_argument("--date-field")
    parser.add_argument("--depth-field")
    parser.add_argument("--source-system", default="NWIC National Water Data Portal")
    parser.add_argument("--observation-method", default="manual")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = raw_files(args.raw_dir)
    if not files:
        raise SystemExit(
            "No NWIC public measured groundwater file is available. Run fetch_nwic_groundwater.py; "
            "if it reports manual_required, manually download a stable CSV/XLS/XLSX/JSON file into "
            "data/raw/nwic/andhra_pradesh_groundwater/."
        )

    import pandas as pd

    metadata = read_fetch_metadata(args.fetch_manifest)
    frames = [standardize_file(path, args, metadata) for path in files]
    output = pd.concat(frames, ignore_index=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"Wrote standardized public measured groundwater readings to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
