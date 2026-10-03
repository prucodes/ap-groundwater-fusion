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
- The CHIRPS monthly catalogue contained August 2026 as its latest available
  month during the check (v3 since the 2026-10-02 rebuild; v2 before it).
  Catalogue availability does not independently verify every historical raster
  or zonal statistic used by the app.
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
| Actual crop, area, sowing date and stage | [NIC Andhra Pradesh e-Panta](https://ap.nic.in/en/publication/presentation-of-state-centre/) | Relevant state crop-booking system; not connected. APWRIMS already carries crop-sown and crop-stress dashboards (`/mis/cropsown`, `/mis/cropstress`) behind a login. Request read access to their mandal-by-crop aggregates through Agriculture / Water Resources / RTGS. Do not scrape personal farmer records, and do not get around the login. |
| Observed local rainfall | [APWRIMS rainfall](https://apwrims.ap.gov.in/mis/rainfall) (AP DES mandal gauges) | **Connected 2026-10-02**, weekly: about 3,500 gauges, per mandal, against the department's normal for the water year to date. Direct DES ingestion had failed TLS verification; APWRIMS serves the same network over valid TLS. The portal's headline divides a mandal-average actual by a district-average normal (-35.9% on 2 Oct); the app publishes the area-weighted figure (-33.2%). Gauge IDs and quality flags still need a departmental feed. |
| Soil moisture | [APWRIMS soil moisture](https://apwrims.ap.gov.in/mis/soilmoisture) (NRSC VIC model, 0.05 degrees) | **Connected 2026-10-02**, weekly: per mandal at 5, 30, 100 and 150 cm, from 2014 onward, set against the same date in earlier years. Modelled, not field measurement, and driven by rainfall. ISRO's EOS-04 500 m product (Bhoonidhi) is open data but revisits every ~17 days, and its API works only from a whitelisted static IP. |
| Official weather outlook and advisories | [IMD API](https://api.imd.gov.in/public/api_reference.html), [IMD agromet advisories](https://imdagrimet.gov.in/cropAdvisory_3.php) | Not connected. Every endpoint answered HTTP 401 "API key missing" on 2026-10-02. Register and keep the key in Actions secrets. IMD's terms restrict republishing, so check their usage rules before the weekly refresh commits forecasts to a public repository. |
| Reservoirs, releases and irrigation delivery | [APWRIMS reservoirs](https://apwrims.ap.gov.in/mis/reservoir) / Water Resources Department | **Storage and releases connected 2026-10-02**: 113 major and medium reservoirs (storage, inflow, outflow, the release into each canal at the headworks), plus 11 upstream reservoirs outside AP. Our sums match the portal's own storage totals exactly. Still missing: the canal-to-command-area-to-mandal crosswalk and delivery schedules. A release is not water delivered to a farm. |
| Climate rainfall history | [CHIRPS v3 monthly catalogue](https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs/) | **Rebuilt on v3 from 1981 on 2026-10-02**; v2 production ends after December 2026. Not mixed: a manifest records the product, and an incremental run refuses to append across products. June-August 2026 reads -41.5% on v3 (-28.4% on v2); the state's gauges read about -50% for those months. Mandal means, not an official area-weighted AP rainfall total. |
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

## Changes Made on 2026-10-02

- **Water context connected.** `phase3_levels/fetch_apwrims_context.py` adds three
  APWRIMS feeds to the weekly refresh:
  - modelled soil moisture,
  - gauge rainfall,
  - reservoir storage with the release into each canal.

  The output is `app/data/water_context.json`, with a receipt in
  `data/refresh_receipts/apwrims_context.json`. Each feed carries its own as-of
  date. A feed that fails, or answers with too few mandals or reservoirs, keeps
  its previous section rather than publishing a partial one.
- **Agriculture page.** The supply-and-weather step now reads "Partly connected"
  and lists what is and is not connected. Each mandal shows its gauge rain and
  soil moisture beside the groundwater record.
- **Signal agreement.** A count shows how many of three stated tests point to
  stress:
  - groundwater shortfall flagged;
  - gauge rain 20% or more below normal;
  - 30 cm soil moisture among the driest quarter of years for the date.

  On 2 Oct, all three agree in 21 of the 524 units where all three are usable,
  and two agree in 154 more. The count is not a score. The soil model is driven
  by rainfall, so those two tests are not independent. The district brief and
  the CSV export carry the same counts with their rules.
- **CHIRPS v3.** The history was rebuilt from 1981 (see above). The Monsoon
  Watch now reads June-August 2026 as the driest of 46 years. El Nino monsoons
  average -13.0% (5 of 7 below normal), against -15.2% (6 of 7) on v2.
- **The narrated film was not re-rendered.** It is a fixed August-2026 edition
  that speaks the v2 figures. The Monsoon page now says, beside the film, which
  figures have moved since and to what.
  Its test now checks the film against its own recorded snapshot instead of the
  live file. The old check compared the film's hash with the whole live file,
  `generatedAt` included, so every weekly refresh would have failed on it.
  Re-narrating needs a human review of the voice-over; that is a release
  decision.
- **Re-audit.** The source audit was re-run online against the new snapshot:
  - CHIRPS v3 has August 2026;
  - ONI matches;
  - 3 of 3 APWRIMS probes match.

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
