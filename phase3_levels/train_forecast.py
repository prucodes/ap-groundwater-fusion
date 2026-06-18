"""Forecasting + gap-fill engine for mandal groundwater level (metres).

This is the realistic, defensible product: a mandal HAS some sensor history; we
(a) gap-fill missing months and (b) forecast the next months, using past levels +
season + NASA-POWER rainfall (recharge driver). Satellite rainfall enters as the
dynamic signal Prakhar asked us to calibrate against.

Two honest evaluations:
  * GAP-FILL  : random cell hold-out (mandal has surrounding-month history).
  * FORECAST  : TEMPORAL hold-out — train on <= cutoff, predict the future months
                the model has never seen. Compared against a persistence baseline
                (predict last year's same month), which is what you'd do by hand.
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


def load():
    lv = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    lv = lv[(lv.level_mbgl > 0) & (lv.level_mbgl < 60)].copy()
    lv["mkey"] = lv.mandal.map(norm)
    aq = lv.district.map(aquifer_of)
    lv["aquifer_type"] = aq.map(lambda x: x[0]); lv["specific_yield"] = aq.map(lambda x: x[1])

    # rainfall (NASA POWER) keyed by normalized mandal name
    rp = os.path.join(HERE, "data", "mandal_rain_history.csv")
    rain = pd.read_csv(rp)
    rain["mkey"] = rain.mandal.map(norm)
    rain = rain.groupby(["mkey", "date"], as_index=False).rain_mm.mean()

    df = lv.merge(rain, on=["mkey", "date"], how="left")
    print(f"  levels {len(lv):,} rows | rainfall match {df.rain_mm.notna().mean()*100:.0f}%")
    return df


def add_features(df):
    df = df.sort_values(["mkey", "date"]).reset_index(drop=True)
    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2*np.pi*(mo-1)/12); df["month_cos"] = np.cos(2*np.pi*(mo-1)/12)
    df["year"] = df.date.str.slice(0, 4).astype(int)
    g = df.groupby("mkey", group_keys=False)
    # autoregressive level features (per mandal, time-ordered)
    df["lag1"] = g.level_mbgl.shift(1)
    df["lag12"] = g.level_mbgl.shift(12)
    df["roll3"] = g.level_mbgl.shift(1).rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    # rainfall drivers (trailing sums, no leakage — include current month)
    r = df.rain_mm.fillna(df.rain_mm.median())
    df["rain_1m"] = r
    df["rain_3m"] = g.apply(lambda x: x.rain_mm.fillna(0).rolling(3, min_periods=1).sum()).reset_index(level=0, drop=True)
    df["rain_12m"] = g.apply(lambda x: x.rain_mm.fillna(0).rolling(12, min_periods=1).sum()).reset_index(level=0, drop=True)
    return df


NUM = ["lat", "lon", "specific_yield", "month_sin", "month_cos",
       "lag1", "lag12", "roll3", "rain_1m", "rain_3m", "rain_12m", "mandal_base"]
CAT = ["aquifer_type"]


def est():
    pre = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    return Pipeline([("pre", pre), ("reg", HistGradientBoostingRegressor(
        max_iter=600, learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0))])


def centroids_join(df):
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    idx = {}
    for m in g["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts: continue
        lon = sum(p[0] for p in pts)/len(pts); lat = sum(p[1] for p in pts)/len(pts)
        idx.setdefault(norm(m["m"]), (round(lat,4), round(lon,4)))
    keys = list(idx.keys())
    cache = {}
    def look(mk):
        if mk in cache: return cache[mk]
        v = idx.get(mk)
        if v is None:
            hit = difflib.get_close_matches(mk, keys, n=1, cutoff=0.88)
            v = idx[hit[0]] if hit else (np.nan, np.nan)
        cache[mk] = v; return v
    ll = df.mkey.map(look)
    df["lat"] = ll.map(lambda x: x[0]); df["lon"] = ll.map(lambda x: x[1])
    return df.dropna(subset=["lat", "lon"]).reset_index(drop=True)


def main():
    df = load()
    df = add_features(df)
    df = centroids_join(df)
    df = df.dropna(subset=["lag1", "lag12"]).reset_index(drop=True)  # need history
    print(f"  modelling rows (with 1y history): {len(df):,}  mandals {df.mkey.nunique()}")
    y = df.level_mbgl.values

    # ---------- GAP-FILL: random cell hold-out ----------
    from sklearn.model_selection import KFold
    kf = KFold(5, shuffle=True, random_state=0)
    p_gap = np.zeros(len(y))
    for tr, te in kf.split(df):
        base = df.iloc[tr].groupby("mkey").level_mbgl.mean(); gm = y[tr].mean()
        trd = df.iloc[tr].copy(); ted = df.iloc[te].copy()
        trd["mandal_base"] = trd.mkey.map(base).fillna(gm); ted["mandal_base"] = ted.mkey.map(base).fillna(gm)
        m = est(); m.fit(trd[NUM+CAT], y[tr]); p_gap[te] = m.predict(ted[NUM+CAT])
    r, ma, r2 = metrics(y, p_gap)
    print(f"\n  GAP-FILL (random month hold-out, +rainfall):  RMSE {r:.2f} m  MAE {ma:.2f} m  R² {r2:.2f}")

    # ---------- FORECAST: temporal hold-out ----------
    cutoff = "2024-01"
    tr = df.date < cutoff; te = df.date >= cutoff
    base = df[tr].groupby("mkey").level_mbgl.mean(); gm = df[tr].level_mbgl.mean()
    trd = df[tr].copy(); ted = df[te].copy()
    trd["mandal_base"] = trd.mkey.map(base).fillna(gm); ted["mandal_base"] = ted.mkey.map(base).fillna(gm)
    m = est(); m.fit(trd[NUM+CAT], df[tr].level_mbgl.values)
    pf = m.predict(ted[NUM+CAT]); yt = df[te].level_mbgl.values
    # persistence baseline: predict same month last year (lag12)
    persist = ted["lag12"].values
    rmf, maf, r2f = metrics(yt, pf)
    rmp, map_, r2p = metrics(yt, persist)
    print(f"\n  FORECAST (train <{cutoff}, predict {cutoff}->2026, never-seen months):")
    print(f"    model        RMSE {rmf:.2f} m  MAE {maf:.2f} m  R² {r2f:.2f}   (n={te.sum():,})")
    print(f"    persistence  RMSE {rmp:.2f} m  MAE {map_:.2f} m  R² {r2p:.2f}   <- predict last year's same month")
    print(f"    -> model is {(1-rmf/rmp)*100:.0f}% better than persistence")
    print("\n  Forecast model by terrain:")
    for aqt in ["alluvial", "coastal", "hard_rock"]:
        mk = ted.aquifer_type.values == aqt
        if mk.sum() == 0: continue
        r, ma, r2 = metrics(yt[mk], pf[mk])
        print(f"    {aqt:12s} (n={mk.sum():5d})  RMSE {r:.2f} m  MAE {ma:.2f} m  R² {r2:.2f}")


if __name__ == "__main__":
    main()
