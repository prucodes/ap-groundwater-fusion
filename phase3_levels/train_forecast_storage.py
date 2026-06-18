"""A/B test: does a GRACE-style STORAGE-ANOMALY feature improve the forecast?

True per-mandal GRACE isn't usable here: it needs Earthdata auth AND its ~300 km
footprint can't resolve a mandal (all of AP is ~3-4 GRACE pixels). GRACE measures
total water-storage anomaly ≈ cumulative (P - ET - runoff). We build that same
physical signal from the real NASA POWER rainfall we already have:

  rain_anom_12m : 12-mo rainfall minus the mandal's own 12-mo normal (wet/dry now)
  rain_24m      : 24-mo cumulative rainfall (multi-year recharge memory)
  rain_anom_24m : 24-mo rainfall minus normal (GRACE-like multi-year storage anomaly)
  spi_proxy     : standardized 12-mo anomaly (z-score) — drought index style

We compare the validated forecast model WITHOUT these vs WITH these, same temporal
hold-out, and report the honest delta.
"""
import json, math, os, re, difflib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
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
    s = str(name).upper().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def metrics(y, p):
    return (math.sqrt(mean_squared_error(y, p)), mean_absolute_error(y, p), r2_score(y, p))


def build():
    lv = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    lv = lv[(lv.level_mbgl > 0) & (lv.level_mbgl < 60)].copy()
    lv["mkey"] = lv.mandal.map(norm)
    aq = lv.district.map(aquifer_of)
    lv["aquifer_type"] = aq.map(lambda x: x[0]); lv["specific_yield"] = aq.map(lambda x: x[1])
    rain = pd.read_csv(os.path.join(HERE, "data", "mandal_rain_history.csv"))
    rain["mkey"] = rain.mandal.map(norm)
    rain = rain.groupby(["mkey", "date"], as_index=False).rain_mm.mean()
    df = lv.merge(rain, on=["mkey", "date"], how="left").sort_values(["mkey", "date"]).reset_index(drop=True)
    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2*np.pi*(mo-1)/12); df["month_cos"] = np.cos(2*np.pi*(mo-1)/12)
    g = df.groupby("mkey", group_keys=False)
    df["lag1"] = g.level_mbgl.shift(1); df["lag12"] = g.level_mbgl.shift(12)
    df["roll3"] = g.level_mbgl.shift(1).rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    r = df.rain_mm.fillna(df.rain_mm.median())
    df["rain_1m"] = r
    df["rain_3m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(3, min_periods=1).sum()).reset_index(level=0, drop=True)
    df["rain_12m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(12, min_periods=1).sum()).reset_index(level=0, drop=True)
    # --- storage-anomaly (GRACE-style) features ---
    df["rain_24m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(24, min_periods=6).sum()).reset_index(level=0, drop=True)
    norm12 = df.groupby("mkey")["rain_12m"].transform("mean")
    std12 = df.groupby("mkey")["rain_12m"].transform("std").replace(0, np.nan)
    norm24 = df.groupby("mkey")["rain_24m"].transform("mean")
    df["rain_anom_12m"] = df["rain_12m"] - norm12
    df["rain_anom_24m"] = df["rain_24m"] - norm24
    df["spi_proxy"] = ((df["rain_12m"] - norm12) / std12).fillna(0)
    # centroids
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    idx = {}
    for m in geo["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts: continue
        lon = sum(p[0] for p in pts)/len(pts); lat = sum(p[1] for p in pts)/len(pts)
        idx.setdefault(norm(m["m"]), (round(lat,4), round(lon,4)))
    keys = list(idx.keys()); cache = {}
    def look(mk):
        if mk in cache: return cache[mk]
        v = idx.get(mk)
        if v is None:
            hit = difflib.get_close_matches(mk, keys, n=1, cutoff=0.88); v = idx[hit[0]] if hit else (np.nan, np.nan)
        cache[mk] = v; return v
    ll = df.mkey.map(look); df["lat"] = ll.map(lambda x: x[0]); df["lon"] = ll.map(lambda x: x[1])
    df = df.dropna(subset=["lat", "lon", "lag1", "lag12", "rain_24m"]).reset_index(drop=True)
    return df


BASE = ["lat", "lon", "specific_yield", "month_sin", "month_cos", "lag1", "lag12", "roll3",
        "rain_1m", "rain_3m", "rain_12m", "mandal_base"]
STORAGE = ["rain_24m", "rain_anom_12m", "rain_anom_24m", "spi_proxy"]
CAT = ["aquifer_type"]

def run(df, num):
    cutoff = "2024-01"
    tr = df.date < cutoff; te = df.date >= cutoff
    base = df[tr].groupby("mkey").level_mbgl.mean(); gm = df[tr].level_mbgl.mean()
    trd = df[tr].copy(); ted = df[te].copy()
    trd["mandal_base"] = trd.mkey.map(base).fillna(gm); ted["mandal_base"] = ted.mkey.map(base).fillna(gm)
    pre = ColumnTransformer([("num", "passthrough", num), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    m = Pipeline([("pre", pre), ("reg", HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0))])
    m.fit(trd[num+CAT], df[tr].level_mbgl.values)
    return metrics(df[te].level_mbgl.values, m.predict(ted[num+CAT]))


def main():
    df = build()
    print(f"  rows {len(df):,}  mandals {df.mkey.nunique()}")
    r0 = run(df, BASE)
    r1 = run(df, BASE + STORAGE)
    print("\n  FORECAST (train <2024, predict 2024->2026):")
    print(f"    WITHOUT storage signal:  RMSE {r0[0]:.3f} m  MAE {r0[1]:.3f} m  R² {r0[2]:.3f}")
    print(f"    WITH    storage signal:  RMSE {r1[0]:.3f} m  MAE {r1[1]:.3f} m  R² {r1[2]:.3f}")
    dmae = (r0[1] - r1[1]); print(f"    -> MAE change: {dmae:+.3f} m ({dmae/r0[1]*100:+.1f}%)")


if __name__ == "__main__":
    main()
