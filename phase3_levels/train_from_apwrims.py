"""Train the first REAL mandal groundwater-level model on APWRIMS history.

Labels: phase3_levels/apwrims/apwrims_gw_history.csv  (mandal, date, level_mbgl, 2014-2026)
Features (this baseline): mandal centroid (lat/lon), DEM elevation/slope/twi, aquifer
type + specific yield (proxy), and seasonality (month) + year.

This is the BASELINE — it answers "can we estimate a mandal's monthly metres from
location + terrain + season, trained on OTHER mandals?" via spatial GroupKFold
(hold out whole mandals). Adding the historical satellite series (GRACE/CHIRPS/
TerraClimate per month) is the next step and should lower the error further.
"""
import json, math, os, re, sys, difflib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")

HARD_ROCK = {"ANANTHAPURAMU", "ANANTAPUR", "SRI SATHYA SAI", "Y.S.R KADAPA", "Y.S.R.", "KADAPA",
             "KURNOOL", "NANDYAL", "CHITTOOR", "ANNAMAYYA", "TIRUPATI"}
DELTA = {"KRISHNA", "EAST GODAVARI", "WEST GODAVARI", "GUNTUR", "KONASEEMA", "ELURU", "NTR", "BAPATLA", "PALNADU"}
def aquifer_of(d):
    du = d.upper()
    if du in HARD_ROCK: return "hard_rock", 0.020
    if du in DELTA: return "alluvial", 0.110
    return "coastal", 0.080


def norm(name):
    """Normalize a mandal name for matching across APWRIMS (new) vs app (old) naming."""
    s = str(name).upper().strip()
    s = re.sub(r"\(.*?\)", " ", s)                       # drop "(R)", "(URBAN)" etc.
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def mandal_centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = {}
    for m in g["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts: continue
        lon = sum(p[0] for p in pts) / len(pts); lat = sum(p[1] for p in pts) / len(pts)
        out[m["m"].strip().upper()] = (round(lat, 4), round(lon, 4))
    return out


def resolve_centroids(mandal_names, cents):
    """Map each APWRIMS mandal -> (lat,lon) via exact, then normalized, then fuzzy.
    Returns {APWRIMS_UPPER_NAME: (lat,lon)} and prints match accounting."""
    norm_index = {}
    for k, v in cents.items():
        norm_index.setdefault(norm(k), v)
    norm_keys = list(norm_index.keys())
    resolved, n_exact, n_norm, n_fuzzy, n_miss = {}, 0, 0, 0, 0
    for raw in mandal_names:
        up = raw.strip().upper()
        if up in cents:
            resolved[up] = cents[up]; n_exact += 1; continue
        nm = norm(raw)
        if nm in norm_index:
            resolved[up] = norm_index[nm]; n_norm += 1; continue
        hit = difflib.get_close_matches(nm, norm_keys, n=1, cutoff=0.88)
        if hit:
            resolved[up] = norm_index[hit[0]]; n_fuzzy += 1; continue
        n_miss += 1
    print(f"  centroid match: exact {n_exact}  normalized +{n_norm}  fuzzy +{n_fuzzy}  unmatched {n_miss}")
    return resolved


def terrain_lookup():
    p = os.path.join(HERE, "data", "mandal_terrain.csv")
    if not os.path.exists(p): return {}
    t = pd.read_csv(p)
    out = {}
    for _, r in t.iterrows():
        name = str(r["mandal_id"]).split("|")[-1].strip().upper()
        out[name] = (float(r["elevation_m"]), float(r["slope_deg"]), float(r["twi"]))
    return out


def main():
    df = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    df = df[(df.level_mbgl > 0) & (df.level_mbgl < 60)].copy()  # drop bad/outlier readings
    cents = mandal_centroids(); terr = terrain_lookup()
    resolved = resolve_centroids(df.mandal.unique(), cents)
    # terrain keyed by normalized name for the same cross-naming robustness
    terr_norm = {}
    for k, v in terr.items():
        terr_norm.setdefault(norm(k), v)

    key = df.mandal.str.strip().str.upper()
    df["lat"] = key.map(lambda m: resolved.get(m, (np.nan, np.nan))[0])
    df["lon"] = key.map(lambda m: resolved.get(m, (np.nan, np.nan))[1])
    nkey = df.mandal.map(norm)
    df["elevation_m"] = nkey.map(lambda m: terr_norm.get(m, (300.0, 3.0, 8.0))[0])
    df["slope_deg"] = nkey.map(lambda m: terr_norm.get(m, (300.0, 3.0, 8.0))[1])
    df["twi"] = nkey.map(lambda m: terr_norm.get(m, (300.0, 3.0, 8.0))[2])
    aq = df.district.map(lambda d: aquifer_of(d))
    df["aquifer_type"] = aq.map(lambda x: x[0]); df["specific_yield"] = aq.map(lambda x: x[1])
    df["year"] = df.date.str.slice(0, 4).astype(int)
    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2 * np.pi * (mo - 1) / 12); df["month_cos"] = np.cos(2 * np.pi * (mo - 1) / 12)

    matched = df.lat.notna().mean()
    df = df.dropna(subset=["lat", "lon"])
    print(f"  rows: {len(df):,}  mandals: {df.mandal.nunique()}  centroid-match: {matched*100:.0f}%")

    NUM = ["lat", "lon", "elevation_m", "slope_deg", "twi", "specific_yield", "year", "month_sin", "month_cos"]
    CAT = ["aquifer_type"]
    X = df[NUM + CAT]; y = df.level_mbgl.values
    groups = df.mandal.values  # hold out WHOLE mandals -> "no-sensor mandal" accuracy

    def est():
        pre = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
        return Pipeline([("pre", pre), ("reg", HistGradientBoostingRegressor(max_iter=500, learning_rate=0.05, max_depth=7, random_state=0))])

    gkf = GroupKFold(n_splits=5)
    preds = np.zeros(len(y))
    for tr, te in gkf.split(X, y, groups):
        m = est(); m.fit(X.iloc[tr], y[tr]); preds[te] = m.predict(X.iloc[te])
    rmse = math.sqrt(mean_squared_error(y, preds)); mae = mean_absolute_error(y, preds); r2 = r2_score(y, preds)
    # naive baseline: predict global mean (what you'd do with no model)
    naive = math.sqrt(mean_squared_error(y, np.full_like(y, y.mean())))
    print(f"\n  BASELINE model (static+season, no satellite yet)")
    print(f"  Spatial CV (whole mandals held out):  RMSE {rmse:.2f} m   MAE {mae:.2f} m   R² {r2:.2f}")
    print(f"  vs naive 'predict the average' RMSE {naive:.2f} m  ->  {(1-rmse/naive)*100:.0f}% better")
    print(f"  ^ metres-accuracy at a mandal with NO sensor, from location+terrain+season alone.")
    print(f"  Next: add historical GRACE/CHIRPS/TerraClimate per month to push this down.")


if __name__ == "__main__":
    main()
