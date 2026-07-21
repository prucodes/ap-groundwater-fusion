# Phase 1 roadmap — stronger mandal-level sensorless estimation

Phase 0 establishes honest evaluation and reproducible data contracts. It does
not claim to solve sensorless groundwater-depth estimation. The current relevant
benchmark is the whole-mandal spatial holdout, not the much lower temporal
nowcast error obtained when a mandal already has lag history.

This roadmap prioritizes sources and experiments that can improve whole-mandal
estimation without presenting indirect signals as groundwater measurements.

## Highest-value data additions

| Priority | Source | Useful variables | Scale / access | Scientific role and caution |
| --- | --- | --- | --- | --- |
| 1 | CGWB groundwater monitoring, yearbooks and India-WRIS/NWIC records | Site coordinates, dated depth-to-water, well/aquifer metadata | Site records and published reports | Adds an independent measured network and spatial labels. Match the same period and preserve network differences; do not use a later model snapshot against older wells. |
| 1 | CGWB NAQUIM/aquifer mapping and AP hydrogeology reports | Aquifer type, lithology, weathered/fractured thickness, transmissivity, specific yield | Aquifer and map units | Likely the most important static control for transferring depths to a mandal with no history. Version and georeference report-derived layers; report uncertain joins. |
| 1 | Authorized APWRIMS station metadata | Stable station ID, coordinates, screen/aquifer, measurement method and quality flags | Station level | Required to distinguish observations from physical stations and to build defensible within-mandal aggregates. Authorization remains a release gate. |
| 2 | Sentinel-1 SAR | Coherence and vertical land-motion features from leakage-safe InSAR processing | 10 m acquisitions; aggregate only over coherent zones | Subsidence can indicate compaction in some pumped alluvial aquifers. It is not groundwater depth, is weak in decorrelated terrain/crops, and must be validated by aquifer cohort. |
| 2 | SMAP L4 soil moisture | Surface/root-zone anomaly, change and drought persistence | 9 km, 3-hourly | Adds antecedent wetness and recharge-response context. Coarse pixels require regional/temporal features, not false mandal precision. |
| 2 | CHIRPS v3 and, where legally available, IMD gridded rainfall | Monthly/seasonal totals, standardized anomalies, dry spells and monsoon onset | CHIRPS 0.05°; IMD product-dependent | Use lagged cumulative rainfall and anomaly features. Migrate from CHIRPS v2 on a versioned overlap evaluation. Rainfall is not recharge. |
| 2 | TerraClimate, ERA5-Land and GLDAS | Actual/potential ET, soil moisture, runoff, temperature and water-balance anomalies | Roughly 4–28 km depending on product | Compare products through ablations; do not stack highly correlated products without regularization and leakage-safe validation. |
| 2 | SoilGrids | Clay/sand/silt, bulk density, organic carbon, coarse fragments, water-retention proxies | 250 m | Static infiltration/storage covariates with published uncertainty. Cache versioned WCS/WebDAV downloads because the public REST API is not currently the dependable bulk path. |
| 2 | Copernicus/SRTM DEM and HydroSHEDS | Elevation, slope, curvature, topographic wetness, drainage density, distance to stream and basin position | 30–90 m | Strong transferable controls on groundwater setting; derive before aggregating to boundary and basin units. |
| 3 | Sentinel-2/Landsat and Dynamic World/WorldCover | Irrigated/cropped area, crop cycles, NDVI/EVI, surface-water occurrence and land-cover change | 10–30 m | Proxies seasonal demand and recharge conditions. Use cloud-aware compositing and historical products aligned to each target month. |
| 3 | Reservoir, canal, tank and river datasets | Storage/release, command area, distance to canal/tank, surface-water persistence | Facility/network and raster | Can explain recharge and substitution from surface water. Official release/command-area data are preferable; missing operational records must remain missing. |
| 3 | CGWB groundwater-resource assessment and agricultural statistics | Extraction stage, irrigated area, crop mix, wells and draft/recharge assessment | Assessment unit, district or block | Useful long-run demand context but often not monthly and sometimes not aligned to current mandals. Keep assessment year and spatial crosswalk explicit. |
| 3 | Electricity/feeder or pump-use aggregates, if lawfully shareable | Agricultural power duration/energy | Feeder or administrative aggregate | Potential demand proxy. Requires privacy, authorization, coverage and confounding review; never infer individual pumping. |

Official discovery endpoints reviewed for this roadmap:

- CGWB monitoring portal: <https://cgwb.gov.in/en/ground-water-level-monitoring>
- CGWB publication repository: <https://cgwb.gov.in/cgwbpnm/publication-detail/246>
- NASA SMAP L4 catalog: <https://developers.google.com/earth-engine/datasets/catalog/NASA_SMAP_SPL4SMGP_008>
- CHIRPS data: <https://www.chc.ucsb.edu/data/chirps>
- TerraClimate catalog: <https://developers.google.com/earth-engine/datasets/catalog/IDAHO_EPSCOR_TERRACLIMATE>
- SoilGrids: <https://isric.org/explore/soilgrids/>
- NASA GLDAS specifications: <https://ldas.gsfc.nasa.gov/gldas/specifications>
- Google Earth Engine public catalog, including Sentinel, Landsat and
  reanalysis collections: <https://developers.google.com/earth-engine/datasets/>

## Model-development sequence

1. Freeze a sensorless benchmark using whole-mandal GroupKFold, spatial blocks,
   leave-district-out and leave-aquifer-out folds. Report all four, not a random
   record split.
2. Establish simple baselines on identical folds: district median, terrain
   median, nearest-neighbour/IDW with self-neighbours excluded, and spatial
   regression/kriging where appropriate.
3. Build hydrogeology and terrain features first. Add soil, rainfall/ET/soil
   moisture, land-cover/crop, surface-water and demand features in registered
   ablation groups.
4. Tune only inside nested training folds. Keep target-mandal observations and
   target-derived aggregates out of every feature calculation.
5. Evaluate terrain, aquifer, coastal/alluvial/hard-rock and data-completeness
   cohorts. A statewide average cannot hide an unreconciled subgroup failure.
6. Calibrate spatial uncertainty on held-out mandals, preferably using
   split-conformal or locally weighted conformal methods evaluated for empirical
   coverage and interval width.
7. Test temporal transfer separately with rolling-origin validation. Do not
   merge the temporal-nowcast and spatial-sensorless claims.
8. Use CGWB as a separate same-period external-network check, with matched
   locations and aquifers where possible, rather than as a universal error
   floor.

## Candidate model families

Start with interpretable, robust tabular/spatial baselines: regularized linear
models, random forests/extra trees, gradient boosting, terrain/aquifer-specific
models, residual kriging and leakage-safe ensembles. Only progress to graph
neural networks, temporal deep learning or physics-informed hybrids after the
same spatial folds demonstrate a repeatable gain over the strongest simple
baseline.

The primary selection metric is whole-mandal MAE, accompanied by RMSE, bias,
rank correlation, empirical interval coverage and worst-cohort error. A new
model is promotable only if it improves multiple spatial folds, does not rely on
target history, and passes reproducibility and provenance gates.

## Realistic outcome

Open covariates can improve spatial transfer, particularly when aquifer,
terrain, soil and demand controls are added. They cannot uniquely determine a
mandal's absolute depth without measured labels and hydrogeologic constraints.
The goal is therefore a materially better, calibrated sensorless estimate with
transparent uncertainty—not a claim that satellite data directly measures
mandal groundwater depth.
