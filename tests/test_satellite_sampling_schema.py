from scripts.sample_raster_at_points import OUTPUT_COLUMNS


def test_satellite_sampling_schema_has_percentiles_not_mbgl():
    assert OUTPUT_COLUMNS == [
        "station_id",
        "station_name",
        "district_name",
        "mandal_name",
        "latitude",
        "longitude",
        "groundwater_percentile",
        "rootzone_percentile",
        "surface_percentile",
        "satellite_sample_date_or_fetch_date",
        "gws_source_file",
        "rtzsm_source_file",
        "sfsm_source_file",
        "data_label",
        "notes",
    ]
    assert all("mbgl" not in column.lower() for column in OUTPUT_COLUMNS)
    assert all("depth" not in column.lower() for column in OUTPUT_COLUMNS)
