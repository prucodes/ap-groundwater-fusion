#!/usr/bin/env python3
"""Sample NASA/NDMC GRACE-DA percentile rasters at station points."""

from __future__ import annotations

import argparse
import csv
from datetime import date
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_POINTS = REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv"
DEFAULT_RASTER_DIR = REPO_ROOT / "data/raw/nasa/grace_da/current"
DEFAULT_GWS_RASTER = DEFAULT_RASTER_DIR / "gws_perc_025deg_GL.tif"
DEFAULT_RTZSM_RASTER = DEFAULT_RASTER_DIR / "rtzsm_perc_025deg_GL.tif"
DEFAULT_SFSM_RASTER = DEFAULT_RASTER_DIR / "sfsm_perc_025deg_GL.tif"
DEFAULT_DOWNLOAD_MANIFEST = DEFAULT_RASTER_DIR / "download_manifest.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/satellite/satellite_samples_at_station_points.csv"
OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "latitude",
    "longitude",
    "groundwater_percentile",
    "rootzone_percentile",
    "surface_percentile",
    "satellite_sample_date_or_fetch_date",
    "gws_source_file",
    "rtzsm_source_file",
    "sfsm_source_file",
    "data_label",
    "notes",
]


def read_fetch_date(manifest_path: Path) -> str:
    if not manifest_path.exists():
        return str(date.today())
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        dates = sorted({row.get("fetch_date", "") for row in reader if row.get("fetch_date")})
    return dates[-1] if dates else str(date.today())


def validate_required_columns(rows: list[dict[str, Any]]) -> None:
    required = ["station_id", "station_name", "district_name", "mandal_name", "latitude", "longitude"]
    missing = [column for column in required if rows and column not in rows[0]]
    if missing:
        raise SystemExit(f"Point CSV is missing required columns: {', '.join(missing)}")


def read_points(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = [dict(row) for row in reader]
    if not rows:
        raise SystemExit(f"Point CSV has no rows: {path}")
    validate_required_columns(rows)
    return rows


def percentile_or_none(value: float | int | None) -> float | None:
    if value is None or value != value:
        return None
    value_float = float(value)
    if value_float < 0 or value_float > 100:
        return None
    return round(value_float, 2)


def sample_raster_values(raster_path: Path, points: list[dict[str, Any]]) -> list[float | None]:
    import rasterio
    from rasterio.warp import transform

    with rasterio.open(raster_path) as dataset:
        longitudes = [float(row["longitude"]) for row in points]
        latitudes = [float(row["latitude"]) for row in points]
        if dataset.crs and str(dataset.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
            xs, ys = transform("EPSG:4326", dataset.crs, longitudes, latitudes)
        else:
            xs, ys = longitudes, latitudes

        sampled: list[float | None] = []
        for values in dataset.sample(list(zip(xs, ys)), masked=True):
            if len(values) == 0:
                sampled.append(None)
                continue
            value = values[0]
            if hasattr(value, "mask") and bool(value.mask):
                sampled.append(None)
                continue
            sampled.append(percentile_or_none(float(value)))
        return sampled


def note_for_values(values: list[float | None]) -> str:
    if all(value is None for value in values):
        return "all satellite/model percentile samples are nodata or outside valid 0-100 range"
    if any(value is None for value in values):
        return "one or more satellite/model percentile samples are nodata or outside valid 0-100 range"
    return "sampled from NASA/NDMC GRACE-DA percentile rasters; values are not groundwater depth"


def write_output(rows: list[dict[str, Any]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--points", type=Path, default=DEFAULT_POINTS)
    parser.add_argument("--gws-raster", type=Path, default=DEFAULT_GWS_RASTER)
    parser.add_argument("--rtzsm-raster", type=Path, default=DEFAULT_RTZSM_RASTER)
    parser.add_argument("--sfsm-raster", type=Path, default=DEFAULT_SFSM_RASTER)
    parser.add_argument("--download-manifest", type=Path, default=DEFAULT_DOWNLOAD_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    for raster_path in [args.gws_raster, args.rtzsm_raster, args.sfsm_raster]:
        if not raster_path.exists():
            raise SystemExit(f"NASA/NDMC raster does not exist: {raster_path}. Run download_nasa_grace_da.py first.")
    if not args.points.exists():
        raise SystemExit(f"Point CSV does not exist: {args.points}")

    points = read_points(args.points)
    gws_values = sample_raster_values(args.gws_raster, points)
    rtzsm_values = sample_raster_values(args.rtzsm_raster, points)
    sfsm_values = sample_raster_values(args.sfsm_raster, points)
    sample_date = read_fetch_date(args.download_manifest)

    output_rows: list[dict[str, Any]] = []
    for index, point in enumerate(points):
        values = [gws_values[index], rtzsm_values[index], sfsm_values[index]]
        output_rows.append(
            {
                "station_id": point["station_id"],
                "station_name": point["station_name"],
                "district_name": point["district_name"],
                "mandal_name": point["mandal_name"],
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "groundwater_percentile": gws_values[index],
                "rootzone_percentile": rtzsm_values[index],
                "surface_percentile": sfsm_values[index],
                "satellite_sample_date_or_fetch_date": sample_date,
                "gws_source_file": str(args.gws_raster.relative_to(REPO_ROOT)),
                "rtzsm_source_file": str(args.rtzsm_raster.relative_to(REPO_ROOT)),
                "sfsm_source_file": str(args.sfsm_raster.relative_to(REPO_ROOT)),
                "data_label": "satellite-model",
                "notes": note_for_values(values),
            }
        )

    write_output(output_rows, args.output)
    print(f"Wrote NASA/NDMC satellite samples to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

