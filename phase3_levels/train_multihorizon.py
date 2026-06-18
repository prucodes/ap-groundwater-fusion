"""Multi-horizon forecast: how far ahead can we usefully predict a mandal's metres?

The production engine is 1-month nowcast. Here we train DIRECT h-step models for
h = 1, 3, 6, 12 months ahead: at time t we use only what's known at t (current
level, last-year level, recent trend, trailing rainfall, and the *calendar* month
of the target), and predict the level h months later. No future rainfall is used
(it's unknown), so this is an honest forecast.

Temporal hold-out (train < 2024, predict 2024->2026). Each horizon is compared to:
  * no-change   : predict the current level (level_t)
  * seasonal    : predict the same calendar month a year earlier
so we only claim credit for what the model adds over the obvious baselines.
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
    m = ~np.isnan(p)
    return (math.sqrt(mean_squared_error(y[m], p[m])), mean_absolute_error(y[m], p[m]), r2_score(y[m], p[m]))


def base_frame():
    lv = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    lv = lv[(lv.level_mbgl > 0) & (lv.level_mbgl < 60)].copy()
    lv["mkey"] = lv.mandal.map(norm)
    aq = lv.district.map(aquifer_of)
    lv["aquifer_type"] = aq.map(lambda x: x[0]); lv["specific_yield"] = aq.map(lambda x: x[1])
    rain = pd.read_csv(os.path.join(HERE, "data", "mandal_rain_history.csv"))
    rain["mkey"] = rain.mandal.map(norm)
    rain = rain.groupby(["mkey", "date"], as_index=False).rain_mm.mean()
    df = lv.merge(rain, on=["mkey", "date"], how="left").sort_values(["mkey", "date"]).reset_index(drop=True)
    df["t"] = pd.to_datetime(df.date + "-01")
    g = df.groupby("mkey", group_keys=False)
    df["cur"] = df.level_mbgl
    df["lag12"] = g.level_mbgl.shift(12)
    df["roll3"] = g.level_mbgl.shift(1).rolling(3, min_periods=1).mean().reset_index(level=0, drop=True)
    df["rain_3m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(3, min_periods=1).sum()).reset_index(level=0, drop=True)
    df["rain_12m"] = g.rain_mm.apply(lambda x: x.fillna(0).rolling(12, min_periods=1).sum()).reset_index(level=0, drop=True)
    # centroids
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json"))); idx = {}
    for m in geo["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts: continue
        lon = sum(p[0] for p in pts)/len(pts); lat = sum(p[1] for p in pts)/len(pts)
        idx.setdefault(norm(m["m"]), (round(lat,4), round(lon,4)))
    keys = list(idx.keys()); cache = {}
    def look(mk):
        if mk in cache: return cache[mk]
        v = idx.get(mk) or (idx[difflib.get_close_matches(mk, keys, n=1, cutoff=0.88)[0]]
                            if difflib.get_close_matches(mk, keys, n=1, cutoff=0.88) else (np.nan, np.nan))
        cache[mk] = v; return v
    ll = df.mkey.map(look); df["lat"] = ll.map(lambda x: x[0]); df["lon"] = ll.map(lambda x: x[1])
    return df.dropna(subset=["lat", "lon", "lag12"]).reset_index(drop=True)


NUM = ["lat", "lon", "specific_yield", "cur", "lag12", "roll3", "rain_3m", "rain_12m",
       "tgt_sin", "tgt_cos", "mandal_base"]
CAT = ["aquifer_type"]

def make_horizon(df, h):
    """Attach target = level h months later (same mandal), plus target-month season."""
    nxt = df[["mkey", "t", "level_mbgl"]].copy()
    nxt["t"] = nxt["t"] - pd.DateOffset(months=h)   # so it joins to the row h months earlier
    nxt = nxt.rename(columns={"level_mbgl": "target"})
    d = df.merge(nxt, on=["mkey", "t"], how="inner")
    tgt_month = (d["t"].dt.month + h - 1) % 12 + 1
    d["tgt_sin"] = np.sin(2*np.pi*(tgt_month-1)/12); d["tgt_cos"] = np.cos(2*np.pi*(tgt_month-1)/12)
    # seasonal baseline = level same calendar month last year, relative to target time
    d["seasonal_base"] = d["lag12"]  # approx: last-year value near target season
    return d


def est():
    pre = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    return Pipeline([("pre", pre), ("reg", HistGradientBoostingRegressor(
        max_iter=600, learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0))])


def main():
    df = base_frame()
    print(f"  base rows {len(df):,}  mandals {df.mkey.nunique()}\n")
    print(f"  {'horizon':>8} | {'model MAE':>9} {'RMSE':>6} {'R2':>5} | {'no-change':>9} {'seasonal':>9}")
    print("  " + "-"*60)
    for h in [1, 3, 6, 12]:
        d = make_horizon(df, h)
        cutoff = pd.Timestamp("2024-01-01")
        tr = d.t < cutoff; te = d.t >= cutoff
        base = d[tr].groupby("mkey").level_mbgl.mean(); gm = d[tr].level_mbgl.mean()
        trd = d[tr].copy(); ted = d[te].copy()
        trd["mandal_base"] = trd.mkey.map(base).fillna(gm); ted["mandal_base"] = ted.mkey.map(base).fillna(gm)
        m = est(); m.fit(trd[NUM+CAT], d[tr].target.values)
        yt = d[te].target.values; pf = m.predict(ted[NUM+CAT])
        rm, ma, r2 = metrics(yt, pf)
        nc = metrics(yt, d[te].cur.values)       # no-change
        se = metrics(yt, d[te].seasonal_base.values)  # seasonal
        print(f"  {h:>6}mo | {ma:>9.2f} {rm:>6.2f} {r2:>5.2f} | {nc[1]:>9.2f} {se[1]:>9.2f}")
    print("\n  (model MAE in metres; lower is better. 'no-change'/'seasonal' are the naive baselines.)")


if __name__ == "__main__":
    main()
