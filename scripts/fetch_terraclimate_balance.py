#!/usr/bin/env python3
"""Pull a TerraClimate annual water balance (actual ET + precipitation) at station points.

TerraClimate (Climatology Lab, ~4 km, open) is read over OPeNDAP and subset to the
Andhra Pradesh window, so only a tiny slice is transferred (no large downloads).

For each station we compute, for the latest available calendar year:
  annual_et_mm      = sum of 12 monthly actual ET (aet)
  annual_precip_mm  = sum of 12 monthly precipitation (ppt)
  water_balance_mm  = annual_precip_mm - annual_et_mm   (negative = demand exceeds rainfall)

This is a recharge-vs-demand context signal. It is modeled climate data, NOT a
groundwater-depth measurement, and carries no official APWRIMS claim. On any network
failure it writes nothing and exits 0 so the rest of the pipeline continues.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_POINTS = REPO_ROOT / "data/processed/groundwater/standardized_groundwater_readings.csv"
DEFAULT_OUTPUT = REPO_ROOT / "data/processed/satellite/et_balance_samples_at_station_points.csv"
DODSC = "https://thredds.northwestknowledge.net/thredds/dodsC/TERRACLIMATE_ALL/data"
AP_BBOX = {"lon": (76.0, 85.0), "lat": (12.0, 20.0)}

OUTPUT_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "latitude",
    "longitude",
    "annual_et_mm",
    "annual_precip_mm",
    "water_balance_mm",
    "balance_year",
    "source",
    "data_label",
    "notes",
]


def read_points(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = [dict(row) for row in csv.DictReader(handle)]
    if not rows:
        raise SystemExit(f"Point CSV has no rows: {path}")
    return rows


def open_year(var: str, year: int):
    import xarray as xr

    url = f"{DODSC}/TerraClimate_{var}_{year}.nc"
    ds = xr.open_dataset(url, decode_times=True)
    return ds[var]


def subset_ap(da):
    lon_lo, lon_hi = AP_BBOX["lon"]
    lat_lo, lat_hi = AP_BBOX["lat"]
    da = da.sel(lon=slice(lon_lo, lon_hi))
    if float(da.lat[0]) > float(da.lat[-1]):
        da = da.sel(lat=slice(lat_hi, lat_lo))
    else:
        da = da.sel(lat=slice(lat_lo, lat_hi))
    return da.load()


def _write_geotiff(da, path: Path) -> None:
    import numpy as np
    import rasterio
    from rasterio.transform import from_origin

    if float(da.lat[0]) < float(da.lat[-1]):
        da = da.sortby("lat", ascending=False)
    lons = da.lon.values
    lats = da.lat.values
    xres = abs(float(lons[1] - lons[0]))
    yres = abs(float(lats[1] - lats[0]))
    arr = da.values.astype("float32")
    west = float(lons.min()) - xres / 2
    north = float(lats.max()) + yres / 2
    transform = from_origin(west, north, xres, yres)
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=arr.shape[0],
        width=arr.shape[1],
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=transform,
        nodata=float("nan"),
    ) as dst:
        dst.write(np.nan_to_num(arr, nan=float("nan")), 1)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--points", type=Path, default=DEFAULT_POINTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--start-year", type=int, default=None, help="Year to try first (defaults to current year).")
    parser.add_argument("--max-years-back", type=int, default=4)
    return parser.parse_args()


def main() -> int:
    from datetime import date

    args = parse_args()
    if not args.points.exists():
        raise SystemExit(f"Point CSV does not exist: {args.points}")
    points = read_points(args.points)

    start = args.start_year or date.today().year
    aet = ppt = None
    used_year = None
    for year in range(start, start - args.max_years_back, -1):
        try:
            print(f"Trying TerraClimate {year} (aet + ppt) over OPeNDAP ...")
            aet = subset_ap(open_year("aet", year))
            ppt = subset_ap(open_year("ppt", year))
            used_year = year
            break
        except Exception as exc:  # network / availability — stay graceful
            print(f"  {year} unavailable ({type(exc).__name__}).")
            aet = ppt = None
            continue

    if aet is None or ppt is None or used_year is None:
        print("Could not reach TerraClimate; skipping ET/water-balance (pipeline continues).")
        return 0

    aet_annual = aet.sum(dim="time")
    ppt_annual = ppt.sum(dim="time")

    # Save AP-window annual grids as GeoTIFFs so district zonal stats can sample them uniformly.
    raster_dir = REPO_ROOT / "data/raw/terraclimate/current"
    raster_dir.mkdir(parents=True, exist_ok=True)
    _write_geotiff(aet_annual, raster_dir / "aet_annual_ap.tif")
    _write_geotiff(ppt_annual, raster_dir / "ppt_annual_ap.tif")
    print(f"Wrote TerraClimate {used_year} AP annual GeoTIFFs to {raster_dir}")

    rows: list[dict[str, Any]] = []
    for point in points:
        lon = float(point["longitude"])
        lat = float(point["latitude"])
        et_val = float(aet_annual.sel(lon=lon, lat=lat, method="nearest").values)
        pp_val = float(ppt_annual.sel(lon=lon, lat=lat, method="nearest").values)
        balance = round(pp_val - et_val, 1)
        rows.append(
            {
                "station_id": point["station_id"],
                "station_name": point["station_name"],
                "district_name": point["district_name"],
                "mandal_name": point["mandal_name"],
                "latitude": point["latitude"],
                "longitude": point["longitude"],
                "annual_et_mm": round(et_val, 1),
                "annual_precip_mm": round(pp_val, 1),
                "water_balance_mm": balance,
                "balance_year": str(used_year),
                "source": "TerraClimate (Climatology Lab)",
                "data_label": "model-water-balance",
                "notes": "annual actual ET vs precipitation (mm); recharge-vs-demand context; not groundwater depth",
            }
        )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote TerraClimate {used_year} water-balance samples to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
