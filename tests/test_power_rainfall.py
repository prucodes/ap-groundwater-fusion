"""The level model's rainfall input refreshes unattended, so the rules that decide
what it writes are pinned here: complete months only, one conversion for both
POWER products, a merge that never drops history, and verified TLS."""
import datetime
import importlib.util
import ssl
import sys
import urllib.error
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "phase3_levels" / "fetch_nasa_power_rainfall.py"
_spec = importlib.util.spec_from_file_location("fetch_nasa_power_rainfall", MODULE_PATH)
power = importlib.util.module_from_spec(_spec)
sys.modules["fetch_nasa_power_rainfall"] = power
_spec.loader.exec_module(power)


def _payload(values):
    return {"properties": {"parameter": {"PRECTOTCORR": values}}}


def test_monthly_skips_fills_and_the_annual_rollup():
    series = power.monthly_series(_payload({"202607": 6.17, "202608": -999.0, "202613": 2.0}))
    assert series == {"2026-07": round(6.17 * 30.44, 1)}


def test_uses_only_the_final_monthly_product():
    # The near-real-time daily product was rejected on evidence (see the module
    # docstring). Reintroducing it should be a deliberate decision, not a drift.
    source = MODULE_PATH.read_text()
    assert "temporal/daily" not in source
    assert "temporal/monthly" in source


def test_probe_reports_the_newest_finalised_month(monkeypatch):
    served = {"2025-12": 5.0, "2026-06": 90.0, "2026-07": 100.0}
    monkeypatch.setattr(power, "fetch_point", lambda lat, lon, first, last: dict(served))
    points = [("D", "A", 0.0, 0.0)]
    assert power.probe_latest_month(points, datetime.date(2026, 9, 19)) == "2026-07"


def test_a_failed_probe_is_not_mistaken_for_nothing_new(monkeypatch):
    def unreachable(*_args):
        raise ConnectionResetError("reset")
    monkeypatch.setattr(power, "fetch_point", unreachable)
    assert power.probe_latest_month([("D", "A", 0.0, 0.0)], datetime.date(2026, 9, 19)) is None


def test_last_complete_month_never_includes_the_current_one():
    assert power.last_complete_month(datetime.date(2026, 9, 19)) == "2026-08"
    assert power.last_complete_month(datetime.date(2027, 1, 3)) == "2026-12"


def test_merge_keeps_history_before_the_window_and_refreshes_inside_it():
    history = {("D", "A"): {"2024-12": 10.0, "2025-06": 50.0}}
    fresh = {("D", "A"): {"2025-06": 55.0, "2026-08": 80.0}}
    merged = power.merge(history, fresh, "2025-01")
    assert merged[("D", "A")] == {"2024-12": 10.0, "2025-06": 55.0, "2026-08": 80.0}


def test_a_failed_mandal_keeps_its_whole_history():
    history = {("D", "A"): {"2024-12": 10.0, "2025-06": 50.0}}
    merged = power.merge(history, {}, "2025-01")
    assert merged[("D", "A")] == history[("D", "A")]


def test_fetches_only_the_mandals_missing_the_latest_month():
    points = [("D", str(i), 0.0, 0.0) for i in range(10)]
    history = {("D", str(i)): {"2026-08": 1.0} for i in range(9)}
    assert power.stale_points(history, points, "2026-08") == [points[9]]
    assert power.stale_points(history, points, "2026-09") == points      # a new month: all
    assert power.stale_points({**history, ("D", "9"): {"2026-08": 1.0}}, points, "2026-08") == []


def test_a_rate_limit_waits_as_long_as_the_server_asks():
    limited = urllib.error.HTTPError("u", 429, "Too Many Requests", {"Retry-After": "12"}, None)
    assert power.retry_wait(limited, 1) == 12
    silent = urllib.error.HTTPError("u", 429, "Too Many Requests", {}, None)
    assert power.retry_wait(silent, 2) == power.RATE_LIMIT_WAIT * 2
    assert power.retry_wait(ConnectionResetError(), 3) == 8


def test_never_retries_a_tls_failure():
    assert not power.is_transient(urllib.error.URLError(ssl.SSLCertVerificationError("bad cert")))
    assert not power.is_transient(urllib.error.HTTPError("u", 404, "Not Found", {}, None))
    assert power.is_transient(urllib.error.HTTPError("u", 429, "Too Many Requests", {}, None))
