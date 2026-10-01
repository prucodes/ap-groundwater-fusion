# Application Review and Visual Refinement

Review date: 2026-09-30. Local work on `codex/agriculture-water-watch`; not deployed by this pass.

## Decision

The application is suitable for demonstrating an evidence-led departmental pilot,
not for issuing approved drought declarations, crop-loss predictions, irrigation
allocations or current-day groundwater inventory. It contains source observations,
satellite-model products, research estimates and scenarios. These must remain
distinct even when displayed together.

Source verification, AP integration priorities and the seasonal baseline blocker
are documented in [Agriculture and Monsoon source readiness](agriculture_monsoon_source_readiness.md).

## Pages and Changes

| Page | Visual / workflow change | Data and interpretation improvement |
| --- | --- | --- |
| Overview | Map appears earlier; secondary evaluation details collapse; quieter KPI styling; direct district and agriculture review links | Matched labels for historical medians, actual verification queue, explicit provisional seasonal flags and missing satellite values |
| Crystal 3D | Original reflective scene retained; optional depth relief; district numeric labels and hover summaries; mandal selector, well-depth cross-section and evidence link; compact year panel; corrected phone framing and zoom/reset | Recorded May history, interpolation excluded from averages/ranks/YoY comparisons; explicit coverage and matched-pair comparison; heights are schematic, not aquifer geometry or storage |
| Districts | Interactive depth-versus-change profile, selectable points, readout and watchlist drill-down; map retained as an alternate view | Coverage and denominators visible; modelled depth separated from measured year-on-year change; not an area-weighted district estimate |
| Review Queue | Compact searchable, district-filtered queue with tier tabs, pagination, evidence links and filtered export | Missing/non-finite readings fail closed; unassessed is not normal; scoring ceiling corrected to seven; priorities are research review rules, not official warnings |
| Watchlist | Keyboard-selectable records; district deep-links; working completeness filters; full action text; no stale detail after an empty result | Current completeness classes; historical median labelled; satellite percentile not compared directly with metres |
| Mandal Map / Detail | Subtle status-coloured hover accents; keyboard map navigation; selected record remains the evidence destination | Map coverage requires a depth value; historical median and source type are explicit |
| Readiness | Source ledger, coverage strip and six release gates replace decorative readiness percentages | Observation time versus fetch time; unknown NASA valid period is not invented; source authority, identity, method, operations and acceptance remain pending |
| Reports | Current snapshot/agriculture/monsoon destinations; earlier reports visibly archived; real evidence/model pack download | Actual manifest and model card; research-only restrictions travel with exports; AWARE is a draft, not a dispatched payload |
| Settings / Shell | Real appearance controls and dataset status; synchronized theme toggles; navigation names match review purpose | No unsupported live-data or operational-readiness claims |
| Compare / Snapshot | Accessible comparison controls; dates beside latest depth; historical median separate | Mixed source periods/units explained; annual climate balance is not measured recharge |
| Climate / NASA / Methodology | Existing visualizations retained; concise contextual labels corrected | TerraClimate annual balance separated from CHIRPS monthly rain; GRACE-DA is satellite-model context, not well depth or ground truth; no causal attribution |
| Irrigation / Scenarios / Estimates | Existing tools retained with clearer assumptions, monitoring language and draft exports | Baseline-review warning; scenario zero means the reference year, not climate normal; no default invented anomaly; model target range explicit; no pumping recommendation |
| Agriculture / Monsoon | Earlier crop-scene, district brief, source status and map interaction work preserved | Dated source receipts, unresolved joins withheld and storage headline under review; illustrative crop stages are not observed field stages |
| Model Evidence Lab (formerly Living Water Table) | Removed the competing sidebar entry; available through Modelled Levels > Advanced model evidence; historical route retained | Separate from Crystal: measured/model/target/uncertainty comparison across 670 boundaries, not the 605-unit May history atlas |

## Crystal: What the 3D View Means

- The embedded dataset contains 605 displayed mandals across May 2015-2026.
  The builder excludes 55 sparse series; this is not complete official AP coverage.
- There are 177 interpolated mandal-years across the history. They remain available
  for visual continuity but are labelled and excluded from recorded statistics.
- May 2026 has 605 recorded displayed units, with an equal-weight mean of about
  10.0 m below ground. This is not today's depth and is not an area-weighted state total.
- Flat view is unchanged by default. Optional relief maps a 0-60 m depth reference
  to height, with adjustable 0.7-1.8x visual exaggeration. Taller means shallower;
  values beyond 60 m share the minimum relief height. Actual depth remains in the
  readout. A selected-location depth marker and a scaled borehole section clarify
  the encoding without changing readings. Surface blending, shimmer and motion are
  presentational, not inferred hydraulic connectivity or moving groundwater.
- District mode uses an equal-weight mean of recorded displayed mandals for each
  year. Labels include recorded counts, with collision suppression to retain map
  readability; hover details show the full local district context.
- A selected mandal shows its measured or interpolated year, depth cross-section,
  district comparison, recorded history and a link to the observation page.
  Historical ranks and YoY differences are withheld when required readings are missing.
- The extraction layer is the separate CGWB 2024 assessment. There are 548 matched
  units; name-based matches require an approved identity crosswalk. The year control
  is disabled in this mode. District extraction means are derived, not official
  district classifications.
- Data checks reconcile the rendered May values to the repository's V2 observation
  records. That verifies the app's transformation, not independent field accuracy
  or official permission to use each source record.
- Crystal is now the only main navigation 3D destination, named Water Depth 3D.
  The legacy classic-view link is removed. No observation data or useful model
  validation evidence was deleted to achieve the navigation cleanup.

## Primary Implementation Files

- `app/public/water-crystal-3d.html`, `app/app/crystal/page.tsx`,
  `phase3_levels/build_crystal_data.py`
- `app/components/governance/DistrictProfile.tsx`,
  `app/components/governance/Governance.module.css`
- Route files under `app/app/` listed in the page table above
- `app/components/ReportDownloads.tsx`, `IrrigationExports.tsx`,
  `MandalStatusMap.tsx`, `LiveMap.tsx`, `SelectedMandalPanel.tsx`,
  `MandalDetail.tsx`, `ThemeToggle.tsx`, `AlertsBell.tsx`, `AppShell.tsx`
- `app/lib/alerts.ts`, `app/lib/irrigation.ts`, `app/lib/data.ts`
- `app/e2e/governance.spec.ts`, `app/e2e/governance-crystal.spec.ts`,
  `app/playwright.config.ts`

## Follow Up Visual Refinement

- Crystal retains the original flat appearance. Relief has a quieter surface
  treatment, an adjustable vertical scale, a selected-location marker with
  collision-aware desktop labels, and a graduated borehole diagram showing the
  district mean as a separate reference. The mobile control stack sizes itself
  around the extra control; source and interpolation labels remain visible.
- Agriculture uses a more faithful crop-frame aspect ratio so mid-season canopies
  are not cut off. Three photographic stage previews show initial, mid-season and
  end-season states before selection. Root traces follow branching paths; rain
  no longer ends in outlined cartoon splash arcs. The inspection lens is larger,
  and the active scenario layer has a concise, explicitly assumed readout.
- Crop art is still generated illustration, not field imagery. Water-budget
  calculations, source snapshots and advisory restrictions did not change.
- Files: `app/components/agriculture/NaturalCropScene.tsx`, `CropWaterLab.tsx`,
  `CropField.module.css`, new `cropArtwork.ts`, `app/public/water-crystal-3d.html`,
  and the corresponding crop-scene and Crystal browser tests.

The active Crystal asset is `app/public/water-crystal-3d.html`. Its embedded `GW`
line is regenerated by the data builder. The older `viz-src` copy is not its build
input; do not overwrite the active asset with that legacy implementation.

## Verification

- Static export: passed, 694 pages generated.
- Production build: passed, including final navigation consolidation.
- Python suite: 233 passed.
- Browser regressions: 103 passed across desktop, phone, agriculture and governance;
  12 focused checks passed again after final navigation, layout and median corrections.
- Follow-up visual pass: static and production builds passed; 42 agriculture and
  governance checks passed, including relief scale invariance, hidden controls,
  real depth labels, canvas pixels, stage artwork, motion/pause and mobile layouts.
- Dedicated 3D checks cover nonblank canvas pixels, changed relief heights,
  projected map framing, district means, same-district height consistency,
  interpolation withholding, mode controls and real history links.

## Remaining Release Gates

1. Department-approved source access, station metadata, revisions and quality flags.
2. Official administrative identity and boundary vintage/crosswalk.
3. Seasonal baseline approval and versioned snapshot/film refresh. The current audit
   identifies 341 baseline/sample-count differences and 26 status changes under an
   unfiltered-history comparison; latest observed depths are unchanged.
4. Authorised crop-booking, observed rainfall, irrigation supply and reservoir feeds.
5. Field validation, measured alert performance, named owners and closed-loop actions.
6. Departmental approval of the final operational purpose and any AWARE contract.

No new telemetry feed, official certification, deployment or government dispatch
is implied by this visual and evidence-quality pass.
