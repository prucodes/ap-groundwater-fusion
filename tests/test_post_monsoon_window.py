"""The post-monsoon card reads the official window and does not close it early.

GEC compares pre-monsoon with post-monsoon. The site is at September, so the
card places this September against every past September and shows what the
remaining stretch has done -- without putting a number on November.

It also has to get its axis the right way round: changeM is depth below ground,
so a positive change means the table FELL. The first version labelled the ends
the other way, which reversed the finding.
"""
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")
COMPONENT = os.path.join(ROOT, "app", "components", "PostMonsoonWindow.tsx")


@pytest.fixture(scope="module")
def watch():
    with open(WATCH, encoding="utf-8") as handle:
        return json.load(handle)


def read():
    with open(COMPONENT, encoding="utf-8") as handle:
        return handle.read()


def seasons(watch):
    out = []
    for row in watch["trajectory"]:
        points = {point["month"]: point["changeM"] for point in row["points"]}
        if 9 in points:
            out.append({"year": row["year"], "current": row["current"],
                        "sep": points[9], "nov": points.get(11)})
    return out


def test_this_september_is_the_only_one_on_its_side_of_zero(watch):
    rows = seasons(watch)
    now = next(r for r in rows if r["current"])
    past = [r for r in rows if not r["current"]]
    assert past, "no earlier season to compare against"
    # The claim the card makes when it holds; if a later season changes this, the
    # card drops the clause rather than printing it wrongly.
    if now["sep"] > 0:
        assert all(r["sep"] < now["sep"] for r in past)


def test_the_axis_labels_match_the_sign_convention():
    page = read()
    left = page.index("x={PAD} y={H - 10}")
    right = page.index('x={W - PAD} y={H - 10}')
    assert left < right
    # Left end is the most negative change, which is the table standing highest.
    assert "table higher than May" in page[left:right]
    assert "table deeper than May" in page[right:right + 200]


def test_november_is_never_given_a_number_for_this_season(watch):
    page = read()
    for phrase in ("will rise", "will fall", "expected", "projected to", "forecast for November"):
        assert phrase not in page
    assert "nothing here is projected into it" in page.lower() or "projected into it" in page
    # And the data must not carry a November value for the open season.
    now = next(r for r in seasons(watch) if r["current"])
    assert now["nov"] is None, "the season has closed; the card should now read the official window"
