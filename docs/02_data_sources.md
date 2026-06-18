# Data Sources

## Source Labels

Every data field and dataset should carry or inherit one of these labels:

- `measured`: official APWRIMS/AP government station, piezometer, telemetry, or sensor readings.
- `mock`: realistic fake records used only for development and validation.
- `satellite-model`: NASA GRACE-FO/GRACE-DA groundwater, rootzone, or surface soil-moisture percentile products.
- `derived`: values calculated by this repository, including confidence, agreement, status, and recommended action.
- `prototype-public-source`: public boundary or name files used only for prototype lookup, normalization, or spatial joining.

## A. satishvmadala/andhrapradesh_opendata_locations

Source URL: `https://github.com/satishvmadala/andhrapradesh_opendata_locations`

Purpose:

- AP district/mandal/village name standardization and ID crosswalk.
- District GeoJSON where available.
- District-mandal gazette references.

Use:

- Prototype admin lookup and name normalization.

Caution:

- Treat as public prototype source, not official APWRIMS boundary source.
- Verify district splits, mandal names, spellings, and recency.
- Note GPL-3.0 license.

Data label: `prototype-public-source`

Official flag: `false`

## B. datta07/INDIAN-SHAPEFILES

Source URL: `https://github.com/datta07/INDIAN-SHAPEFILES`

Purpose:

- India/AP state/district/subdistrict boundary GeoJSON/shapefile source.

Use:

- Prototype boundary polygons for spatial join if AP mandal/subdistrict geometry is available and valid.

Caution:

- Treat as public prototype source, not official APWRIMS boundary source.
- Verify AP folder contents, district/mandal coverage, geometry validity, names, CRS, and recency.
- Note MIT license.

Data label: `prototype-public-source`

Official flag: `false`

## C. Official APWRIMS/APSAC/RTGS Boundaries

Purpose:

- Final production boundary source.

Use:

- Replace public prototype boundaries once shared by the government team.

Caution:

- Required before claiming official mandal-level results.
- Official flags should only be set after receiving official APWRIMS/AP government data.

Data label: `measured` for official readings or official boundary metadata as applicable.

Official flag: `true` only after official source receipt and verification.

## NASA GRACE-FO/GRACE-DA

Purpose:

- Supporting groundwater and soil-moisture percentile signals.

Use:

- Directional context for dry, normal, or wet satellite/model conditions.
- Agreement and mismatch checks against station readings.

Caution:

- Satellite/model percentiles are not exact groundwater depth.
- Spatial resolution is coarser than mandal and station-level decision making.

Data label: `satellite-model`

Official flag: `false`

