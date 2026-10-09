"""The tanks going into rabi: masks in place, shares that are shares, and a usual built from past years."""
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "phase3_levels", "data")
FILL = json.load(open(os.path.join(ROOT, "app", "data", "tank_fill.json")))
YEARS = json.load(open(os.path.join(DATA, "tank_fill_years.json")))
BOUNDARIES = json.load(open(os.path.join(ROOT, "app", "data", "ap_map_display.json")))["mandals"]


def test_every_sentinel_tile_has_a_tank_mask_on_the_mandal_outlines():
    tiles = json.load(open(os.path.join(DATA, "sentinel_masks", "tiles.json")))
    for name in tiles:
        mask = np.load(os.path.join(DATA, "tank_masks", f"tank_{name}.npz"))
        assert len(mask["index"]) == len(mask["fraction"]) == len(mask["mandal"])
        if len(mask["mandal"]):
            assert 0 <= int(mask["mandal"].min()) and int(mask["mandal"].max()) < len(BOUNDARIES)
            assert 0 < float(mask["fraction"].min()) and float(mask["fraction"].max()) <= 1.001


def test_past_years_cover_every_mandal_and_hold_shares():
    for year, table in YEARS.items():
        assert len(table["wet"]) == len(table["seen"]) == len(BOUNDARIES), year
        for wet, seen in zip(table["wet"], table["seen"]):
            assert wet is None or 0 <= wet <= 1
            assert seen is None or 0 <= seen <= 1.001


def test_the_published_fill_adds_up():
    assert len(FILL["mandals"]) == len(BOUNDARIES)
    scored = [m for m in FILL["mandals"] if m and m["now"] is not None and m["usual"] is not None]
    assert len(scored) == FILL["scoredMandals"]
    assert FILL["emptier"] + FILL["fuller"] <= FILL["scoredMandals"]
    for m in FILL["mandals"]:
        if m:
            assert m["tankHa"] >= 20
            assert m["usual"] is None or m["years"] >= 3
    years = [row["year"] for row in FILL["byYear"]]
    assert years == list(range(years[0], years[-1] + 1)), "a year is missing from the record"
    assert FILL["usualYears"] == [years[0], years[-1] - 1]
