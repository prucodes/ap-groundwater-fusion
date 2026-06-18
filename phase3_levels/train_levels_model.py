"""Phase 3 — train the satellite->metres groundwater-level model.

Usage:
  python train_levels_model.py --labels data/well_features_labeled.csv
  python train_levels_model.py --demo          # synthetic data, proves the pipeline runs

Honest design:
  * Spatial GroupKFold CV — wells are held out by location, so the reported error
    is "accuracy at a place the model never saw" (i.e. a no-sensor mandal).
  * Quantile models give a confidence band (p10..p90), not a fake point estimate.
  * Saves a model bundle (median + lower + upper + metadata) for inference.
"""
import argparse, json, math, os, sys
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import joblib

sys.path.insert(0, os.path.dirname(__file__))
from lib_features import NUMERIC_FEATURES, CATEGORICAL_FEATURES, ALL_FEATURES, TARGET, physics_level_change_m, month_cyclical

HERE = os.path.dirname(__file__)


def make_demo(n=1200, seed=7):
    """Synthetic but physically-plausible wells, to prove the pipeline end-to-end."""
    rng = np.random.default_rng(seed)
    aqui = rng.choice(["alluvial", "hard_rock", "coastal"], n, p=[0.45, 0.4, 0.15])
    sy = np.where(aqui == "alluvial", 0.12, np.where(aqui == "hard_rock", 0.02, 0.10))
    sy = sy + rng.normal(0, 0.01, n)
    sy = np.clip(sy, 0.005, 0.25)
    lat = rng.uniform(13.0, 19.0, n); lon = rng.uniform(77.0, 84.5, n)
    elev = rng.uniform(5, 900, n); slope = rng.uniform(0, 12, n); twi = rng.uniform(2, 14, n)
    rain1 = rng.uniform(0, 220, n); rain3 = rain1 * rng.uniform(1.5, 3.0, n)
    et1 = rng.uniform(40, 160, n); bal = rain3 - et1 * 3 + rng.normal(0, 60, n)
    grace_anom = rng.normal(0, 6, n)              # cm water-equiv anomaly
    gpct = np.clip(60 + grace_anom * 3 + rng.normal(0, 8, n), 0, 100)
    month = rng.integers(1, 13, n)
    phys = np.array([physics_level_change_m(g, s) for g, s in zip(grace_anom, sy)])
    # "True" depth: deeper in hard rock + high elevation + low rain + negative anomaly
    mbgl = (
        6
        + (aqui == "hard_rock") * 6
        + elev / 180.0
        - rain3 / 120.0
        + et1 / 50.0
        - phys * 1.2
        - grace_anom * 0.25
        + slope * 0.15
        + rng.normal(0, 1.4, n)               # irreducible noise
    )
    mbgl = np.clip(mbgl, 1.0, 35.0)
    ms = np.array([month_cyclical(m) for m in month])
    df = pd.DataFrame({
        "well_id": [f"W{i:04d}" for i in range(n)],
        "grace_gws_anom_cm": grace_anom, "grace_gws_pctl": gpct,
        "rootzone_pctl": np.clip(gpct + rng.normal(0, 6, n), 0, 100),
        "surface_pctl": np.clip(gpct + rng.normal(0, 10, n), 0, 100),
        "rain_1m_mm": rain1, "rain_3m_mm": rain3, "et_1m_mm": et1, "water_balance_mm": bal,
        "specific_yield": sy, "elevation_m": elev, "slope_deg": slope, "twi": twi,
        "phys_level_change_m": phys, "month_sin": ms[:, 0], "month_cos": ms[:, 1],
        "lat": lat, "lon": lon, "aquifer_type": aqui, TARGET: mbgl,
    })
    return df


def build_estimator(quantile=None):
    pre = ColumnTransformer([
        ("num", "passthrough", NUMERIC_FEATURES),
        ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL_FEATURES),
    ])
    if quantile is None:
        reg = HistGradientBoostingRegressor(loss="squared_error", max_iter=400, learning_rate=0.05, max_depth=6, random_state=0)
    else:
        reg = HistGradientBoostingRegressor(loss="quantile", quantile=quantile, max_iter=400, learning_rate=0.05, max_depth=6, random_state=0)
    return Pipeline([("pre", pre), ("reg", reg)])


def spatial_groups(df, cell=0.5):
    """Group wells into ~0.5° spatial cells so CV holds out whole regions."""
    return (np.round(df["lat"] / cell).astype(int).astype(str) + "_" + np.round(df["lon"] / cell).astype(int).astype(str))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", help="CSV with features + 'mbgl' target column")
    ap.add_argument("--demo", action="store_true", help="use synthetic data")
    ap.add_argument("--out", default=os.path.join(HERE, "models", "levels_model.joblib"))
    args = ap.parse_args()

    if args.demo or not args.labels:
        if not args.demo:
            print("[i] No --labels given; running in --demo mode (synthetic).")
        df = make_demo()
        mode = "DEMO (synthetic)"
    else:
        df = pd.read_csv(args.labels)
        mode = f"REAL ({args.labels})"

    missing = [c for c in ALL_FEATURES + [TARGET] if c not in df.columns]
    if missing:
        sys.exit(f"[x] Missing required columns: {missing}")

    X, y = df[ALL_FEATURES], df[TARGET].values
    groups = spatial_groups(df)

    # Spatial cross-validation — honest "no-sensor location" error
    gkf = GroupKFold(n_splits=min(5, df.groupby(groups).ngroups))
    preds = np.zeros(len(y))
    for tr, te in gkf.split(X, y, groups):
        m = build_estimator()
        m.fit(X.iloc[tr], y[tr])
        preds[te] = m.predict(X.iloc[te])
    rmse = math.sqrt(mean_squared_error(y, preds)); mae = mean_absolute_error(y, preds); r2 = r2_score(y, preds)

    print(f"\n  Mode: {mode}   wells: {len(y)}   features: {len(ALL_FEATURES)}")
    print(f"  Spatial CV (held-out locations):  RMSE = {rmse:.2f} m   MAE = {mae:.2f} m   R² = {r2:.2f}")
    print("  ^ this is the metres-accuracy at a mandal with NO sensor.\n")

    # Fit final median + quantile band on all data
    median = build_estimator(quantile=0.5); median.fit(X, y)
    lower = build_estimator(quantile=0.1); lower.fit(X, y)
    upper = build_estimator(quantile=0.9); upper.fit(X, y)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    joblib.dump({
        "median": median, "lower": lower, "upper": upper,
        "features": ALL_FEATURES, "target": TARGET,
        "cv": {"rmse_m": round(rmse, 3), "mae_m": round(mae, 3), "r2": round(r2, 3)},
        "mode": mode, "n_wells": int(len(y)),
    }, args.out)
    print(f"  Saved model bundle -> {args.out}")


if __name__ == "__main__":
    main()
