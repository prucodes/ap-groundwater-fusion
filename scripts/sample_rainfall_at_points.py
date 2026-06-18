#!/usr/bin/env python3
"""Sample CHIRPS monthly rainfall (mm) at station points.

Output is a recharge/supply context signal in millimetres. It is not groundwater
depth and carries no official APWRIMS claim. Runs independently of the GRACE
sampler; if the CHIRPS raster is absent it exits 0 without writing (graceful).
"""

from __future__ import annotations

import argparse
import csv
from datetime import date
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_POINTS = REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv"
DEFAULT_RASTER = REPO_ROOT / "data/raw/chirps/current/chirps_monthly_latest.tif"
DEFAULT_MANIFEST = REPO_ROOT / "data/raw/chirps/current/download_manifest.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/satellite/rainfall_samples_at_station_points.csv"

OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "latitude",
    "longitude",
    "rainfall_mm",
    "rainfall_period",
    "source_file",
    "data_label",
    "notes",
]


def read_period(manifest_path: Path) -> str:
    if not manifest_path.exists():
        return ""
    with manifest_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("data_period"):
                return row["data_period"]
    return ""


def read_points(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [dict(row) for row in csv.DictReader(handle)]
    if not rows:
        raise SystemExit(f"Point CSV has no rows: {path}")
    return rows


def rainfall_or_none(value: float | None) -> float | None:
    if value is None or value != value:
        return None
    v = float(value)
    if v < 0:  # CHIRPS nodata is -9999
        return None
    return round(v, 1)


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
            sampled.append(rainfall_or_none(float(value)))
        return sampled


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--points", type=Path, default=DEFAULT_POINTS)
    parser.add_argument("--raster", type=Path, default=DEFAULT_RASTER)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.raster.exists():
        print(f"CHIRPS raster not found at {args.raster}; skipping rainfall sampling (run fetch_chirps_rainfall.py).")
        return 0
    if not args.points.exists():
        raise SystemExit(f"Point CSV does not exist: {args.points}")

    points = read_points(args.points)
    values = sample_raster_values(args.raster, points)
    period = read_period(args.manifest)

    rows: list[dict[str, Any]] = []
    for index, point in enumerate(points):
        mm = values[index]
        rows.append(
            {
                "station_id": point["station_id"],
                "station_name": point["station_name"],
                "district_name": point["district_name"],
                "mandal_name": point["mandal_name"],
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "rainfall_mm": mm,
                "rainfall_period": period,
                "source_file": str(args.raster.relative_to(REPO_ROOT)),
                "data_label": "satellite-gauge-rainfall",
                "notes": "CHIRPS monthly rainfall mm; recharge context only; not groundwater depth"
                if mm is not None
                else "CHIRPS sample is nodata at this point",
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote CHIRPS rainfall samples ({period or 'unknown period'}) to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
