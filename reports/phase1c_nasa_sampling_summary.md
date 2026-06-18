# Phase 1C NASA Sampling Summary

## Downloaded NASA/NDMC Files

| local_path | source_url | fetch_date | file_size_bytes | sha256 | tls_verified | tls_fallback_reason |
| --- | --- | --- | --- | --- | --- | --- |
| data/raw/nasa/grace_da/current/gws_perc_025deg_GL.tif | https://nasagrace.unl.edu/globaldata/current/gws_perc_025deg_GL.tif | 2026-06-12 | 909660 | d0d8c0d0c288268fc5e2e531fa226173a68bd266adbd34effd1af513a5038c6f | false | existing file reused |
| data/raw/nasa/grace_da/current/rtzsm_perc_025deg_GL.tif | https://nasagrace.unl.edu/globaldata/current/rtzsm_perc_025deg_GL.tif | 2026-06-12 | 1005430 | e3b85addbcc68ce21d18f76977f819c57ae6cde90cf880baede263424e4025e0 | false | existing file reused |
| data/raw/nasa/grace_da/current/sfsm_perc_025deg_GL.tif | https://nasagrace.unl.edu/globaldata/current/sfsm_perc_025deg_GL.tif | 2026-06-12 | 1016380 | 43673cc879f1afbc165457d125b42d0d9835f637d195a208655d3141b1960db2 | false | existing file reused |

## Raster Inventory

| raster_name | crs | bounds | width | height | resolution | nodata | min_value | max_value |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gws_perc_025deg_GL.tif | EPSG:4326 | -180.0,-60.0,180.0,90.0 | 1440 | 600 | 0.25,0.25 | -999.0 | 0.2198 | 100.0 |
| rtzsm_perc_025deg_GL.tif | EPSG:4326 | -180.0,-60.0,180.0,90.0 | 1440 | 600 | 0.25,0.25 | -999.0 | 0.2198 | 100.0 |
| sfsm_perc_025deg_GL.tif | EPSG:4326 | -180.0,-60.0,180.0,90.0 | 1440 | 600 | 0.25,0.25 | -999.0 | 0.2198 | 100.0 |

## Station Sampling

- Station points sampled: 10
- Total null/nodata percentile samples: 0

## Percentile Summary

| metric | count | null_count | min | mean | max |
| --- | --- | --- | --- | --- | --- |
| groundwater_percentile | 10 | 0 | 91.59 | 98.01 | 100.0 |
| rootzone_percentile | 10 | 0 | 72.25 | 90.68 | 98.09 |
| surface_percentile | 10 | 0 | 63.26 | 85.91 | 100.0 |

## Top 5 Highest Groundwater Percentile Stations

| station | groundwater_percentile |
| --- | --- |
| APM-GNT-002 - Mangalagiri Telemetry Point (Guntur/Mangalagiri) | 100.0 |
| APM-KRI-001 - Gudivada Manual Well (Krishna/Gudivada) | 100.0 |
| APM-KRI-002 - Avanigadda Piezometer (Krishna/Avanigadda) | 100.0 |
| APM-ANT-001 - Tadipatri Sensor Point (Anantapur/Tadipatri) | 100.0 |
| APM-VSK-002 - Bheemunipatnam Observation Well (Visakhapatnam/Bheemunipatnam) | 100.0 |

## Top 5 Lowest Groundwater Percentile Stations

| station | groundwater_percentile |
| --- | --- |
| APM-CTR-001 - Madanapalle Piezometer (Chittoor/Madanapalle) | 91.59 |
| APM-CTR-002 - Palamaner Manual Well (Chittoor/Palamaner) | 93.85 |
| APM-VSK-001 - Anakapalle Telemetry Point (Visakhapatnam/Anakapalle) | 96.92 |
| APM-ANT-002 - Dharmavaram Observation Well (Anantapur/Dharmavaram) | 98.82 |
| APM-GNT-001 - Tenali Observation Well (Guntur/Tenali) | 98.9 |

## Caveat

Station values are point samples from 0.25 degree NASA/NDMC GRACE-DA percentile rasters. They are not mandal averages, not official APWRIMS readings, and not groundwater levels in mbgl.
