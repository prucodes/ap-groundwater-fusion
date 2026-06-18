#!/usr/bin/env python3
"""Standardize one selected prototype AP mandal/subdistrict boundary file."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Iterable


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/boundaries/ap_mandal_boundaries_prototype.geojson"
DISTRICT_CANDIDATES = ["district_name", "district", "dist_name", "dt_name", "dtname", "dist"]
MANDAL_CANDIDATES = [
    "mandal_name",
    "mandal",
    "subdistrict",
    "sub_district",
    "subdistrict_name",
    "tehsil",
    "taluk",
    "taluka",
    "sdtname",
]


def normalize_name(value: object) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"\s+", " ", text.strip())
    return text.upper()


def find_field(columns: Iterable[str], candidates: list[str]) -> str | None:
    lowered_to_original = {column.lower(): column for column in columns}
    for candidate in candidates:
        if candidate.lower() in lowered_to_original:
            return lowered_to_original[candidate.lower()]

    for column in columns:
        lowered = column.lower()
        if any(candidate.lower() in lowered for candidate in candidates):
            return column
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-path", type=Path, required=True)
    parser.add_argument("--district-field", default=None)
    parser.add_argument("--mandal-field", default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.input_path.exists():
        raise SystemExit(f"Input boundary file does not exist: {args.input_path}")

    import geopandas as gpd

    gdf = gpd.read_file(args.input_path)
    if gdf.empty:
        raise SystemExit("Input boundary file has no features.")
    if "geometry" not in gdf.columns:
        raise SystemExit("Input boundary file has no geometry column.")

    district_field = args.district_field or find_field(gdf.columns, DISTRICT_CANDIDATES)
    mandal_field = args.mandal_field or find_field(gdf.columns, MANDAL_CANDIDATES)

    if not mandal_field:
        raise SystemExit(
            "Could not identify a mandal/subdistrict field. Pass --mandal-field explicitly after inspecting the source."
        )
    if not district_field:
        raise SystemExit("Could not identify a district field. Pass --district-field explicitly after inspecting the source.")

    gdf = gdf[gdf.geometry.notna()].copy()
    if gdf.empty:
        raise SystemExit("Input boundary file has no non-empty geometries.")

    invalid_mask = ~gdf.geometry.is_valid
    if invalid_mask.any():
        gdf.loc[invalid_mask, "geometry"] = gdf.loc[invalid_mask, "geometry"].buffer(0)

    if gdf.crs is None:
        print("Input CRS is missing; assuming EPSG:4326 for prototype processing.")
        gdf = gdf.set_crs("EPSG:4326")
    else:
        gdf = gdf.to_crs("EPSG:4326")

    gdf["district_name"] = gdf[district_field].map(normalize_name)
    gdf["mandal_name"] = gdf[mandal_field].map(normalize_name)
    gdf["boundary_source"] = "public_prototype"
    gdf["official_flag"] = False

    output_columns = ["district_name", "mandal_name", "boundary_source", "official_flag", "geometry"]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    gdf[output_columns].to_file(args.output, driver="GeoJSON")
    print(f"Wrote standardized prototype boundaries to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

