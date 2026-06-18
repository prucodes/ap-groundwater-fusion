#!/usr/bin/env python3
"""Inspect downloaded NASA/NDMC GRACE-DA percentile GeoTIFFs."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RASTER_DIR = REPO_ROOT / "data/raw/nasa/grace_da/current"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/satellite/nasa_raster_inventory.csv"
DEFAULT_RASTERS = [
    DEFAULT_RASTER_DIR / "gws_perc_025deg_GL.tif",
    DEFAULT_RASTER_DIR / "rtzsm_perc_025deg_GL.tif",
    DEFAULT_RASTER_DIR / "sfsm_perc_025deg_GL.tif",
]
OUTPUT_COLUMNS = [
    "raster_name",
    "local_path",
    "crs",
    "bounds",
    "width",
    "height",
    "resolution",
    "nodata",
    "dtype",
    "min_value",
    "max_value",
    "notes",
]


def inspect_raster(path: Path) -> dict[str, str]:
    import numpy as np
    import rasterio

    with rasterio.open(path) as dataset:
        band = dataset.read(1, masked=True)
        compressed = band.compressed()
        if compressed.size:
            min_value = float(np.nanmin(compressed))
            max_value = float(np.nanmax(compressed))
        else:
            min_value = float("nan")
            max_value = float("nan")

        notes: list[str] = ["satellite-model percentile raster; not groundwater depth"]
        if compressed.size and (min_value < 0 or max_value > 100):
            notes.append("warning: percentile values outside 0-100 after nodata masking")
        else:
            notes.append("percentile range generally within 0-100")

        return {
            "raster_name": path.name,
            "local_path": str(path.relative_to(REPO_ROOT)),
            "crs": str(dataset.crs) if dataset.crs else "unknown",
            "bounds": ",".join(str(round(value, 8)) for value in dataset.bounds),
            "width": str(dataset.width),
            "height": str(dataset.height),
            "resolution": ",".join(str(value) for value in dataset.res),
            "nodata": "" if dataset.nodata is None else str(dataset.nodata),
            "dtype": str(dataset.dtypes[0]),
            "min_value": "" if min_value != min_value else str(round(min_value, 4)),
            "max_value": "" if max_value != max_value else str(round(max_value, 4)),
            "notes": "; ".join(notes),
        }


def write_inventory(rows: list[dict[str, str]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raster", type=Path, action="append", default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    raster_paths = args.raster if args.raster else DEFAULT_RASTERS
    missing = [path for path in raster_paths if not path.exists()]
    if missing:
        raise SystemExit(
            "Missing NASA/NDMC raster files:\n"
            + "\n".join(f"- {path}" for path in missing)
            + "\nRun scripts/download_nasa_grace_da.py first."
        )

    rows = [inspect_raster(path) for path in raster_paths]
    write_inventory(rows, args.output)
    print(f"Wrote NASA raster inventory to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

