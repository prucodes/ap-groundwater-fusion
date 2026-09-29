"""The 60-second script has to stay speakable and stay sourced.

A shooting script is where an unsourced figure slips into a public video, and
where a line quietly grows past what a narrator can say in its window. Both are
cheap to check and expensive to find in an edit.
"""
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT = os.path.join(ROOT, "docs", "el_nino_60s_script.md")
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")

# A narrator reading a government-facing script sits in this band. The reference
# reel runs near the top of it; below it the video will not fit 60 seconds.
MIN_WPM = 140
MAX_WPM = 180
TOTAL_SECONDS = 60


def rows():
    text = open(SCRIPT).read()
    out = []
    for line in text.split("\n"):
        if not re.match(r"\|\s*\d+\s*\|\s*\d:\d\d", line):
            continue
        cells = [c.strip() for c in line.split("|")[1:-1]]
        start, end = cells[1].split("\u2013")
        to_s = lambda t: int(t.split(":")[0]) * 60 + int(t.split(":")[1])
        out.append({"n": int(cells[0]), "start": to_s(start), "end": to_s(end),
                    "vo": cells[2], "onscreen": cells[3], "visual": cells[4]})
    return out


def test_every_line_is_speakable_in_its_window():
    for row in rows():
        seconds = row["end"] - row["start"]
        assert seconds > 0
        wpm = len(row["vo"].split()) / seconds * 60
        assert MIN_WPM <= wpm <= MAX_WPM, f"line {row['n']} runs at {wpm:.0f} wpm in {seconds}s"


def test_the_windows_are_contiguous_and_fill_the_minute():
    parts = rows()
    assert parts
    assert parts[0]["start"] == 0
    assert parts[-1]["end"] == TOTAL_SECONDS
    for before, after in zip(parts, parts[1:]):
        assert before["end"] == after["start"], "a gap or overlap between lines"


def test_it_reaches_andhra_pradesh_and_does_not_open_there():
    """The whole point: explain the thing first, then land it. A script that
    mentions the state in its first line is not the one that was asked for."""
    parts = rows()
    text = " ".join(p["vo"] for p in parts)
    assert "Andhra Pradesh" in text
    first_half = " ".join(p["vo"] for p in parts if p["end"] <= TOTAL_SECONDS // 2)
    assert "Andhra" not in first_half


def test_no_forecast_is_promised():
    """The site publishes none, and the model measured worse when the index was
    added to it. A video promising what happens next contradicts the page."""
    text = open(SCRIPT).read().lower()
    narration = " ".join(r["vo"].lower() for r in rows())
    for word in ("will fall", "will be", "expect", "forecast", "predict"):
        assert word not in narration, f"the narration promises something: {word!r}"
    assert "do not put a forecast in this video" in text


def test_the_on_screen_figures_are_the_ones_the_site_publishes():
    """A narrator may say "sixty-three percent". A card on screen may not: it is
    a written record, and it must read what the page reads."""
    import json

    with open(WATCH) as handle:
        watch = json.load(handle)
    cards = " ".join(r["onscreen"] for r in rows()).replace("\u2212", "-")
    assert f'{watch["enso"]["oniC"]:+.2f}' in cards
    assert f'{watch["recharge"]["fallingPct"]}%' in cards
    assert f'{abs(watch["rainfall"]["anomalyPct"])}%' in cards
    assert f'{abs(watch["elNinoRainfall"]["swMonsoon"]["elNinoAnomalyPct"])}%' in cards
    volume = watch["recharge"]["volume"]
    assert f'{round(volume["shortfallMm3"]):,}' in cards


def test_every_claim_has_a_source_row():
    text = open(SCRIPT).read()
    assert "## Sources, line by line" in text
    sourced = {int(m) for m in re.findall(r"^\|\s*(\d+)\s*\|", text.split("## Sources")[1], re.M)}
    for row in rows():
        assert row["n"] in sourced, f"line {row['n']} has no source row"


def test_the_famine_figure_is_the_sourced_one_not_the_reel_s():
    """The reference reel uses "3 percent of the world's population", a
    contested global total. The India estimate is far better established."""
    text = open(SCRIPT).read()
    narration = " ".join(r["vo"] for r in rows())
    assert "eight million" in narration
    assert "3 percent" not in narration and "3% of the world" not in narration
    assert "5.6" in text and "9.6" in text, "the estimate's range must be recorded"
