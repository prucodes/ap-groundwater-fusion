"""Village tanks before and after the cyclones (phase3_levels/build_cyclone_tanks.py)."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = json.load(open(os.path.join(ROOT, "app", "data", "cyclone_tanks.json")))


def test_the_windows_sit_either_side_of_the_storms():
    # Arnab's rain is counted from 25 Oct and Murasu's ended on 6 Nov.
    assert DATA["before"][1] < "2026-10-25" and DATA["after"][0] >= "2026-11-05"


def test_the_state_figure_adds_up_from_its_rows():
    rows = DATA["rows"]
    assert len(rows) == DATA["mandals"]
    assert abs(sum(r[3] * r[1] for r in rows) - DATA["wetHaBefore"]) < len(rows)
    assert abs(sum(r[3] * r[2] for r in rows) - DATA["wetHaAfter"]) < len(rows)
    assert DATA["rose"] == sum(1 for r in rows if r[2] - r[1] > 0.10)


def test_every_picture_is_a_pair_on_disk_from_its_window():
    assert DATA["pictures"]
    for p in DATA["pictures"]:
        for side, (start, end) in (("before", DATA["before"]), ("after", DATA["after"])):
            assert start <= p[side]["date"] <= end
            assert os.path.exists(os.path.join(ROOT, "app", "public", p[side]["file"]))
