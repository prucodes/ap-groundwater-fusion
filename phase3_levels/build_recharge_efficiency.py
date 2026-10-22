#!/usr/bin/env python3
"""Where rain actually becomes groundwater: twelve years of it, mandal by mandal.

The monsoon watch says what this season banked. The question a department asks
next is not about this season at all: if a percolation tank or a check dam is
going to be built, where does rain reliably reach the aquifer, and where does it
run off or evaporate instead? That is a property of the place, so it wants the
whole record rather than one year.

The method is the monsoon watch's own, which is GEC-2015's: the rise in the water
table between the pre-monsoon May reading and the post-monsoon November one,
times the mandal's specific yield, times its area, is the water stored; the rain
that fell on it over June to September is what arrived. The windows differ:
October and November rain is not counted, which lifts the share. The share of one by the
other is run for every year a mandal has both readings, and the median of those
years is what is published. A median rather than a mean because one freak year,
in either direction, should not describe a place.

Mandals whose water table sits deeper than DEEP_WELL_M are set aside rather than
ranked. Water-table fluctuation assumes an unconfined aquifer: the storage it
infers is a head change times a specific yield. A reading twenty-five or forty
metres down is likely in a confined or deep semi-confined zone, where the storage
coefficient is orders of magnitude below specific yield, so the same arithmetic
invents water. The cutoff is a precaution: depth alone does not prove confinement. Unfiltered it showed: share and depth correlated at +0.40, and the
mandals below twenty metres ran a median 11.2% against 24.1% for those above, with
Pedapadu at 96% on a table 25 m down and a delta yield of 0.116. They are reported
in their own list, because a deep reading is worth knowing about and is not worth
ranking a recharge structure on.

Four more things worth saying plainly.

It is NET of the season's own pumping, because the rise is what remained after
it. Gross recharge is larger by whatever was drawn while it rained, which no
public source observes. A mandal that converts little may be recharging well and
pumping it straight back out, and this cannot tell the two apart.

A share above 100% is more water than the counted rain delivered: a canal, flow
from upslope, irrigation return flow, October rain, or a specific yield that is
off. This cannot say which. Those mandals are reported separately rather than at the top of the
table, because siting a recharge structure on them would be reading somebody
else's water as local performance.

The absolute number rests on specific yield, which for many mandals is an
aquifer-wide proxy rather than a measured value. The frame decides where CGWB's
measured yield overrides that proxy, and this inherits the decision. The ranking
between mandals of the same aquifer is firmer than the number itself.

And a mandal needs several years before any of this is said about it.
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
IMPORTS_PCT = 100.0       # above this, more was stored than the counted rain delivered
# Past this depth the method's unconfined assumption is doubtful; a precaution,
# the same threshold the seawater watch uses.
DEEP_WELL_M = 20.0
STRONG_PCT = 15.0         # worth a closer look for recharge works; not a siting rule
WEAK_PCT = 3.0            # little of the rain stays


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
    # which decides the precautionary depth exclusion.
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
        "method": ("Water-table fluctuation, the GEC-2015 method: the May to November rise times specific "
                   "yield times area, as a share of June to September rainfall, for every year a mandal has "
                   "both readings. The median year is published, and a year whose table fell counts as zero."),
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
        "caveat": ("Net of the season's pumping, so a mandal that keeps little may be recharging well and "
                   "drawing it straight back out. The share rests on specific yield, often an aquifer-wide "
                   "estimate, so the ranking within an aquifer is firmer than the number. October and "
                   "November rain fall outside the rain counted."),
        "limits": [
            ("A deeper water table has more room to rise, and still scores higher after the deepest "
             "are set aside: share and depth correlate at 0.27 among the mandals ranked here, against "
             "0.40 before. Compare mandals of similar depth and aquifer rather than across the whole "
             "table."),
            ("Past {deep:.0f} m the method's unconfined assumption is doubtful, so those mandals are "
             "set aside as a precaution. Depth alone does not prove an aquifer is confined.").format(deep=DEEP_WELL_M),
            ("A share above 100% means more water was stored than the counted rain delivered: a canal, "
             "flow from upslope, irrigation return, October rain, or a specific yield that is off. "
             "This cannot tell which."),
            ("A ranking to decide where to look, verified in the field before anything is built on it."),
        ],
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
