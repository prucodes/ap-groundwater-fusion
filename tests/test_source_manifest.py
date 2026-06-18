import csv
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = REPO_ROOT / "data/source_manifest.csv"
EXPECTED_COLUMNS = [
    "source_name",
    "source_url",
    "license",
    "downloaded_or_created_date",
    "data_label",
    "official_flag",
    "notes",
]


def read_manifest():
    with MANIFEST_PATH.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        return list(reader.fieldnames or []), list(reader)


def test_source_manifest_schema_is_exact():
    fieldnames, rows = read_manifest()
    assert fieldnames == EXPECTED_COLUMNS
    assert rows


def test_prototype_sources_are_not_official():
    _, rows = read_manifest()
    prototype_rows = [row for row in rows if row["data_label"] == "prototype-public-source"]
    assert prototype_rows
    assert all(row["official_flag"] == "false" for row in prototype_rows)


def test_required_public_source_licenses_are_recorded():
    _, rows = read_manifest()
    by_name = {row["source_name"]: row for row in rows}
    assert by_name["satishvmadala/andhrapradesh_opendata_locations"]["license"] == "GPL-3.0"
    assert by_name["datta07/INDIAN-SHAPEFILES"]["license"] == "MIT"


def test_source_manifest_has_required_phase1c_sources_and_flags():
    _, rows = read_manifest()
    by_name = {row["source_name"]: row for row in rows}
    required_names = [
        "Mock APWRIMS-like groundwater readings",
        "satishvmadala/andhrapradesh_opendata_locations",
        "datta07/INDIAN-SHAPEFILES",
        "Official APWRIMS/APSAC/RTGS pending",
        "NASA/NDMC GRACE-DA current gws_perc_025deg_GL.tif",
        "NASA/NDMC GRACE-DA current rtzsm_perc_025deg_GL.tif",
        "NASA/NDMC GRACE-DA current sfsm_perc_025deg_GL.tif",
    ]
    for source_name in required_names:
        assert source_name in by_name
        assert by_name[source_name]["data_label"]
        assert by_name[source_name]["official_flag"] in {"true", "false"}
