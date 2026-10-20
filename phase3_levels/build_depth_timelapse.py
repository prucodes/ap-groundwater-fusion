#!/usr/bin/env python3
"""A decade of the water table, as one byte per mandal per month.

The site shows where the water table is now. This is where it has been since
2014, so a reader can see whether a season is unusual rather than being told.

Every mandal is drawn against *its own* median for that calendar month, the
same rule the rest of the platform uses: depth swings with the season and with
the aquifer, so a statewide colour scale would show only that hard rock is deep
and the delta is shallow, in every frame, forever. The anomaly moves; the depth
does not.

The payload is a byte per mandal-month -- 670 x 141 is under 95 KB before
compression -- laid out month-major so one frame is one contiguous slice.
"""
import base64
import json
import os
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(ROOT, "app", "public", "geo", "depth-timelapse.json")

# A quarter of this is the smallest move worth a shade; +-15.9 m covers every
# mandal in the record with room to spare.
STEP_M = 0.125
ZERO = 128
NO_DATA = 0
# A calendar month needs this many years before it has a median worth comparing to.
MIN_YEARS = 4


def load(name):
    with open(os.path.join(APP, name), encoding="utf-8") as handle:
        return json.load(handle)


def boundary_of():
    """mandalId -> boundary index, through the names the outlines carry."""
    geo = load("ap_map_geometry.json")
    index = {}
    for position, feature in enumerate(geo["mandals"]):
        index.setdefault(f"{feature['d']}|{feature['m']}".upper(), position)
    records = load("mandal_groundwater_records_v2.json")
    rows = records if isinstance(records, list) else next(v for v in records.values() if isinstance(v, list))
    out = {}
    for row in rows:
        identity = row["identity"]
        key = f"{identity['districtName']}|{identity['mandalName']}".upper().replace("_", " ")
        if key in index:
            out[identity["mandalId"]] = index[key]
    return out, len(geo["mandals"])


# ENSO states, by the threshold the Climate Prediction Center uses on Nino 3.4.
EL_NINO_C, LA_NINA_C = 0.5, -0.5
# Lags searched when asking how far the water table trails the Pacific.
MAX_LAG_MONTHS = 14
MIN_PAIRS = 60


def correlation(left, right):
    count = len(left)
    if count < 2:
        return 0.0
    mean_l, mean_r = sum(left) / count, sum(right) / count
    var_l = sum((x - mean_l) ** 2 for x in left)
    var_r = sum((y - mean_r) ** 2 for y in right)
    if var_l == 0 or var_r == 0:
        return 0.0
    return sum((x - mean_l) * (y - mean_r) for x, y in zip(left, right)) / (var_l ** 0.5 * var_r ** 0.5)


def pacific(months, deeper, oni_by_month):
    """What the Pacific has done to Andhra's water table over these twelve years.

    Descriptive, not predictive. Both series move slowly -- a water table in one
    month is most of the next month's -- so the effective sample is far smaller
    than the month count, and no significance is claimed or implied anywhere this
    is shown. The lag reported is simply where the correlation peaks.
    """
    paired = [(share, oni_by_month.get(month))
              for month, share in zip(months, deeper)]
    paired = [(share, value) for share, value in paired
              if share is not None and value is not None]
    if len(paired) < MIN_PAIRS:
        return None

    lags = []
    for lag in range(MAX_LAG_MONTHS + 1):
        leading = [value for _, value in paired[:len(paired) - lag]]
        trailing = [share for share, _ in paired[lag:]]
        if len(leading) < MIN_PAIRS:
            break
        lags.append({"lagMonths": lag, "r": round(correlation(leading, trailing), 3),
                     "months": len(leading)})
    best = max(lags, key=lambda row: abs(row["r"]))

    def median_share(rows):
        ordered = sorted(rows)
        return round(ordered[len(ordered) // 2], 1) if ordered else None

    states = []
    for name, rows in (
        ("El Nino", [s for s, v in paired if v >= EL_NINO_C]),
        ("Neutral", [s for s, v in paired if LA_NINA_C < v < EL_NINO_C]),
        ("La Nina", [s for s, v in paired if v <= LA_NINA_C]),
    ):
        if rows:
            states.append({"state": name, "months": len(rows),
                           "medianDeeperPct": median_share(rows)})
    return {
        "bestLagMonths": best["lagMonths"],
        "bestR": best["r"],
        "lags": lags,
        "byState": states,
        "rule": "Share of mandals deeper than their own usual, against Nino 3.4 in the "
                "same month and at lags after it.",
        "caveat": "A description of these twelve years, not a forecast. Both series move "
                  "slowly, so far fewer than the month count are independent and no "
                  "significance is claimed; the lag is where the correlation peaks.",
    }


def marks(months, deeper, oni_by_month):
    """A few months worth jumping straight to."""
    out = []
    scored = [(index, share) for index, share in enumerate(deeper) if share is not None]
    if scored:
        deepest = max(scored, key=lambda row: row[1])
        shallowest = min(scored, key=lambda row: row[1])
        out.append({"at": deepest[0], "label": "Driest month",
                    "why": f"{deepest[1]}% of mandals deeper than their own usual"})
        out.append({"at": shallowest[0], "label": "Fullest month",
                    "why": f"only {shallowest[1]}% deeper than usual"})
    warm = [(index, oni_by_month.get(month)) for index, month in enumerate(months)
            if oni_by_month.get(month) is not None]
    if warm:
        peak = max(warm, key=lambda row: row[1])
        if peak[1] >= EL_NINO_C:
            out.append({"at": peak[0], "label": "Strongest El Nino",
                        "why": f"Nino 3.4 at +{peak[1]:.2f} C"})
    out.append({"at": len(months) - 1, "label": "Now", "why": "the latest month on record"})
    seen, unique = set(), []
    for mark in out:
        if mark["at"] not in seen:
            seen.add(mark["at"])
            unique.append(mark)
    return sorted(unique, key=lambda mark: mark["at"])


def build():
    series = load("mandal_observation_series_v2.json")["series"]
    place, mandal_count = boundary_of()

    months = sorted({o["period"] for rows in series.values() for o in rows["observations"]})
    at = {month: position for position, month in enumerate(months)}

    cells = bytearray([NO_DATA]) * (len(months) * mandal_count)
    placed = clipped = 0
    for mandal_id, rows in series.items():
        index = place.get(mandal_id)
        if index is None:
            continue
        depths = {o["period"]: o["value"] for o in rows["observations"] if o["value"] is not None}
        by_calendar = {}
        for period, value in depths.items():
            by_calendar.setdefault(period[5:7], []).append(value)
        normal = {month: statistics.median(values)
                  for month, values in by_calendar.items() if len(values) >= MIN_YEARS}
        for period, value in depths.items():
            base = normal.get(period[5:7])
            if base is None:
                continue
            step = round((value - base) / STEP_M) + ZERO
            if step < 1 or step > 255:
                clipped += 1
                step = min(255, max(1, step))
            cells[at[period] * mandal_count + index] = step
            placed += 1

    # Each mandal's own range, so the colour means "unusual for here" rather than
    # "deep". Hard rock genuinely moves ten to thirty metres within one calendar
    # month across years while the delta moves one; a single scale in metres would
    # paint half the State saturated in every frame and show nothing moving.
    scales = []
    for index in range(mandal_count):
        column = sorted((cells[position * mandal_count + index] - ZERO) * STEP_M
                        for position in range(len(months))
                        if cells[position * mandal_count + index] != NO_DATA)
        if len(column) < 24:
            scales.append(None)
            continue
        half = (column[int(0.9 * len(column))] - column[int(0.1 * len(column))]) / 2
        # A floor, so a mandal that barely moves does not turn its own noise into weather.
        scales.append(round(max(half, 0.5), 2))

    # The share of mandals deeper than their own usual, per month: the scrubber's
    # own line, so the reader can see where the bad seasons are before scrubbing.
    deeper = []
    for position in range(len(months)):
        frame = cells[position * mandal_count:(position + 1) * mandal_count]
        known = [byte for byte in frame if byte != NO_DATA]
        deeper.append(round(100 * sum(1 for byte in known if byte > ZERO) / len(known), 1) if known else None)

    oni = {}
    path = os.path.join(ROOT, "phase3_levels", "data", "enso_oni.csv")
    if os.path.exists(path):
        import csv
        with open(path, encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                key = row.get("date", "")[:7]
                value = row.get("oni_c") or row.get("oni") or row.get("anomaly")
                if key and value not in (None, ""):
                    oni[key] = round(float(value), 2)

    return {
        "contractVersion": "depth-timelapse-v1",
        "unit": "m_bgl",
        "months": months,
        "mandals": mandal_count,
        "stepM": STEP_M,
        "zero": ZERO,
        "minYears": MIN_YEARS,
        "rule": ("Each mandal against its own median for that calendar month, over the months it has. "
                 "Positive is deeper than usual."),
        "scaleM": scales,
        "scaleRule": ("Each mandal's own half-range (10th to 90th percentile of its anomalies), "
                      "floored at 0.5 m, so the colour reads as unusual for that mandal."),
        "deeperThanUsualPct": deeper,
        "oniC": [oni.get(month) for month in months],
        "pacific": pacific(months, deeper, oni),
        "marks": marks(months, deeper, oni),
        "placed": placed,
        "clipped": clipped,
        "cells": base64.b64encode(bytes(cells)).decode("ascii"),
    }


def main():
    payload = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    size = os.path.getsize(OUT)
    print(f"  {len(payload['months'])} months, {payload['mandals']} mandals, "
          f"{payload['placed']:,} readings placed, {payload['clipped']} clipped")
    print(f"  {payload['months'][0]} -> {payload['months'][-1]}; {size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
