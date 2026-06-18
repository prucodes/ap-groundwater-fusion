#!/usr/bin/env python3
"""Inventory prototype boundary files without treating them as official."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any, Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SATISH_DIR = REPO_ROOT / "data/raw/boundaries/satishvmadala_ap_open_data"
DEFAULT_DATTA_DIR = REPO_ROOT / "data/raw/boundaries/datta07_indian_shapefiles"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/boundaries/boundary_inventory.csv"
BOUNDARY_EXTENSIONS = {".geojson", ".json", ".shp"}
OUTPUT_COLUMNS = [
    "source_root",
    "file_path",
    "file_type",
    "geometry_type",
    "crs",
    "feature_count",
    "likely_admin_level",
    "key_name_fields",
    "notes",
]


def iter_boundary_files(source_dirs: Iterable[Path]) -> Iterable[tuple[Path, Path]]:
    for source_dir in source_dirs:
        if not source_dir.exists():
            continue
        for path in sorted(source_dir.rglob("*")):
            if path.is_file() and path.suffix.lower() in BOUNDARY_EXTENSIONS:
                yield source_dir, path


def likely_admin_level(path: Path, fields: Iterable[str]) -> str:
    text = " ".join([path.name.lower(), *[field.lower() for field in fields]])
    if any(token in text for token in ["mandal", "subdistrict", "sub_district", "tehsil", "taluk"]):
        return "possible_mandal_or_subdistrict"
    if "district" in text:
        return "possible_district"
    if any(token in text for token in ["state", "andhra", "ap"]):
        return "possible_state_or_ap"
    return "unknown"


def key_name_fields(fields: Iterable[str]) -> list[str]:
    markers = ["name", "district", "mandal", "village", "subdistrict", "tehsil", "taluk", "dt", "dist"]
    selected = []
    for field in fields:
        lowered = field.lower()
        if any(marker in lowered for marker in markers):
            selected.append(field)
    return selected[:20]


def summarize_geojson(path: Path) -> dict[str, str]:
    with path.open("r", encoding="utf-8") as handle:
        payload: dict[str, Any] = json.load(handle)

    features = payload.get("features", [])
    fields: set[str] = set()
    geometry_types: set[str] = set()
    for feature in features:
        properties = feature.get("properties") or {}
        fields.update(str(key) for key in properties.keys())
        geometry = feature.get("geometry") or {}
        geometry_type = geometry.get("type")
        if geometry_type:
            geometry_types.add(str(geometry_type))

    crs_payload = payload.get("crs") or {}
    crs = ""
    if isinstance(crs_payload, dict):
        crs = str(crs_payload.get("properties", {}).get("name", ""))

    fields_sorted = sorted(fields)
    return {
        "geometry_type": ";".join(sorted(geometry_types)) or "unknown",
        "crs": crs or "unknown",
        "feature_count": str(len(features)),
        "likely_admin_level": likely_admin_level(path, fields_sorted),
        "key_name_fields": ";".join(key_name_fields(fields_sorted)),
        "notes": "JSON/GeoJSON inspected without officiality assumption",
    }


def summarize_with_geopandas(path: Path) -> dict[str, str]:
    import geopandas as gpd

    gdf = gpd.read_file(path)
    geometry_types = sorted(str(value) for value in gdf.geom_type.dropna().unique())
    fields = [str(column) for column in gdf.columns if column != "geometry"]
    return {
        "geometry_type": ";".join(geometry_types) or "unknown",
        "crs": str(gdf.crs) if gdf.crs else "unknown",
        "feature_count": str(len(gdf)),
        "likely_admin_level": likely_admin_level(path, fields),
        "key_name_fields": ";".join(key_name_fields(fields)),
        "notes": "Inspected with GeoPandas; not assumed official or mandal-level",
    }


def summarize_file(path: Path) -> dict[str, str]:
    if path.suffix.lower() in {".json", ".geojson"}:
        try:
            return summarize_geojson(path)
        except Exception as json_error:
            try:
                summary = summarize_with_geopandas(path)
                summary["notes"] = f"GeoPandas fallback after JSON parse issue: {json_error}"
                return summary
            except Exception as geo_error:
                return {
                    "geometry_type": "unknown",
                    "crs": "unknown",
                    "feature_count": "unknown",
                    "likely_admin_level": "unknown",
                    "key_name_fields": "",
                    "notes": f"Could not inspect file: {geo_error}",
                }

    try:
        return summarize_with_geopandas(path)
    except Exception as error:
        return {
            "geometry_type": "unknown",
            "crs": "unknown",
            "feature_count": "unknown",
            "likely_admin_level": "unknown",
            "key_name_fields": "",
            "notes": f"Could not inspect shapefile; install geospatial dependencies or check file: {error}",
        }


def build_inventory(source_dirs: list[Path]) -> list[dict[str, str]]:
    rows = []
    for source_root, path in iter_boundary_files(source_dirs):
        summary = summarize_file(path)
        rows.append(
            {
                "source_root": str(source_root.relative_to(REPO_ROOT)),
                "file_path": str(path.relative_to(REPO_ROOT)),
                "file_type": path.suffix.lower().lstrip("."),
                **summary,
            }
        )
    return rows


def write_inventory(rows: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--satish-dir", type=Path, default=DEFAULT_SATISH_DIR)
    parser.add_argument("--datta-dir", type=Path, default=DEFAULT_DATTA_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = build_inventory([args.satish_dir, args.datta_dir])
    write_inventory(rows, args.output)
    print(f"Wrote {len(rows)} boundary inventory rows to {args.output}")
    if not rows:
        print("No prototype boundary files found. This is expected before public boundary data is added.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

