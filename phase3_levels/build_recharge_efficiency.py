#!/usr/bin/env python3
"""Exploratory positive storage-change / rainfall ratio, not recharge efficiency.

The numerator uses May-November water-level rise and assumed specific yield;
the denominator uses June-September rain. The windows differ, and pumping,
lateral flow, irrigation returns and yield error are not resolved. It is NET
of the season's flows and clips negative storage changes to zero. Ratios over
100% require investigation, not an automatic diagnosis of imported water.
The 20 m depth exclusion is precautionary; depth does not establish confinement.
"""
import datetime
import json
import os
import statistics
import sys

import pandas as pd

from build_monsoon_watch import (
    APP, MIN_SHARE_RAIN_MM, PRE_MONSOON_MONTH, SW_MONSOON,
    build_frame, history_paths, mandal_areas, resolve_locations, seasonal_totals,
)

OUT = os.path.join(APP, "recharge_efficiency.json")

POST_MONSOON_MONTH = 11   # November, the reading the assessment itself uses
MIN_YEARS = 5             # fewer than this describes a few seasons, not a place
IMPORTS_PCT = 100.0       # ratios above this need attribution checks
# Precautionary project threshold; not a test of aquifer confinement.
DEEP_WELL_M = 20.0
STRONG_PCT = 15.0         # descriptive project threshold, not a siting rule
WEAK_PCT = 3.0            # lower descriptive threshold


def classify(share):
    if share > IMPORTS_PCT:
        return "imports"
    if share >= STRONG_PCT:
        return "strong"
    if share < WEAK_PCT:
        return "weak"
    return "moderate"


def build():
    frame = build_frame()
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json"), encoding="utf-8"))
    _, _, boundary_index = resolve_locations(
        frame.drop_duplicates("mkey")[["mandal_uuid", "district", "mandal"]], geo)
    areas = mandal_areas(geo)

    levels = frame.pivot_table(index="mkey", columns="date", values="level_mbgl", aggfunc="last")
    # Each mandal's own typical depth, over its whole record rather than one month,
    # used only for the precautionary depth exclusion.
    typical_depth = levels.median(axis=1, skipna=True)
    meta = frame.drop_duplicates("mkey").set_index("mkey")[
        ["district", "mandal", "aquifer_type", "specific_yield"]]

    paths = history_paths()
    if not paths:
        print("  no CHIRPS history on disk; nothing to score", file=sys.stderr)
        return None
    rain = pd.concat([pd.read_csv(path) for path in paths], ignore_index=True)
    rain["year"] = rain.date.str.slice(0, 4).astype(int)
    rain["mon"] = rain.date.str.slice(5, 7).astype(int)
    monsoon = seasonal_totals(rain, SW_MONSOON, "mm")
    rain_at = {(int(r.boundary_index), int(r.year)): float(r.mm) for r in monsoon.itertuples()}

    years = sorted({int(c[:4]) for c in levels.columns})
    rows, skipped_thin = [], 0
    for key, row in meta.iterrows():
        index = boundary_index.get(key)
        yield_ = row["specific_yield"]
        area = areas.get(int(index)) if index is not None else None
        if index is None or area is None or yield_ is None or pd.isna(yield_):
            continue

        depth = typical_depth.get(key)
        shares, banked_total, rain_total, scored = [], 0.0, 0.0, []
        for year in years:
            pre, post = f"{year}-{PRE_MONSOON_MONTH:02d}", f"{year}-{POST_MONSOON_MONTH:02d}"
            if pre not in levels.columns or post not in levels.columns:
                continue
            start, end = levels.at[key, pre], levels.at[key, post]
            if pd.isna(start) or pd.isna(end):
                continue
            fell_mm = rain_at.get((int(index), year))
            if fell_mm is None:
                continue
            if fell_mm < MIN_SHARE_RAIN_MM:
                skipped_thin += 1
                continue
            # Depth below ground: the table rose if November is shallower than May.
            rise = float(start) - float(end)
            banked = max(rise, 0.0) * float(yield_) * area      # m x km2 = Mm3
            fell = fell_mm * area * 1e-3                         # mm x km2 = 0.001 Mm3
            if fell <= 0:
                continue
            share = 100 * banked / fell
            shares.append(share)
            banked_total += banked
            rain_total += fell
            scored.append({"year": year, "sharePct": round(share, 1),
                           "riseM": round(rise, 2), "rainMm": round(fell_mm, 0)})

        if len(shares) < MIN_YEARS:
            continue
        median = statistics.median(shares)
        ordered = sorted(shares)
        rows.append({
            "deepWell": bool(depth is not None and not pd.isna(depth) and depth > DEEP_WELL_M),
            "typicalDepthM": None if depth is None or pd.isna(depth) else round(float(depth), 1),
            "district": row["district"],
            "mandal": row["mandal"],
            "boundaryIndex": int(index),
            "aquifer": row["aquifer_type"],
            "specificYield": round(float(yield_), 3),
            "areaKm2": round(area, 1),
            "years": len(shares),
            "medianSharePct": round(median, 1),
            "lowSharePct": round(ordered[len(ordered) // 4], 1),
            "highSharePct": round(ordered[(3 * len(ordered)) // 4], 1),
            "driestYearSharePct": round(min(scored, key=lambda s: s["rainMm"])["sharePct"], 1),
            "bankedMm3PerYear": round(banked_total / len(shares), 2),
            "class": classify(median),
            "driestYearRainMm": min(scored, key=lambda s: s["rainMm"])["rainMm"],
        })

    for r in rows:
        if r["deepWell"]:
            r["class"] = "set aside"
    rows.sort(key=lambda r: -r["medianSharePct"])
    counts = {}
    for r in rows:
        counts[r["class"]] = counts.get(r["class"], 0) + 1
    by_aquifer = []
    for name in sorted({r["aquifer"] for r in rows if r["aquifer"]}):
        group = [r["medianSharePct"] for r in rows if r["aquifer"] == name
                 and r["class"] not in ("imports", "set aside")]
        if group:
            by_aquifer.append({"aquifer": name, "mandals": len(group),
                               "medianSharePct": round(statistics.median(group), 1)})

    local = [r for r in rows if r["class"] not in ("imports", "set aside")]
    classes = ["weak", "moderate", "strong", "imports", "set aside"]
    slim = lambda r: {k: r[k] for k in
                      ("district", "mandal", "aquifer", "medianSharePct", "years",
                       "typicalDepthM", "specificYield", "class")}
    return {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
            .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "method": 'Exploratory storage-change/rainfall proxy: positive May-to-November water-level rise times specific yield and area, divided by June-September rainfall volume; median across paired years. Negative changes are clipped to zero',
        "window": {"preMonsoonMonth": PRE_MONSOON_MONTH, "postMonsoonMonth": POST_MONSOON_MONTH,
                   "rainMonths": list(SW_MONSOON), "minYears": MIN_YEARS,
                   "minRainMm": MIN_SHARE_RAIN_MM},
        "scored": len(rows),
        "ranked": len(local),
        "yearsAvailable": [min(years), max(years)],
        "counts": counts,
        "stateMedianSharePct": round(statistics.median([r["medianSharePct"] for r in local]), 1) if local else None,
        "byAquifer": by_aquifer,
        "thresholds": {"strongPct": STRONG_PCT, "weakPct": WEAK_PCT,
                       "importsPct": IMPORTS_PCT, "deepWellM": DEEP_WELL_M},
        "codes": {"class": classes},
        # Keyed the way the map layers are, so a fill is one lookup.
        "fields": ["medianSharePct", "classCode", "years", "typicalDepthM"],
        "values": {f"{r['district'].upper()}|{r['mandal'].upper()}":
                   [r["medianSharePct"], classes.index(r["class"]), r["years"], r["typicalDepthM"]]
                   for r in rows},
        "strongest": [slim(r) for r in local[:8]],
        "weakest": [slim(r) for r in sorted(local, key=lambda r: r["medianSharePct"])[:8]],
        "setAside": [slim(r) for r in sorted(
            [r for r in rows if r["class"] == "set aside"],
            key=lambda r: -r["medianSharePct"])[:8]],
        "caveat": "Net of the season's pumping and other flows, with an assumed specific yield. This is not gross recharge or a measured rainfall-recharge fraction. October-November rain is outside the denominator; a ratio above 100% does not prove imported water.",
        "limits": ['Depth alone does not identify a confined aquifer. The 20 m exclusion is a project precaution, not a hydrogeological diagnosis; well construction and aquifer data are needed.', 'In the current snapshot, proxy and depth correlate at 0.27 after the exclusion versus 0.40 before. Compare similar depth and aquifer settings; these descriptive correlations require rechecking when data change.', 'Rainfall-window mismatch, irrigation return flows, lateral flows, pumping and specific-yield error can all change the ratio. Their contributions are not identified here.', 'Project thresholds describe the proxy, not validated recharge suitability. Any proposed structure must be verified in the field; agreement with a published recharge coefficient is not independent validation.'],
    }


def main():
    payload = build()
    if payload is None:
        return 1
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"  {payload['scored']} mandals scored over {payload['yearsAvailable'][0]}-{payload['yearsAvailable'][1]}")
    print(f"  state median share of monsoon rain banked: {payload['stateMedianSharePct']}%")
    print(f"  {payload['counts']}")
    for row in payload["byAquifer"]:
        print(f"    {row['aquifer']:<10} {row['mandals']:>4} mandals, median {row['medianSharePct']}%")
    print("  strongest converters:")
    for row in payload["strongest"][:6]:
        print(f"    {row['mandal'][:22]:<22} {row['district'][:16]:<16} {row['medianSharePct']:>6}%  "
              f"({row['years']} yrs, {row['aquifer']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
