#!/usr/bin/env python3
"""Export mandal fusion outputs as CSV and JSON for future dashboard/API use."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "data/processed/fusion/mandal_groundwater_fusion_v0.csv"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "data/processed/fusion"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def read_rows(input_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with input_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        return list(reader.fieldnames or []), rows


def write_csv(fieldnames: list[str], rows: list[dict[str, str]], output_path: Path) -> None:
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    args = parse_args()
    if not args.input.exists():
        raise SystemExit(f"Fusion input does not exist: {args.input}")

    fieldnames, rows = read_rows(args.input)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_output = args.output_dir / "mandal_groundwater_fusion_v0_export.csv"
    json_output = args.output_dir / "mandal_groundwater_fusion_v0_records.json"

    write_csv(fieldnames, rows, csv_output)
    with json_output.open("w", encoding="utf-8") as handle:
        json.dump(rows, handle, indent=2)
        handle.write("\n")

    print(f"Wrote export CSV to {csv_output}")
    print(f"Wrote export JSON to {json_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

