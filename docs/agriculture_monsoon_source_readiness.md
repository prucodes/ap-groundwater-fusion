# AP Agriculture and Monsoon Watch: Source Readiness

Assessment date: 2026-09-30. Research prototype, not an approved government advisory.

## Decision

This is a credible direction for a departmental decision-support pilot, but it is
not yet an operational crop-risk, drought-declaration or water-allocation system.
The useful question is: **which places need verification, what evidence is missing,
and which department should act next?** A climate index or a groundwater-depth
anomaly alone cannot answer how many hectares will fail or how much irrigation
water a crop will receive.

The current pages contain real source inputs, derived research indicators and
explicit scenario assumptions. They are not live telemetry. A successful weekly
download does not make a monthly observation current-day information.

## What Was Checked

Machine-readable evidence: `reports/watch-source-audit.json`. Its source check is
bound to the SHA-256 of the published Monsoon Watch snapshot. Online checks were
performed on 2026-09-30; this is not continuous independent certification.

- Three public APWRIMS chart probes matched the stored August 2026 readings at
  displayed precision: Orvakal 28.97, Rentachintala 8.77, Sirvel 13.95 m bgl.
  These checks do not verify all mandals, station coverage or departmental quality flags.
- The NOAA ONI file matched JJA 2026 at +1.80 C. This is a three-month ocean index,
  not a mandal rainfall or crop-loss forecast. ONI and RONI are different indices.
- The CHIRPS v2 monthly catalogue contained August 2026 as its latest available
  month during the check. Catalogue availability does not independently verify
  every historical raster or zonal statistic used by the app.
- All 593 published seasonal rows reproduce under the existing implementation.
  Reproducibility is not methodological approval: the seasonal baseline inherits
  model-training eligibility filters requiring location and lagged observations.
- Recomputing from valid unfiltered source history changes baseline values or
  historical sample counts for 341 series and changes 26 status flags. Latest
  depths do not change. Departmental baseline review and a versioned data/film
  update are release blockers; this pass does not silently replace the baseline.
- Fourteen seasonal series share seven prototype boundaries. These ambiguous
  joins are now withheld on the Monsoon map instead of selecting the last row.
  The Agriculture map also requires a unique, identity-matched join.
- The state aggregate storage headline is withheld: duplicated boundary areas
  and assumed specific yield make it unsuitable as a claimed volume of water lost.
  Remaining per-location storage proxies are estimates, not measured inventory.

## AP Source Priorities

| Need | Primary source | Current connection / constraint |
| --- | --- | --- |
| Groundwater levels and history | [APWRIMS](https://apwrims.ap.gov.in/mis/groundwater/levels) | Public monthly chart data already ingested; obtain an authorised feed, station metadata, quality flags and revision policy for operational use. August 2026 in sampled series. |
| Actual crop, area, sowing date and stage | [NIC Andhra Pradesh e-Panta](https://ap.nic.in/en/publication/presentation-of-state-centre/) | Relevant state crop-booking system; not connected. Request approved aggregated access through Agriculture/NIC. Do not scrape personal farmer records. |
| Observed local rainfall | [AP DES rainfall](https://www.desweather.ap.gov.in/weather/Realtime/DayCount.jsp), [APSDMA Weather Watch](https://apsdmagis.ap.gov.in/weather-watch/index.html) | Relevant official state sources. Direct DES ingestion failed TLS verification; no bypass used. Obtain a trusted endpoint, gauge IDs, accumulation windows and quality flags. |
| Official weather outlook and advisories | [IMD API documentation](https://mausam.imd.gov.in/imd_latest/contents/api.pdf), [IMD agromet advisories](https://imdagrimet.gov.in/cropAdvisory_3.php) | Documented state-rainfall endpoint returned HTTP 401. Approved access is needed. A discoverable PDF must still be checked for issue and validity dates. |
| Reservoirs, releases and irrigation delivery | [APWRIMS](https://apwrims.ap.gov.in/) / Water Resources Department | A reservoir dashboard is not proof of water available to a specific farm. Need releases, usable storage, command areas and delivery schedules; not connected to the crop scenarios. |
| Climate rainfall history | [CHIRPS v2 monthly catalogue](https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/) | Existing satellite-and-gauge product, useful for consistent historical context. Current app aggregates mandal means; not an official area-weighted AP rainfall total. Do not mix v3 into a v2 baseline. |
| ENSO context | [NOAA ONI](https://psl.noaa.gov/data/correlation/oni.data), [NOAA advisory](https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml) | Connected research context. Keep issue period, index version and observation separate from forecast probabilities. |
| Official geography and accountability | Department-approved mandal/village IDs, boundaries and ownership | Public prototype geography is not sufficient for sanctions, eligibility, allocation or official area totals. Crosswalk and administrative-vintage approval pending. |

## Changes Made in This Pass

- Interactive district review brief: provisional flags versus coverage gaps,
  count-based district comparison, explicit denominators, record drill-down and
  a downloadable dated draft. Proposed departmental checks are not assignments;
  unknown crop exposure and allocable water are not converted into fake totals.
- Shared dated-source and governance-status panel on Agriculture and Monsoon Watch.
  Baseline-review warning remains visible even when source details are collapsed.
- Monsoon Watch leads with dated seasonal evidence before the retained film, with
  section navigation and an Agriculture-review link. Source-series denominators,
  storage-proxy labels and historical ONI grouping are explicit. Map readouts now
  support keyboard/touch, with clamped, subtly coloured desktop hover cards.
- Audit script reproduces local calculations and supports limited online probes.
  An absent or mismatched audit receipt is not presented as successful verification.
- APWRIMS refreshes now write content-hashed receipts, keeping full fetch time,
  sample-check time and observation period separate. A sample check cannot invent
  a full download receipt. The publisher only accepts a matching history hash.
- Rainfall-history refresh now advances to the previous complete UTC month instead
  of stopping at a hard-coded August 2026 cutoff. Source availability still governs
  whether a new month can be ingested.
- Existing weekly workflow includes refresh receipts in its output commit. This
  pass neither creates a new schedule nor deploys or triggers a production refresh.
- Softer photographic crop-scene water traces, unobstructed roots, and restrained
  status-coloured mandal hover cards. Crop stages and flow are illustrations;
  their visual realism is not evidence of live field observation.

## Minimum Credible Departmental Pilot

1. Agree on a small, department-selected geography and decision, for example a
   weekly water-stress verification queue. Name Agriculture and Groundwater owners.
2. Approve the historical baseline, thresholds and official location crosswalk.
   Publish a versioned dataset and update the fixed film separately before briefing
   officials with corrected figures. Keep the old release reproducible.
3. Connect authorised crop-booking aggregates, gauge rainfall, groundwater and
   irrigation supply. Retain source files, observation time, fetch time, units,
   quality flags and revisions. Keep missing fields missing.
4. Run shadow comparisons against field checks and official advisories. Measure
   coverage, freshness, false alarms and missed cases by district and crop stage.
   No autonomous allocation or farmer advice during this validation period.
5. Give each verified case an owner, action, due date, evidence and closure record.
   Publish operational recommendations only after named departmental sign-off.

The CM/CMO value is an auditable route from evidence to action, not a claim that
the prototype can predict every mandal's drought or crop outcome. Better visuals
can clarify that route; approved data, validation and accountability make it usable.

## Reproduction

```sh
python3 scripts/audit_watch_sources.py --online
python3 -m pytest
cd app
npm run build
```

For a local-only rerun retaining the original online check date:

```sh
python3 scripts/audit_watch_sources.py --reuse-online reports/watch-source-audit.json
```

The audit does not replace source datasets. It does not request credentials,
bypass access controls or disable TLS validation.
