"""A salinity unit has no stage of extraction, and must not be given one.

INGRES assesses a salinity-affected unit for category only; where a share of
the extractable resource would go, it returns a sentinel (-100000). Passed
through, it reached 39 mandal pages as "-100000% of the extractable
groundwater drawn". The fetcher now drops any negative share, and both readers
drop it again, because the published file keeps the sentinel until the next
refresh rewrites it.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FETCH = os.path.join(ROOT, "phase3_levels", "fetch_field_signals.py")
SERVER = os.path.join(ROOT, "app", "lib", "fieldSignalsServer.ts")
CLIENT = os.path.join(ROOT, "app", "lib", "fieldSignals.ts")
PAGE = os.path.join(ROOT, "app", "components", "MandalSeasonContext.tsx")


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_the_fetcher_publishes_no_negative_share():
    source = read(FETCH)
    assert "def stage_of_extraction(" in source
    assert '"stage": stage_of_extraction(row)' in source
    assert re.search(r"return None if value is not None and value < 0 else value", source)


def test_both_readers_drop_it_again():
    # The published file carries the sentinel until a refresh rewrites it, so the
    # fetcher's fix alone would leave the live pages wrong for a week.
    server = read(SERVER)
    assert "value < 0 ? null : value" in server
    assert "stagePct: stage(row.stage)" in server
    assert "stagePct: stage(row.prev.stage)" in server
    client = read(CLIENT)
    assert "row[3] < 0 ? null : row[3]" in client


def test_the_page_says_why_rather_than_printing_a_question_mark():
    page = read(PAGE)
    assert "no stage of extraction is assessed for a salinity unit" in page
    # The old fallback printed "?%", which reads as a missing figure rather than
    # a unit the method does not assess.
    assert '?.toFixed(0) ?? "?"' not in page
