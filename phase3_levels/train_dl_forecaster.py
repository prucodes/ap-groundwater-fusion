"""#2 experiment — does a neural net beat gradient boosting on the groundwater forecast?

Honest DL-vs-GBM benchmark on IDENTICAL features, same temporal hold-out (train <2024,
predict 2024->26). PyTorch MLP vs HistGradientBoosting. Uses a GPU if present (H100/cuda
on the platform, MPS on Apple Silicon, else CPU) — but the data is small, so this is an
*accuracy* test, not a compute one. Expected honest outcome: DL does NOT beat GBM on data
this size. If so, that's a valid result — we keep the efficient model, and the value of the
run is (a) due-diligence and (b) exercising the platform's GPU.

Local:    pip install torch  &&  python phase3_levels/train_dl_forecaster.py
Platform: run as a GPU Job on the H100 (see gpu-dl-job.yaml).
"""
import os, re, json
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import torch, torch.nn as nn

BASE = "gw-workbench" if os.path.isdir("gw-workbench") else "."
P3 = os.path.join(BASE, "phase3_levels"); APP = os.path.join(BASE, "app", "data")

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
    return df.dropna(subset=["lat", "lon", "lag1", "lag12"]).reset_index(drop=True)

def metrics(y, p):
    return np.sqrt(mean_squared_error(y, p)), mean_absolute_error(y, p), r2_score(y, p)

class MLP(nn.Module):
    def __init__(self, d):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(d, 128), nn.ReLU(), nn.Dropout(0.1),
                                 nn.Linear(128, 64), nn.ReLU(), nn.Linear(64, 1))
    def forward(self, x):
        return self.net(x).squeeze(-1)

def main():
    df = build()
    tr = df[df.date < "2024-01"]; te = df[df.date >= "2024-01"]
    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    dev_name = torch.cuda.get_device_name(0) if device == "cuda" else device
    print(f"  rows {len(df):,}  device: {device} ({dev_name})   train {len(tr):,} / test {len(te):,}\n")

    # GBM baseline (the current production model)
    pre_g = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    Xtr_g = pre_g.fit_transform(tr[NUM + CAT]); Xte_g = pre_g.transform(te[NUM + CAT])
    gbm = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8,
                                        l2_regularization=1.0, random_state=0)
    gbm.fit(Xtr_g, tr.level_mbgl.values)
    r, a, r2 = metrics(te.level_mbgl.values, gbm.predict(Xte_g))
    print(f"    GBM (baseline)   RMSE {r:.3f} m   MAE {a:.3f} m   R2 {r2:.3f}")
    mae_gbm = a

    # PyTorch MLP on the same features (standardized)
    pre = ColumnTransformer([("num", StandardScaler(), NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    Xtr = np.asarray(pre.fit_transform(tr[NUM + CAT]), dtype=np.float32)
    Xte = np.asarray(pre.transform(te[NUM + CAT]), dtype=np.float32)
    ymu, ysd = float(tr.level_mbgl.mean()), float(tr.level_mbgl.std())
    ytr = ((tr.level_mbgl.values - ymu) / ysd).astype(np.float32)

    torch.manual_seed(0)
    model = MLP(Xtr.shape[1]).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    lossf = nn.MSELoss()
    Xt = torch.tensor(Xtr, device=device); yt = torch.tensor(ytr, device=device)
    n, bs = len(Xt), 2048
    for epoch in range(300):
        model.train(); perm = torch.randperm(n, device=device)
        for i in range(0, n, bs):
            idx = perm[i:i + bs]
            opt.zero_grad()
            loss = lossf(model(Xt[idx]), yt[idx]); loss.backward(); opt.step()
    model.eval()
    with torch.no_grad():
        pred = model(torch.tensor(Xte, device=device)).cpu().numpy() * ysd + ymu
    r, a, r2 = metrics(te.level_mbgl.values, pred)
    print(f"    PyTorch MLP      RMSE {r:.3f} m   MAE {a:.3f} m   R2 {r2:.3f}")

    d = a - mae_gbm
    print(f"\n  -> MLP vs GBM MAE: {d:+.3f} m ({100*d/mae_gbm:+.1f}%)   "
          f"{'DL WINS' if d < -0.01 else 'GBM STAYS BEST — DL did not beat it (honest result)'}")

if __name__ == "__main__":
    main()
