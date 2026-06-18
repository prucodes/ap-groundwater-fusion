#!/usr/bin/env python3
"""Generate Phase 1D public measured groundwater evidence reports."""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from datetime import date
from pathlib import Path
from statistics import mean


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FETCH_MANIFEST = REPO_ROOT / "data/raw/nwic/andhra_pradesh_groundwater/fetch_manifest.csv"
DEFAULT_PUBLIC = REPO_ROOT / "data/processed/groundwater/standardized_public_groundwater_readings.csv"
DEFAULT_JOINED_PUBLIC = REPO_ROOT / "data/processed/groundwater/stations_joined_public_measured_to_boundaries.csv"
DEFAULT_FUSION = REPO_ROOT / "data/processed/fusion/mandal_groundwater_fusion_v0.csv"
DEFAULT_SATELLITE = REPO_ROOT / "data/processed/satellite/satellite_samples_at_station_points.csv"
DEFAULT_REPORT_DIR = REPO_ROOT / "reports"


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_float(value: str | None) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_date(value: str | None):
    import pandas as pd

    return pd.to_datetime(value, errors="coerce")


def table(rows: list[dict[str, object]], columns: list[str]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(column, "")) for column in columns) + " |")
    return "\n".join(lines)


def stats(values: list[float]) -> str:
    if not values:
        return ""
    return f"min={round(min(values), 2)}, mean={round(mean(values), 2)}, max={round(max(values), 2)}"


def write_public_summary(fetch_rows: list[dict[str, str]], public_rows: list[dict[str, str]], joined_rows: list[dict[str, str]], report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    fetch = fetch_rows[0] if fetch_rows else {}
    dates = [parse_date(row.get("reading_date")) for row in public_rows]
    valid_dates = [value for value in dates if value == value]
    mbgl_values = [parse_float(row.get("groundwater_level_mbgl")) for row in public_rows]
    mbgl_numeric = [value for value in mbgl_values if value is not None]
    missing_coords = sum(1 for row in public_rows if parse_float(row.get("latitude")) is None or parse_float(row.get("longitude")) is None)
    invalid_or_review = sum(1 for row in public_rows if "invalid" in row.get("validation_notes", "").lower() or "outside default plausible" in row.get("validation_notes", "").lower())
    station_dates = [(row.get("station_id", ""), row.get("reading_date", "")) for row in public_rows]
    duplicate_count = len(station_dates) - len(set(station_dates))
    mandal_available = sum(1 for row in public_rows if row.get("mandal_name", "").strip())
    spatial_joined = sum(1 for row in joined_rows if row.get("boundary_mandal_name", "").strip())

    lines = [
        "# Phase 1D Public Measured Data Summary",
        "",
        f"- Source URL/resource: {fetch.get('source_url', '')}",
        f"- Resource ID: {fetch.get('source_resource_id', '')}",
        f"- Fetch mode/status: {fetch.get('fetch_status', 'not_run')}",
        f"- Rows downloaded/standardized: {len(public_rows)}",
        f"- Station count: {len({row.get('station_id', '') for row in public_rows if row.get('station_id')})}",
        f"- District count: {len({row.get('district_name', '') for row in public_rows if row.get('district_name')})}",
        f"- Mandal names available: {mandal_available}",
        f"- Mandals spatially joined: {spatial_joined}",
        f"- Date range: {'' if not valid_dates else str(min(valid_dates).date()) + ' to ' + str(max(valid_dates).date())}",
        f"- Latest reading date: {'' if not valid_dates else str(max(valid_dates).date())}",
        f"- Missing coordinate rows: {missing_coords}",
        f"- Invalid/plausibility warning rows: {invalid_or_review}",
        f"- Duplicate station/date rows: {duplicate_count}",
        f"- MBGL summary: {stats(mbgl_numeric)}",
        "",
        "## Caveat",
        "",
        "Public measured groundwater data is not official APWRIMS data. Official APWRIMS export remains required for government-grade validation.",
        "",
    ]
    (report_dir / "phase1d_public_measured_data_summary.md").write_text("\n".join(lines), encoding="utf-8")


def write_fusion_summary(fusion_rows: list[dict[str, str]], satellite_rows: list[dict[str, str]], report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    public_fused = [row for row in fusion_rows if "public measured" in row.get("data_quality_notes", "").lower()]
    confidence = Counter(row.get("confidence_label", "") for row in fusion_rows)
    status = Counter(row.get("status", "") for row in fusion_rows)
    verify = [row for row in fusion_rows if row.get("sensor_satellite_agreement") == "strong_disagreement" or row.get("confidence_label") == "Verify"]
    satellite_dates = sorted({row.get("satellite_sample_date_or_fetch_date", "") for row in satellite_rows if row.get("satellite_sample_date_or_fetch_date")})
    groundwater_dates = [parse_date(row.get("latest_sensor_date")) for row in fusion_rows]
    valid_groundwater_dates = [value for value in groundwater_dates if value == value]
    latest_groundwater = "" if not valid_groundwater_dates else str(max(valid_groundwater_dates).date())
    nasa_date = satellite_dates[-1] if satellite_dates else ""
    date_gap = ""
    if latest_groundwater and nasa_date:
        gap = (parse_date(nasa_date) - parse_date(latest_groundwater)).days
        date_gap = str(gap)

    lines = [
        "# Phase 1D Public Vs Satellite Fusion Summary",
        "",
        f"- Mandals fused using public measured data: {len(public_fused)}",
        f"- Latest groundwater reading date: {latest_groundwater}",
        f"- NASA sample/fetch date: {nasa_date}",
        f"- Date gap in days: {date_gap}",
        "",
        "## Confidence Distribution",
        "",
        table([{"confidence_label": key, "count": value} for key, value in confidence.items()], ["confidence_label", "count"]),
        "",
        "## Status Distribution",
        "",
        table([{"status": key, "count": value} for key, value in status.items()], ["status", "count"]),
        "",
        "## Verify/Mismatch Cases",
        "",
        table(
            [
                {
                    "district_name": row.get("district_name", ""),
                    "mandal_name": row.get("mandal_name", ""),
                    "agreement": row.get("sensor_satellite_agreement", ""),
                    "groundwater_percentile": row.get("groundwater_percentile", ""),
                    "median_groundwater_mbgl": row.get("median_groundwater_mbgl", ""),
                }
                for row in verify
            ],
            ["district_name", "mandal_name", "agreement", "groundwater_percentile", "median_groundwater_mbgl"],
        )
        if verify
        else "No verify/mismatch cases.",
        "",
        "## Caveat",
        "",
        "NASA values are satellite/model percentiles and not groundwater depth. Official APWRIMS data remains required.",
        "",
    ]
    (report_dir / "phase1d_public_vs_satellite_fusion_summary.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch-manifest", type=Path, default=DEFAULT_FETCH_MANIFEST)
    parser.add_argument("--public", type=Path, default=DEFAULT_PUBLIC)
    parser.add_argument("--joined-public", type=Path, default=DEFAULT_JOINED_PUBLIC)
    parser.add_argument("--fusion", type=Path, default=DEFAULT_FUSION)
    parser.add_argument("--satellite", type=Path, default=DEFAULT_SATELLITE)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    write_public_summary(read_csv(args.fetch_manifest), read_csv(args.public), read_csv(args.joined_public), args.report_dir)
    write_fusion_summary(read_csv(args.fusion), read_csv(args.satellite), args.report_dir)
    print(f"Wrote Phase 1D reports to {args.report_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

