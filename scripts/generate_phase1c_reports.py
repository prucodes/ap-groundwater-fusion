#!/usr/bin/env python3
"""Generate Phase 1C NASA sampling and fusion evidence reports."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from statistics import mean


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_NASA_MANIFEST = REPO_ROOT / "data/raw/nasa/grace_da/current/download_manifest.csv"
DEFAULT_RASTER_INVENTORY = REPO_ROOT / "data/processed/satellite/nasa_raster_inventory.csv"
DEFAULT_SAMPLES = REPO_ROOT / "data/processed/satellite/satellite_samples_at_station_points.csv"
DEFAULT_FUSION = REPO_ROOT / "data/processed/fusion/mandal_groundwater_fusion_v0.csv"
DEFAULT_REPORT_DIR = REPO_ROOT / "reports"
PERCENTILE_COLUMNS = ["groundwater_percentile", "rootzone_percentile", "surface_percentile"]


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise SystemExit(f"Required input is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def parse_float(value: str | None) -> float | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def stats(values: list[float | None]) -> dict[str, float | int | None]:
    numeric = [value for value in values if value is not None]
    if not numeric:
        return {"count": 0, "null_count": len(values), "min": None, "mean": None, "max": None}
    return {
        "count": len(numeric),
        "null_count": len(values) - len(numeric),
        "min": round(min(numeric), 2),
        "mean": round(mean(numeric), 2),
        "max": round(max(numeric), 2),
    }


def station_label(row: dict[str, str]) -> str:
    return f"{row.get('station_id', '')} - {row.get('station_name', '')} ({row.get('district_name', '')}/{row.get('mandal_name', '')})"


def top_groundwater(samples: list[dict[str, str]], reverse: bool) -> list[dict[str, str | float]]:
    rows = []
    for row in samples:
        value = parse_float(row.get("groundwater_percentile"))
        if value is None:
            continue
        rows.append({"station": station_label(row), "groundwater_percentile": round(value, 2)})
    return sorted(rows, key=lambda item: float(item["groundwater_percentile"]), reverse=reverse)[:5]


def markdown_table(rows: list[dict[str, object]], columns: list[str]) -> str:
    lines = ["| " + " | ".join(columns) + " |", "| " + " | ".join(["---"] * len(columns)) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(column, "")) for column in columns) + " |")
    return "\n".join(lines)


def build_nasa_summary(
    download_rows: list[dict[str, str]],
    raster_rows: list[dict[str, str]],
    sample_rows: list[dict[str, str]],
) -> dict[str, object]:
    percentile_stats = {
        column: stats([parse_float(row.get(column)) for row in sample_rows])
        for column in PERCENTILE_COLUMNS
    }
    return {
        "downloaded_files": download_rows,
        "rasters": raster_rows,
        "station_points_sampled": len(sample_rows),
        "total_null_or_nodata_samples": sum(int(percentile_stats[column]["null_count"] or 0) for column in PERCENTILE_COLUMNS),
        "percentile_stats": percentile_stats,
        "top_5_highest_groundwater_percentile": top_groundwater(sample_rows, reverse=True),
        "top_5_lowest_groundwater_percentile": top_groundwater(sample_rows, reverse=False),
    }


def write_nasa_reports(summary: dict[str, object], report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    json_path = report_dir / "phase1c_nasa_sampling_summary.json"
    csv_path = report_dir / "phase1c_nasa_sampling_summary.csv"
    md_path = report_dir / "phase1c_nasa_sampling_summary.md"

    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
        handle.write("\n")

    percentile_stats = summary["percentile_stats"]
    assert isinstance(percentile_stats, dict)
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["metric", "count", "null_count", "min", "mean", "max"])
        writer.writeheader()
        for metric, values in percentile_stats.items():
            assert isinstance(values, dict)
            writer.writerow({"metric": metric, **values})

    downloaded_files = summary["downloaded_files"]
    rasters = summary["rasters"]
    highest = summary["top_5_highest_groundwater_percentile"]
    lowest = summary["top_5_lowest_groundwater_percentile"]
    assert isinstance(downloaded_files, list)
    assert isinstance(rasters, list)
    assert isinstance(highest, list)
    assert isinstance(lowest, list)

    lines = [
        "# Phase 1C NASA Sampling Summary",
        "",
        "## Downloaded NASA/NDMC Files",
        "",
        markdown_table(
            downloaded_files,
            ["local_path", "source_url", "fetch_date", "file_size_bytes", "sha256", "tls_verified", "tls_fallback_reason"],
        ),
        "",
        "## Raster Inventory",
        "",
        markdown_table(
            rasters,
            ["raster_name", "crs", "bounds", "width", "height", "resolution", "nodata", "min_value", "max_value"],
        ),
        "",
        "## Station Sampling",
        "",
        f"- Station points sampled: {summary['station_points_sampled']}",
        f"- Total null/nodata percentile samples: {summary['total_null_or_nodata_samples']}",
        "",
        "## Percentile Summary",
        "",
        markdown_table(
            [{"metric": key, **value} for key, value in percentile_stats.items() if isinstance(value, dict)],
            ["metric", "count", "null_count", "min", "mean", "max"],
        ),
        "",
        "## Top 5 Highest Groundwater Percentile Stations",
        "",
        markdown_table(highest, ["station", "groundwater_percentile"]),
        "",
        "## Top 5 Lowest Groundwater Percentile Stations",
        "",
        markdown_table(lowest, ["station", "groundwater_percentile"]),
        "",
        "## Caveat",
        "",
        "Station values are point samples from 0.25 degree NASA/NDMC GRACE-DA percentile rasters. "
        "They are not mandal averages, not official APWRIMS readings, and not groundwater levels in mbgl.",
        "",
    ]
    md_path.write_text("\n".join(lines), encoding="utf-8")


def build_fusion_summary(fusion_rows: list[dict[str, str]]) -> dict[str, object]:
    confidence_distribution = Counter(row.get("confidence_label", "") for row in fusion_rows)
    status_distribution = Counter(row.get("status", "") for row in fusion_rows)
    verify_rows = [
        row
        for row in fusion_rows
        if row.get("confidence_label", "").lower() == "verify"
        or row.get("sensor_satellite_agreement", "") == "strong_disagreement"
    ]
    return {
        "mandal_count": len(fusion_rows),
        "using_mock_groundwater_readings": sum("mock groundwater input" in row.get("data_quality_notes", "") for row in fusion_rows),
        "using_public_prototype_boundaries": sum(row.get("boundary_source", "") == "public_prototype" for row in fusion_rows),
        "with_real_nasa_satellite_model_values": sum(
            any(parse_float(row.get(column)) is not None for column in PERCENTILE_COLUMNS) for row in fusion_rows
        ),
        "confidence_label_distribution": dict(confidence_distribution),
        "status_distribution": dict(status_distribution),
        "verify_or_mismatch_cases": [
            {
                "district_name": row.get("district_name", ""),
                "mandal_name": row.get("mandal_name", ""),
                "sensor_satellite_agreement": row.get("sensor_satellite_agreement", ""),
                "confidence_label": row.get("confidence_label", ""),
                "groundwater_percentile": row.get("groundwater_percentile", ""),
                "median_groundwater_mbgl": row.get("median_groundwater_mbgl", ""),
            }
            for row in verify_rows
        ],
    }


def write_fusion_report(summary: dict[str, object], report_dir: Path) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    md_path = report_dir / "phase1c_fusion_summary.md"
    verify_rows = summary["verify_or_mismatch_cases"]
    assert isinstance(verify_rows, list)
    lines = [
        "# Phase 1C Fusion Summary",
        "",
        f"- Mandals in fusion output: {summary['mandal_count']}",
        f"- Mandals using mock groundwater readings: {summary['using_mock_groundwater_readings']}",
        f"- Mandals using public prototype boundaries: {summary['using_public_prototype_boundaries']}",
        f"- Mandals with real NASA satellite-model values: {summary['with_real_nasa_satellite_model_values']}",
        "",
        "## Confidence Label Distribution",
        "",
        markdown_table(
            [{"confidence_label": key, "count": value} for key, value in dict(summary["confidence_label_distribution"]).items()],
            ["confidence_label", "count"],
        ),
        "",
        "## Status Distribution",
        "",
        markdown_table(
            [{"status": key, "count": value} for key, value in dict(summary["status_distribution"]).items()],
            ["status", "count"],
        ),
        "",
        "## Verify Or Mismatch Cases",
        "",
        markdown_table(
            verify_rows,
            [
                "district_name",
                "mandal_name",
                "sensor_satellite_agreement",
                "confidence_label",
                "groundwater_percentile",
                "median_groundwater_mbgl",
            ],
        )
        if verify_rows
        else "No verify or strong-disagreement cases found.",
        "",
        "## Caveats And Next Official Data Requirements",
        "",
        "- Current groundwater readings are mock APWRIMS-format data, not official APWRIMS readings.",
        "- Current boundaries are public prototype boundaries with `boundary_official_flag=false`.",
        "- NASA/NDMC values are satellite/model percentiles, not groundwater depth.",
        "- Official APWRIMS sensor readings, official APWRIMS/APSAC/RTGS mandal boundaries, and APWRIMS admin IDs are required before official mandal-level claims.",
        "",
    ]
    md_path.write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--download-manifest", type=Path, default=DEFAULT_NASA_MANIFEST)
    parser.add_argument("--raster-inventory", type=Path, default=DEFAULT_RASTER_INVENTORY)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    parser.add_argument("--fusion", type=Path, default=DEFAULT_FUSION)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    nasa_summary = build_nasa_summary(
        read_csv(args.download_manifest),
        read_csv(args.raster_inventory),
        read_csv(args.samples),
    )
    write_nasa_reports(nasa_summary, args.report_dir)
    fusion_summary = build_fusion_summary(read_csv(args.fusion))
    write_fusion_report(fusion_summary, args.report_dir)
    print(f"Wrote Phase 1C reports to {args.report_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

