#!/usr/bin/env python3
"""Twelve years of measured depth per mandal, small enough to hover over.

The map says where the water table is now. The question a reader asks next,
pointing at one mandal, is whether that is normal for the place, and the answer
is its own record: the saw-tooth of monsoon recharge and summer drawdown, and
whether the teeth are marching down the page.

The whole record already exists in mandal_observation_series_v2.json, but that
file is 6.3 MB and is imported at the top of lib/data.ts. Reading it from the
map would pull all of it into the browser for a sparkline in a tooltip, so this
writes a slim copy instead: one byte per mandal-month, fetched by the map only
once someone actually hovers.

Absolute metres, not the anomaly the time-lapse draws. A hydrograph is read for
its shape and its level together, and the anomaly throws the level away. Each
mandal is scaled by its own record, so a byte is worth a few centimetres in the
delta and a few tens in hard rock, which is the precision each one deserves. The
scale travels per mandal so the sparkline can be drawn back in metres.

The scale runs between the 2nd and 98th percentile rather than the minimum and
maximum, and readings outside it sit on the edge. One freak reading otherwise
sets the whole range: Nuzendla has a single 10.3 m month against a record that
usually moves between 2 and 5, and against min-to-max the twelve-year seasonal
cycle collapsed into a flat band of noise under one spike. Clipping three
readings at each end to show the other hundred and thirty-five is the trade a
sparkline is for; the panel's full Hydrograph still draws every point.

Not an official hydrograph. These are the mandal-mean readings the rest of the
platform uses, and a mandal mean is not a well.
"""
import base64
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(ROOT, "app", "public", "geo", "mandal-hydrographs.json")

NO_DATA = 255      # 0..254 carry depth; 255 says the month was never read
LEVELS = 254
# The scale's ends, as percentiles of each mandal's own readings.
LOW_PCT, HIGH_PCT = 2, 98
# Below this a mandal has too little to draw a twelve-year line from.
MIN_READINGS = 24
# A flat record still needs a range to divide by.
MIN_RANGE_M = 0.5


def load(name):
    with open(os.path.join(APP, name), encoding="utf-8") as handle:
        return json.load(handle)


def boundary_of():
    """mandalId -> boundary index, through the names the outlines carry.

    The same mapping build_depth_timelapse.py uses, so a hover and the time-lapse
    are talking about the same mandal.
    """
    geo = load("ap_map_geometry.json")
    index = {}
    for position, feature in enumerate(geo["mandals"]):
        index.setdefault(f"{feature['d']}|{feature['m']}".upper(), position)
    records = load("mandal_groundwater_records_v2.json")
    rows = records if isinstance(records, list) else next(
        v for v in records.values() if isinstance(v, list))
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
    floor = [None] * mandal_count
    span = [None] * mandal_count
    placed = thin = 0

    for mandal_id, rows in series.items():
        index = place.get(mandal_id)
        if index is None:
            continue
        depths = {o["period"]: float(o["value"])
                  for o in rows["observations"] if o["value"] is not None}
        if len(depths) < MIN_READINGS:
            thin += 1
            continue
        ordered = sorted(depths.values())
        # Named so it cannot shadow `at`, the month-to-column index above.
        def percentile(pct, values=ordered):
            return values[min(len(values) - 1, max(0, round(pct / 100 * (len(values) - 1))))]
        low, high = percentile(LOW_PCT), percentile(HIGH_PCT)
        width = max(high - low, MIN_RANGE_M)
        floor[index] = round(low, 2)
        span[index] = round(width, 2)
        for period, value in depths.items():
            step = round((value - low) / width * LEVELS)
            cells[at[period] * mandal_count + index] = max(0, min(LEVELS, step))
        placed += 1

    return {
        "contractVersion": "1.0.0",
        "unit": "m_bgl",
        "months": months,
        "mandals": mandal_count,
        "levels": LEVELS,
        "noData": NO_DATA,
        "minM": floor,
        "rangeM": span,
        "placed": placed,
        "rule": f"Measured depth below ground, each mandal scaled between its own "
                f"{LOW_PCT}nd and {HIGH_PCT}th percentile so a byte is worth the precision "
                f"that mandal deserves. depth = minM + byte / levels * rangeM.",
        "clipRule": f"Readings outside the {LOW_PCT}nd to {HIGH_PCT}th percentile sit on the "
                    f"edge of the scale, so one freak month cannot flatten a decade.",
        "caveat": "Mandal-mean readings, not a single well, and not an official hydrograph.",
        "cells": base64.b64encode(bytes(cells)).decode("ascii"),
    }


def main():
    payload = build()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
        handle.write("\n")
    size = os.path.getsize(OUT) / 1024
    print(f"  {payload['placed']} mandals over {len(payload['months'])} months "
          f"({payload['months'][0]} to {payload['months'][-1]})")
    print(f"  wrote {size:,.0f} KB -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
