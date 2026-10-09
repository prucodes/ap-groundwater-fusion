"""Each map outline carries its own State mandal's readings, and only those.

A name key that drops Urban and Rural once put Rajahmundry (Urban) and (Rural)
on one chart, two wells interleaved month by month, shown on both polygons.
"""
import collections
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
RECORDS = json.load(open(os.path.join(APP, "mandal_groundwater_records_v2.json")))["records"]
SERIES = json.load(open(os.path.join(APP, "mandal_observation_series_v2.json")))["series"]
GEOMETRY = json.load(open(os.path.join(APP, "ap_map_geometry.json")))["mandals"]
CONFIRMED = os.path.join(ROOT, "phase3_levels", "data", "mandal_boundary_confirmed.csv")


def test_no_chart_interleaves_two_wells():
    for mandal_id, series in SERIES.items():
        months = collections.Counter(point["period"] for point in series["observations"])
        assert max(months.values(), default=1) == 1, f"{mandal_id} holds two readings in one month"


def test_a_modelled_outline_shows_its_own_series_only():
    for record in RECORDS:
        identity = record["identity"]
        if identity["coverageStatus"] == "modelled":
            assert len(identity["joinedSourceSeriesIds"]) == 1, identity["mandalName"]


def test_no_state_series_is_drawn_on_two_outlines():
    seen = collections.Counter(sid for r in RECORDS for sid in r["identity"]["joinedSourceSeriesIds"])
    twice = [sid for sid, count in seen.items() if count > 1]
    assert not twice, f"State series on two outlines: {twice}"


def test_confirmed_pairs_reach_the_outline_they_were_reviewed_against():
    assert len(RECORDS) == len(GEOMETRY)
    with open(CONFIRMED) as handle:
        for row in csv.DictReader(handle):
            index = int(row["boundary_index"])
            assert GEOMETRY[index]["m"] == row["boundary_mandal"], row["mandal"]
            assert 0.5 <= float(row["official_outline_iou"]) <= 1
            assert row["mandal_uuid"] in RECORDS[index]["identity"]["joinedSourceSeriesIds"], row["mandal"]


def test_every_state_mandal_is_drawn_or_disclosed():
    counts = json.load(open(os.path.join(APP, "dataset_manifest.json")))["counts"]
    drawn = {sid for r in RECORDS for sid in r["identity"]["joinedSourceSeriesIds"]}
    assert counts["rawSourceSeriesCount"] == (
        len(drawn) + counts["seriesSharingBoundaryCount"] + counts["seriesWithoutBoundaryCount"]
    ), "a State mandal is neither on the map nor in the outlines disclosure"
    note = json.load(open(os.path.join(APP, "model_card.json")))["disclosures"]["outlines"]
    assert f"lists {counts['rawSourceSeriesCount']} mandals" in note and f"draws {len(RECORDS)} outlines" in note
