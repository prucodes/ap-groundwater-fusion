"""Replace the 3-class specific-yield PROXY with REAL measured specific yield from
the CGWB/Nature quality-controlled dataset (169 AP wells, figshare 29293877), via
inverse-distance interpolation to each mandal centroid. Then A/B test whether real
Sy improves the forecast vs the proxy.
"""
import csv, json, os, re, math, glob
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
SYCSV = glob.glob(os.path.join(HERE, "cgwb_sy", "**", "CGWB_India_filtered_GWLs_ref_sy_2000_2022.csv"), recursive=True)[0]


def norm(s):
    s = str(s).upper().strip(); s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


def hav(la1, lo1, la2, lo2):
    R = 6371.0; p1, p2 = np.radians(la1), np.radians(la2)
    dla = np.radians(la2 - la1); dlo = np.radians(lo2 - lo1)
    a = np.sin(dla/2)**2 + np.cos(p1)*np.cos(p2)*np.sin(dlo/2)**2
    return 2*R*np.arcsin(np.sqrt(a))


def ap_wells():
    out = []
    for r in csv.DictReader(open(SYCSV, encoding="utf-8", errors="ignore")):
        if "ANDHRA" not in (r.get("State") or "").upper():
            continue
        try:
            la, lo, sy = float(r["Latitude"]), float(r["Longitude"]), float(r["Reference_Sy"])
        except (ValueError, TypeError):
            continue
        if 0.005 < sy < 0.35 and 12 < la < 20 and 76 < lo < 85:
            out.append((la, lo, sy))
    return out


def mandal_centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = {}
    for m in g["mandals"]:
        pts = [pt for ring in m["rings"] for pt in ring]
        if pts:
            out[norm(m["m"])] = (sum(p[1] for p in pts)/len(pts), sum(p[0] for p in pts)/len(pts))
    return out


def main():
    wells = ap_wells()
    wla = np.array([w[0] for w in wells]); wlo = np.array([w[1] for w in wells]); wsy = np.array([w[2] for w in wells])
    print(f"  real Sy wells (AP): {len(wells)}  mean {wsy.mean():.3f}")
    cents = mandal_centroids()
    out = {}
    for mk, (la, lo) in cents.items():
        d = hav(la, lo, wla, wlo)
        order = np.argsort(d)[:6]                 # 6 nearest wells, IDW
        dd, vv = d[order], wsy[order]
        w = 1.0 / (dd**2 + 1e-6)
        out[mk] = round(float(np.sum(w*vv)/np.sum(w)), 4)
    with open(os.path.join(HERE, "data", "mandal_specific_yield.csv"), "w", newline="") as f:
        wr = csv.writer(f); wr.writerow(["mkey", "specific_yield_real"])
        for mk, sy in out.items():
            wr.writerow([mk, sy])
    print(f"  wrote real Sy for {len(out)} mandals -> data/mandal_specific_yield.csv")

    # ---- A/B: forecast with proxy Sy vs real Sy ----
    import train_forecast as T
    df = T.load(); df = T.add_features(df); df = T.centroids_join(df)
    df = df.dropna(subset=["lag1", "lag12"]).reset_index(drop=True)
    df["sy_real"] = df.mkey.map(out).fillna(np.median(list(out.values())))
    from sklearn.compose import ColumnTransformer
    from sklearn.preprocessing import OneHotEncoder
    from sklearn.pipeline import Pipeline
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
    cutoff = "2024-01"; tr = df.date < cutoff; te = df.date >= cutoff
    base = df[tr].groupby("mkey").level_mbgl.mean(); gm = df[tr].level_mbgl.mean()
    def run(num):
        trd = df[tr].copy(); ted = df[te].copy()
        trd["mandal_base"] = trd.mkey.map(base).fillna(gm); ted["mandal_base"] = ted.mkey.map(base).fillna(gm)
        pre = ColumnTransformer([("n", "passthrough", num), ("c", OneHotEncoder(handle_unknown="ignore"), ["aquifer_type"])])
        m = Pipeline([("p", pre), ("r", HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0))])
        m.fit(trd[num+["aquifer_type"]], df[tr].level_mbgl.values)
        p = m.predict(ted[num+["aquifer_type"]]); y = df[te].level_mbgl.values
        return math.sqrt(mean_squared_error(y, p)), mean_absolute_error(y, p), r2_score(y, p)
    proxy = [c for c in T.NUM]                    # includes proxy specific_yield
    real = [c for c in T.NUM if c != "specific_yield"] + ["sy_real"]
    r0 = run(proxy); r1 = run(real)
    print(f"\n  FORECAST proxy Sy:  MAE {r0[1]:.3f}  RMSE {r0[0]:.3f}  R2 {r0[2]:.3f}")
    print(f"  FORECAST real  Sy:  MAE {r1[1]:.3f}  RMSE {r1[0]:.3f}  R2 {r1[2]:.3f}")
    print(f"  -> MAE change {r0[1]-r1[1]:+.3f} m")


if __name__ == "__main__":
    main()
