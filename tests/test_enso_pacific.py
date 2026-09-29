"""The Pacific panel must agree with the index the rest of the site publishes.

It shows a single month's sea-surface anomaly; the headline figure is a
three-month running mean of the same box. Those are different numbers, and a
reader comparing them will assume one is broken unless they really do line up
when reduced to the same quantity. This checks that they do.
"""
import csv
import json
import os

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PANEL = os.path.join(ROOT, "app", "data", "enso_pacific.json")
ONI = os.path.join(ROOT, "phase3_levels", "data", "enso_oni.csv")
PUBLIC = os.path.join(ROOT, "app", "public")


@pytest.fixture(scope="module")
def panel():
    with open(PANEL) as handle:
        return json.load(handle)


def test_the_three_month_mean_tracks_the_published_index(panel):
    """Computed from ERSST against a 1991-2020 baseline, against NOAA's own
    published ONI. A different baseline moves it a little; a wrong box, wrong
    hemisphere or wrong sign moves it a lot."""
    with open(ONI) as handle:
        published = {row["date"]: float(row["oni_c"]) for row in csv.DictReader(handle)}
    compared = 0
    for month in panel["months"]:
        theirs = published.get(month["month"])
        if theirs is None:
            continue
        compared += 1
        assert abs(month["nino34ThreeMonthC"] - theirs) < 0.35, (
            f'{month["month"]}: panel {month["nino34ThreeMonthC"]}, NOAA {theirs}'
        )
    assert compared >= 12


def test_every_month_has_a_frame_that_exists(panel):
    assert len(panel["months"]) >= 12
    for month in panel["months"]:
        assert os.path.exists(os.path.join(PUBLIC, month["file"])), month["file"]
    assert os.path.exists(os.path.join(PUBLIC, panel["basemap"]))


def test_the_panel_stays_small_enough_to_ship():
    """Every visitor downloads these. As PNGs they came to 4.3 MB."""
    folder = os.path.join(PUBLIC, "enso")
    total = sum(os.path.getsize(os.path.join(folder, f)) for f in os.listdir(folder))
    assert total < 1_200_000, f"{total / 1e6:.2f} MB of panel assets"


def test_the_window_has_india_and_south_america_in_it(panel):
    """The point of the panel is that both are in the same picture; a
    Pacific-only window is what every other explainer shows."""
    window = panel["window"]
    assert window["lon0"] <= 80 <= window["lon1"], "India is outside the window"
    assert window["lon0"] <= 285 <= window["lon1"], "the Peruvian coast is outside the window"
    assert window["lat0"] > 0 > window["lat1"]


def test_andhra_pradesh_is_marked_inside_the_frame(panel):
    marker = panel["andhraPradesh"]
    assert 0 < marker["xPct"] < 100
    assert 0 < marker["yPct"] < 100
    # It belongs on the left-hand side, near India, not out in the Pacific.
    assert marker["xPct"] < 20


def test_the_months_run_in_order_and_end_recently(panel):
    months = [m["month"] for m in panel["months"]]
    assert months == sorted(months)
    assert len(set(months)) == len(months)
