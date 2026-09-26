"""Guards for the nowcast hardening: locations, screening, blend, conformal band."""
import csv
import json
import os
import sys

import numpy as np
import pandas as pd
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

engine = pytest.importorskip("build_levels_engine")

HISTORY = os.path.join(ROOT, "phase3_levels", "apwrims", "apwrims_gw_history.csv")
GEOMETRY = os.path.join(ROOT, "app", "data", "ap_map_geometry.json")
ALIASES = os.path.join(ROOT, "phase3_levels", "data", "mandal_boundary_aliases.csv")


def test_alias_table_is_unique_and_points_at_real_boundaries():
    geo = json.load(open(GEOMETRY))
    with open(ALIASES) as handle:
        rows = list(csv.DictReader(handle))
    assert rows, "the alias table should not be empty"
    ids = [row["mandal_uuid"] for row in rows]
    assert len(ids) == len(set(ids)), "one alias per source series"
    for row in rows:
        index = int(row["boundary_index"])
        assert 0 <= index < len(geo["mandals"])
        assert geo["mandals"][index]["m"].upper() == row["boundary_mandal"].upper()


def test_every_source_series_gets_a_location():
    """No mandal may be dropped for want of a polygon; 56 of 688 once were."""
    levels = pd.read_csv(HISTORY)
    geo = json.load(open(GEOMETRY))
    locations, basis, _ = engine.resolve_locations(levels, geo)
    assert set(levels.mandal_uuid) <= set(locations)
    assert set(basis.values()) <= {"boundary_exact", "boundary_alias", "district_centroid"}
    # The fallback is a fallback: most mandals still resolve to their own polygon.
    exact = sum(1 for value in basis.values() if value == "boundary_exact")
    assert exact > 0.8 * len(basis)


def test_screening_drops_a_spike_and_keeps_ordinary_months():
    steady = [10.0, 10.2, 10.1, 10.3, 10.2, 10.4, 10.3, 10.5]
    levels = steady + [90.0]
    frame = pd.DataFrame({
        "mkey": ["a"] * len(levels),
        "date": [f"2020-{index + 1:02d}" for index in range(len(levels))],
        "level_mbgl": levels,
    })
    frame["lag1"] = frame.level_mbgl.shift(1)
    kept = engine.screen_training_rows(frame)
    assert 90.0 not in set(kept.level_mbgl), "a 80 m single-month jump is not a water table"
    assert len(kept) == len(frame) - 1


def test_depth_bands_cover_the_range_in_order():
    index = engine.depth_band_index([1.0, 7.0, 15.0, 25.0, 120.0])
    assert list(index) == [0, 1, 2, 3, 4]
    assert engine.band_label(0) == "0-5m"
    assert engine.band_label(len(engine.BLEND_EDGES) - 2).endswith("m+")


def test_blend_never_loses_to_carrying_the_last_reading_forward():
    rng = np.random.default_rng(0)
    anchor = rng.uniform(25.0, 40.0, 400)          # deep mandals
    actual = anchor + rng.normal(0, 3.0, 400)
    point = anchor + rng.normal(0, 9.0, 400)       # a model that is worse than doing nothing
    weights = engine.blend_weights(actual, anchor, point)
    _, blended, _ = engine.apply_blend(weights, anchor, point - 1, point, point + 1)
    assert np.mean(np.abs(actual - blended)) <= np.mean(np.abs(actual - anchor)) + 1e-9
    assert np.mean(np.abs(actual - blended)) < np.mean(np.abs(actual - point))


def test_conformal_offsets_reach_nominal_coverage_on_their_own_data():
    rng = np.random.default_rng(1)
    actual = rng.normal(10.0, 4.0, 900)
    lower, upper = actual - rng.uniform(0.2, 0.6, 900), actual + rng.uniform(0.2, 0.6, 900)
    miss = rng.random(900) < 0.45                  # a badly under-covering band
    lower[miss] = actual[miss] + 0.5
    upper[miss] = actual[miss] + 1.5
    cohorts = np.array(["hard_rock"] * 450 + ["coastal"] * 450)
    offsets = engine.conformal_offsets(actual, lower, upper, cohorts)
    wide_lower, wide_upper = engine.apply_conformal(offsets, lower, upper, cohorts)
    covered = np.mean((actual >= wide_lower) & (actual <= wide_upper))
    assert covered >= engine.NOMINAL_COVERAGE


def test_the_engine_models_the_change_not_the_level():
    """A level target cannot reach past its training range; the change can."""
    assert "lag1" in engine.NUM
    source = open(os.path.join(ROOT, "phase3_levels", "build_levels_engine.py")).read()
    assert "level_mbgl - train.lag1" in source
