from scripts.fusion_engine_v0 import FUSION_OUTPUT_COLUMNS
from scripts.fusion_engine_v0 import DEFAULT_JOINED_PUBLIC_STATIONS, notes_for_group


def test_fusion_output_schema_is_complete_and_ordered():
    assert FUSION_OUTPUT_COLUMNS == [
        "mandal_name",
        "district_name",
        "sensor_count",
        "latest_sensor_date",
        "median_groundwater_mbgl",
        "avg_groundwater_mbgl",
        "groundwater_percentile",
        "rootzone_percentile",
        "surface_percentile",
        "rainfall_mm",
        "annual_et_mm",
        "water_balance_mm",
        "water_balance_status",
        "sensor_satellite_agreement",
        "confidence_score",
        "confidence_label",
        "status",
        "recommended_action",
        "data_quality_notes",
        "boundary_source",
        "boundary_official_flag",
    ]


def test_public_measured_fusion_notes_differ_from_mock():
    public_notes = notes_for_group({"measured_public"}, {"public_prototype"}, satellite_missing=False)
    mock_notes = notes_for_group({"mock"}, {"public_prototype"}, satellite_missing=False)

    assert "public measured groundwater input; not official APWRIMS" in public_notes
    assert "mock groundwater input" not in public_notes
    assert "mock groundwater input" in mock_notes


def test_public_measured_priority_path_is_defined():
    assert DEFAULT_JOINED_PUBLIC_STATIONS.name == "stations_joined_public_measured_to_boundaries.csv"
