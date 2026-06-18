#!/usr/bin/env python3
"""Validate and standardize APWRIMS-like groundwater readings."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "data/mock/apwrims/mock_groundwater_readings.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv"
REQUIRED_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "village_name",
    "latitude",
    "longitude",
    "reading_date",
    "groundwater_level_mbgl",
    "source_type",
    "source_system",
    "quality_flag",
    "data_label",
]


def normalize_name(value: object) -> str:
    text = "" if value is None else str(value)
    text = re.sub(r"\s+", " ", text.strip())
    return text.upper()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def validate_columns(columns: list[str]) -> None:
    missing = [column for column in REQUIRED_COLUMNS if column not in columns]
    if missing:
        raise SystemExit(f"Groundwater input is missing required columns: {', '.join(missing)}")


def validation_note(row: object) -> str:
    notes: list[str] = []
    latitude = getattr(row, "latitude")
    longitude = getattr(row, "longitude")
    mbgl = getattr(row, "groundwater_level_mbgl")
    reading_date = getattr(row, "reading_date")

    if latitude != latitude or not (-90 <= latitude <= 90):
        notes.append("invalid latitude")
    if longitude != longitude or not (-180 <= longitude <= 180):
        notes.append("invalid longitude")
    if mbgl != mbgl or mbgl < 0:
        notes.append("invalid groundwater_level_mbgl")
    if reading_date != reading_date:
        notes.append("invalid reading_date")
    if not notes:
        notes.append("schema checks passed")
    return "; ".join(notes)


def main() -> int:
    args = parse_args()
    if not args.input.exists():
        raise SystemExit(f"Groundwater input does not exist: {args.input}")

    import pandas as pd

    df = pd.read_csv(args.input)
    validate_columns(list(df.columns))

    df["reading_date"] = pd.to_datetime(df["reading_date"], errors="coerce").dt.date.astype("string")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df["groundwater_level_mbgl"] = pd.to_numeric(df["groundwater_level_mbgl"], errors="coerce")

    for column in ["district_name", "mandal_name", "village_name"]:
        df[f"{column}_standardized"] = df[column].map(normalize_name)

    df["validation_notes"] = [validation_note(row) for row in df.itertuples(index=False)]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.output, index=False)
    print(f"Wrote standardized groundwater readings to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

