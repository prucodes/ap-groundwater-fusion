# Phase 0 data-integrity implementation note

Recorded before Phase 0 edits on 2026-07-20. Everything listed below predates
this task and is user-owned work that must be preserved.

## Dirty working tree

Tracked modifications:

- `app/app/api/ai-brief/route.ts`
- `app/app/districts/page.tsx`
- `app/app/estimates/page.tsx`
- `app/data/dashboard_summary.json`
- `app/data/dataset_manifest.json`
- `app/data/mandal_dataset.json`
- `app/data/mandal_depth_series.json`
- `app/data/nasa_provenance.json`
- `app/data/satellite_station_samples.json`
- `app/next.config.mjs`
- `docs/phase3_results_brief.html`
- `phase3_levels/apwrims/apwrims_gw_history.csv`
- `phase3_levels/build_levels_engine.py`
- `phase3_levels/outputs/mandal_levels_estimated.json`
- `phase3_levels/refresh_nasa_districts.py`

There were no staged changes. Untracked work includes the Phase 1 approach and
poster deliverables, demo frames/walkthrough, the InSAR pipeline and downloads,
real specific-yield work, extraction/rain/power covariates, APWRIMS staging
fetcher, model experiments, and the experimental groundwater visual-prep script.
These files are not Phase 0 implementation targets and must not be removed,
reset, stashed, or overwritten.

Important pre-existing changes to retain include the June 2026 APWRIMS refresh,
July 2026 GRACE-DA refresh, real CGWB specific-yield override, refreshed model
outputs, React table-key correction, hidden Next.js demo indicator, and the new
results-brief section.

## Current source-of-truth inputs

- APWRIMS-format history:
  `phase3_levels/apwrims/apwrims_gw_history.csv`
- Prototype mandal geometry: `app/data/ap_map_geometry.json`
- District signal geometry: `app/data/ap_district_geometry.json`
- Mandal climate context: `app/data/ap_mandal_heat.json`
- Active historical model output:
  `phase3_levels/outputs/mandal_levels_estimated.json`
- NASA provenance: `app/data/nasa_provenance.json`
- CGWB comparison data: `phase3_levels/cgwb/cgwb_gw_levels.csv`

## Verified current counts and dates

- 670 prototype boundary features.
- 688 raw APWRIMS series/name variants.
- 632 modelled records.
- 639 current UI records, including seven measured-only records.
- 31 remaining boundary-only features.
- 28 districts.
- 89,443 APWRIMS-format rows, June 2014 through June 2026.
- 632 current history-series entries.
- 653 mandal heat/context records, although the current publisher joins only 590
  of 639 UI records because it indexes climate rows by mandal name alone.

## Evaluation tasks and current reproducible findings

- `train_forecast.py`: temporal holdout on eligible records with lag history;
  approximately 1.30 m MAE. This is a rolling temporal nowcast/gap-fill task,
  not sensorless spatial accuracy and not a direct multi-month forecast.
- `train_multihorizon.py`: direct 1/3/6/12-month research forecasts. The
  one-month result is close to no-change; the twelve-month result does not beat
  no-change.
- `train_spatial.py`: leave-whole-mandal-out estimation; IDW is approximately
  4.9 m MAE. The fusion-training IDW currently includes self-neighbours and must
  not be reported until corrected.
- `cross_validate_cgwb.py`: same-month CGWB/APWRIMS network comparison,
  approximately 6.12 m MAE and 0.40 correlation over 16,097 pairs.
- `validate_against_cgwb.py`: compares latest CGWB station observations ending
  in 2021 with a later model snapshot. Its approximately 6.20 m/0.25 result is
  temporally mismatched and is not suitable for display as model validation.
- Current P10-P90 values are model quantiles, not guaranteed confidence
  intervals.

## Active-path defects to remediate

- `build_real_app_data.py` emits a flat V1 object that mixes observations,
  model estimates, a linear future projection, heuristic confidence, climate
  context, and operational advice.
- `forecast_next_month_mbgl` is `estimate + trend / 12`, not a validated
  forecast.
- `sensor_count` is a record/month count, not a verified physical-station count.
- `build_levels_engine.py` fits and predicts the latest target rows in-sample.
- The weekly pipeline creates `mandal_levels_current.json`, but the publisher
  reads `mandal_levels_estimated.json`.
- The app-level `mandal_levels_estimated.json` is stale at May 2026 while the
  current Phase 3 output targets June 2026.
- The climate join drops valid context because it is keyed only by normalized
  mandal name instead of district plus mandal identity.
- The UI displays an unsupported 0.82 m / 0.98 independent-validation claim.
- `app/lib/alerts.ts` scores legacy agreement keys, while current generated data
  contains different keys.
- GRACE-DA is sometimes presented too close to mandal-scale depth, and rainfall
  minus ET is sometimes described as recharge.

## Phase 0 preservation rule

Phase 0 will add a V2 active path and mark existing V1 artifacts inactive rather
than deleting them. Generated outputs will be rebuilt only from the current
user-refreshed inputs. Unrelated pre-existing work will remain untouched.

## Change-group 4 checkpoint

Rechecked immediately before the integrity-test, CI, and documentation group.
There are still no staged changes. All original tracked modifications listed
above remain present, and all original untracked experiments and report assets
remain in place. The additional untracked V2 contract, publisher, validator,
generated artifacts, and provenance component are Phase 0 work.

This group will not edit or regenerate the pre-existing APWRIMS CSV, NASA sample
assets, V1 mandal datasets, V1 depth series, or V1 model output. It will limit
changes to lifecycle gates, active V2 documentation, tests, and canonical V2
artifact regeneration.
