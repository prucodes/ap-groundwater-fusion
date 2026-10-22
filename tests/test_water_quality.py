"""Unsafe drinking water by mandal, from the State's own list of affected habitations."""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "phase3_levels", "data")
OUT = os.path.join(ROOT, "app", "data", "water_quality.json")


def load():
    return json.load(open(OUT))


def test_every_block_reaches_a_mandal_and_the_totals_hold():
    data = load()
    rows = list(csv.DictReader(open(os.path.join(DATA, "jjm_quality_affected_habitations.csv"))))
    meta = json.load(open(os.path.join(DATA, "jjm_quality_affected_habitations.meta.json")))
    assert data["unmatched"] == [] and data["matched"] == len(rows)
    assert data["totals"]["habitations"] == meta["stateTotals"]["habitations"]
    assert data["totals"]["fluoride"] == meta["stateTotals"]["fluoride"]
    assert sum(v[6] for v in data["mandals"].values()) == data["totals"]["habitations"]


def test_every_alias_says_why():
    for row in csv.DictReader(open(os.path.join(DATA, "jjm_wq_block_aliases.csv"))):
        assert row["reason"].strip(), row


def test_it_does_not_overclaim():
    data = load()
    assert "says nothing about why" in data["caveat"]
    assert "fewer tests" in data["caveat"]
    assert data["since"] == "2019-04-01"
