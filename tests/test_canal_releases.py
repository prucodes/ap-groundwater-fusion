"""Canal water this season: weekly headworks releases, added up honestly."""
import datetime
import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILDER = os.path.join(ROOT, "phase3_levels", "build_canal_releases.py")
OUT = os.path.join(ROOT, "app", "data", "canal_releases.json")


def builder():
    spec = importlib.util.spec_from_file_location("canal_builder", BUILDER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_out_of_state_and_non_release_rows_are_left_out():
    b = builder()
    assert not b.in_scope({"district": "Vijayanagara(KS)", "outlet": "Main Canal"})
    assert not b.in_scope({"district": "Palnadu", "outlet": "Inflow"})
    assert b.in_scope({"district": "Palnadu", "outlet": "RMC"})


def test_a_steady_flow_adds_up_to_flow_times_days():
    b = builder()
    rows = [{"date": d, "reservoir": "R", "outlet": "C", "basin": "B", "district": "D", "cusecs": "1000"}
            for d in ("2026-06-01", "2026-06-08", "2026-06-15")]
    vol, days = b.volumes(rows, {"2026-06-01", "2026-06-08", "2026-06-15"},
                          datetime.date(2026, 6, 1), datetime.date(2026, 6, 15))
    assert len(days) == 3
    assert abs(vol[("R", "C", "B", "D")] - 1000 * 14 * 2446.58 / 1e6) < 1e-6


def test_no_state_total_is_published_and_the_deltas_lead():
    data = json.load(open(OUT))
    assert "state" not in data
    assert [d["system"] for d in data["deltas"]] == ["Godavari delta", "Krishna delta"]
    assert "not added into one State figure" in data["caveat"]
    assert "not where it reaches a field" in data["caveat"]
