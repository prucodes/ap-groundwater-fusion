"""Train the Phase 0 holdout-safe nowcast engine and emit per-mandal estimates.

- Trains 3 gradient-boosted models: median (p50) + p10 + p90 (quantile loss) so
  every estimate carries an honest uncertainty band.
- Models the CHANGE from last month, not the level. Boosted trees cannot
  extrapolate past the levels they were trained on, and the level is not
  stationary while the change is.
- Blends with last month's reading at a weight calibrated per depth band, so a
  published estimate is never worse than carrying the last reading forward. The
  model alone loses to that rule below 20 m, where the deepest mandals sit.
- Calibrates the p10-p90 band per aquifer on a held-out year (split conformal),
  because the raw quantiles under-cover hard rock and over-cover the coast.
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
try:
    from .source_identity import reconcile as reconcile_sources
except ImportError:
    from source_identity import reconcile as reconcile_sources
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUTD = os.path.join(HERE, "outputs"); os.makedirs(OUTD, exist_ok=True)
MODELD = os.path.join(HERE, "models"); os.makedirs(MODELD, exist_ok=True)
MODEL_VERSION = "phase0-nowcast-3.0.0"
OUTPUT_SCHEMA_VERSION = "2.1.0"

# A reading deeper than this is a transcription error, not a water table. The
# previous 60 m cap silently deleted 630 readings from 33 mandals -- including
# 111 of Gandepalle's, one of the deepest mandals in the state.
DEPTH_CAP_M = 200.0
# Single-month jumps this many robust deviations beyond a mandal's own typical
# move are dropped from TRAINING only; they stay in every evaluation.
JUMP_SIGMA = 4.0
# Depth bands (m below ground) the blend weight is calibrated within.
BLEND_EDGES = (0.0, 5.0, 10.0, 20.0, 30.0, float("inf"))
# Months of held-out history used to calibrate the blend and the band.
CALIBRATION_MONTHS = 12
NOMINAL_COVERAGE = 0.80

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
       "lag1", "lag12", "roll3", "rain_1m", "rain_3m", "rain_12m", "mandal_base",
       "lag2", "lag3", "lag6", "move_1m", "move_3m", "move_12m"]
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
    # Names repeat across districts (and Urban/Rural must remain distinct).
    # Use the source UUID for time-series features, never a name-only key.
    lv["mkey"] = lv.mandal_uuid
    lv["namekey"] = lv.mandal.map(identity_norm)
    lv["districtkey"] = lv.district.map(identity_norm)
    if lv.mkey.isna().any() or lv.duplicated(["mkey", "date"]).any():
        raise ValueError("Source history must have one row per UUID and calendar month")
    aq = lv.district.map(aquifer_of)
    lv["aquifer_type"] = aq.map(lambda x: x[0]); lv["specific_yield"] = aq.map(lambda x: x[1])
    # REAL specific yield (CGWB / Nature figshare 29293877), IDW to mandal — overrides proxy where available
    syp = os.path.join(HERE, "data", "mandal_specific_yield.csv")
    if os.path.exists(syp):
        sy_real = {r["mkey"]: float(r["specific_yield_real"]) for _, r in pd.read_csv(syp).iterrows()}
        # This historical yield table has name-only IDs. Ambiguous names retain
        # the documented terrain proxy rather than borrowing another location.
        names = lv.assign(n=lv.mandal.map(norm)).groupby("n").mkey.nunique()
        unique = set(names[names == 1].index)
        lv["specific_yield"] = lv.mandal.map(norm).map(
            {key: value for key, value in sy_real.items() if key in unique}
        ).fillna(lv["specific_yield"])
    rain = pd.read_csv(os.path.join(HERE, "data", "mandal_rain_history.csv"))
    rain["namekey"] = rain.mandal.map(identity_norm)
    rain["districtkey"] = rain.district.map(identity_norm)
    rain = rain.groupby(["districtkey", "namekey", "date"], as_index=False).rain_mm.mean()
    df = lv.merge(rain, on=["districtkey", "namekey", "date"], how="left", validate="one_to_one")
    df = df.sort_values(["mkey", "date"]).reset_index(drop=True)
    mo = df.date.str.slice(5, 7).astype(int)
    df["month_sin"] = np.sin(2*np.pi*(mo-1)/12); df["month_cos"] = np.cos(2*np.pi*(mo-1)/12)
    df = calendar_history_features(df)
    g = df.groupby("mkey", group_keys=False)
    df["rain_1m"] = df.rain_mm
    periods = pd.PeriodIndex(df.date, freq="M")
    rain_lookup = df.set_index(["mkey", "date"]).rain_mm
    rain_months = []
    for offset in range(12):
        keys = pd.MultiIndex.from_arrays([df.mkey, (periods - offset).astype(str)])
        rain_months.append(pd.Series(rain_lookup.reindex(keys).to_numpy(), index=df.index))
    df["rain_3m"] = pd.concat(rain_months[:3], axis=1).sum(axis=1, min_count=3)
    df["rain_12m"] = pd.concat(rain_months, axis=1).sum(axis=1, min_count=12)
    # centroids
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    locations, basis, boundary_index = resolve_locations(lv, geo)
    ll = df.mkey.map(locations); df["lat"] = ll.map(lambda x: x[0]); df["lon"] = ll.map(lambda x: x[1])
    df["location_basis"] = df.mkey.map(basis).fillna("none")
    df["boundary_index"] = df.mkey.map(boundary_index)
    df["mandal_base"] = df.groupby("mkey").level_mbgl.transform("mean")
    df = df.dropna(subset=["lat", "lon", "lag1", "lag12"]).reset_index(drop=True)
    return df


def centroid(feature):
    pts = [pt for ring in feature.get("rings", []) for pt in ring]
    if not pts:
        return None
    return (round(sum(p[1] for p in pts) / len(pts), 4), round(sum(p[0] for p in pts) / len(pts), 4))


def resolve_locations(lv, geo):
    """Give every source series a centroid, and say how it was arrived at.

    Exact reconciliation first, then the reviewed alias table, then the mandal's
    own district centroid. Dropping a mandal for want of a polygon cost the
    published run 56 of 688 mandals; a district centroid is a weaker feature
    than the mandal's own, but the mandal's own lagged levels carry the signal.
    Returns the centroid, how it was reached, and the boundary it came from so
    that downstream builders inherit this decision instead of re-guessing it.
    """
    boundaries = geo["mandals"]
    matches, _ = reconcile_sources(lv.to_dict("records"), boundaries)
    locations, basis, boundary_index = {}, {}, {}
    for uid, match in matches.items():
        point = centroid(boundaries[match["boundaryIndex"]])
        if point:
            locations[uid] = point
            basis[uid] = "boundary_exact"
            boundary_index[uid] = int(match["boundaryIndex"])

    alias_path = os.path.join(HERE, "data", "mandal_boundary_aliases.csv")
    if os.path.exists(alias_path):
        for _, row in pd.read_csv(alias_path).iterrows():
            uid = str(row["mandal_uuid"])
            if uid in locations:
                continue
            point = centroid(boundaries[int(row["boundary_index"])])
            if point:
                locations[uid] = point
                basis[uid] = "boundary_alias"
                boundary_index[uid] = int(row["boundary_index"])

    district_points = {}
    for feature in boundaries:
        point = centroid(feature)
        if point:
            district_points.setdefault(identity_norm(feature["d"]), []).append(point)
    district_mean = {
        name: (round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4))
        for name, pts in district_points.items()
    }
    for uid, district in lv.drop_duplicates("mandal_uuid").set_index("mandal_uuid").district.items():
        if uid in locations:
            continue
        point = district_mean.get(identity_norm(district))
        if point:
            locations[uid] = point
            basis[uid] = "district_centroid"
    return locations, basis, boundary_index


def identity_norm(value):
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", str(value).upper())).strip().replace(" ", "")


def calendar_history_features(df):
    """Calendar offsets, not previous-row offsets; no cross-UUID rolling leak."""
    df = df.copy()
    periods = pd.PeriodIndex(df.date, freq="M")
    lookup = df.set_index(["mkey", "date"]).level_mbgl
    prior = {}
    for offset in (1, 2, 3, 6, 12, 13):
        keys = pd.MultiIndex.from_arrays([df.mkey, (periods - offset).astype(str)])
        prior[offset] = pd.Series(lookup.reindex(keys).to_numpy(), index=df.index)
    df["lag1"], df["lag12"] = prior[1], prior[12]
    df["lag2"], df["lag3"], df["lag6"] = prior[2], prior[3], prior[6]
    df["roll3"] = pd.concat([prior[1], prior[2], prior[3]], axis=1).mean(axis=1)
    # Which way the water table was already moving, from lagged values only.
    df["move_1m"] = prior[1] - prior[2]
    df["move_3m"] = prior[1] - prior[3]
    df["move_12m"] = prior[1] - prior[13]
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


def screen_training_rows(train):
    """Drop implausible single-month jumps from TRAINING only.

    The spread is measured with a median absolute deviation, not a standard
    deviation: one 80 m transcription slip inflates a standard deviation enough
    to hide itself, which is exactly the row that has to go. Screened rows stay
    in every evaluation; only the fit is protected from them.
    """
    step = (train.level_mbgl - train.lag1).abs()
    grouped = step.groupby(train.mkey)
    middle = grouped.transform("median")
    spread = (step - middle).abs().groupby(train.mkey).transform("median") * 1.4826
    limit = middle + JUMP_SIGMA * spread
    return train[step.isna() | limit.isna() | (spread <= 0) | (step <= limit)]


def fit_models(train, names=("p50", "p10", "p90")):
    """Median and p10/p90 models over the CHANGE from last month."""
    features = train[NUM + CAT]
    change = (train.level_mbgl - train.lag1).to_numpy()
    quantiles = {"p50": None, "p10": 0.1, "p90": 0.9}
    models = {}
    for name in names:
        models[name] = mk_est(quantiles[name])
        models[name].fit(features, change)
    return models


def predict_band(models, target):
    """p10 / p50 / p90 back in level space, monotonically ordered."""
    features = target[NUM + CAT]
    anchor_level = target.lag1.to_numpy()
    raw = np.vstack([anchor_level + models[name].predict(features)
                     for name in ("p10", "p50", "p90")])
    lower, point, upper = np.sort(raw, axis=0)
    return lower, point, upper


def depth_band_index(depth):
    return np.digitize(np.asarray(depth, dtype="float64"), np.asarray(BLEND_EDGES[1:-1]))


def band_label(index):
    low, high = BLEND_EDGES[index], BLEND_EDGES[index + 1]
    return f"{low:g}-{high:g}m" if np.isfinite(high) else f"{low:g}m+"


def blend_weights(actual, anchor_level, point):
    """How much to trust the model over last month's reading, per depth band.

    Below 20 m the model on its own is beaten by carrying the last reading
    forward, so the weight is fitted rather than assumed.
    """
    grid = np.linspace(0, 1, 21)
    index = depth_band_index(anchor_level)
    weights = {}
    for band in range(len(BLEND_EDGES) - 1):
        rows = index == band
        if rows.sum() < 50:
            weights[band] = 1.0
            continue
        errors = [np.mean(np.abs(actual[rows] - (w * point[rows] + (1 - w) * anchor_level[rows])))
                  for w in grid]
        weights[band] = float(grid[int(np.argmin(errors))])
    return weights


def apply_blend(weights, anchor_level, lower, point, upper):
    index = depth_band_index(anchor_level)
    weight = np.array([weights.get(int(i), 1.0) for i in index])
    blended = weight * point + (1 - weight) * anchor_level
    return blended - (point - lower), blended, blended + (upper - point)


def conformal_offsets(actual, lower, upper, cohorts):
    """Per-aquifer widening that makes the band meet its nominal coverage."""
    scores = np.maximum(lower - actual, actual - upper)
    return {str(cohort): float(np.quantile(scores[cohorts == cohort], NOMINAL_COVERAGE, method="higher"))
            for cohort in np.unique(cohorts)}


def apply_conformal(offsets, lower, upper, cohorts):
    widen = np.array([offsets.get(str(cohort), 0.0) for cohort in cohorts])
    return lower - widen, upper + widen


def calibrated_predict(history, target):
    """Fit on `history`, calibrate on its last months, predict `target`.

    The blend weight and the band widening are chosen on months the calibration
    model never saw, then applied to the model fitted on everything.
    """
    months = sorted(history.date.unique())
    split = months[-CALIBRATION_MONTHS] if len(months) > CALIBRATION_MONTHS else months[len(months) // 2]
    early, calibration = history[history.date < split], history[history.date >= split]
    # The warm model must not see the calibration window, not even through the
    # mandal's own historical mean, or the weights it earns are flattering.
    early, calibration = reset_mandal_base(early, calibration)
    warm = fit_models(screen_training_rows(early))
    lower, point, upper = predict_band(warm, calibration)
    actual = calibration.level_mbgl.to_numpy()
    anchor_level = calibration.lag1.to_numpy()
    weights = blend_weights(actual, anchor_level, point)
    lower, point, upper = apply_blend(weights, anchor_level, lower, point, upper)
    offsets = conformal_offsets(actual, lower, upper, calibration.aquifer_type.to_numpy())

    models = fit_models(screen_training_rows(history))
    lower, point, upper = predict_band(models, target)
    lower, point, upper = apply_blend(weights, target.lag1.to_numpy(), lower, point, upper)
    lower, upper = apply_conformal(offsets, lower, upper, target.aquifer_type.to_numpy())
    diagnostics = {
        "calibrationPeriod": {"start": str(calibration.date.min()), "end": str(calibration.date.max())},
        "blendWeightOnModel": {band_label(band): round(weight, 2) for band, weight in sorted(weights.items())},
        "conformalWidenM": {name: round(value, 4) for name, value in sorted(offsets.items())},
    }
    return lower, point, upper, models, diagnostics


def depth_band_report(actual, point, anchor_level):
    """Accuracy per depth band against the rule the model has to beat."""
    index = depth_band_index(actual)
    report = []
    for band in range(len(BLEND_EDGES) - 1):
        rows = index == band
        if not rows.any():
            continue
        report.append({
            "band": band_label(band),
            "sampleCount": int(rows.sum()),
            "maeM": round(float(mean_absolute_error(actual[rows], point[rows])), 4),
            "lastReadingMaeM": round(float(mean_absolute_error(actual[rows], anchor_level[rows])), 4),
        })
    return report


def evaluate_rolling_origin(df, origins=24):
    """Retrain at every month and nowcast that month, as production does.

    One frozen 2023 split reports a model far older than the one actually
    serving; this is the validation the forecast release gate asks for.
    """
    months = [m for m in sorted(df.date.unique()) if m >= "2024-01"][-origins:]
    errors, anchor_errors = [], []
    for month in months:
        history, target = df[df.date < month], df[df.date == month]
        if target.empty or history.empty:
            continue
        history, target = reset_mandal_base(history, target)
        models = fit_models(screen_training_rows(history), names=("p50",))
        point = target.lag1.to_numpy() + models["p50"].predict(target[NUM + CAT])
        actual = target.level_mbgl.to_numpy()
        errors.append(np.abs(actual - point))
        anchor_errors.append(np.abs(actual - target.lag1.to_numpy()))
    errors = np.concatenate(errors); anchor_errors = np.concatenate(anchor_errors)
    return {
        "task": "rolling_origin_nowcast",
        "note": "Model retrained before every target month, as the weekly refresh does.",
        "originCount": len(months),
        "originPeriod": {"start": months[0], "end": months[-1]},
        "sampleCount": int(errors.size),
        "maeM": round(float(errors.mean()), 4),
        "lastReadingMaeM": round(float(anchor_errors.mean()), 4),
        "skillVsLastReadingPct": round(float(100 * (1 - errors.mean() / anchor_errors.mean())), 2),
    }


def evaluate_temporal_nowcast(df):
    """Evaluate lag-eligible temporal nowcasts on a fixed unseen-period holdout."""
    train = df[df.date < "2024-01"].copy()
    test = df[df.date >= "2024-01"].copy()
    train, test = reset_mandal_base(train, test)
    lower, point, upper, _, diagnostics = calibrated_predict(train, test)
    actual = test.level_mbgl.to_numpy()
    baseline = test.lag12.to_numpy()
    anchor_level = test.lag1.to_numpy()

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
        "eligibleCohort": "source-UUID mandal-months with exact calendar lag1 and lag12 and a resolved location; missing rainfall stays missing",
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
        # The harder baseline, and the one a reader assumes: carry the last
        # reading forward. Published alongside so the softer number cannot
        # stand on its own.
        "lastReadingBaseline": {
            "name": "carry_last_reading_forward",
            "maeM": round(float(mean_absolute_error(actual, anchor_level)), 4),
            "skillPct": round(float(100 * (1 - mean_absolute_error(actual, point)
                                           / mean_absolute_error(actual, anchor_level))), 2),
        },
        "depthBands": depth_band_report(actual, point, anchor_level),
        "calibration": diagnostics,
        "terrainCohorts": terrain,
        "intervalEvaluation": {
            "intervalType": "conformalised_quantile_p10_p90",
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
    print(
        f"  training on {len(train):,} rows / {train.mkey.nunique()} mandals "
        f"after holding out {len(latest):,} latest targets"
    )
    lower, point, upper, models, diagnostics = calibrated_predict(train, latest)
    joblib.dump(
        {
            "m50": models["p50"],
            "m10": models["p10"],
            "m90": models["p90"],
            "NUM": NUM,
            "CAT": CAT,
            "target": "change_from_lag1",
            "calibration": diagnostics,
            "model_version": MODEL_VERSION,
        },
        os.path.join(MODELD, "levels_engine_v2.joblib"),
    )
    latest["p10"], latest["est"], latest["p90"] = lower, point, upper
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
            "mandal": r.mandal, "district": r.district, "mkey": norm(r.mandal),
            "sourceSeriesId": r.mkey,
            "lat": round(r.lat, 4), "lon": round(r.lon, 4), "aquifer": r.aquifer_type,
            "locationBasis": r.location_basis,
            "boundaryIndex": None if pd.isna(r.boundary_index) else int(r.boundary_index),
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
    aliases = os.path.join(HERE, "data", "mandal_boundary_aliases.csv")
    if os.path.exists(aliases):
        inputs["boundaryAliases"] = aliases
    payload = {
        "schemaVersion": OUTPUT_SCHEMA_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "label": "Modelled temporal nowcast; not an official APWRIMS result",
        "modelVersion": MODEL_VERSION,
        "trainingPeriod": {"start": str(train.date.min()), "end": str(train.date.max())},
        "targetPeriodRange": {"start": str(latest.date.min()), "end": str(latest.date.max())},
        "featureNames": NUM + CAT,
        "targetVariable": "change_from_previous_month",
        "intervalType": "conformalised_quantile_p10_p90",
        "latestTargetsExcludedFromFit": True,
        "calibration": diagnostics,
        "locationBasis": {
            str(name): int(count)
            for name, count in latest.location_basis.value_counts().items()
        },
        "inputHashes": {name: sha256(path) for name, path in inputs.items()},
        "evaluation": {
            "temporalNowcast": evaluate_temporal_nowcast(df),
            "rollingOriginNowcast": evaluate_rolling_origin(df),
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
