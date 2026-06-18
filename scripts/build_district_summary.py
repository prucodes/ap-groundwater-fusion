#!/usr/bin/env python3
"""Build a statewide district-level satellite summary + geometry for the heat map.

Dissolves the prototype mandal boundaries into districts and computes, per district,
the zonal mean of the real satellite rasters:
  - NASA/NDMC GRACE-DA groundwater / root-zone / surface percentiles
  - CHIRPS monthly rainfall (mm)
  - TerraClimate annual actual ET and precipitation (mm) -> water balance

Every Andhra Pradesh district gets real values (the rasters cover the whole state),
unlike the mandal fusion which is limited to seed-sensor mandals. Output stays
public_prototype geometry; values are satellite/model context, not groundwater depth.
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BOUNDARIES = REPO_ROOT / "data/processed/boundaries/ap_mandal_boundaries_prototype.geojson"
GRACE_DIR = REPO_ROOT / "data/raw/nasa/grace_da/current"
CHIRPS_TIF = REPO_ROOT / "data/raw/chirps/current/chirps_monthly_latest.tif"
TC_DIR = REPO_ROOT / "data/raw/terraclimate/current"
CHIRPS_MANIFEST = REPO_ROOT / "data/raw/chirps/current/download_manifest.csv"
ET_SAMPLES = REPO_ROOT / "data/processed/satellite/et_balance_samples_at_station_points.csv"
DEFAULT_OUTPUT = REPO_ROOT / "app/data/ap_district_geometry.json"


def zonal_mean(raster_path: Path, geom, clamp_pct: bool = False) -> float | None:
    if not raster_path.exists():
        return None
    import numpy as np
    import rasterio
    from rasterio.mask import mask

    with rasterio.open(raster_path) as src:
        try:
            out, _ = mask(src, [geom], crop=True, filled=True, nodata=src.nodata)
        except Exception:
            return None
        arr = out[0].astype("float64")
        nod = src.nodata
        valid = arr[np.isfinite(arr)]
        if nod is not None:
            valid = valid[valid != nod]
        valid = valid[valid > -9000]  # CHIRPS/-9999 style nodata
        if clamp_pct:
            valid = valid[(valid >= 0) & (valid <= 100)]
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


def read_period(manifest: Path, field: str) -> str:
    if not manifest.exists():
        return ""
    with manifest.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get(field):
                return row[field]
    return ""


def read_balance_year() -> str:
    if not ET_SAMPLES.exists():
        return ""
    with ET_SAMPLES.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            if row.get("balance_year"):
                return row["balance_year"]
    return ""


def simplify_rings(geom, tolerance: float = 0.02) -> list[list[list[float]]]:
    simplified = geom.simplify(tolerance, preserve_topology=True)
    rings: list[list[list[float]]] = []

    def add(polygon) -> None:
        ring = [[round(x, 4), round(y, 4)] for x, y in polygon.exterior.coords]
        if len(ring) >= 4:
            rings.append(ring)

    if simplified_is_multi(simplified):
        for poly in simplified.geoms:
            add(poly)
    else:
        add(simplified)
    return rings


def simplified_is_multi(geom) -> bool:
    return geom.geom_type == "MultiPolygon"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boundaries", type=Path, default=DEFAULT_BOUNDARIES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.boundaries.exists():
        print(f"Boundary GeoJSON missing at {args.boundaries}; skipping district summary.")
        return 0

    import geopandas as gpd

    gdf = gpd.read_file(args.boundaries)
    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
    elif str(gdf.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
        gdf = gdf.to_crs("EPSG:4326")

    counts = gdf.groupby("district_name").size().to_dict()
    dissolved = gdf.dissolve(by="district_name")

    grace_gws = GRACE_DIR / "gws_perc_025deg_GL.tif"
    grace_rtz = GRACE_DIR / "rtzsm_perc_025deg_GL.tif"
    grace_sfs = GRACE_DIR / "sfsm_perc_025deg_GL.tif"
    aet_tif = TC_DIR / "aet_annual_ap.tif"
    ppt_tif = TC_DIR / "ppt_annual_ap.tif"

    districts: list[dict[str, object]] = []
    min_lon = min_lat = float("inf")
    max_lon = max_lat = float("-inf")

    for name, row in dissolved.iterrows():
        geom = row.geometry
        gws = zonal_mean(grace_gws, geom, clamp_pct=True)
        rtz = zonal_mean(grace_rtz, geom, clamp_pct=True)
        sfs = zonal_mean(grace_sfs, geom, clamp_pct=True)
        rain = zonal_mean(CHIRPS_TIF, geom)
        aet = zonal_mean(aet_tif, geom)
        ppt = zonal_mean(ppt_tif, geom)
        balance = round(ppt - aet, 1) if (aet is not None and ppt is not None) else None

        rings = simplify_rings(geom)
        if not rings:
            continue
        for ring in rings:
            for lon, lat in ring:
                min_lon, max_lon = min(min_lon, lon), max(max_lon, lon)
                min_lat, max_lat = min(min_lat, lat), max(max_lat, lat)
        centroid = geom.representative_point()

        districts.append(
            {
                "d": str(name),
                "rings": rings,
                "c": [round(centroid.x, 4), round(centroid.y, 4)],
                "mandal_count": int(counts.get(name, 0)),
                "gw_percentile": gws,
                "rootzone_percentile": rtz,
                "surface_percentile": sfs,
                "rainfall_mm": rain,
                "annual_et_mm": aet,
                "water_balance_mm": balance,
                "water_balance_status": balance_status(balance),
            }
        )

    def rng(key: str) -> dict[str, float]:
        vals = [d[key] for d in districts if d.get(key) is not None]
        return {"min": min(vals), "max": max(vals)} if vals else {"min": 0, "max": 1}

    payload = {
        "crs": "CRS84 lon/lat",
        "boundary_source": "public_prototype",
        "official_flag": False,
        "caveat": "District zonal means of satellite/model layers over public prototype boundaries. "
        "Regional situational context — not groundwater depth, not official.",
        "rainfall_period": read_period(CHIRPS_MANIFEST, "data_period"),
        "balance_year": read_balance_year(),
        "bbox": [round(min_lon, 4), round(min_lat, 4), round(max_lon, 4), round(max_lat, 4)],
        "layers": {
            "gw_percentile": {"label": "NASA Groundwater %ile", "unit": "pctl", **rng("gw_percentile")},
            "rainfall_mm": {"label": "Rainfall (CHIRPS)", "unit": "mm", **rng("rainfall_mm")},
            "water_balance_mm": {"label": "Water Balance", "unit": "mm/yr", **rng("water_balance_mm")},
        },
        "district_count": len(districts),
        "districts": districts,
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    print(f"Wrote district summary ({len(districts)} districts) to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
