# NASA GRACE-DA Ingestion Notes

## Files Downloaded

Phase 1C downloads the current public NASA/NDMC GRACE-DA percentile GeoTIFFs:

- `gws_perc_025deg_GL.tif`: groundwater storage percentile.
- `rtzsm_perc_025deg_GL.tif`: root-zone soil moisture percentile.
- `sfsm_perc_025deg_GL.tif`: surface soil moisture percentile.

Default source path:

`https://nasagrace.unl.edu/globaldata/current/`

Local path:

`data/raw/nasa/grace_da/current/`

Each download is recorded in:

`data/raw/nasa/grace_da/current/download_manifest.csv`

The source manifest is also updated with `data_label=satellite-model` and `official_flag=false`.

## Meaning Of Values

The raster values are percentiles, generally from 0 to 100 after nodata masking.

- Low percentiles indicate relatively dry satellite/model conditions.
- Mid percentiles indicate near-normal satellite/model conditions.
- High percentiles indicate relatively wet satellite/model conditions.

These values are not groundwater depth, not meters below ground level, and not a replacement for APWRIMS/piezometer readings.

## Station-Point Sampling

`scripts/sample_raster_at_points.py` uses the standardized APWRIMS-like station coordinates and samples each GeoTIFF at the station longitude/latitude.

Output:

`data/processed/satellite/satellite_samples_at_station_points.csv`

Output fields include:

- station identifiers and coordinates
- `groundwater_percentile`
- `rootzone_percentile`
- `surface_percentile`
- source raster file paths
- `data_label=satellite-model`

No sampled field is converted to mbgl or groundwater depth.

## Limitations

GRACE-DA rasters are 0.25 degree products. A point sample at a station coordinate returns the model grid-cell value containing or nearest to that station, not a station-scale groundwater measurement.

Implications:

- Multiple stations may sample the same raster cell.
- Local hydrogeology, pumping, canal command areas, and aquifer variation may not be visible in the satellite/model signal.
- Agreement or disagreement should be interpreted directionally.
- APWRIMS/piezometer observations remain the ground-truth layer.

## Next Step

Use official APWRIMS sensor readings and official APWRIMS/APSAC/RTGS mandal boundaries to aggregate satellite/model context and measured groundwater conditions by mandal. Until then, outputs remain prototype-only when they use mock readings or public prototype boundaries.

