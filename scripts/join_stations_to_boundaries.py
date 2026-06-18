#!/usr/bin/env python3
"""Spatially join standardized groundwater stations to prototype boundaries."""

from __future__ import annotations

import argparse
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_STATIONS = REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv"
DEFAULT_BOUNDARIES = REPO_ROOT / "data/processed/boundaries/ap_mandal_boundaries_prototype.geojson"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/groundwater/stations_joined_to_boundaries.csv"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stations", type=Path, default=DEFAULT_STATIONS)
    parser.add_argument("--boundaries", type=Path, default=DEFAULT_BOUNDARIES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def mismatch_note(row: object) -> str:
    station_mandal = str(getattr(row, "station_mandal_name", "") or "").strip().upper()
    boundary_mandal = str(getattr(row, "boundary_mandal_name", "") or "").strip().upper()
    if not boundary_mandal or boundary_mandal == "NAN":
        return "no containing prototype boundary found"
    if station_mandal and station_mandal != boundary_mandal:
        return "station mandal differs from prototype boundary mandal"
    return "station mandal agrees with prototype boundary mandal"


def main() -> int:
    args = parse_args()
    if not args.stations.exists():
        raise SystemExit(f"Standardized station file does not exist: {args.stations}")
    if not args.boundaries.exists():
        raise SystemExit(
            f"Prototype boundary file does not exist: {args.boundaries}. "
            "Run standardize_boundaries.py after adding a selected prototype boundary file."
        )

    import geopandas as gpd
    import pandas as pd

    stations = pd.read_csv(args.stations)
    required_station_columns = {"latitude", "longitude", "district_name"}
    missing = sorted(required_station_columns - set(stations.columns))
    if missing:
        raise SystemExit(f"Station file is missing required columns: {', '.join(missing)}")
    if "mandal_name" not in stations.columns:
        stations["mandal_name"] = ""

    stations["station_district_name"] = stations["district_name"]
    stations["station_mandal_name"] = stations["mandal_name"]
    station_gdf = gpd.GeoDataFrame(
        stations,
        geometry=gpd.points_from_xy(stations["longitude"], stations["latitude"]),
        crs="EPSG:4326",
    )

    boundaries = gpd.read_file(args.boundaries).to_crs("EPSG:4326")
    required_boundary_columns = {"district_name", "mandal_name", "boundary_source", "official_flag"}
    missing_boundary = sorted(required_boundary_columns - set(boundaries.columns))
    if missing_boundary:
        raise SystemExit(f"Boundary file is missing required columns: {', '.join(missing_boundary)}")

    boundaries = boundaries.rename(
        columns={
            "district_name": "boundary_district_name",
            "mandal_name": "boundary_mandal_name",
            "official_flag": "boundary_official_flag",
        }
    )
    join_columns = [
        "boundary_district_name",
        "boundary_mandal_name",
        "boundary_source",
        "boundary_official_flag",
        "geometry",
    ]
    joined = gpd.sjoin(station_gdf, boundaries[join_columns], how="left", predicate="within")

    joined["district_name"] = joined["boundary_district_name"].fillna(joined["station_district_name"])
    joined["mandal_name"] = joined["boundary_mandal_name"].fillna(joined["station_mandal_name"])
    joined["boundary_source"] = joined["boundary_source"].fillna("none")
    joined["boundary_official_flag"] = joined["boundary_official_flag"].fillna(False).astype(bool)
    joined["boundary_join_notes"] = [mismatch_note(row) for row in joined.itertuples(index=False)]

    output_df = pd.DataFrame(joined.drop(columns=["geometry", "index_right"], errors="ignore"))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output_df.to_csv(args.output, index=False)
    print(f"Wrote station-boundary join output to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
