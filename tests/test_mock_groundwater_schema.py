import csv
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MOCK_PATH = REPO_ROOT / "data/mock/apwrims/mock_groundwater_readings.csv"
EXPECTED_COLUMNS = [
    "station_id",
    "station_name",
    "district_name",
    "mandal_name",
    "village_name",
    "latitude",
    "longitude",
    "reading_date",
    "groundwater_level_mbgl",
    "source_type",
    "source_system",
    "quality_flag",
    "data_label",
]


def read_mock_rows():
    with MOCK_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def test_mock_groundwater_schema_is_exact():
    fieldnames, rows = read_mock_rows()
    assert fieldnames == EXPECTED_COLUMNS
    assert rows


def test_all_mock_rows_are_labeled_mock():
    _, rows = read_mock_rows()
    assert {row["data_label"] for row in rows} == {"mock"}


def test_mock_rows_do_not_imply_official_status():
    fieldnames, rows = read_mock_rows()
    assert "official_flag" not in fieldnames
    assert all("official" not in " ".join(row.values()).lower() for row in rows)

