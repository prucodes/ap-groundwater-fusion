"""Drinking water beside the summer outlook: counts only, every block placed once."""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
DATA = json.load(open(os.path.join(APP, "drinking_water.json")))
SUMMER = json.load(open(os.path.join(APP, "summer_outlook.json")))
BOUNDARIES = json.load(open(os.path.join(APP, "ap_map_display.json")))["mandals"]
ALIASES = os.path.join(ROOT, "phase3_levels", "data", "jjm_block_aliases.csv")


def test_every_block_is_placed_on_one_mandal_outline():
    matching = DATA["matching"]
    assert matching["matched"] == matching["blocks"] and not matching["unmatched"]
    assert matching["exactName"] + matching["reviewed"] == matching["matched"]
    placed = [i for i, m in enumerate(DATA["mandals"]) if m]
    assert len(placed) == matching["matched"]
    assert len(DATA["mandals"]) == len(BOUNDARIES)


def test_the_alias_table_still_points_at_the_outlines_it_was_reviewed_against():
    seen = set()
    for row in csv.DictReader(open(ALIASES)):
        index = int(row["boundary_index"])
        assert BOUNDARIES[index]["m"] == row["our_name"], f"{row['jjm_block']}: outline {index} is now {BOUNDARIES[index]['m']}"
        assert index not in seen, f"outline {index} is aliased twice"
        seen.add(index)


def test_tier_tallies_follow_the_summer_outlook():
    for tier, tally in DATA["byTier"].items():
        indexes = [i for i, m in enumerate(SUMMER["mandals"]) if m and m.get("tier") == tier]
        assert tally["mandals"] == len(indexes)
        assert tally["sources"] == sum(DATA["mandals"][i]["sources"] for i in indexes if DATA["mandals"][i])
        assert 0 <= tally["chemical"] <= tally["tested"]


def test_shares_are_shares_and_only_counts_are_published():
    state = DATA["state"]
    assert 0.5 < state["groundwaterShare"] <= 1 and 0.5 < state["pipedGroundwaterShare"] <= 1
    for row in DATA["mandals"]:
        if row:
            assert set(row) == {"former", "sources", "tested", "chemical", "bacterial"}
