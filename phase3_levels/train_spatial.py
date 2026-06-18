"""Spatial-fusion experiment: can we estimate a NO-SENSOR mandal's monthly metres
from the SURROUNDING mandals' sensors (+ terrain + season)?

This is the question Prakhar actually asked. The standard, defensible method for
"fill a location with no sensor" is spatial interpolation from neighbours
(IDW / regression-kriging), NOT pure ML on static covariates. We test it honestly
with leave-whole-mandal-out CV: for each held-out mandal, it is interpolated from
ONLY the training mandals (it never sees its own readings).

Models compared, all under the SAME spatial GroupKFold:
  A. naive            -> predict the global mean (floor)
  B. static ML        -> location+terrain+aquifer+season  (the prior baseline)
  C. IDW neighbours   -> inverse-distance weighted mean of training mandals, per month
  D. fusion ML        -> static features + the IDW-neighbour estimate as a feature
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
    s = str(name).upper().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def mandal_centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = {}
    for m in g["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts: continue
        lon = sum(p[0] for p in pts) / len(pts); lat = sum(p[1] for p in pts) / len(pts)
        out[m["m"].strip().upper()] = (round(lat, 4), round(lon, 4))
    return out


def resolve_centroids(names, cents):
    idx = {}
    for k, v in cents.items():
        idx.setdefault(norm(k), v)
    keys = list(idx.keys()); res = {}
    for raw in names:
        up = raw.strip().upper()
        if up in cents: res[up] = cents[up]; continue
        nm = norm(raw)
        if nm in idx: res[up] = idx[nm]; continue
        hit = difflib.get_close_matches(nm, keys, n=1, cutoff=0.88)
        if hit: res[up] = idx[hit[0]]
    return res


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dlat = np.radians(lat2 - lat1); dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat/2)**2 + np.cos(p1)*np.cos(p2)*np.sin(dlon/2)**2
    return 2 * R * np.arcsin(np.sqrt(a))


def idw_predict(train, test, k=8, power=2.0):
    """For each test row, IDW of the SAME-month training readings from k nearest mandals."""
    out = np.full(len(test), np.nan)
    # group training rows by month for same-month interpolation
    tr_by_month = {m: g for m, g in train.groupby("date")}
    test = test.reset_index(drop=True)
    for i, r in test.iterrows():
        g = tr_by_month.get(r["date"])
        if g is None or len(g) == 0:
            continue
        d = haversine_km(r["lat"], r["lon"], g["lat"].values, g["lon"].values)
        order = np.argsort(d)[:k]
        dd = d[order]; vv = g["level_mbgl"].values[order]
        if dd[0] < 1e-6:  # exact same point (shouldn't happen across mandals)
            out[i] = vv[0]; continue
        w = 1.0 / (dd ** power)
        out[i] = np.sum(w * vv) / np.sum(w)
    # fallback for months with no neighbours -> training global mean
    out[np.isnan(out)] = train["level_mbgl"].mean()
    return out


def metrics(y, p):
    return (math.sqrt(mean_squared_error(y, p)), mean_absolute_error(y, p), r2_score(y, p))


def main():
    df = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    df = df[(df.level_mbgl > 0) & (df.level_mbgl < 60)].copy()
    cents = mandal_centroids()
    resolved = resolve_centroids(df.mandal.unique(), cents)
    key = df.mandal.str.strip().str.upper()
    df["lat"] = key.map(lambda m: resolved.get(m, (np.nan, np.nan))[0])
    df["lon"] = key.map(lambda m: resolved.get(m, (np.nan, np.nan))[1])
    aq = df.district.map(aquifer_of)
    df["aquifer_type"] = aq.map(lambda x: x[0]); df["specific_yield"] = aq.map(lambda x: x[1])
    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2*np.pi*(mo-1)/12); df["month_cos"] = np.cos(2*np.pi*(mo-1)/12)
    df["year"] = df.date.str.slice(0, 4).astype(int)
    df = df.dropna(subset=["lat", "lon"]).reset_index(drop=True)
    print(f"  rows: {len(df):,}  mandals: {df.mandal.nunique()}")

    y = df.level_mbgl.values
    groups = df.mandal.values
    gkf = GroupKFold(n_splits=5)

    NUM = ["lat", "lon", "specific_yield", "year", "month_sin", "month_cos"]
    CAT = ["aquifer_type"]
    def est(num):
        pre = ColumnTransformer([("num", "passthrough", num), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
        return Pipeline([("pre", pre), ("reg", HistGradientBoostingRegressor(max_iter=500, learning_rate=0.05, max_depth=7, random_state=0))])

    p_static = np.zeros(len(y)); p_idw = np.zeros(len(y)); p_fus = np.zeros(len(y))
    for tr, te in gkf.split(df, y, groups):
        trd, ted = df.iloc[tr], df.iloc[te]
        # B static
        m = est(NUM); m.fit(trd[NUM+CAT], y[tr]); p_static[te] = m.predict(ted[NUM+CAT])
        # C idw
        idw_te = idw_predict(trd, ted)
        p_idw[te] = idw_te
        # D fusion: add idw as a feature (compute idw for train too, via internal split-free same-fold)
        idw_tr = idw_predict(trd, trd)   # train rows interpolated from other train mandals
        trd2 = trd.copy(); trd2["idw"] = idw_tr
        ted2 = ted.copy(); ted2["idw"] = idw_te
        mf = est(NUM + ["idw"]); mf.fit(trd2[NUM+["idw"]+CAT], y[tr]); p_fus[te] = mf.predict(ted2[NUM+["idw"]+CAT])

    naive = np.full_like(y, y.mean())
    print("\n  Spatial CV (whole mandals held out) — metres-accuracy at a NO-SENSOR mandal:")
    for name, p in [("A naive (predict average)", naive), ("B static ML", p_static),
                    ("C IDW neighbours", p_idw), ("D fusion (static + IDW)", p_fus)]:
        r, ma, r2 = metrics(y, p)
        print(f"    {name:28s}  RMSE {r:5.2f} m   MAE {ma:5.2f} m   R² {r2:5.2f}")

    # per-terrain breakdown for the best model (fusion)
    print("\n  Fusion model by aquifer terrain (worst case — whole mandal blind):")
    for aqt in ["alluvial", "coastal", "hard_rock"]:
        mask = df.aquifer_type.values == aqt
        if mask.sum() == 0: continue
        r, ma, r2 = metrics(y[mask], p_fus[mask])
        print(f"    {aqt:12s} (n={mask.sum():6d})  RMSE {r:5.2f} m   MAE {ma:5.2f} m   R² {r2:5.2f}")

    # ---- REALISTIC scenario: GAP-FILL (mandal has history, fill missing months) ----
    # Random cell hold-out. Features add the mandal's own baseline (mean of its TRAIN
    # rows) — this is the common operational case (a mandal with sparse/late readings).
    from sklearn.model_selection import KFold
    print("\n  GAP-FILL scenario (mandal has some history; predict a missing month):")
    p_gap = np.zeros(len(y))
    kf = KFold(n_splits=5, shuffle=True, random_state=0)
    NUM2 = NUM + ["mandal_base"]
    for tr, te in kf.split(df):
        base = df.iloc[tr].groupby("mandal")["level_mbgl"].mean()
        gmean = y[tr].mean()
        trd = df.iloc[tr].copy(); ted = df.iloc[te].copy()
        trd["mandal_base"] = trd["mandal"].map(base).fillna(gmean)
        ted["mandal_base"] = ted["mandal"].map(base).fillna(gmean)
        m = est(NUM2); m.fit(trd[NUM2+CAT], y[tr]); p_gap[te] = m.predict(ted[NUM2+CAT])
    r, ma, r2 = metrics(y, p_gap)
    print(f"    overall                      RMSE {r:5.2f} m   MAE {ma:5.2f} m   R² {r2:5.2f}")
    for aqt in ["alluvial", "coastal", "hard_rock"]:
        mask = df.aquifer_type.values == aqt
        if mask.sum() == 0: continue
        r, ma, r2 = metrics(y[mask], p_gap[mask])
        print(f"    {aqt:12s} (n={mask.sum():6d})  RMSE {r:5.2f} m   MAE {ma:5.2f} m   R² {r2:5.2f}")


if __name__ == "__main__":
    main()
