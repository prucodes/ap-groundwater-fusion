# Mandal-Level Groundwater Fusion Layer for Andhra Pradesh

This repository is a data-first proof of concept for combining APWRIMS-format
groundwater observations with regional NASA/NDMC GRACE-DA and climate context.
The active Phase 0 output separates measured observations, modelled nowcasts,
unreleased forecasts, external signals, data completeness and neutral monitoring
flags.

APWRIMS-format observations are the measured historical source. Their current
browser-session sample has authorization pending and is not described as an
official export. NASA/NDMC GRACE-DA is supporting regional model-assimilated
context and must not be interpreted as a direct mandal-level groundwater-depth
measurement. Public boundary/name datasets are prototype-only until replaced by
verified official boundaries and identifiers.

The `app/` directory contains the static prototype UI. It reads generated JSON from `app/data/` and does not add a backend, database, or official-result claims.

### Active data pipeline (Phase 0 / contract V2)

The dashboard's V2 records are produced by
`phase3_levels/build_real_app_data.py`, which delegates to the fail-closed Phase
0 publisher and combines:

- the **APWRIMS depth history** (`phase3_levels/apwrims/apwrims_gw_history.csv`) — a **browser-session research sample (authorization pending)**, not an official APWRIMS export;
- the **holdout-safe nowcast output** (`phase3_levels/outputs/mandal_nowcasts_v2.json`), whose latest target rows are excluded from fitting;
- **NASA GRACE-DA / CHIRPS / TerraClimate** district signals.

Active application artifacts are
`app/data/mandal_groundwater_records_v2.json`,
`app/data/mandal_observation_series_v2.json`,
`app/data/model_card.json`, and `app/data/dataset_manifest.json`. The manifest
contains canonical counts, validity periods, hashes and active/legacy lifecycle
status.

The temporal holdout metric evaluates lag-eligible nowcasting/gap filling; it is
not sensorless spatial accuracy. Whole-mandal estimation is evaluated
separately. Model intervals are P10–P90 quantile ranges, not guaranteed
confidence intervals. No forecast horizon is currently released, and rainfall
minus actual ET is climate context rather than direct measured recharge.

Run the active path in this order:

```bash
python3 phase3_levels/build_levels_engine.py
python3 phase3_levels/evaluate_phase0.py
python3 phase3_levels/build_real_app_data.py
python3 phase3_levels/validate_phase0.py
python3 -m pytest -q
cd app
npm run typecheck
npm run build
```

The V1 files documented in `phase3_levels/LEGACY_OUTPUTS.md` are preserved but
inactive and cannot be imported by application TypeScript. The remaining V0 and
Phase 1/2 sections below document historical pipeline work; they are not the
active Phase 0 application contract.

## V0 Pipeline Command Order

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python scripts/inspect_boundary_sources.py
python scripts/build_admin_name_crosswalk.py

# Requires a selected prototype boundary file after public boundary data is placed under data/raw/boundaries/
python scripts/standardize_boundaries.py --input-path path/to/prototype_boundary.geojson

python scripts/standardize_groundwater_readings.py
python scripts/join_stations_to_boundaries.py

# Optional: only when an explicit NASA GRACE-FO/GRACE-DA source/config is provided
python scripts/download_nasa_grace_da.py
python scripts/sample_raster_at_points.py --help

python scripts/fusion_engine_v0.py
python scripts/export_mandal_outputs.py
python scripts/validate_fusion_outputs.py

pytest
```

## Phase 1B Public Boundary Fetch

```bash
python scripts/fetch_public_boundary_sources.py
python scripts/inspect_boundary_sources.py
python scripts/standardize_boundaries.py --input-path "data/raw/boundaries/datta07_indian_shapefiles/STATES/ANDHRA PRADESH/ANDHRA PRADESH_SUBDISTRICTS.geojson" --district-field dtname --mandal-field sdtname
python scripts/join_stations_to_boundaries.py
python scripts/fusion_engine_v0.py
python scripts/export_mandal_outputs.py
python scripts/validate_fusion_outputs.py
```

## Phase 1C NASA GRACE-DA Ingestion

```bash
python3 -m py_compile scripts/*.py tests/*.py
python scripts/download_nasa_grace_da.py
python scripts/inspect_nasa_rasters.py
python scripts/sample_raster_at_points.py
python scripts/fusion_engine_v0.py
python scripts/export_mandal_outputs.py
python scripts/validate_fusion_outputs.py
python3 -m pytest
```

Phase 1C downloads NASA/NDMC GRACE-DA percentile GeoTIFFs and samples them at station points. The outputs are `satellite-model` percentiles only; they are not groundwater depth and must not be converted to `mbgl`.

If local Python certificate verification fails, fix the local certificate chain or update `certifi` first. `python scripts/download_nasa_grace_da.py --allow-insecure-tls` exists only as an explicit local reproducibility fallback and records `tls_verified=false` in the NASA download manifest.

## Phase 1C QA / Hardening

```bash
python3 scripts/download_nasa_grace_da.py
python3 scripts/inspect_nasa_rasters.py
python3 scripts/sample_raster_at_points.py
python3 scripts/fusion_engine_v0.py
python3 scripts/export_mandal_outputs.py
python3 scripts/validate_fusion_outputs.py
python3 scripts/generate_phase1c_reports.py
python3 -m pytest
```

The QA report command writes:

- `reports/phase1c_nasa_sampling_summary.md`
- `reports/phase1c_nasa_sampling_summary.csv`
- `reports/phase1c_nasa_sampling_summary.json`
- `reports/phase1c_fusion_summary.md`

## Phase 1D Public Measured Groundwater Import

```bash
python3 scripts/fetch_nwic_groundwater.py
python3 scripts/inspect_nwic_groundwater.py
python3 scripts/standardize_nwic_groundwater.py
python3 scripts/compare_mock_vs_public_measured.py
python3 scripts/join_stations_to_boundaries.py --stations data/processed/groundwater/standardized_public_groundwater_readings.csv --output data/processed/groundwater/stations_joined_public_measured_to_boundaries.csv
python3 scripts/sample_raster_at_points.py --points data/processed/groundwater/standardized_public_groundwater_readings.csv
python3 scripts/fusion_engine_v0.py
python3 scripts/export_mandal_outputs.py
python3 scripts/validate_fusion_outputs.py
python3 scripts/generate_phase1d_reports.py
python3 -m pytest
```

If NWIC/NWDP does not expose a stable public CSV/XLS/XLSX/JSON URL, `fetch_nwic_groundwater.py` writes `fetch_status=manual_required`. In that case, manually download the public file into `data/raw/nwic/andhra_pradesh_groundwater/`; do not scrape dashboards. Public measured data is labeled `measured_public`, never `official_apwrims`.

## Phase 2A Static Prototype UI

Generate dashboard seed data from the processed CSV outputs before building the UI:

```bash
python3 -m py_compile scripts/*.py tests/*.py
python3 scripts/export_dashboard_seed_data.py
python3 -m pytest

cd app
npm install
npm run build
npm run dev
```

`export_dashboard_seed_data.py` also simplifies the prototype boundary GeoJSON into a compact, renderable status map. Pass `--skip-map` to leave the existing `ap_map_geometry.json` untouched (useful when the 25 MB boundary file is not present locally).

The Phase 2A app reads:

- `app/data/mandal_fusion_seed.json`
- `app/data/satellite_station_samples.json`
- `app/data/source_readiness.json`
- `app/data/dashboard_summary.json`
- `app/data/ap_map_geometry.json` (simplified `public_prototype` boundaries for the inline SVG status map; `official_flag=false`)

Pages: Overview (`/`), Mandal Map (`/map`), Mandal Insights (`/mandals`, `/mandals/[id]`), Verify / Watchlist (`/watchlist`), Districts roll-up (`/districts`), Compare (`/compare`), Executive Snapshot (`/snapshot`, print/PDF), Data Readiness (`/readiness`), Reports (`/reports`), Methodology (`/methodology`), Settings (`/settings`).

Product features: command palette search (⌘K), action alerts, light/dark theme toggle (`?theme=dark` deep link), CSV export, and a printable one-page executive snapshot. Maps are **live** (Leaflet + CARTO/OpenStreetMap tiles) with the prototype mandal boundaries overlaid as a status layer — internet is required for basemap tiles. `npm install` pulls `leaflet`.

The UI is a premium GovTech + satellite/water intelligence design (dark navy shell, satellite header, light content cards) built from the approved mockups in `app/design-references/`. Charts (status donut, percentile rings, sparklines) and the Andhra Pradesh status map are hand-rolled inline SVG with no chart/map dependency. Runtime visual assets are served from:

- `app/public/assets/header-satellite-earth.png`
- `app/public/assets/sidebar-satellite-earth.png`
- `app/public/assets/light-map-water-shell.png`

If the asset PNGs are absent the layout falls back to CSS gradients and still builds. No raw NASA `.tif` files are copied into the app package.

The map view renders the real (simplified) Andhra Pradesh outline with seed mandals coloured by fusion status. It is a static prototype status layer, not an official polygon renderer. Official APWRIMS/AP government data and official APWRIMS/APSAC/RTGS mandal boundaries are still required for government-grade results.

UI safeguards (in `tests/test_dashboard_seed_data.py`) scan the UI source so copy never claims an "official mandal-level result", "satellite groundwater depth", or "NASA water level"; assert the prototype notice exists; confirm every page renders the notice banner; and verify seed/NASA/boundary source labels in the exported JSON.

## Phase 2B Multi-Source Satellite Fusion (rainfall)

Beyond NASA GRACE-DA, the historical fusion layer pulls **real CHIRPS monthly rainfall** (UCSB Climate Hazards Group — open, no login) as a climate/supply context signal:

```bash
python3 scripts/fetch_chirps_rainfall.py          # downloads latest available month (GeoTIFF), graceful on network failure
python3 scripts/sample_rainfall_at_points.py      # samples rainfall_mm at station points
python3 scripts/fusion_engine_v0.py               # passes rainfall_mm through per mandal
python3 scripts/export_dashboard_seed_data.py     # adds rainfall to app JSON + readiness + labels
python3 -m pytest
```

Rainfall is labeled `satellite-gauge-rainfall` (millimetres). It is climate
context—not direct recharge and not groundwater depth—and carries no official
claim. If the raster is absent the active V2 record retains an explicit missing
state.

## Phase 2C Water Balance (evapotranspiration + overdraft)

Adds an **annual water balance** from **TerraClimate** (Climatology Lab, ~4 km, open) read over OPeNDAP — only the AP window is transferred, no large downloads:

```bash
python3 scripts/fetch_terraclimate_balance.py   # latest full year actual ET (aet) + precipitation (ppt) per station
python3 scripts/fusion_engine_v0.py             # annual_et_mm, water_balance_mm (= ppt - aet), water_balance_status
python3 scripts/export_dashboard_seed_data.py
python3 -m pytest
```

Per mandal the historical pipeline computes
`water_balance_mm = annual_rainfall − annual_ET`. This is a climatic
water-balance indicator only. It does not measure recharge, pumping, aquifer
storage change or safe yield and cannot independently determine an operational
groundwater action. Needs internet for the OPeNDAP read; the active publisher
retains a stale/failed refresh state rather than inventing a replacement.

## Phase 2D Statewide District Heat-Map

`build_district_summary.py` dissolves the prototype mandal boundaries into the 13 AP districts and computes **zonal means of the real satellite rasters per district** (GRACE-DA percentiles, CHIRPS rainfall, TerraClimate annual ET/precipitation → water balance). Every district gets real values (rasters cover the whole state), unlike the seed-limited mandal fusion.

```bash
python3 scripts/fetch_chirps_rainfall.py
python3 scripts/fetch_terraclimate_balance.py   # also writes AP annual aet/ppt GeoTIFFs
python3 scripts/build_district_summary.py        # -> app/data/ap_district_geometry.json
```

The Map page (`/map`) has a **Mandal ⇄ District toggle**. District mode renders a **choropleth heat-map** with a selectable layer (Water Balance / Groundwater %ile / Rainfall), a diverging deficit→surplus scale, per-district tooltips and a gradient legend. This is the most honest use of GRACE (its ~150–300 km footprint suits district scale far better than mandals). Values are regional satellite/model context — not groundwater depth, not official.

## Phase 2E Early-Warning Console

`/alerts` ranks mandals by a **transparent, deterministic severity model** (`app/lib/alerts.ts`) over the real signals — deep seed reading (+3), sensor–satellite disagreement (+2), annual water deficit (+2), and moderately-deep / partial-agreement / tight-balance / low-confidence (+1 each). Tiers: Critical ≥ 6, High 4–5, Watch 1–3. Each alert shows its contributing factors with weights (auditable, no black box), a lead action, and a link to the mandal. The sidebar alerts bell uses the same engine. It is prototype triage over seed + real satellite signals — confirm with official APWRIMS data before acting.

## Phase 2F Scenario Planner

`/scenario` stress-tests the statewide water balance against a **monsoon anomaly dial** (−50%…+20%). For each district it scales annual rainfall by the dial, holds actual ET constant, recomputes `balance = scaled rainfall − ET`, re-tiers it, and shows **which districts tip into deficit** — with live KPIs (deficit count now vs scenario, newly-tipped), a headline, and a sorted district list with current→scenario status flow. A simplified planning aid over real TerraClimate data, clearly labeled — not a calibrated forecast.

## Phase 2G Mandal heat-map + District situation brief

`build_mandal_heat.py` zonal-means CHIRPS rainfall and TerraClimate water balance over **all ~670 mandals** → `app/data/ap_mandal_heat.json`. The Map page (`/map`) Mandal view gains a selector — **Fusion status / Water Balance / Rainfall** — rendering a statewide per-mandal choropleth. **GRACE is intentionally excluded at mandal scale** (sub-pixel / false precision) and shown only at district level.

```bash
python3 scripts/build_mandal_heat.py   # -> app/data/ap_mandal_heat.json
```

The Districts page now shows a **data-driven Situation Brief** per district (`app/lib/brief.ts`) — a deterministic, auditable narrative (wetness, water balance, mandals flagged, recommended action) with a Copy button. It is generated from real TerraClimate + GRACE-DA + CHIRPS signals and is **upgradeable to a live Claude-written narrative** when an API key is provided. District roll-ups now report the **real district mandal count** (e.g. 63) with seed-fusion coverage shown separately.

## NASA Signals page + overview heat toggle

`/nasa` is a dedicated view of the **raw NASA/NDMC GRACE-DA** signal as extracted and mapped: a district groundwater-percentile choropleth, a per-district table (GW / root-zone / surface), and the per-station sample table (lat/long, percentiles, sample date, source rasters) — i.e. the satellite signal *before* fusion. It states the resolution honestly: GRACE suits district/basin scale; at mandal scale it is a regional proxy (~25 km, sub-pixel), so GRACE is shown only at district level. The Overview map gained a **Status / Balance / Rainfall** toggle (reusing the mandal heat layers).

Forwardable docs (themed, print-to-PDF) live in `docs/`: `aware_integration_note.html` (PoC → Production → AWARE) and `data_request_note.html` (the exact APWRIMS data ask).

Roadmap: GRACE depletion trend + real time-series, SMAP soil moisture (NASA Earthdata login), and Sentinel-1 InSAR land subsidence (alluvial-belt pilot) are the next sources.

## Important V0 Notes

- Boundary standardization requires an actual prototype boundary file placed under `data/raw/boundaries/`.
- Station-boundary joining requires `data/processed/boundaries/ap_mandal_boundaries_prototype.geojson`.
- Official outputs require official APWRIMS/AP government groundwater readings and official APWRIMS/APSAC/RTGS boundaries.
- Public prototype boundaries must remain `boundary_source=public_prototype` and `official_flag=false`.
- Mock readings must remain `data_label=mock`.
- Satellite/model percentiles must not be converted into groundwater depth.
