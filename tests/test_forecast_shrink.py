"""Monsoon-season forecasts lean back toward today's level; dry-season ones are left as they are."""
import importlib.util
import json
import os

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHRINK = json.load(open(os.path.join(ROOT, "phase3_levels", "outputs", "forecast_shrink.json")))


def builder():
    import sys
    sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
    spec = importlib.util.spec_from_file_location("build_forecast", os.path.join(ROOT, "phase3_levels", "build_forecast.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_only_monsoon_targets_lean_back_and_the_band_moves_with_them():
    b = builder()
    shrink = {"weight": 0.65, "monsoonMonths": [7, 8, 9, 10, 11]}
    point, lower, upper = np.array([4.0, 4.0]), np.array([3.0, 3.0]), np.array([6.0, 6.0])
    lo, pt, up, hit = b.apply_shrink(shrink, ["2027-08", "2027-02"], np.array([6.0, 6.0]), lower, point, upper)
    assert hit.tolist() == [True, False]
    assert pt.tolist() == [0.65 * 4 + 0.35 * 6, 4.0], "an August target moves 35% of the way back to the origin's 6 m"
    assert (up - lo).tolist() == [3.0, 3.0] and lo[1] == 3.0


def test_no_learned_weight_leaves_the_forecast_alone(tmp_path):
    b = builder()
    assert b.load_shrink(str(tmp_path / "missing.json")) is None
    point = np.array([5.0])
    _, pt, _, hit = b.apply_shrink(None, ["2027-08"], np.array([9.0]), point - 1, point, point + 1)
    assert pt.tolist() == [5.0] and not hit.any()


def test_the_learned_weight_helped_dry_monsoons_out_of_sample_and_held_steady():
    assert 0 < SHRINK["weight"] < 1 and SHRINK["monsoonMonths"] == [7, 8, 9, 10, 11]
    dry = SHRINK["outOfSample"]["monsoonDry"]
    assert dry["correctedMaeM"] < dry["releasedMaeM"], "the reason it exists: dry monsoons"
    recent = SHRINK["outOfSample"]["since2024"]
    assert recent["correctedMaeM"] <= recent["releasedMaeM"] * 1.02, "and it may not cost the recent record more than 2%"
    assert recent["correctedMaeM"] < recent["noChangeMaeM"] * 0.95, "the release gate still holds"
    late = [c["weight"] for c in SHRINK["weightByCut"] if c["cut"] >= "2024-01"]
    assert max(late) - min(late) <= 0.15, "a weight that swings from retrain to retrain is not one to publish"
