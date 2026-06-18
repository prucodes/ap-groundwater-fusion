# Phase 3 — Satellite → metres (calibrated groundwater levels)

**Goal (Prakhar's refined ask):** estimate groundwater **levels in metres (mbgl)** for
every mandal from **open satellite + climate data**, calibrated to the **sparse**
sensors AP already has — *without* deploying a sensor in every mandal.

This is a **modeled estimate with a confidence band**, not a measurement. Direct
depth-from-satellite is impossible; this learns the satellite→depth relationship
from existing wells and extends it everywhere.

---

## The method (hybrid physics + ML)

1. **Satellite → groundwater storage change.** GRACE/GRACE-FO total water change,
   minus soil-moisture/snow (GLDAS) → groundwater storage anomaly (cm of water).
2. **Storage → level change (the metres step).**
   `water-table change (m) = storage change (m of water) ÷ specific yield`.
   Specific yield comes from **CGWB** (their own official GEC method). Fed to the
   model as `phys_level_change_m` (first-principles feature).
3. **Change → absolute mbgl.** Anchor to a baseline from existing wells.
4. **Downscale to mandal (ML).** Train `features → mbgl` against well observations,
   then predict every mandal. Spatial cross-validation reports the honest error
   **at locations with no sensor**.

Confidence band = quantile models (p10 / median / p90).

---

## Files

| File | Purpose |
|---|---|
| `lib_features.py` | feature schema + specific-yield physics helper |
| `train_levels_model.py` | train + **spatial CV** + quantile bands → `models/levels_model.joblib` |
| `build_mandal_features.py` | assemble current per-mandal features from project data |
| `predict_levels.py` | model + features → `outputs/mandal_levels_current.json` (mbgl + band + basis) |
| `fetch_weekly.py` | **hands-off weekly pipeline** (fetch → features → predict) |
| `run_weekly.sh` / `.github/workflows/phase3_weekly_levels.yml` | scheduling |

## Run it

```bash
# prove the ML machinery (synthetic):
python phase3_levels/train_levels_model.py --demo
python phase3_levels/predict_levels.py --demo

# real current AP features + a full weekly cycle:
python phase3_levels/build_mandal_features.py
python phase3_levels/fetch_weekly.py        # pulls live GRACE-DA + CHIRPS + TerraClimate

# train on REAL labels once you have them (see below):
python phase3_levels/train_levels_model.py --labels phase3_levels/data/well_features_labeled.csv
```

## Schedule (no week-by-week feeding)

```cron
# crontab -e  — every Monday 07:30
30 7 * * 1  /full/path/Groundwater\ Project\ Phase2A/phase3_levels/run_weekly.sh
```
…or enable the included **GitHub Action** (`workflow_dispatch` to test, weekly cron otherwise).

---

## Status: what's real vs. placeholder

**Real now (live):** CHIRPS rainfall, TerraClimate ET/balance, GRACE-DA percentiles,
670-mandal feature assembly, the full train→predict→weekly machinery.
Demo spatial-CV accuracy on synthetic data: **RMSE ≈ 1.7 m** (proves the pipeline; real
numbers come from real labels).

**Placeholders to wire** (`build_mandal_features.py` marks each):
specific yield, DEM (elevation/slope/TWI), aquifer type, mandal centroids,
GRACE anomaly in cm, 3-month rainfall sum.

---

## Data to acquire (all open — no new sensors)

### 1. Training labels — the answer key (THE unlock)
Historical groundwater levels at known wells, **monthly, multi-year**:
- **India-WRIS** — `https://indiawris.gov.in` → Ground Water → Ground Water Level →
  state **Andhra Pradesh** → export CSV (lat, lon, date, level mbgl). Decades of CGWB wells.
- **CGWB** seasonal reports (Sy + aquifer) — `http://cgwb.gov.in`.
- **APWRIMS** — the `groundwater/levels` view with a wide `startDate`/`endDate` → time series.
Need columns: `well_id, lat, lon, date, mbgl` (+ aquifer/Sy if available).

### 2. Predictor stack (statewide, free)
| Layer | Source |
|---|---|
| GRACE/GRACE-FO mascons (raw cm) | NASA JPL / PO.DAAC (Earthdata login) |
| GLDAS/NOAH soil moisture, snow | NASA GES DISC (Earthdata) |
| CHIRPS rainfall | UCSB *(wired)* |
| TerraClimate ET/balance | U. Idaho *(wired)* |
| SRTM / Copernicus DEM | NASA / ESA |
| ESA WorldCover / Dynamic World | ESA / Google |
| SoilGrids | ISRIC |
| Specific yield + aquifer map | CGWB |

> NASA Earthdata layers need a free login — put creds in `~/.netrc` (local) or
> `EARTHDATA_USER`/`EARTHDATA_PASS` secrets (GitHub Action).

---

## Honesty guardrails
- Output is **ESTIMATE ± band**, validated against **held-out** wells (report RMSE).
- Best where each aquifer type has some calibration wells; weakest in hard-rock
  Rayalaseema. Use the model to decide **where the next few sensors go** for max gain.
- Never presented as a measured reading.
