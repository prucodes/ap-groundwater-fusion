#!/usr/bin/env python3
"""Statewide per-mandal heat values (rainfall + water balance) for all ~670 mandals.

Zonal-means CHIRPS rainfall and TerraClimate annual ET/precipitation over every
prototype mandal polygon, so the mandal map can render a real statewide choropleth.
GRACE is deliberately excluded here: its ~150-300 km footprint is sub-pixel at
mandal scale (neighbouring mandals would share identical values = false precision).
GRACE stays at district level. Values are satellite/model context, not groundwater depth.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BOUNDARIES = REPO_ROOT / "data/processed/boundaries/ap_mandal_boundaries_prototype.geojson"
CHIRPS_TIF = REPO_ROOT / "data/raw/chirps/current/chirps_monthly_latest.tif"
AET_TIF = REPO_ROOT / "data/raw/terraclimate/current/aet_annual_ap.tif"
PPT_TIF = REPO_ROOT / "data/raw/terraclimate/current/ppt_annual_ap.tif"
CHIRPS_MANIFEST = REPO_ROOT / "data/raw/chirps/current/download_manifest.csv"
ET_SAMPLES = REPO_ROOT / "data/processed/satellite/et_balance_samples_at_station_points.csv"
DEFAULT_OUTPUT = REPO_ROOT / "app/data/ap_mandal_heat.json"


def zonal_mean(dataset, geom) -> float | None:
    import numpy as np
    from rasterio.mask import mask

    try:
        out, _ = mask(dataset, [geom], crop=True, filled=True, nodata=dataset.nodata)
    except Exception:
        return None
    arr = out[0].astype("float64")
    valid = arr[np.isfinite(arr)]
    if dataset.nodata is not None:
        valid = valid[valid != dataset.nodata]
    valid = valid[valid > -9000]
    if valid.size == 0:
        return None
    return round(float(valid.mean()), 1)


def balance_status(balance: float | None) -> str:
    if balance is None:
        return ""
    if balance >= 250:
        return "Surplus"
    if balance >= 50:
        return "Balanced"
    return "Deficit"


def read_field(path: Path, field: str) -> str:
    if not path.exists():
        return ""
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get(field):
                return row[field]
    return ""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boundaries", type=Path, default=DEFAULT_BOUNDARIES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not (args.boundaries.exists() and CHIRPS_TIF.exists() and AET_TIF.exists() and PPT_TIF.exists()):
        print("Missing boundary or raster inputs; skipping mandal heat build.")
        return 0

    import geopandas as gpd
    import rasterio

    gdf = gpd.read_file(args.boundaries)
    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
    elif str(gdf.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
        gdf = gdf.to_crs("EPSG:4326")

    values: dict[str, dict[str, object]] = {}
    rain_vals: list[float] = []
    bal_vals: list[float] = []

    with rasterio.open(CHIRPS_TIF) as rain_ds, rasterio.open(AET_TIF) as aet_ds, rasterio.open(PPT_TIF) as ppt_ds:
        for _, row in gdf.iterrows():
            geom = row.geometry
            if geom is None:
                continue
            d = str(row.get("district_name", "")).strip().upper()
            m = str(row.get("mandal_name", "")).strip().upper()
            rain = zonal_mean(rain_ds, geom)
            aet = zonal_mean(aet_ds, geom)
            ppt = zonal_mean(ppt_ds, geom)
            balance = round(ppt - aet, 1) if (aet is not None and ppt is not None) else None
            if rain is not None:
                rain_vals.append(rain)
            if balance is not None:
                bal_vals.append(balance)
            values[f"{d}|{m}"] = {
                "rainfall_mm": rain,
                "water_balance_mm": balance,
                "water_balance_status": balance_status(balance),
            }

    def rng(vals: list[float]) -> dict[str, float]:
        return {"min": round(min(vals), 1), "max": round(max(vals), 1)} if vals else {"min": 0, "max": 1}

    payload = {
        "boundary_source": "public_prototype",
        "official_flag": False,
        "caveat": "Per-mandal zonal means of CHIRPS rainfall and TerraClimate water balance. "
        "Satellite/model context, not groundwater depth. GRACE excluded at mandal scale (sub-pixel).",
        "rainfall_period": read_field(CHIRPS_MANIFEST, "data_period"),
        "balance_year": read_field(ET_SAMPLES, "balance_year"),
        "layers": {"rainfall_mm": rng(rain_vals), "water_balance_mm": rng(bal_vals)},
        "count": len(values),
        "values": values,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    print(f"Wrote mandal heat values ({len(values)} mandals) to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
