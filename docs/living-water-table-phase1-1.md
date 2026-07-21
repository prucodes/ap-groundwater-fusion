# Living Water Table — Phase 1.1 verification record

## Pre-edit repository state

Phase 1.1 started from an intentionally dirty working tree. No files were
staged. The existing modified files include the Phase 0 pipeline, V2 loaders,
application pages and components, generated data, documentation, and the
weekly workflow. Existing untracked work includes the Phase 1 route and
components, V2 artifacts, Phase 0 validators/tests, Docker/OpenShift files,
reports, and the CGWB, IMD, InSAR, power, extraction, kriging, and sensorless
model experiments. These changes predate Phase 1.1 and remain user-owned.

Phase 1.1 does not reset, clean, stash, stage, delete, or overwrite that work.
Edits are limited to the existing Living Water Table presentation, the shared
theme-control label, focused tests, and this verification record. The
scientific generation scripts and active V2 data artifacts are not retrained or
regenerated in this pass.

## Measured/modelled provenance decision

The active output is not an archived operational nowcast. In
`phase3_levels/build_levels_engine.py`, the latest eligible row for every
mandal is removed from the fitting data before the p50/p10/p90 models are fit.
That removed row is then predicted and published to
`phase3_levels/outputs/mandal_nowcasts_v2.json`.

The UI therefore describes this value as a **held-out model estimate**:

- the same-period measured mandal aggregate is primary;
- the estimate is explicitly described as generated without the target-period
  observation;
- the observed/estimated absolute difference and interval inclusion are shown
  only when their periods match;
- the interval remains a model P10–P90 quantile range, not a guaranteed
  confidence interval;
- no forecast is shown.

The V2 field name remains `nowcast` for contract compatibility, but Phase 1.1
does not use that name as the user-facing interpretation of this artifact.

## Scope

This pass refines route-local scroll restoration, bounds-derived camera
framing, neutral fixed-slab depth cues, grid hierarchy, selected-boundary
treatment, legend collapse, visual-quality wording, appearance wording,
interaction guidance, browser verification, and screenshot evidence. It does
not introduce cinematic rendering, temporal playback, stress layers,
data-driven extrusion, forecasts, or new scientific model features.
