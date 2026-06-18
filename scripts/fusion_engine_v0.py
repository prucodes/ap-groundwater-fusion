#!/usr/bin/env python3
"""Create V0 mandal-level groundwater fusion outputs."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_JOINED_STATIONS = REPO_ROOT / "data/processed/groundwater/stations_joined_to_boundaries.csv"
DEFAULT_JOINED_PUBLIC_STATIONS = REPO_ROOT / "data/processed/groundwater/stations_joined_public_measured_to_boundaries.csv"
DEFAULT_STANDARDIZED_STATIONS = REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv"
DEFAULT_MOCK_STATIONS = REPO_ROOT / "data/mock/apwrims/mock_groundwater_readings.csv"
DEFAULT_SATELLITE = REPO_ROOT / "data/processed/satellite/satellite_samples_at_station_points.csv"
LEGACY_SATELLITE = REPO_ROOT / "data/processed/satellite/station_satellite_samples.csv"
DEFAULT_RAINFALL = REPO_ROOT / "data/processed/satellite/rainfall_samples_at_station_points.csv"
DEFAULT_ET_BALANCE = REPO_ROOT / "data/processed/satellite/et_balance_samples_at_station_points.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/fusion/mandal_groundwater_fusion_v0.csv"

FUSION_OUTPUT_COLUMNS = [
    "mandal_name",
    "district_name",
    "sensor_count",
    "latest_sensor_date",
    "median_groundwater_mbgl",
    "avg_groundwater_mbgl",
    "groundwater_percentile",
    "rootzone_percentile",
    "surface_percentile",
    "rainfall_mm",
    "annual_et_mm",
    "water_balance_mm",
    "water_balance_status",
    "sensor_satellite_agreement",
    "confidence_score",
    "confidence_label",
    "status",
    "recommended_action",
    "data_quality_notes",
    "boundary_source",
    "boundary_official_flag",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stations", type=Path, default=None)
    parser.add_argument("--satellite", type=Path, default=DEFAULT_SATELLITE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--reference-date", default=str(date.today()))
    parser.add_argument("--as-of-date", default=None)
    parser.add_argument("--priority-mode", choices=["auto", "explicit"], default="auto")
    return parser.parse_args()


def valid_station_file(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        import pandas as pd

        df = pd.read_csv(path, nrows=5)
    except Exception:
        return False
    required = {"district_name", "mandal_name", "station_id", "reading_date", "groundwater_level_mbgl", "data_label"}
    return required.issubset(set(df.columns))


def resolve_station_input(requested_path: Path | None, priority_mode: str) -> Path:
    if requested_path is not None:
        if requested_path.exists():
            return requested_path
        raise SystemExit(f"Station input does not exist: {requested_path}")

    if priority_mode == "auto" and valid_station_file(DEFAULT_JOINED_PUBLIC_STATIONS):
        print(f"Using public measured station input at {DEFAULT_JOINED_PUBLIC_STATIONS}")
        return DEFAULT_JOINED_PUBLIC_STATIONS

    if DEFAULT_JOINED_STATIONS.exists():
        return DEFAULT_JOINED_STATIONS
    requested_path = DEFAULT_JOINED_STATIONS
    if requested_path.exists():
        return requested_path
    if requested_path == DEFAULT_JOINED_STATIONS and DEFAULT_STANDARDIZED_STATIONS.exists():
        print(f"Joined station file not found; using standardized readings at {DEFAULT_STANDARDIZED_STATIONS}")
        return DEFAULT_STANDARDIZED_STATIONS
    if requested_path == DEFAULT_JOINED_STATIONS and DEFAULT_MOCK_STATIONS.exists():
        print(f"Processed station file not found; using mock readings at {DEFAULT_MOCK_STATIONS}")
        return DEFAULT_MOCK_STATIONS
    raise SystemExit(f"Station input does not exist: {requested_path}")


def first_non_null(values: list[Any]) -> float | None:
    for value in values:
        if value == value and value is not None:
            return float(value)
    return None


def satellite_direction(row: Any) -> str:
    values = [
        getattr(row, "groundwater_percentile", None),
        getattr(row, "rootzone_percentile", None),
        getattr(row, "surface_percentile", None),
    ]
    percentile = first_non_null(values)
    if percentile is None:
        return "missing"
    if percentile <= 30:
        return "dry"
    if percentile >= 70:
        return "wet"
    return "normal"


def sensor_direction(median_groundwater_mbgl: float) -> str:
    if median_groundwater_mbgl >= 15:
        return "deep"
    if median_groundwater_mbgl <= 6:
        return "shallow"
    return "moderate"


def agreement_label(sensor_state: str, satellite_state: str) -> str:
    if satellite_state == "missing":
        return "satellite_missing"
    if sensor_state == "deep" and satellite_state == "dry":
        return "agree_stress"
    if sensor_state == "shallow" and satellite_state == "wet":
        return "agree_normal_or_wet"
    if sensor_state == "deep" and satellite_state == "wet":
        return "strong_disagreement"
    if sensor_state == "shallow" and satellite_state == "dry":
        return "strong_disagreement"
    return "partial_or_neutral"


def water_balance_status(balance_mm: float | None) -> str:
    """Annual precipitation minus actual ET (mm/yr). Prototype classification.

    Negative / near-zero balance means atmospheric + crop demand approaches or
    exceeds rainfall, i.e. the shortfall is met by stored/irrigation water
    (groundwater pressure). Thresholds are illustrative, not official.
    """
    if balance_mm is None or balance_mm != balance_mm:
        return ""
    if balance_mm >= 250:
        return "Surplus"
    if balance_mm >= 50:
        return "Balanced"
    return "Deficit"


def confidence_and_action(
    sensor_count: int,
    days_since_latest: int | None,
    agreement: str,
    boundary_official_flag: bool,
) -> tuple[int, str, str, str]:
    recent = days_since_latest is not None and days_since_latest <= 90
    enough = sensor_count >= 2

    if agreement == "strong_disagreement":
        return (
            40,
            "Verify",
            "verify",
            "Prioritize field verification because sensor readings and satellite/model signal disagree.",
        )
    if not enough or not recent:
        label = "Low"
        status = "insufficient_or_stale_data"
        action = "Collect additional recent station readings before operational interpretation."
        score = 35
        if not boundary_official_flag:
            action = f"{action} Do not treat as official until APWRIMS/APSAC/RTGS boundaries are supplied."
        return score, label, status, action

    if enough and recent and agreement.startswith("agree"):
        label = "High"
        status = "stress_watch" if agreement == "agree_stress" else "normal_watch"
        action = "Escalate for APWRIMS/AWARE review if official inputs confirm the same pattern."
        score = 85
    else:
        label = "Medium"
        status = "monitor"
        action = "Review recent station readings and nearby field reports."
        score = 65

    if not boundary_official_flag:
        action = f"{action} Do not treat as official until APWRIMS/APSAC/RTGS boundaries are supplied."
    return score, label, status, action


def notes_for_group(data_labels: set[str], boundary_sources: set[str], satellite_missing: bool) -> str:
    notes: list[str] = []
    prototype_input = False
    lowered_labels = {label.lower() for label in data_labels}
    if "measured_public" in lowered_labels:
        notes.append("public measured groundwater input; not official APWRIMS")
    if "official_apwrims" in lowered_labels:
        notes.append("official APWRIMS groundwater input")
    if "mock" in lowered_labels:
        prototype_input = True
        notes.append("mock groundwater input")
    if any(source in {"public_prototype", "prototype-public-source", "none"} for source in boundary_sources):
        prototype_input = True
        notes.append("no official boundary claim")
    if "public_prototype" in boundary_sources or "prototype-public-source" in boundary_sources:
        notes.append("public prototype boundary")
    if "none" in boundary_sources:
        notes.append("no boundary join available")
    if satellite_missing:
        notes.append("satellite/model percentile missing")
    if prototype_input:
        notes.append("prototype-only output; no official APWRIMS claim")
    if not notes:
        notes.append("inputs passed V0 data-label checks")
    return "; ".join(notes)


def main() -> int:
    args = parse_args()
    station_path = resolve_station_input(args.stations, args.priority_mode)

    import pandas as pd

    stations = pd.read_csv(station_path)
    required = {"district_name", "mandal_name", "station_id", "reading_date", "groundwater_level_mbgl", "data_label"}
    missing = sorted(required - set(stations.columns))
    if missing:
        raise SystemExit(f"Station input is missing required columns: {', '.join(missing)}")

    stations["reading_date"] = pd.to_datetime(stations["reading_date"], errors="coerce")
    stations["groundwater_level_mbgl"] = pd.to_numeric(stations["groundwater_level_mbgl"], errors="coerce")
    stations = stations.sort_values("reading_date").drop_duplicates(subset=["station_id"], keep="last")
    if "boundary_source" not in stations.columns:
        stations["boundary_source"] = "none"
    if "boundary_official_flag" not in stations.columns:
        stations["boundary_official_flag"] = False

    satellite_path = args.satellite
    if not satellite_path.exists() and args.satellite == DEFAULT_SATELLITE and LEGACY_SATELLITE.exists():
        satellite_path = LEGACY_SATELLITE
        print(f"Current satellite sample file not found; using legacy satellite samples at {LEGACY_SATELLITE}")

    if satellite_path.exists():
        satellite = pd.read_csv(satellite_path)
        if "station_id" not in satellite.columns:
            raise SystemExit("Satellite input is missing required column: station_id")
        for column in ["groundwater_percentile", "rootzone_percentile", "surface_percentile"]:
            if column not in satellite.columns:
                satellite[column] = pd.NA
            satellite[column] = pd.to_numeric(satellite[column], errors="coerce")
            invalid = satellite[column].notna() & ((satellite[column] < 0) | (satellite[column] > 100))
            if invalid.any():
                raise SystemExit(f"Satellite input has {column} values outside 0-100.")
        stations = stations.merge(
            satellite[["station_id", "groundwater_percentile", "rootzone_percentile", "surface_percentile"]],
            on="station_id",
            how="left",
        )
    else:
        print(f"Satellite sample file not found at {args.satellite}; continuing with missing satellite/model context.")
        for column in ["groundwater_percentile", "rootzone_percentile", "surface_percentile"]:
            stations[column] = pd.NA

    # Optional recharge/supply context: CHIRPS monthly rainfall (mm). Graceful if absent.
    if DEFAULT_RAINFALL.exists():
        rainfall = pd.read_csv(DEFAULT_RAINFALL)
        if {"station_id", "rainfall_mm"}.issubset(rainfall.columns):
            rainfall["rainfall_mm"] = pd.to_numeric(rainfall["rainfall_mm"], errors="coerce")
            stations = stations.merge(rainfall[["station_id", "rainfall_mm"]], on="station_id", how="left")
    if "rainfall_mm" not in stations.columns:
        stations["rainfall_mm"] = pd.NA

    # Optional annual water balance: TerraClimate actual ET vs precipitation (mm/yr). Graceful if absent.
    if DEFAULT_ET_BALANCE.exists():
        et_balance = pd.read_csv(DEFAULT_ET_BALANCE)
        keep = [c for c in ("station_id", "annual_et_mm", "water_balance_mm") if c in et_balance.columns]
        if "station_id" in keep:
            for col in ("annual_et_mm", "water_balance_mm"):
                if col in et_balance.columns:
                    et_balance[col] = pd.to_numeric(et_balance[col], errors="coerce")
            stations = stations.merge(et_balance[keep], on="station_id", how="left")
    for column in ("annual_et_mm", "water_balance_mm"):
        if column not in stations.columns:
            stations[column] = pd.NA

    reference_date = pd.to_datetime(args.as_of_date or args.reference_date)
    rows: list[dict[str, Any]] = []
    group_columns = ["district_name", "mandal_name"]
    for (district_name, mandal_name), group in stations.groupby(group_columns, dropna=False):
        latest_date = group["reading_date"].max()
        latest_date_text = "" if pd.isna(latest_date) else latest_date.date().isoformat()
        days_since_latest = None if pd.isna(latest_date) else int((reference_date - latest_date).days)
        median_mbgl = float(group["groundwater_level_mbgl"].median())
        avg_mbgl = float(group["groundwater_level_mbgl"].mean())

        percentile_values = {
            "groundwater_percentile": group["groundwater_percentile"].mean(),
            "rootzone_percentile": group["rootzone_percentile"].mean(),
            "surface_percentile": group["surface_percentile"].mean(),
        }
        rainfall_mean = group["rainfall_mm"].mean() if "rainfall_mm" in group.columns else None
        et_mean = group["annual_et_mm"].mean() if "annual_et_mm" in group.columns else None
        balance_mean = group["water_balance_mm"].mean() if "water_balance_mm" in group.columns else None
        balance_value = None if balance_mean is None or pd.isna(balance_mean) else round(float(balance_mean), 1)
        satellite_stub = type("SatelliteStub", (), percentile_values)
        sensor_state = sensor_direction(median_mbgl)
        satellite_state = satellite_direction(satellite_stub)
        agreement = agreement_label(sensor_state, satellite_state)
        boundary_official_flag = bool(group["boundary_official_flag"].fillna(False).astype(bool).all())
        confidence_score, confidence_label, status, recommended_action = confidence_and_action(
            sensor_count=int(group["station_id"].nunique()),
            days_since_latest=days_since_latest,
            agreement=agreement,
            boundary_official_flag=boundary_official_flag,
        )
        boundary_sources = {str(value) for value in group["boundary_source"].fillna("none").unique()}
        data_labels = {str(value) for value in group["data_label"].fillna("").unique()}
        satellite_missing = all(pd.isna(value) for value in percentile_values.values())

        rows.append(
            {
                "mandal_name": mandal_name,
                "district_name": district_name,
                "sensor_count": int(group["station_id"].nunique()),
                "latest_sensor_date": latest_date_text,
                "median_groundwater_mbgl": round(median_mbgl, 2),
                "avg_groundwater_mbgl": round(avg_mbgl, 2),
                "groundwater_percentile": None
                if pd.isna(percentile_values["groundwater_percentile"])
                else round(float(percentile_values["groundwater_percentile"]), 2),
                "rootzone_percentile": None
                if pd.isna(percentile_values["rootzone_percentile"])
                else round(float(percentile_values["rootzone_percentile"]), 2),
                "surface_percentile": None
                if pd.isna(percentile_values["surface_percentile"])
                else round(float(percentile_values["surface_percentile"]), 2),
                "rainfall_mm": None
                if rainfall_mean is None or pd.isna(rainfall_mean)
                else round(float(rainfall_mean), 1),
                "annual_et_mm": None
                if et_mean is None or pd.isna(et_mean)
                else round(float(et_mean), 1),
                "water_balance_mm": balance_value,
                "water_balance_status": water_balance_status(balance_value),
                "sensor_satellite_agreement": agreement,
                "confidence_score": confidence_score,
                "confidence_label": confidence_label,
                "status": status,
                "recommended_action": recommended_action,
                "data_quality_notes": notes_for_group(data_labels, boundary_sources, satellite_missing),
                "boundary_source": ";".join(sorted(boundary_sources)),
                "boundary_official_flag": boundary_official_flag,
            }
        )

    output = pd.DataFrame(rows, columns=FUSION_OUTPUT_COLUMNS)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    output.to_csv(args.output, index=False)
    print(f"Wrote V0 fusion output to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
