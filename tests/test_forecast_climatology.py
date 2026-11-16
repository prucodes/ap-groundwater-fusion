"""The forecast's climatology inputs (train_multihorizon.add_climatology) use earlier years only."""
import os
import sys

import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))
import train_multihorizon as tm  # noqa: E402


def frame():
    # One mandal, origins every November: the change to February is 1, 2, 3 and then 10 m.
    rows = [{"mkey": "m", "date": f"{y}-11", "cur": 5.0, "target": 5.0 + d} for y, d in zip(range(2020, 2024), (1, 2, 3, 10))]
    rows += [{"mkey": "m", "date": f"{y}-05", "cur": 9.0, "target": 9.0 - 4} for y in range(2020, 2024)]
    return pd.DataFrame(rows)


def test_each_origin_sees_only_the_years_before_it():
    out = tm.add_climatology(frame()).set_index("date")
    assert pd.isna(out.loc["2020-11", "clim_change"])           # no earlier November
    assert out.loc["2021-11", "clim_change"] == 1.0
    assert out.loc["2023-11", "clim_change"] == 2.0               # median of 1, 2, 3: not 10, its own year
    assert out.loc["2023-11", "clim_max"] == 3.0
    assert out.loc["2023-05", "clim_change"] == -4.0              # a May origin keeps to Mays


def test_a_live_forecast_row_sees_every_known_year():
    known = frame()
    latest = pd.DataFrame([{"mkey": "m", "date": "2024-11"}])
    row = tm.climatology_at_origin(known, latest).iloc[0]
    assert row.clim_change == 2.5 and row.clim_max == 10.0
    assert {"clim_change", "clim_max"} <= set(tm.NUM)
