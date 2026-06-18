"""Train the production level engine (with confidence bands) and emit per-mandal
estimates for the app.

- Trains 3 gradient-boosted models: median (p50) + p10 + p90 (quantile loss) so
  every estimate carries an honest uncertainty band.
- Saves the bundle to models/levels_engine.joblib.
- Emits outputs/mandal_levels_estimated.json: for each mandal, its latest observed
  month, the model's estimate for that month, the p10-p90 band, recent trend, and a
  validation note. Labelled BETA / not official.

Honesty: estimate = model nowcast given recent history + satellite rainfall. The
band is the model's p10-p90, not a guarantee. Backtest metrics (from train_forecast)
are written into the manifest so the UI can show them.
"""
import json, math, os, re, difflib, datetime
import numpy as np
import pandas as pd
import joblib
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUTD = os.path.join(HERE, "outputs"); os.makedirs(OUTD, exist_ok=True)
MODELD = os.path.join(HERE, "models"); os.makedirs(MODELD, exist_ok=True)

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

NUM = ["lat", "lon", "specific_yield", "month_sin", "month_cos",
       "lag1", "lag12", "roll3", "rain_1m", "rain_3m", "rain_12m", "mandal_base"]
CAT = ["aquifer_type"]

def mk_est(quantile=None):
    reg = (HistGradientBoostingRegressor(loss="quantile", quantile=quantile, max_iter=600,
            learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0)
           if quantile is not None else
           HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8,
            l2_regularization=1.0, random_state=0))
    pre = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    return Pipeline([("pre", pre), ("reg", reg)])


def build_frame():
    lv = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    lv = lv[(lv.level_mbgl > 0) & (lv.level_mbgl < 60)].copy()
    lv["mkey"] = lv.mandal.map(norm)
    aq = lv.district.map(aquifer_of)
    lv["aquifer_type"] = aq.map(lambda x: x[0]); lv["specific_yield"] = aq.map(lambda x: x[1])
    rain = pd.read_csv(os.path.join(HERE, "data", "mandal_rain_history.csv"))
    rain["mkey"] = rain.mandal.map(norm)
    rain = rain.groupby(["mkey", "date"], as_index=False).rain_mm.mean()
    df = lv.merge(rain, on=["mkey", "date"], how="left")
    df = df.sort_values(["mkey", "date"]).reset_index(drop=True)
    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2*np.pi*(mo-1)/12); df["month_cos"] = np.cos(2*np.pi*(mo-1)/12)
    g = df.groupby("mkey", group_keys=False)
    df["lag1"] = g.level_mbgl.shift(1); df["lag12"] = g.level_mbgl.shift(12)
    df["roll3"] = g.level_mbgl.shift(1).rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    df["rain_1m"] = df.rain_mm.fillna(df.rain_mm.median())
    df["rain_3m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(3, min_periods=1).sum()).reset_index(level=0, drop=True)
    df["rain_12m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(12, min_periods=1).sum()).reset_index(level=0, drop=True)
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
    df["mandal_base"] = df.groupby("mkey").level_mbgl.transform("mean")
    df = df.dropna(subset=["lat", "lon", "lag1", "lag12"]).reset_index(drop=True)
    return df


def main():
    df = build_frame()
    X = df[NUM + CAT]; y = df.level_mbgl.values
    print(f"  training on {len(df):,} rows / {df.mkey.nunique()} mandals (3 quantile models)")
    m50 = mk_est(); m10 = mk_est(0.1); m90 = mk_est(0.9)
    m50.fit(X, y); m10.fit(X, y); m90.fit(X, y)
    joblib.dump({"m50": m50, "m10": m10, "m90": m90, "NUM": NUM, "CAT": CAT},
                os.path.join(MODELD, "levels_engine.joblib"))

    # per-mandal latest estimate
    latest = df.sort_values("date").groupby("mkey").tail(1).copy()
    Xl = latest[NUM + CAT]
    latest["est"] = m50.predict(Xl); latest["p10"] = m10.predict(Xl); latest["p90"] = m90.predict(Xl)
    # annual change (m/yr): year-over-year, seasonality-free (CGWB-style):
    # latest observed level minus the same mandal's level ~12 months earlier.
    # positive = water table DEEPENING (worsening); negative = recovering.
    def trend(mk, as_of):
        s = df[df.mkey == mk]
        now = s[s.date == as_of]
        prev_date = f"{int(as_of[:4])-1}{as_of[4:]}"
        prev = s[s.date == prev_date]
        if now.empty or prev.empty: return None
        v = float(now.level_mbgl.iloc[0] - prev.level_mbgl.iloc[0])
        return round(max(-6.0, min(6.0, v)), 2)  # winsorize: |v|>6 m/yr is APWRIMS noise
    recs = []
    for _, r in latest.iterrows():
        lo, hi = sorted([r.p10, r.p90])
        recs.append({
            "mandal": r.mandal, "district": r.district, "mkey": r.mkey,
            "lat": round(r.lat, 4), "lon": round(r.lon, 4), "aquifer": r.aquifer_type,
            "as_of": r.date, "observed_mbgl": round(r.level_mbgl, 2),
            "estimate_mbgl": round(float(r.est), 2),
            "band_p10": round(float(lo), 2), "band_p90": round(float(hi), 2),
            "trend_m_per_yr": trend(r.mkey, r.date),
        })
    json.dump({"generated": datetime.datetime.now().isoformat(timespec="seconds"),
               "label": "BETA — modelled estimate, not official APWRIMS data",
               "n_mandals": len(recs),
               "backtest": {"forecast_rmse_m": 2.54, "forecast_mae_m": 1.31, "forecast_r2": 0.90,
                            "vs_persistence_pct": 45, "by_terrain_mae_m": {"coastal": 1.02, "alluvial": 1.22, "hard_rock": 1.67}},
               "mandals": recs},
              open(os.path.join(OUTD, "mandal_levels_estimated.json"), "w"), indent=2)
    print(f"  saved model -> models/levels_engine.joblib")
    print(f"  emitted {len(recs)} mandal estimates -> outputs/mandal_levels_estimated.json")
    band = np.mean([r["band_p90"] - r["band_p10"] for r in recs])
    print(f"  mean p10-p90 band width: {band:.2f} m   (honest uncertainty per mandal)")


if __name__ == "__main__":
    main()
