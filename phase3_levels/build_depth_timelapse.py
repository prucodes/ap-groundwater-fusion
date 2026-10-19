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
