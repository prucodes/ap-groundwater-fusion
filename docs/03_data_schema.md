# Data Schema

## Active Phase 0 contract (V2)

The active UI consumes `MandalGroundwaterRecordV2`, contract version `2.0.0`,
from `app/data/mandal_groundwater_records_v2.json`. The JSON schema is
`phase3_levels/contracts/mandal_groundwater_record_v2.schema.json`. There is
exactly one V2 record for every prototype boundary feature.

Each record separates:

- `identity`: temporary mandal/district IDs, prototype boundary identity,
  explicit coverage status, and source-series joins;
- `observation`: nullable measured APWRIMS-format mandal aggregate, observation
  period, record count and unique month count. `physicalStationCount` remains
  `null` because distinct physical station identifiers are not verified;
- `nowcast`: nullable current model estimate, target period, model version and
  a `model_quantile_p10_p90` interval;
- `forecast`: nullable future target. It remains `null` while no horizon passes
  the rolling-origin baseline release gate;
- `signals`: separate GRACE-DA regional model-assimilated context, CHIRPS
  rainfall, TerraClimate actual ET, and rainfall-minus-actual-ET climate
  balance;
- `quality`: history length, missing features, interval width, cohort,
  completeness class and the method used for the qualitative confidence class;
- `assessment`: neutral monitoring status, measured trend and one of the four
  supported context-agreement categories; and
- `provenance`: source paths, authorization/license state, hashes, builder,
  geometry, model and contract versions.

Exclusive coverage states are `modelled`, `measured_only`, `boundary_only`,
`no_data`, and `excluded`. Missing objects are meaningful and must not be
replaced with district values, neighbour histories, or another value type.

Active related artifacts:

- `app/data/mandal_observation_series_v2.json`
- `app/data/model_card.json`
- `app/data/dataset_manifest.json`
- `phase3_levels/outputs/mandal_nowcasts_v2.json`
- `phase3_levels/outputs/phase0_evaluations.json`

The manifest is the canonical count and lifecycle inventory. Files explicitly
listed there as `legacy_inactive` must not be imported by application code.

## Mock APWRIMS-Like Groundwater Readings

Path: `data/mock/apwrims/mock_groundwater_readings.csv`

| Field | Label | Notes |
| --- | --- | --- |
| `station_id` | `mock` | Fake station identifier. |
| `station_name` | `mock` | Fake station name. |
| `district_name` | `mock` | AP district name for pilot sample. |
| `mandal_name` | `mock` | AP mandal name for pilot sample. |
| `village_name` | `mock` | Village name where available. |
| `latitude` | `mock` | Realistic fake coordinate. |
| `longitude` | `mock` | Realistic fake coordinate. |
| `reading_date` | `mock` | Fake reading date. |
| `groundwater_level_mbgl` | `mock` | Fake groundwater level in meters below ground level. |
| `source_type` | `mock` | Manual, telemetry, piezometer, or sensor. |
| `source_system` | `mock` | `APWRIMS-like mock`. |
| `quality_flag` | `mock` | Simple quality flag such as `ok` or `review`. |
| `data_label` | `mock` | Must be `mock` for every row. |

## Groundwater Source Labels

- `mock`: Realistic fake APWRIMS-format data for pipeline testing only.
- `measured_public`: Public measured groundwater observations from NWIC/NWDP/India-WRIS/AP public sources. These are measured observations but not official APWRIMS exports.
- `measured_public_prototype`: Public measured observations that require extra review because fields, coordinates, units, or admin joins are incomplete.
- `official_apwrims`: Future official APWRIMS/AP government export only. This label must not be used for NWIC/public data.

## Processed Groundwater Readings

Adds standardized name fields and validation notes while preserving raw values and `data_label`.

Expected additions:

- `district_name_standardized`
- `mandal_name_standardized`
- `village_name_standardized`
- `validation_notes`

## Standardized Public Measured Groundwater Readings

Path: `data/processed/groundwater/standardized_public_groundwater_readings.csv`

Fields:

- `station_id`
- `station_name`
- `district_name`
- `mandal_name`
- `village_name`
- `latitude`
- `longitude`
- `reading_date`
- `groundwater_level_mbgl`
- `groundwater_level_unit = mbgl`
- `depth_reference = meters_below_ground_level`
- `measurement_parameter = depth_to_water`
- `source_type`
- `source_system`
- `source_resource_id`
- `measured_data_label = measured_public`
- `data_label = measured_public`
- `observation_method`
- `quality_flag`
- `validation_notes`
- `source_file`
- `source_url`
- `source_license`
- `fetch_status`
- `raw_station_id`
- `raw_station_name`
- `raw_district_name`
- `raw_groundwater_level_field`
- `raw_date_field`

Public measured rows must not be labeled `official_apwrims`.

## Boundary Inventory

Path: `data/processed/boundaries/boundary_inventory.csv`

Fields:

- `source_root`
- `file_path`
- `file_type`
- `geometry_type`
- `crs`
- `feature_count`
- `likely_admin_level`
- `key_name_fields`
- `notes`

All public boundary inventory entries are `prototype-public-source` context unless replaced by official data.

## Standardized Prototype Boundaries

Path: `data/processed/boundaries/ap_mandal_boundaries_prototype.geojson`

Expected fields:

- `district_name`
- `mandal_name`
- `boundary_source = public_prototype`
- `official_flag = false`
- `geometry`

## Satellite/Model Samples

Expected fields:

- `station_id`
- `sample_date`
- `groundwater_percentile`
- `rootzone_percentile`
- `surface_percentile`
- `satellite_source_file`
- `data_label = satellite-model`

Satellite/model percentile fields must not be converted into groundwater depth.

## Legacy V0 fusion output (inactive)

Path: `data/processed/fusion/mandal_groundwater_fusion_v0.csv`

Fields:

- `mandal_name`
- `district_name`
- `sensor_count`
- `latest_sensor_date`
- `median_groundwater_mbgl`
- `avg_groundwater_mbgl`
- `groundwater_percentile`
- `rootzone_percentile`
- `surface_percentile`
- `sensor_satellite_agreement`
- `confidence_score`
- `confidence_label`
- `status`
- `recommended_action`
- `data_quality_notes`
- `boundary_source`
- `boundary_official_flag`

Fusion fields are `derived` unless they directly carry measured/mock/prototype/satellite source values.
This schema remains for historical reproducibility only. Its ambiguous
`sensor_count`, `latest_sensor_date`, numeric confidence and action fields are
not part of the active V2 application contract.
