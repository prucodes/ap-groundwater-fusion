"""Does CGWB mandal-level EXTRACTION improve the forecast? The one genuinely new
(demand-side) signal. Adds stage-of-extraction % + irrigation-pumping per mandal
(static, from the 2024 assessment) and A/B tests it, same temporal hold-out.
Local: python phase3_levels/train_ab_extraction.py
"""
import os, re
import numpy as np, pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from train_dl_forecaster import build, NUM, CAT, norm, P3

NUM_X = NUM + ["stage_pct", "irrigation_ham"]

def model(num):
    pre = ColumnTransformer([("num", "passthrough", num), ("cat", OneHotEncoder(handle_unknown="ignore"), CAT)])
    reg = HistGradientBoostingRegressor(max_iter=600, learning_rate=0.05, max_depth=8, l2_regularization=1.0, random_state=0)
    return __import__("sklearn.pipeline", fromlist=["Pipeline"]).Pipeline([("pre", pre), ("reg", reg)])

def metrics(y, p): return np.sqrt(mean_squared_error(y, p)), mean_absolute_error(y, p), r2_score(y, p)

def main():
    df = build()
    ex = pd.read_csv(os.path.join(P3, "data", "mandal_extraction_cgwb2024.csv"))
    ex["mkey"] = ex.mandal.map(norm)
    ex = ex.groupby("mkey", as_index=False)[["stage_pct", "irrigation_ham"]].mean()
    df = df.merge(ex, on="mkey", how="left")
    matched = df.dropna(subset=["stage_pct"]).mkey.nunique()
    for c in ["stage_pct", "irrigation_ham"]:
        df[c] = df[c].fillna(df[c].median())
    print(f"  rows {len(df):,}  mandals {df.mkey.nunique()}  (extraction matched: {matched} mandals)\n")

    tr = df[df.date < "2024-01"]; te = df[df.date >= "2024-01"]
    for label, num in [("BASE", NUM), ("+ EXTRACTION", NUM_X)]:
        m = model(num); m.fit(tr[num + CAT], tr.level_mbgl.values)
        r, a, r2 = metrics(te.level_mbgl.values, m.predict(te[num + CAT]))
        print(f"    {label:<13} RMSE {r:.3f} m   MAE {a:.3f} m   R2 {r2:.3f}")
        if label == "BASE": base = a
        else:
            d = a - base
            print(f"\n  -> MAE change: {d:+.3f} m ({100*d/base:+.1f}%)   "
                  f"{'ADOPT — it helps' if d < -0.01 else 'no real gain (honest negative)'}")

if __name__ == "__main__":
    main()
