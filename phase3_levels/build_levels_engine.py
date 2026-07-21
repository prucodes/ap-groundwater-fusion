"""Train the Phase 0 holdout-safe nowcast engine and emit per-mandal estimates.

- Trains 3 gradient-boosted models: median (p50) + p10 + p90 (quantile loss) so
  every estimate carries an honest uncertainty band.
- Saves the bundle to models/levels_engine_v2.joblib.
- Emits outputs/mandal_nowcasts_v2.json. The latest eligible row for every mandal
  is excluded from fitting before its nowcast is generated.

The interval is a model p10-p90 quantile range, not a guaranteed confidence
interval. Evaluation metadata is generated from the same code path as the output.
"""
import datetime
import difflib
import hashlib
import json
import os
import re
import numpy as np
import pandas as pd
import joblib
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUTD = os.path.join(HERE, "outputs"); os.makedirs(OUTD, exist_ok=True)
MODELD = os.path.join(HERE, "models"); os.makedirs(MODELD, exist_ok=True)
MODEL_VERSION = "phase0-nowcast-2.0.0"
OUTPUT_SCHEMA_VERSION = "2.0.0"

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
    # REAL specific yield (CGWB / Nature figshare 29293877), IDW to mandal — overrides proxy where available
    syp = os.path.join(HERE, "data", "mandal_specific_yield.csv")
    if os.path.exists(syp):
        sy_real = {r["mkey"]: float(r["specific_yield_real"]) for _, r in pd.read_csv(syp).iterrows()}
        lv["specific_yield"] = lv["mkey"].map(sy_real).fillna(lv["specific_yield"])
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


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_mandal_base(train, target):
    """Derive the historical mandal mean from training rows only."""
    train = train.copy()
    target = target.copy()
    global_mean = float(train.level_mbgl.mean())
    base = train.groupby("mkey").level_mbgl.mean()
    train["mandal_base"] = train.mkey.map(base).fillna(global_mean)
    target["mandal_base"] = target.mkey.map(base).fillna(global_mean)
    return train, target


def evaluate_temporal_nowcast(df):
    """Evaluate lag-eligible temporal nowcasts on a fixed unseen-period holdout."""
    train = df[df.date < "2024-01"].copy()
    test = df[df.date >= "2024-01"].copy()
    train, test = reset_mandal_base(train, test)
    models = (mk_est(), mk_est(0.1), mk_est(0.9))
    for model in models:
        model.fit(train[NUM + CAT], train.level_mbgl.values)
    point = models[0].predict(test[NUM + CAT])
    p10 = models[1].predict(test[NUM + CAT])
    p90 = models[2].predict(test[NUM + CAT])
    # Independently fitted quantile models can cross. Apply the standard
    # monotonic rearrangement so reported p10 <= p50 <= p90.
    ordered = np.sort(np.vstack([p10, point, p90]), axis=0)
    lower, point, upper = ordered
    actual = test.level_mbgl.to_numpy()
    baseline = test.lag12.to_numpy()

    terrain = {}
    for cohort, cohort_rows in test.groupby("aquifer_type"):
        positions = test.index.get_indexer(cohort_rows.index)
        cohort_actual = cohort_rows.level_mbgl.to_numpy()
        cohort_lower = lower[positions]
        cohort_upper = upper[positions]
        terrain[str(cohort)] = {
            "sampleCount": int(len(cohort_rows)),
            "maeM": round(float(mean_absolute_error(cohort_actual, point[positions])), 4),
            "empiricalCoveragePct": round(
                float(np.mean((cohort_actual >= cohort_lower) & (cohort_actual <= cohort_upper)) * 100), 2
            ),
        }

    return {
        "task": "rolling_temporal_holdout_nowcast",
        "eligibleCohort": "mandal-months with lag1, lag12, location and rainfall features",
        "trainingPeriod": {
            "start": str(train.date.min()),
            "end": str(train.date.max()),
        },
        "evaluationPeriod": {
            "start": str(test.date.min()),
            "end": str(test.date.max()),
        },
        "sampleCount": int(len(test)),
        "model": {
            "maeM": round(float(mean_absolute_error(actual, point)), 4),
            "rmseM": round(float(mean_squared_error(actual, point) ** 0.5), 4),
            "r2": round(float(r2_score(actual, point)), 4),
        },
        "baseline": {
            "name": "same_month_previous_year",
            "maeM": round(float(mean_absolute_error(actual, baseline)), 4),
        },
        "terrainCohorts": terrain,
        "intervalEvaluation": {
            "intervalType": "model_quantile_p10_p90",
            "nominalCoveragePct": 80,
            "empiricalCoveragePct": round(float(np.mean((actual >= lower) & (actual <= upper)) * 100), 2),
            "meanWidthM": round(float(np.mean(upper - lower)), 4),
            "sampleCount": int(len(test)),
        },
    }


def main():
    df = build_frame()
    latest_idx = df.sort_values("date").groupby("mkey").tail(1).index
    latest = df.loc[latest_idx].copy()
    train = df.drop(index=latest_idx).copy()
    train, latest = reset_mandal_base(train, latest)
    X = train[NUM + CAT]; y = train.level_mbgl.values
    print(
        f"  training on {len(train):,} rows / {train.mkey.nunique()} mandals "
        f"after holding out {len(latest):,} latest targets"
    )
    m50 = mk_est(); m10 = mk_est(0.1); m90 = mk_est(0.9)
    m50.fit(X, y); m10.fit(X, y); m90.fit(X, y)
    joblib.dump(
        {
            "m50": m50,
            "m10": m10,
            "m90": m90,
            "NUM": NUM,
            "CAT": CAT,
            "model_version": MODEL_VERSION,
        },
        os.path.join(MODELD, "levels_engine_v2.joblib"),
    )

    Xl = latest[NUM + CAT]
    raw_quantiles = np.vstack([m10.predict(Xl), m50.predict(Xl), m90.predict(Xl)])
    monotonic_quantiles = np.sort(raw_quantiles, axis=0)
    latest["p10"], latest["est"], latest["p90"] = monotonic_quantiles
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
        recs.append({
            "mandal": r.mandal, "district": r.district, "mkey": r.mkey,
            "lat": round(r.lat, 4), "lon": round(r.lon, 4), "aquifer": r.aquifer_type,
            "as_of": r.date, "observed_mbgl": round(r.level_mbgl, 2),
            "estimate_mbgl": round(float(r.est), 2),
            "band_p10": round(float(r.p10), 2), "band_p90": round(float(r.p90), 2),
            "trend_m_per_yr": trend(r.mkey, r.date),
        })
    inputs = {
        "apwrimsHistory": os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"),
        "rainfallHistory": os.path.join(HERE, "data", "mandal_rain_history.csv"),
        "geometry": os.path.join(APP, "ap_map_geometry.json"),
    }
    specific_yield = os.path.join(HERE, "data", "mandal_specific_yield.csv")
    if os.path.exists(specific_yield):
        inputs["specificYield"] = specific_yield
    payload = {
        "schemaVersion": OUTPUT_SCHEMA_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "label": "Modelled temporal nowcast; not an official APWRIMS result",
        "modelVersion": MODEL_VERSION,
        "trainingPeriod": {"start": str(train.date.min()), "end": str(train.date.max())},
        "targetPeriodRange": {"start": str(latest.date.min()), "end": str(latest.date.max())},
        "featureNames": NUM + CAT,
        "intervalType": "model_quantile_p10_p90",
        "latestTargetsExcludedFromFit": True,
        "inputHashes": {name: sha256(path) for name, path in inputs.items()},
        "evaluation": {
            "temporalNowcast": evaluate_temporal_nowcast(df),
        },
        "mandals": recs,
    }
    output_path = os.path.join(OUTD, "mandal_nowcasts_v2.json")
    with open(output_path, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print("  saved model -> models/levels_engine_v2.joblib")
    print(f"  emitted {len(recs)} holdout-safe nowcasts -> outputs/mandal_nowcasts_v2.json")
    band = np.mean([r["band_p90"] - r["band_p10"] for r in recs])
    print(f"  mean p10-p90 band width: {band:.2f} m   (honest uncertainty per mandal)")


if __name__ == "__main__":
    main()
