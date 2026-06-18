#!/usr/bin/env python3
"""Export static JSON seed data for the Phase 2A prototype UI."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from statistics import mean


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FUSION = REPO_ROOT / "data/processed/fusion/mandal_groundwater_fusion_v0.csv"
DEFAULT_SATELLITE = REPO_ROOT / "data/processed/satellite/satellite_samples_at_station_points.csv"
DEFAULT_NASA_SUMMARY = REPO_ROOT / "reports/phase1c_nasa_sampling_summary.csv"
DEFAULT_NWIC_FETCH = REPO_ROOT / "data/raw/nwic/andhra_pradesh_groundwater/fetch_manifest.csv"
DEFAULT_BOUNDARIES = REPO_ROOT / "data/processed/boundaries/ap_mandal_boundaries_prototype.geojson"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "app/data"
PROTOTYPE_NOTICE = (
    "Prototype using seed APWRIMS-format readings and real NASA satellite-model signals. "
    "Official APWRIMS export and official mandal boundaries are required for government-grade results."
)


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


def avg(rows: list[dict[str, str]], column: str) -> float | None:
    values = [parse_float(row.get(column)) for row in rows]
    numeric = [value for value in values if value is not None]
    return round(mean(numeric), 2) if numeric else None


def status_bucket(row: dict[str, str]) -> str:
    agreement = row.get("sensor_satellite_agreement", "")
    confidence = row.get("confidence_label", "")
    status = row.get("status", "")
    if agreement == "strong_disagreement" or confidence == "Verify":
        return "Verify"
    if "stress" in status:
        return "Stress"
    if confidence == "Low":
        return "Low Confidence"
    # High-confidence sensor/satellite agreement is a healthy "Normal" reading.
    if status == "normal_watch":
        return "Normal"
    if status == "monitor" or "watch" in status:
        return "Watch"
    return "Normal"


def action_preview(row: dict[str, str]) -> dict[str, object]:
    return {
        "district_name": row.get("district_name", ""),
        "mandal_name": row.get("mandal_name", ""),
        "status": row.get("status", ""),
        "confidence_label": row.get("confidence_label", ""),
        "recommended_action": row.get("recommended_action", ""),
        "source_caveat": "Prototype only. Official APWRIMS export and official mandal boundaries required.",
    }


def build_mandal_rows(fusion_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    output = []
    for index, row in enumerate(fusion_rows, start=1):
        item = {
            "id": f"{row.get('district_name', 'district').lower()}-{row.get('mandal_name', 'mandal').lower()}".replace(" ", "-"),
            "rank": index,
            "mandal_name": row.get("mandal_name", ""),
            "district_name": row.get("district_name", ""),
            "sensor_count": int(float(row.get("sensor_count") or 0)),
            "latest_sensor_date": row.get("latest_sensor_date", ""),
            "median_groundwater_mbgl": parse_float(row.get("median_groundwater_mbgl")),
            "avg_groundwater_mbgl": parse_float(row.get("avg_groundwater_mbgl")),
            "groundwater_percentile": parse_float(row.get("groundwater_percentile")),
            "rootzone_percentile": parse_float(row.get("rootzone_percentile")),
            "surface_percentile": parse_float(row.get("surface_percentile")),
            "rainfall_mm": parse_float(row.get("rainfall_mm")),
            "annual_et_mm": parse_float(row.get("annual_et_mm")),
            "water_balance_mm": parse_float(row.get("water_balance_mm")),
            "water_balance_status": row.get("water_balance_status", ""),
            "sensor_satellite_agreement": row.get("sensor_satellite_agreement", ""),
            "confidence_score": parse_float(row.get("confidence_score")),
            "confidence_label": row.get("confidence_label", ""),
            "status": row.get("status", ""),
            "status_bucket": status_bucket(row),
            "recommended_action": row.get("recommended_action", ""),
            "data_quality_notes": row.get("data_quality_notes", ""),
            "boundary_source": row.get("boundary_source", "public_prototype"),
            "boundary_official_flag": str(row.get("boundary_official_flag", "")).lower() == "true",
            "measured_input_label": "seed_mock",
            "measured_input_source": "seed_apwrims_format",
            "satellite_input_label": "NASA/NDMC GRACE-DA satellite-model",
            "rainfall_input_label": "CHIRPS monthly rainfall (UCSB)",
            "water_balance_input_label": "TerraClimate annual ET vs rainfall",
            "official_result": False,
            "aware_apwrims_action_preview": action_preview(row),
        }
        output.append(item)
    return output


def readiness(nwic_rows: list[dict[str, str]]) -> list[dict[str, object]]:
    nwic_status = nwic_rows[0].get("fetch_status", "manual_required") if nwic_rows else "manual_required"
    return [
        {"label": "Real NASA GRACE-DA data", "status": "available", "data_label": "satellite-model", "official_flag": False},
        {"label": "Real CHIRPS rainfall (recharge)", "status": "available", "data_label": "satellite-gauge-rainfall", "official_flag": False},
        {"label": "Real TerraClimate ET / water balance", "status": "available", "data_label": "model-water-balance", "official_flag": False},
        {"label": "APWRIMS readings (session sample · authorization pending)", "status": "available", "data_label": "measured_session_pending", "official_flag": False},
        {"label": "Public NWIC import lane", "status": nwic_status, "data_label": "measured_public", "official_flag": False},
        {"label": "Official APWRIMS export", "status": "pending", "data_label": "official_apwrims", "official_flag": False},
        {"label": "Official APWRIMS/APSAC/RTGS boundaries", "status": "pending", "data_label": "official_boundary", "official_flag": False},
        {"label": "APWRIMS admin IDs", "status": "pending", "data_label": "official_admin_ids", "official_flag": False},
    ]


def _perp_distance(point: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> float:
    (px, py), (sx, sy), (ex, ey) = point, start, end
    dx, dy = ex - sx, ey - sy
    if dx == 0 and dy == 0:
        return ((px - sx) ** 2 + (py - sy) ** 2) ** 0.5
    t = ((px - sx) * dx + (py - sy) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = sx + t * dx, sy + t * dy
    return ((px - cx) ** 2 + (py - cy) ** 2) ** 0.5


def simplify_ring(points: list[list[float]], tolerance: float) -> list[list[float]]:
    """Douglas-Peucker simplification on a coordinate ring (pure Python, no deps)."""
    if len(points) < 4:
        return points
    coords = [(p[0], p[1]) for p in points]
    keep = [False] * len(coords)
    keep[0] = keep[-1] = True
    stack = [(0, len(coords) - 1)]
    while stack:
        first, last = stack.pop()
        max_dist, index = 0.0, -1
        for i in range(first + 1, last):
            dist = _perp_distance(coords[i], coords[first], coords[last])
            if dist > max_dist:
                max_dist, index = dist, i
        if index != -1 and max_dist > tolerance:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [[round(coords[i][0], 4), round(coords[i][1], 4)] for i in range(len(coords)) if keep[i]]


def _outer_rings(geometry: dict) -> list[list[list[float]]]:
    gtype = geometry.get("type")
    coords = geometry.get("coordinates", [])
    if gtype == "Polygon":
        return [coords[0]] if coords else []
    if gtype == "MultiPolygon":
        return [poly[0] for poly in coords if poly]
    return []


def _ring_area_centroid(ring: list[list[float]]) -> tuple[float, float, float]:
    area = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if area == 0:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return (sum(xs) / len(xs), sum(ys) / len(ys), 0.0)
    area *= 0.5
    return (cx / (6 * area), cy / (6 * area), abs(area))


def build_map_geometry(
    boundaries_path: Path, seed_keys: set[tuple[str, str]]
) -> dict[str, object]:
    """Simplify the prototype boundary GeoJSON into a compact renderable status map.

    Highlighted seed mandals keep finer detail; the remaining mandals form a faint
    base outline so the real Andhra Pradesh shape is recognizable. Coordinates remain
    public_prototype boundaries and carry no official claim.
    """
    if not boundaries_path.exists():
        return {}
    with boundaries_path.open("r", encoding="utf-8") as handle:
        collection = json.load(handle)

    features = collection.get("features", [])
    mandals: list[dict[str, object]] = []
    min_lon = min_lat = float("inf")
    max_lon = max_lat = float("-inf")

    for feature in features:
        props = feature.get("properties", {})
        district = str(props.get("district_name", "")).strip()
        mandal = str(props.get("mandal_name", "")).strip()
        key = (district.upper(), mandal.upper())
        is_seed = key in seed_keys
        tolerance = 0.0025 if is_seed else 0.02
        rings: list[list[list[float]]] = []
        best_centroid: tuple[float, float] = (0.0, 0.0)
        best_area = -1.0
        for raw_ring in _outer_rings(feature.get("geometry", {})):
            simplified = simplify_ring(raw_ring, tolerance)
            if len(simplified) < 4:
                continue
            rings.append(simplified)
            cx, cy, area = _ring_area_centroid(simplified)
            if area > best_area:
                best_area, best_centroid = area, (cx, cy)
            for lon, lat in simplified:
                min_lon, max_lon = min(min_lon, lon), max(max_lon, lon)
                min_lat, max_lat = min(min_lat, lat), max(max_lat, lat)
        if not rings:
            continue
        entry: dict[str, object] = {"d": district, "m": mandal, "rings": rings, "seed": is_seed}
        if is_seed:
            entry["c"] = [round(best_centroid[0], 4), round(best_centroid[1], 4)]
        mandals.append(entry)

    return {
        "crs": "CRS84 lon/lat",
        "boundary_source": "public_prototype",
        "official_flag": False,
        "caveat": "Public prototype boundaries, simplified for display only. Not official APWRIMS/APSAC/RTGS boundaries.",
        "bbox": [
            round(min_lon, 4),
            round(min_lat, 4),
            round(max_lon, 4),
            round(max_lat, 4),
        ],
        "feature_count": len(mandals),
        "mandals": mandals,
    }


def write_json(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fusion", type=Path, default=DEFAULT_FUSION)
    parser.add_argument("--satellite", type=Path, default=DEFAULT_SATELLITE)
    parser.add_argument("--nasa-summary", type=Path, default=DEFAULT_NASA_SUMMARY)
    parser.add_argument("--nwic-fetch", type=Path, default=DEFAULT_NWIC_FETCH)
    parser.add_argument("--boundaries", type=Path, default=DEFAULT_BOUNDARIES)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--skip-map",
        action="store_true",
        help="Skip rebuilding app/data/ap_map_geometry.json (boundary GeoJSON not required).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    fusion_rows = read_csv(args.fusion)
    satellite_rows = read_csv(args.satellite)
    nasa_summary = read_csv(args.nasa_summary)
    nwic_fetch = read_csv(args.nwic_fetch)
    rainfall_path = REPO_ROOT / "data/processed/satellite/rainfall_samples_at_station_points.csv"
    rainfall_rows = read_csv(rainfall_path) if rainfall_path.exists() else []
    rainfall_period = rainfall_rows[0].get("rainfall_period", "") if rainfall_rows else ""
    rainfall_available = any(r.get("rainfall_mm") not in (None, "", "nan") for r in fusion_rows)
    et_path = REPO_ROOT / "data/processed/satellite/et_balance_samples_at_station_points.csv"
    et_rows = read_csv(et_path) if et_path.exists() else []
    balance_year = et_rows[0].get("balance_year", "") if et_rows else ""
    balance_available = any(r.get("water_balance_mm") not in (None, "", "nan") for r in fusion_rows)
    mandals = build_mandal_rows(fusion_rows)
    verify_count = sum(1 for item in mandals if item["status_bucket"] == "Verify")
    summary = {
        "prototype_notice": PROTOTYPE_NOTICE,
        "mandals_analyzed": len(mandals),
        "mandals_needing_verification": verify_count,
        "avg_groundwater_percentile": avg(fusion_rows, "groundwater_percentile"),
        "avg_rootzone_percentile": avg(fusion_rows, "rootzone_percentile"),
        "avg_surface_percentile": avg(fusion_rows, "surface_percentile"),
        "avg_rainfall_mm": avg(fusion_rows, "rainfall_mm") if rainfall_available else None,
        "rainfall_period": rainfall_period,
        "avg_water_balance_mm": avg(fusion_rows, "water_balance_mm") if balance_available else None,
        "balance_year": balance_year,
        "deficit_mandals": sum(1 for r in fusion_rows if r.get("water_balance_status") == "Deficit") if balance_available else 0,
        "overall_data_confidence": "Prototype",
        "sample_fetch_date": satellite_rows[0].get("satellite_sample_date_or_fetch_date", "") if satellite_rows else "",
        "status_distribution": dict(Counter(item["status_bucket"] for item in mandals)),
        "confidence_distribution": dict(Counter(str(item["confidence_label"]) for item in mandals)),
        "source_labels": {
            "measured_input_label": "seed_mock / seed_apwrims_format",
            "satellite_input_label": "NASA/NDMC GRACE-DA satellite-model",
            "rainfall_input_label": "CHIRPS monthly rainfall (UCSB)" if rainfall_available else "pending",
            "water_balance_input_label": "TerraClimate annual ET vs rainfall" if balance_available else "pending",
            "boundary_source": "public_prototype",
            "official_boundary_flag": False,
            "official_apwrims_export": "pending",
            "public_nwic_import": nwic_fetch[0].get("fetch_status", "manual_required") if nwic_fetch else "manual_required",
            "not_official_results_caveat": PROTOTYPE_NOTICE,
        },
    }
    write_json(args.output_dir / "mandal_fusion_seed.json", mandals)
    write_json(args.output_dir / "satellite_station_samples.json", satellite_rows)
    write_json(args.output_dir / "source_readiness.json", readiness(nwic_fetch))
    write_json(args.output_dir / "dashboard_summary.json", {"summary": summary, "nasa_percentile_summary": nasa_summary})

    map_path = args.output_dir / "ap_map_geometry.json"
    if args.skip_map:
        print("Skipped map geometry export (--skip-map).")
    else:
        seed_keys = {
            (row.get("district_name", "").upper(), row.get("mandal_name", "").upper())
            for row in fusion_rows
        }
        geometry = build_map_geometry(args.boundaries, seed_keys)
        if geometry:
            write_json(map_path, geometry)
            print(f"Wrote simplified map geometry ({geometry['feature_count']} mandals) to {map_path}")
        elif map_path.exists():
            print(f"Boundary GeoJSON missing; kept existing {map_path}")
        else:
            print("Boundary GeoJSON missing; no map geometry written (UI will use bbox fallback).")

    print(f"Wrote dashboard seed JSON to {args.output_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

