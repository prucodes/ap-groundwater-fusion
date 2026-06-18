"""Phase 3 — assemble the current per-mandal feature table for inference.

Reads what the project already has (CHIRPS rainfall + TerraClimate balance per
mandal; GRACE-DA + ET per district; mandal polygons for centroids) and writes one
row per mandal with the model feature schema.

Now wired (better than flat placeholders):
  * real mandal centroids (computed from polygon rings)
  * AP hydrogeology PROXY for aquifer type + specific yield + elevation
    (hard-rock Rayalaseema vs alluvial deltas vs coastal) — flagged, pending
    the CGWB aquifer/Sy map + a DEM zonal-stat (enrich_terrain.py).
  * real DEM elevation/slope if phase3_levels/data/mandal_terrain.csv exists.
"""
import json, os, sys, datetime
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
from lib_features import ALL_FEATURES, physics_level_change_m, month_cyclical

HERE = os.path.dirname(__file__)
APP = os.path.join(HERE, "..", "app", "data")

# AP hydrogeology PROXY by (old-13) district — replace with CGWB aquifer map.
HARD_ROCK = {"ANANTAPUR", "Y.S.R.", "KURNOOL", "CHITTOOR"}            # granite/gneiss
DELTA     = {"KRISHNA", "EAST GODAVARI", "WEST GODAVARI", "GUNTUR"}  # Godavari-Krishna alluvium
# everything else -> coastal/mixed
PROXY = {
    "hard_rock": {"sy": 0.020, "elev": 450.0, "slope": 5.0, "twi": 7.0},
    "alluvial":  {"sy": 0.110, "elev": 25.0,  "slope": 1.5, "twi": 11.0},
    "coastal":   {"sy": 0.080, "elev": 60.0,  "slope": 2.5, "twi": 9.0},
}


def aquifer_of(district_upper):
    if district_upper in HARD_ROCK:
        return "hard_rock"
    if district_upper in DELTA:
        return "alluvial"
    return "coastal"


def centroids_by_key():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = {}
    for m in g["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]  # [lon,lat]
        if not pts:
            continue
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out[f"{m['d']}|{m['m']}"] = (round(lat, 4), round(lon, 4))
    return out


def main():
    heat = json.load(open(os.path.join(APP, "ap_mandal_heat.json")))
    dgeo = json.load(open(os.path.join(APP, "ap_district_geometry.json")))
    by_district = {d["d"].upper(): d for d in dgeo["districts"]}
    cents = centroids_by_key()

    # optional real DEM cache: key -> {elevation_m, slope_deg, twi}
    terrain = {}
    tpath = os.path.join(HERE, "data", "mandal_terrain.csv")
    if os.path.exists(tpath):
        for _, r in pd.read_csv(tpath).iterrows():
            terrain[r["mandal_id"]] = r

    period = heat.get("rainfall_period", "2026.04")
    month = int(period.split(".")[-1]) if "." in period else 6
    msin, mcos = month_cyclical(month)

    rows = []
    for key, v in heat["values"].items():
        district, mandal = key.split("|", 1)
        du = district.upper()
        d = by_district.get(du)
        aq = aquifer_of(du)
        px = PROXY[aq]
        sy = px["sy"]
        gpct = (d or {}).get("gw_percentile")
        grace_anom_cm = (gpct - 50.0) / 5.0 if gpct is not None else 0.0
        lat, lon = cents.get(key, (15.9, 79.7))
        t = terrain.get(key)
        rows.append({
            "mandal_id": key,
            "mandal_name": mandal.title(),
            "district": district.title(),
            "grace_gws_anom_cm": round(grace_anom_cm, 2),
            "grace_gws_pctl": gpct if gpct is not None else 50.0,
            "rootzone_pctl": (d or {}).get("rootzone_percentile", 50.0),
            "surface_pctl": (d or {}).get("surface_percentile", 50.0),
            "rain_1m_mm": v.get("rainfall_mm", 0.0),
            "rain_3m_mm": round(v.get("rainfall_mm", 0.0) * 2.4, 1),       # TODO real 3-mo CHIRPS sum
            "et_1m_mm": round(((d or {}).get("annual_et_mm") or 900) / 12.0, 1),
            "water_balance_mm": v.get("water_balance_mm", 0.0),
            "specific_yield": sy,                                          # PROXY
            "elevation_m": float(t["elevation_m"]) if t is not None else px["elev"],
            "slope_deg": float(t["slope_deg"]) if t is not None else px["slope"],
            "twi": float(t["twi"]) if t is not None else px["twi"],
            "phys_level_change_m": round(physics_level_change_m(grace_anom_cm, sy), 3),
            "month_sin": round(msin, 4), "month_cos": round(mcos, 4),
            "lat": lat, "lon": lon,                                        # REAL centroid
            "aquifer_type": aq,                                            # PROXY
            "has_sensor": False,                                           # TODO from APWRIMS well list
        })

    df = pd.DataFrame(rows)
    out = os.path.join(HERE, "data", "mandal_features_current.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    df.to_csv(out, index=False)
    n_terrain = len(terrain)
    print(f"  Built features for {len(df)} mandals -> {out}")
    print(f"  REAL: centroids, rainfall, water_balance, GRACE pctl/root/surface, ET"
          + (f", DEM terrain ({n_terrain})" if n_terrain else ""))
    print(f"  PROXY (flagged): aquifer_type, specific_yield"
          + (", elevation/slope/twi" if not n_terrain else "")
          + ", grace_anom_cm(approx), rain_3m(approx)")
    json.dump({"built_at": datetime.datetime.now().isoformat(timespec="seconds"),
               "n_mandals": len(df), "rainfall_period": period,
               "real": ["centroids", "rainfall", "water_balance", "grace_pctl", "et"] + (["dem_terrain"] if n_terrain else []),
               "proxy": ["aquifer_type", "specific_yield"] + ([] if n_terrain else ["elevation", "slope", "twi"]) + ["grace_anom_cm", "rain_3m"]},
              open(os.path.join(HERE, "data", "features_manifest.json"), "w"), indent=2)


if __name__ == "__main__":
    main()
