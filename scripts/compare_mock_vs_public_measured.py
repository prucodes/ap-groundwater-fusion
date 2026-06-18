#!/usr/bin/env python3
"""Compare mock APWRIMS-like coverage with public measured groundwater coverage."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MOCK = REPO_ROOT / "data/mock/apwrims/mock_groundwater_readings.csv"
DEFAULT_PUBLIC = REPO_ROOT / "data/processed/groundwater/standardized_public_groundwater_readings.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/groundwater/mock_vs_public_measured_comparison.csv"
OUTPUT_COLUMNS = [
    "dataset",
    "status",
    "district_name",
    "mandal_name",
    "station_count",
    "date_range",
    "coordinate_available_count",
    "mbgl_min",
    "mbgl_mean",
    "mbgl_max",
    "notes",
]


def summarize(path: Path, dataset: str) -> list[dict[str, str]]:
    import pandas as pd

    if not path.exists():
        return [
            {
                "dataset": dataset,
                "status": "absent",
                "district_name": "",
                "mandal_name": "",
                "station_count": "0",
                "date_range": "",
                "coordinate_available_count": "0",
                "mbgl_min": "",
                "mbgl_mean": "",
                "mbgl_max": "",
                "notes": f"{path} not available",
            }
        ]
    df = pd.read_csv(path)
    if df.empty:
        return []
    df["reading_date"] = pd.to_datetime(df["reading_date"], errors="coerce")
    df["groundwater_level_mbgl"] = pd.to_numeric(df["groundwater_level_mbgl"], errors="coerce")
    df["coord_ok"] = pd.to_numeric(df["latitude"], errors="coerce").notna() & pd.to_numeric(df["longitude"], errors="coerce").notna()
    rows = []
    for (district, mandal), group in df.groupby(["district_name", "mandal_name"], dropna=False):
        date_min = group["reading_date"].min()
        date_max = group["reading_date"].max()
        date_range = "" if pd.isna(date_min) else f"{date_min.date()} to {date_max.date()}"
        rows.append(
            {
                "dataset": dataset,
                "status": "available",
                "district_name": district,
                "mandal_name": mandal,
                "station_count": str(group["station_id"].nunique()),
                "date_range": date_range,
                "coordinate_available_count": str(int(group["coord_ok"].sum())),
                "mbgl_min": "" if group["groundwater_level_mbgl"].dropna().empty else str(round(group["groundwater_level_mbgl"].min(), 2)),
                "mbgl_mean": "" if group["groundwater_level_mbgl"].dropna().empty else str(round(group["groundwater_level_mbgl"].mean(), 2)),
                "mbgl_max": "" if group["groundwater_level_mbgl"].dropna().empty else str(round(group["groundwater_level_mbgl"].max(), 2)),
                "notes": "Coverage comparison only; mock and public stations are not assumed equivalent.",
            }
        )
    return rows


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mock", type=Path, default=DEFAULT_MOCK)
    parser.add_argument("--public", type=Path, default=DEFAULT_PUBLIC)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = summarize(args.mock, "mock") + summarize(args.public, "measured_public")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote mock vs public measured comparison to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

