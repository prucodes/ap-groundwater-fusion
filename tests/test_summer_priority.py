"""The summer drinking-water priority list must follow its own stated rules.

Each band is a claim a district office will act on, and each sign beside a name is
a reason it was put there. So every row is re-derived here from the files it was
built from: the outlook's tier, the cyclone rain, the monsoon flag, the tank fill
and the water tests.
"""
import json
import os
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_summer_priority as priority  # noqa: E402


def load(name):
    with open(os.path.join(APP, name)) as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def data():
    return load("summer_priority.json")


def test_every_beyond_mandal_is_on_the_list_and_nothing_within_its_record_is(data):
    outlook = load("summer_outlook.json")
    beyond = {i for i, row in enumerate(outlook["mandals"]) if row and row["tier"] == "beyond"}
    listed = {row["index"]: row for row in data["mandals"]}
    assert beyond <= set(listed)
    for index, row in listed.items():
        assert outlook["mandals"][index]["tier"] in ("beyond", "dry")
        assert row["tier"] == outlook["mandals"][index]["tier"]


def test_bands_follow_the_sign_counts(data):
    rules = data["rules"]
    for row in data["mandals"]:
        signs = len(row["signs"])
        if row["band"] == "first":
            assert row["tier"] == "beyond" and signs >= rules["firstSigns"]
        elif row["band"] == "next":
            assert row["tier"] == "beyond" and signs < rules["firstSigns"]
        else:
            assert row["tier"] == "dry" and row["deep"] and signs >= rules["watchSigns"]


def test_each_sign_is_backed_by_the_number_beside_it(data):
    rules = data["rules"]
    for row in data["mandals"]:
        assert ("storms" in row["signs"]) == (row["stormMm"] is not None and row["stormMm"] < rules["stormDryMm"])
        assert ("monsoon" in row["signs"]) == (row["monsoon"] is not None)
        if "tanks" in row["signs"]:
            assert row["tankNowPct"] <= row["tankUsualPct"] - rules["tankGapPoints"] + 1
        assert ("quality" in row["signs"]) == (row["testedAboveLimitPct"] is not None
                                               and row["testedAboveLimitPct"] >= rules["stateAboveLimitPct"] - 0.05)


def test_the_list_is_ordered_by_band_then_signs_then_people(data):
    order = {"first": 0, "next": 1, "watch": 2}
    keys = [(order[r["band"]], -len(r["signs"]), -(r["people"] or 0)) for r in data["mandals"]]
    assert keys == sorted(keys)


def test_the_summary_adds_up(data):
    for band, tally in data["summary"].items():
        rows = [r for r in data["mandals"] if r["band"] == band]
        assert tally["mandals"] == len(rows)
        assert tally["people"] == sum(r["people"] or 0 for r in rows)
        assert tally["sources"] == sum(r["sources"] or 0 for r in rows)
        for sign, n in tally["signs"].items():
            assert n == sum(1 for r in rows if sign in r["signs"])


def test_rows_link_to_the_mandal_they_name(data):
    records = load("mandal_groundwater_records_v2.json")["records"]
    outlines = load("ap_map_geometry.json")["mandals"]
    for row in data["mandals"]:
        assert row["id"] == records[row["index"]]["identity"]["mandalId"]
        assert row["mandal"] == priority.title(outlines[row["index"]]["m"])


def test_a_rebuild_from_the_committed_inputs_gives_the_same_list(data):
    rebuilt = priority.build(load("summer_outlook.json"), load("drinking_water.json"), load("tank_fill.json"),
                             load("cyclone_arnab.json"), load("monsoon_watch.json"),
                             load("mandal_groundwater_records_v2.json")["records"], load("ap_map_geometry.json")["mandals"])
    assert rebuilt["mandals"] == data["mandals"]
    assert rebuilt["summary"] == data["summary"]


def test_title_case_matches_the_site():
    assert priority.title("Y.S.R KADAPA") == "Y.S.R Kadapa"
    assert priority.title("NTR") == "NTR"
    assert priority.title("SRI POTTI SRIRAMULU NELLORE") == "Sri Potti Sriramulu Nellore"
    assert priority.title("Nandyal") == "Nandyal"
