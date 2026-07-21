"""Tier-3 test (local, no new data): does SPATIAL correction of the GBM residuals help?
Regression-kriging idea — the tabular model may leave spatially-structured error that a
neighbour-based correction can recover. Compares, same temporal hold-out (train<2024, test>=2024):
  GBM baseline
  + per-mandal bias correction (mean training residual of that mandal)
  + spatial kNN correction (mean training residual of the ~5 nearest OTHER mandals)
Local: python phase3_levels/krige_residuals.py
"""
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.neighbors import NearestNeighbors
from train_dl_forecaster import build, NUM, CAT, metrics

def main():
    df = build()
    tr = df[df.date < "2024-01"].copy(); te = df[df.date >= "2024-01"].copy()
    print(f"  rows {len(df):,}  train {len(tr):,} / test {len(te):,}\n")
    pre = ColumnTransformer([("num", "passthrough", NUM), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    Xtr = pre.fit_transform(tr[NUM + CAT]); Xte = pre.transform(te[NUM + CAT])
    gbm = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8,
                                        l2_regularization=1.0, random_state=0)
    gbm.fit(Xtr, tr.level_mbgl.values)
    tr["pred"] = gbm.predict(Xtr); te["pred"] = gbm.predict(Xte)

    r, a, r2 = metrics(te.level_mbgl.values, te.pred.values)
    base = a
    print(f"    GBM baseline           RMSE {r:.3f}  MAE {a:.3f}  R2 {r2:.3f}")

    tr["resid"] = tr.level_mbgl.values - tr.pred.values
    rm = tr.groupby("mkey").resid.mean()

    # (a) per-mandal bias correction
    p = te.pred + te.mkey.map(rm).fillna(0.0)
    r, a, r2 = metrics(te.level_mbgl.values, p.values)
    print(f"    + self bias-correction RMSE {r:.3f}  MAE {a:.3f}  R2 {r2:.3f}   ({100*(a-base)/base:+.1f}% MAE)")

    # (b) spatial kNN correction (nearest OTHER mandals)
    cent = tr.groupby("mkey")[["lat", "lon"]].first().reindex(rm.index)
    keys = list(rm.index); kidx = {k: i for i, k in enumerate(keys)}
    nn = NearestNeighbors(n_neighbors=6).fit(cent.values)
    sc = {}
    for mk in te.mkey.unique():
        if mk not in kidx:
            sc[mk] = 0.0; continue
        _, ii = nn.kneighbors(cent.values[kidx[mk]:kidx[mk]+1])
        neigh = [keys[j] for j in ii[0] if keys[j] != mk][:5]
        sc[mk] = float(rm.loc[neigh].mean()) if neigh else 0.0
    p = te.pred + te.mkey.map(sc).fillna(0.0)
    r, a, r2 = metrics(te.level_mbgl.values, p.values)
    print(f"    + spatial kNN correc.  RMSE {r:.3f}  MAE {a:.3f}  R2 {r2:.3f}   ({100*(a-base)/base:+.1f}% MAE)")

if __name__ == "__main__":
    main()
