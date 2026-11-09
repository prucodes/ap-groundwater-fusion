"""The monthly CHIRPS fetch must never publish an older month as the latest.

On 7 Nov 2026 the server answered HTTP 429 (rate limited) for September back to
June. The fetch read every error as "not published yet", walked back to May and
republished it, so the Climate page showed May rainfall in November. A 404 means
the month is not out; a 429, a 5xx or a timeout means nothing about the month.
"""
import io
import os
import sys
import urllib.error

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))

import fetch_chirps_rainfall as fetch  # noqa: E402

URL = "https://example.org/chirps-v3.0.2026.10.tif"


def http_error(code):
    return urllib.error.HTTPError("https://example.org/x.tif", code, "x", {}, io.BytesIO())


def test_a_rate_limit_is_waited_out_not_read_as_a_missing_month():
    calls, waits = [], []

    def once(url, context):
        calls.append(url)
        if len(calls) < 3:
            raise fetch.Unreachable("HTTP 429")
        return b"tif"

    assert fetch.try_download("u", None, once, waits.append) == b"tif"
    assert waits == list(fetch.RETRY_WAITS_S[:2])


def test_a_month_the_server_does_not_have_is_skipped_at_once():
    waits = []
    assert fetch.try_download("u", None, lambda url, context: None, waits.append) is None
    assert waits == []


def test_fetch_once_tells_missing_from_unreachable(monkeypatch):
    def raises(error):
        def opener(*args, **kwargs):
            raise error
        return opener

    monkeypatch.setattr(fetch, "urlopen", raises(http_error(404)))
    assert fetch.fetch_once(URL, None) is None
    for error in (http_error(429), http_error(503), urllib.error.URLError("timed out"), TimeoutError()):
        monkeypatch.setattr(fetch, "urlopen", raises(error))
        with pytest.raises(fetch.Unreachable):
            fetch.fetch_once(URL, None)


def run(monkeypatch, tmp_path, answers, published="2026.09"):
    """main() over a fake server: answers maps 'YYYY.MM' to bytes, None (404) or 'down'."""
    tried = []

    def download(url, context):
        period = url.rsplit("chirps-v3.0.", 1)[1][:7]
        tried.append(period)
        answer = answers.get(period)
        if answer == "down":
            raise fetch.Unreachable("HTTP 429")
        return answer

    monkeypatch.setattr(fetch, "try_download", download)
    monkeypatch.setattr(fetch, "published_period", lambda: published)
    monkeypatch.setattr(fetch, "append_source_manifest", lambda *a: None)
    monkeypatch.setattr(fetch, "candidate_months", lambda n: [(2026, m) for m in range(11, 3, -1)])
    monkeypatch.setattr(sys, "argv", ["fetch", "--output-dir", str(tmp_path)])
    monkeypatch.setattr(fetch, "REPO_ROOT", tmp_path)
    assert fetch.main() == 0
    return tried, (tmp_path / fetch.TARGET_TIF).exists()


def test_a_server_that_will_not_answer_leaves_the_published_month_alone(monkeypatch, tmp_path):
    tried, wrote = run(monkeypatch, tmp_path, {"2026.11": None, "2026.10": "down", "2026.05": b"old"})
    assert tried == ["2026.11", "2026.10"] and not wrote


def test_it_never_walks_back_past_the_month_already_published(monkeypatch, tmp_path):
    tried, wrote = run(monkeypatch, tmp_path, {"2026.05": b"old"})
    assert tried == ["2026.11", "2026.10", "2026.09"] and not wrote


def test_a_newer_month_is_taken(monkeypatch, tmp_path):
    tried, wrote = run(monkeypatch, tmp_path, {"2026.11": None, "2026.10": b"new"})
    assert tried == ["2026.11", "2026.10"] and wrote
