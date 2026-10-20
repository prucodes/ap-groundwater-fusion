"""The hover hydrograph exists to keep a 6.3 MB series out of the map's bundle,
so the guards here are mostly about that bargain holding.
"""
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAYLOAD = os.path.join(ROOT, "app", "public", "geo", "mandal-hydrographs.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_mandal_hydrographs.py")
MAP = os.path.join(ROOT, "app", "components", "MandalStatusMap.tsx")
HOVER = os.path.join(ROOT, "app", "components", "HoverHydrograph.tsx")
FULL = os.path.join(ROOT, "app", "components", "Hydrograph.tsx")
RUNNER = os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")


def load():
    with open(PAYLOAD, encoding="utf-8") as handle:
        return json.load(handle)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_the_payload_stays_small_enough_to_fetch_on_hover():
    """The whole point is not shipping mandal_observation_series_v2.json, which is
    over six megabytes. If this grows past a few hundred KB the bargain is gone."""
    assert os.path.getsize(PAYLOAD) < 400 * 1024, os.path.getsize(PAYLOAD)


def test_the_map_does_not_import_the_full_series():
    """lib/data.ts imports the 6.3 MB series at module scope, so a call to
    depthSeriesFor from the map would pull it into that page's bundle.

    Scoped to calls and imports rather than any mention of the names, because both
    files explain in prose which file they are deliberately not reading, and a
    guard that matches its own disclaimer has failed here three times before.
    """
    for path in (MAP, HOVER):
        body = read(path)
        assert "depthSeriesFor(" not in body, path
        assert "from \"../data/mandal_observation_series" not in body, path
        assert "observationSeries" not in body, path


def test_the_hover_chart_is_not_the_panel_chart():
    """Hydrograph.tsx draws the full instrument from the in-bundle series for the
    mandal panel. Overwriting it with the hover version broke two other pages once."""
    assert "export function Hydrograph(" in read(FULL)
    assert "export function HoverHydrograph(" in read(HOVER)
    assert "HoverHydrograph" in read(MAP)


def test_one_byte_a_month_and_the_grid_is_the_size_it_claims():
    data = load()
    cells = base64.b64decode(data["cells"])
    assert len(cells) == len(data["months"]) * data["mandals"]
    assert len(data["minM"]) == data["mandals"]
    assert len(data["rangeM"]) == data["mandals"]


def test_every_scaled_mandal_decodes_to_a_sane_depth():
    data = load()
    cells = base64.b64decode(data["cells"])
    checked = 0
    for index, (low, width) in enumerate(zip(data["minM"], data["rangeM"])):
        if low is None or width is None:
            continue
        checked += 1
        for month in range(len(data["months"])):
            byte = cells[month * data["mandals"] + index]
            if byte == data["noData"]:
                continue
            depth = low + byte / data["levels"] * width
            assert -5 <= depth <= 120, (index, month, depth)
    assert checked > 500, checked


def test_a_mandal_with_no_reading_is_left_empty_rather_than_at_zero():
    """A zero byte is a real depth at the shallow end of a mandal's range, so the
    gap needs its own value or an unread month would plot as the shallowest."""
    data = load()
    assert data["noData"] not in range(0, data["levels"] + 1)
    assert "gap in the record reads as a gap" in read(HOVER)


def test_it_says_what_it_is_not():
    data = load()
    assert "not a single well" in data["caveat"] or "not an official" in data["caveat"]


def test_the_weekly_refresh_builds_and_commits_it():
    assert "build_mandal_hydrographs.py" in read(RUNNER)
    assert "app/public/geo/mandal-hydrographs.json" in read(WORKFLOW)
