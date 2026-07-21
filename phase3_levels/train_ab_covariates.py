"""#3 experiment, step 2 — HONEST A/B: does adding soil moisture + temperature
improve the mandal groundwater forecast?

Same temporal hold-out as your storage-signal test (train < 2024, predict 2024->26),
same HistGradientBoosting model. Compares:
  BASE   : the current production feature set
  + COV  : BASE + root/surface soil wetness + temperature (with 3-month memory)
and reports the honest RMSE / MAE / R^2 delta. If +COV doesn't beat BASE, we DON'T adopt it.

Run from the gw-workbench folder, AFTER fetch_power_covariates.py:
  python phase3_levels/train_ab_covariates.py
"""
import os, re, json
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

BASE = "gw-workbench" if os.path.isdir("gw-workbench") else "."
P3 = os.path.join(BASE, "phase3_levels")
APP = os.path.join(BASE, "app", "data")

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

NUM_BASE = ["lat", "lon", "specific_yield", "month_sin", "month_cos",
            "lag1", "lag12", "roll3", "rain_1m", "rain_3m", "rain_12m", "mandal_base"]
NUM_COV = NUM_BASE + ["sm_root", "sm_root_3m", "sm_top", "temp"]
CAT = ["aquifer_type"]

def model(num):
    pre = ColumnTransformer([("num", "passthrough", num),
                             ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    reg = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8,
                                        l2_regularization=1.0, random_state=0)
    return Pipeline([("pre", pre), ("reg", reg)])

def build():
    lv = pd.read_csv(os.path.join(P3, "apwrims", "apwrims_gw_history.csv"))
    lv = lv[(lv.level_mbgl > 0) & (lv.level_mbgl < 60)].copy()
    lv["mkey"] = lv.mandal.map(norm)
    aq = lv.district.map(aquifer_of)
    lv["aquifer_type"] = aq.map(lambda x: x[0]); lv["specific_yield"] = aq.map(lambda x: x[1])

    rain = pd.read_csv(os.path.join(P3, "data", "mandal_rain_history.csv"))
    rain["mkey"] = rain.mandal.map(norm)
    rain = rain.groupby(["mkey", "date"], as_index=False).rain_mm.mean()
    df = lv.merge(rain, on=["mkey", "date"], how="left").sort_values(["mkey", "date"]).reset_index(drop=True)

    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2*np.pi*(mo-1)/12); df["month_cos"] = np.cos(2*np.pi*(mo-1)/12)
    g = df.groupby("mkey", group_keys=False)
    df["lag1"] = g.level_mbgl.shift(1); df["lag12"] = g.level_mbgl.shift(12)
    df["roll3"] = g.level_mbgl.shift(1).rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    df["rain_1m"] = df.rain_mm.fillna(df.rain_mm.median())
    df["rain_3m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(3, min_periods=1).sum()).reset_index(level=0, drop=True)
    df["rain_12m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(12, min_periods=1).sum()).reset_index(level=0, drop=True)

    # --- NEW covariates: root/surface soil wetness + temperature ---
    cov = pd.read_csv(os.path.join(P3, "data", "mandal_power_covariates.csv"))
    cov["mkey"] = cov.mandal.map(norm)
    cov = cov.groupby(["mkey", "date"], as_index=False)[["sm_root", "sm_top", "temp"]].mean()
    df = df.merge(cov, on=["mkey", "date"], how="left")
    for c in ["sm_root", "sm_top", "temp"]:
        df[c] = df[c].fillna(df[c].median())
    g2 = df.groupby("mkey", group_keys=False)
    df["sm_root_3m"] = g2.sm_root.apply(lambda x: x.rolling(3, min_periods=1).mean()).reset_index(level=0, drop=True)

    # centroids
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    idx = {}
    for m in geo["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts: continue
        lon = sum(p[0] for p in pts)/len(pts); lat = sum(p[1] for p in pts)/len(pts)
        idx.setdefault(norm(m["m"]), (round(lat, 4), round(lon, 4)))
    df["lat"] = df.mkey.map(lambda k: idx.get(k, (np.nan, np.nan))[0])
    df["lon"] = df.mkey.map(lambda k: idx.get(k, (np.nan, np.nan))[1])
    df["mandal_base"] = df.groupby("mkey").level_mbgl.transform("mean")
    df = df.dropna(subset=["lat", "lon", "lag1", "lag12"]).reset_index(drop=True)
    return df

def metrics(y, p):
    return np.sqrt(mean_squared_error(y, p)), mean_absolute_error(y, p), r2_score(y, p)

def evaluate(tr, te, num, label):
    m = model(num)
    m.fit(tr[num + CAT], tr.level_mbgl.values)
    r, a, r2 = metrics(te.level_mbgl.values, m.predict(te[num + CAT]))
    print(f"    {label:<10} RMSE {r:.3f} m   MAE {a:.3f} m   R2 {r2:.3f}")
    return a

def main():
    df = build()
    tr = df[df.date < "2024-01"]; te = df[df.date >= "2024-01"]
    print(f"  rows {len(df):,}  mandals {df.mkey.nunique()}   (train {len(tr):,} / test {len(te):,})\n")
    print("  FORECAST (train <2024, predict 2024->2026):")
    mae_base = evaluate(tr, te, NUM_BASE, "BASE")
    mae_cov = evaluate(tr, te, NUM_COV, "+ SOIL/TEMP")
    delta = mae_cov - mae_base
    print(f"\n  -> MAE change: {delta:+.3f} m ({100*delta/mae_base:+.1f}%)   "
          f"{'ADOPT — it helps' if delta < -0.01 else 'DO NOT adopt — no real gain (honest negative)'}")

if __name__ == "__main__":
    main()
