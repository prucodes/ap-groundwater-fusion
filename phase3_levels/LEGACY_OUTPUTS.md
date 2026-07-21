# Legacy Phase 3 outputs

Phase 0 makes the V2 path the only active application data path. The following
files are preserved for reproducibility but are inactive:

- `app/data/mandal_dataset.json`
- `app/data/mandal_depth_series.json`
- `app/data/mandal_levels_estimated.json`
- `phase3_levels/outputs/mandal_levels_estimated.json`
- `phase3_levels/outputs/mandal_levels_current.json` when present

These artifacts mix incompatible counts or semantics, including observation
counts described as sensors, measured/modelled fallback values, heuristic
confidence, linear trend extrapolation, and V1 agreement keys. Application
TypeScript must not import or reference them. Their lifecycle status and hashes
are recorded under `artifacts.legacy` in
`app/data/dataset_manifest.json`.

Active generated artifacts are:

- `phase3_levels/outputs/mandal_nowcasts_v2.json`
- `phase3_levels/outputs/phase0_evaluations.json`
- `app/data/mandal_groundwater_records_v2.json`
- `app/data/mandal_observation_series_v2.json`
- `app/data/model_card.json`
- `app/data/dataset_manifest.json`

Run `python3 phase3_levels/build_levels_engine.py`,
`python3 phase3_levels/evaluate_phase0.py`,
`python3 phase3_levels/build_real_app_data.py`, and
`python3 phase3_levels/validate_phase0.py` in that order. A failed required step
must stop publication.
