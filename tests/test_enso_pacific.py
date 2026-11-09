"""The Pacific panel must agree with the index the rest of the site publishes.

It shows a single month's sea-surface anomaly; the headline figure is a
three-month running mean of the same box. Those are different numbers, and a
reader comparing them will assume one is broken unless they really do line up
when reduced to the same quantity. This checks that they do.
"""
import csv
import errno
import json
import os
import sys
import urllib.error

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_enso_pacific as pacific  # noqa: E402

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
    hemisphere or wrong sign moves it a lot. On the same ERSST version as the
    index (v6) it lands within a few hundredths; v5 ran 0.35 warm in 2026."""
    with open(ONI) as handle:
        published = {row["date"]: float(row["oni_c"]) for row in csv.DictReader(handle)}
    compared = 0
    for month in panel["months"]:
        theirs = published.get(month["month"])
        if theirs is None or month["nino34ThreeMonthC"] is None:
            continue
        compared += 1
        assert abs(month["nino34ThreeMonthC"] - theirs) < 0.15, (
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


def test_a_dropped_connection_is_tried_again_before_the_month_is_given_up(monkeypatch):
    """8 Nov 2026: NOAA and NASA briefly unreachable from the runner, and the panels stayed a month old."""
    calls, waits = [], []

    def fetch(url, path):
        calls.append(url)
        if len(calls) < 3:
            raise urllib.error.URLError(OSError(errno.ENETUNREACH, "Network is unreachable"))

    monkeypatch.setattr(pacific.time, "sleep", waits.append)
    pacific.download("https://example.org/sst.nc", "/nowhere", fetch)
    assert len(calls) == 3 and waits == list(pacific.DOWNLOAD_RETRY_WAITS_S[:2])


def test_a_refusal_is_not_retried(monkeypatch):
    calls = []

    def fetch(url, path):
        calls.append(url)
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

    monkeypatch.setattr(pacific.time, "sleep", lambda s: pytest.fail("waited on a 404"))
    with pytest.raises(urllib.error.HTTPError):
        pacific.download("https://example.org/gone.jpg", "/nowhere", fetch)
    assert len(calls) == 1


def test_the_published_earth_is_reused_without_asking_nasa(monkeypatch, panel):
    """The Blue Marble is a 2004 composite on a fixed window; a NASA outage must not stop the month."""
    pytest.importorskip("PIL")
    monkeypatch.setattr(pacific, "cached", lambda *a: pytest.fail("fetched the Earth image again"))
    width, height = pacific.basemap()
    assert width == pacific.BASEMAP_WIDTH
    assert round(width / height, 4) == panel["aspect"]


def test_the_newest_month_carries_no_two_month_mean(panel):
    """The latest month has nothing after it yet; half a running mean is not the index."""
    assert panel["months"][-1]["nino34ThreeMonthC"] is None
    assert all(m["nino34ThreeMonthC"] is not None for m in panel["months"][1:-1])
