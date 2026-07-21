# Fusion Methodology

## Active Phase 0 method

APWRIMS-format history is the measured historical source. The latest measured
mandal aggregate is kept separate from the current modelled nowcast. The model
does not continuously observe groundwater in every mandal, and its output does
not replace an official APWRIMS result or a field measurement.

The production builder excludes each modelled mandal's latest eligible target
row from fitting before predicting that row. P50, P10 and P90 gradient-boosted
models are fitted on the earlier rows. The resulting interval is a model
quantile range, not a guaranteed confidence interval.

No future value is synthesized from the measured trend. Forecast objects are
released only when a horizon is evaluated on identical rolling-origin records,
has no target leakage, and reduces MAE by at least five percent against both
no-change and seasonal baselines without an unresolved terrain-cohort failure.
No horizon currently satisfies that complete release gate.

## Evaluation tasks

Evaluation results are generated in
`phase3_levels/outputs/phase0_evaluations.json` and published through
`app/data/model_card.json`.

- Rolling temporal holdout evaluates nowcasting/gap-filling only for records
  with the required prior history and lag features.
- Whole-mandal GroupKFold evaluates spatial estimation when an entire mandal is
  withheld. It is the relevant current proxy for sensorless performance and has
  materially higher error than temporal nowcasting.
- Direct 1-, 3-, 6- and 12-month forecasts are research evaluations and are not
  released.
- The same-month CGWB/APWRIMS result is a cross-network comparability
  diagnostic. Different sites, aquifers, spatial aggregation, periods and
  possible location mismatches prevent it from being described as ground truth
  or independent proof of model accuracy.

Metrics must always be shown with their task, cohort, split, sample count,
baseline and model version. Temporal nowcast performance must not be generalized
to sensorless mandals.

## External context

GRACE-DA is regional model-assimilated groundwater-storage/wetness context. It
is not a direct mandal-level depth measurement. CHIRPS rainfall and
TerraClimate actual ET are kept as separate climate inputs.
Rainfall-minus-actual-ET is a climate water-balance indicator and is not direct
measured recharge or a calibrated pumping recommendation.

## Context agreement and alerts

The active agreement categories are:

- `declining_despite_positive_climate_balance`
- `declining_without_positive_climate_balance`
- `stable_or_recovering`
- `unknown`

Legacy values fail validation. Unknown or missing inputs return diagnostics and
do not receive an agreement score. Climate balance alone cannot create a
groundwater-severity alert. Boundary-only and no-data records return an explicit
`insufficient_data` state. Suggested next steps are limited to monitoring,
reviewing measured history, or field verification.

## Confidence and official-use limits

The qualitative confidence class summarizes data completeness and the stated
method; it is not a verified accuracy probability or forecast score. Physical
station counts remain unknown until stable station identifiers can be
deduplicated.

Current boundaries are public prototype boundaries with temporary identifiers.
APWRIMS-format observations are a browser-session research sample with
authorization pending. All V2 outputs are decision-support research artifacts,
not official measurements or official operational directions.

## Legacy V0 method

The earlier V0 aggregation and heuristic confidence/action logic is retained in
legacy scripts and artifacts for reproducibility. It is inactive and must not be
used by the application.
