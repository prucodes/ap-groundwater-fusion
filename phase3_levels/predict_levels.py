"""Phase 3 — predict groundwater level (metres) per mandal from current features.

Usage:
  python predict_levels.py --features data/mandal_features_current.csv
  python predict_levels.py --demo     # synthetic current-features, proves inference runs

Output: outputs/mandal_levels_current.json — one record per mandal:
  estimated mbgl (median) + p10..p90 confidence band + basis (sat-only / sat+sensor).
Every number is labelled an ESTIMATE with a band — never an exact reading.
"""
import argparse, json, os, sys, datetime
import numpy as np
import pandas as pd
import joblib

sys.path.insert(0, os.path.dirname(__file__))
from lib_features import ALL_FEATURES
from train_levels_model import make_demo

HERE = os.path.dirname(__file__)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default=os.path.join(HERE, "models", "levels_model.joblib"))
    ap.add_argument("--features", help="CSV of current per-mandal features")
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "outputs", "mandal_levels_current.json"))
    args = ap.parse_args()

    if not os.path.exists(args.model):
        sys.exit(f"[x] No model at {args.model} — run train_levels_model.py first.")
    bundle = joblib.load(args.model)

    if args.demo or not args.features:
        df = make_demo(n=670, seed=99).rename(columns={"well_id": "mandal_id"})
        df["mandal_name"] = df["mandal_id"]
        df["has_sensor"] = np.random.default_rng(1).random(len(df)) < 0.08  # ~8% have a sensor
        src = "DEMO (synthetic current features)"
    else:
        df = pd.read_csv(args.features)
        src = args.features

    X = df[ALL_FEATURES]
    med = bundle["median"].predict(X)
    lo = bundle["lower"].predict(X)
    hi = bundle["upper"].predict(X)

    recs = []
    for i, row in df.reset_index(drop=True).iterrows():
        has = bool(row.get("has_sensor", False))
        recs.append({
            "mandal_id": row.get("mandal_id", f"M{i}"),
            "mandal_name": row.get("mandal_name", row.get("mandal_id", f"M{i}")),
            "est_mbgl": round(float(med[i]), 2),
            "p10_mbgl": round(float(lo[i]), 2),
            "p90_mbgl": round(float(hi[i]), 2),
            "band_m": round(float(hi[i] - lo[i]), 2),
            "basis": "sat+sensor (calibrated)" if has else "sat-only (estimated)",
        })

    out = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": src,
        "model_cv": bundle.get("cv"),
        "label": "ESTIMATED groundwater level (mbgl) from satellite + open data, calibrated to wells. Estimate with confidence band — not a measured reading.",
        "count": len(recs),
        "mandals": recs,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2)
    bands = [r["band_m"] for r in recs]
    print(f"  Predicted {len(recs)} mandals  ·  median band ±{np.median(bands)/2:.1f} m  ·  model CV RMSE {bundle['cv']['rmse_m']} m")
    print(f"  Wrote -> {args.out}")


if __name__ == "__main__":
    main()
