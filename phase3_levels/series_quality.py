"""Months the State's groundwater series carried forward rather than measured.

In an ordinary month about one mandal in twenty repeats the previous month's reading to
the centimetre. In much of 2021 nearly all of them did (March, April, June, September to
December): those readings are copies, not measurements, and a change across them is zero
by construction. Every builder that reads the APWRIMS history treats such a month as
missing, so the model neither learns from it nor is scored on it, and no page draws it.

The rule is applied to the whole State, not mandal by mandal: a single mandal holding
steady is plausible, a whole State holding steady to the centimetre is not.
"""
import csv
import os
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
HISTORY = os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")
SHARE = 0.5     # a month where at least this share of mandals repeat last month's value


def _previous(month):
    year, number = int(month[:4]), int(month[5:7])
    return f"{year - 1}-12" if number == 1 else f"{year}-{number - 1:02d}"


def carried_forward_months(rows, share=SHARE):
    """Months in which at least `share` of the series repeat the calendar month before.

    `rows` are history rows with mandal_uuid, date (YYYY-MM) and level_mbgl.
    """
    series = defaultdict(dict)
    for row in rows:
        try:
            series[row["mandal_uuid"]][row["date"]] = float(row["level_mbgl"])
        except (TypeError, ValueError):
            continue
    same, both = defaultdict(int), defaultdict(int)
    for values in series.values():
        for month, value in values.items():
            before = values.get(_previous(month))
            if before is None:
                continue
            both[month] += 1
            same[month] += value == before
    return sorted(month for month in both if same[month] >= share * both[month])


_CACHE = {}


def history_carried_forward(path=HISTORY):
    """The carried-forward months of the history file at `path` (read once per process)."""
    key = (path, os.path.getmtime(path))
    if key not in _CACHE:
        with open(path) as handle:
            _CACHE[key] = carried_forward_months(csv.DictReader(handle))
    return _CACHE[key]
