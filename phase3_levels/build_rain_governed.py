#!/usr/bin/env python3
"""Historical association between seasonal water-level change and rainfall.

This is not a measure of extraction. In-sample R-squared on a small sample of
seasons does not establish cause or forecast skill. A weak or inverse fit cannot
rule out rainfall effects. The legacy class IDs remain stable for consumers;
user-facing labels describe stronger, moderate, or weak/inverse association.
"""
import datetime
import json
import os
import statistics
import sys

import pandas as pd

from build_monsoon_watch import (
    APP, PRE_MONSOON_MONTH, SW_MONSOON,
    build_frame, history_paths, resolve_locations, seasonal_totals,
)

OUT = os.path.join(APP, "rain_governed.json")

POST_MONSOON_MONTH = 11
MIN_SEASONS = 7           # below this a fit is describing noise
GOVERNED_R2 = 0.40        # descriptive stronger-fit threshold; not a majority
PARTLY_R2 = 0.15          # rain is in there, with much else


def classify(r2, slope):
    # A positive slope says the table fell further in wetter years, which is not
    # a positive recharge-response association; it does not rule rain out.
    if slope >= 0:
        return "not rain"
    if r2 >= GOVERNED_R2:
        return "rain governed"
    if r2 >= PARTLY_R2:
        return "partly"
    return "not rain"


def build():
    frame = build_frame()
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json"), encoding="utf-8"))
    _, _, boundary_index = resolve_locations(
        frame.drop_duplicates("mkey")[["mandal_uuid", "district", "mandal"]], geo)
    levels = frame.pivot_table(index="mkey", columns="date", values="level_mbgl", aggfunc="last")
    meta = frame.drop_duplicates("mkey").set_index("mkey")[["district", "mandal", "aquifer_type"]]

    paths = history_paths()
    if not paths:
        print("  no CHIRPS history on disk", file=sys.stderr)
        return None
    rain = pd.concat([pd.read_csv(path) for path in paths], ignore_index=True)
    rain["year"] = rain.date.str.slice(0, 4).astype(int)
    rain["mon"] = rain.date.str.slice(5, 7).astype(int)
    rain_at = {(int(r.boundary_index), int(r.year)): float(r.mm)
               for r in seasonal_totals(rain, SW_MONSOON, "mm").itertuples()}

    signals = json.load(open(os.path.join(APP, "field_signals_mandals.json"), encoding="utf-8"))
    irrigated_at = signals["fields"].index("irrigatedPct")
    category_at = signals["fields"].index("category")
    categories = signals["codes"]["category"]

    years = sorted({int(c[:4]) for c in levels.columns})
    rows = []
    for key, info in meta.iterrows():
        index = boundary_index.get(key)
        if index is None:
            continue
        pairs = []
        for year in years:
            pre, post = f"{year}-{PRE_MONSOON_MONTH:02d}", f"{year}-{POST_MONSOON_MONTH:02d}"
            if pre not in levels.columns or post not in levels.columns:
                continue
            start, end = levels.at[key, pre], levels.at[key, post]
            millimetres = rain_at.get((int(index), year))
            if pd.isna(start) or pd.isna(end) or millimetres is None:
                continue
            # Depth below ground, so a negative change is the table rising.
            pairs.append((millimetres, float(end) - float(start)))
        if len(pairs) < MIN_SEASONS:
            continue

        xs = [p[0] for p in pairs]
        ys = [p[1] for p in pairs]
        mean_x, mean_y = sum(xs) / len(xs), sum(ys) / len(ys)
        var_x = sum((x - mean_x) ** 2 for x in xs)
        if var_x == 0:
            continue
        slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / var_x
        residual = [y - (mean_y + slope * (x - mean_x)) for x, y in zip(xs, ys)]
        total = sum((y - mean_y) ** 2 for y in ys)
        r2 = 1 - sum(r * r for r in residual) / total if total > 0 else 0.0

        signal = signals["values"].get(f"{info['district'].upper()}|{info['mandal'].upper()}")
        category = (categories[signal[category_at]]
                    if signal and isinstance(signal[category_at], int) else None)
        rows.append({
            "district": info["district"], "mandal": info["mandal"],
            "boundaryIndex": int(index), "aquifer": info["aquifer_type"],
            "seasons": len(pairs),
            "r2": round(max(r2, 0.0), 2),
            # Metres the table moves per 100 mm of monsoon rain, signed so that a
            # positive number is the table rising, which is how it would be read.
            "risePer100mm": round(-slope * 100, 2),
            "irrigatedPct": signal[irrigated_at] if signal else None,
            "category": category,
            "class": classify(r2, slope),
        })

    groups = []
    for name in ("rain governed", "partly", "not rain"):
        members = [r for r in rows if r["class"] == name]
        if not members:
            continue
        aquifers = {}
        for r in members:
            if r["aquifer"]:
                aquifers[r["aquifer"]] = aquifers.get(r["aquifer"], 0) + 1
        irrigated = [r["irrigatedPct"] for r in members if r["irrigatedPct"] is not None]
        stressed = sum(1 for r in members
                       if r["category"] in ("semi_critical", "critical", "over_exploited"))
        groups.append({
            "class": name, "mandals": len(members),
            "aquifers": dict(sorted(aquifers.items(), key=lambda kv: -kv[1])),
            "medianIrrigatedPct": round(statistics.median(irrigated), 1) if irrigated else None,
            "stressedPct": round(100 * stressed / len(members), 1),
            "medianRisePer100mm": round(statistics.median(r["risePer100mm"] for r in members), 2),
        })

    classes = ["rain governed", "partly", "not rain"]
    return {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
            .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "method": 'In-sample linear association between May-to-November depth change and June-September rainfall for each mandal. R² describes fitted historical variance, not causation or forecast skill',
        "window": {"preMonsoonMonth": PRE_MONSOON_MONTH, "postMonsoonMonth": POST_MONSOON_MONTH,
                   "rainMonths": list(SW_MONSOON), "minSeasons": MIN_SEASONS},
        "thresholds": {"governedR2": GOVERNED_R2, "partlyR2": PARTLY_R2},
        "scored": len(rows),
        "medianR2": round(statistics.median(r["r2"] for r in rows), 2),
        "groups": groups,
        "codes": {"class": classes},
        "fields": ["r2", "classCode", "risePer100mm", "seasons", "irrigatedPct"],
        "values": {f"{r['district'].upper()}|{r['mandal'].upper()}":
                   [r["r2"], classes.index(r["class"]), r["risePer100mm"],
                    r["seasons"], r["irrigatedPct"]]
                   for r in rows},
        "caveat": 'Nothing here measures extraction, and the unexplained variation is not pumping. Low R² or an inverse slope does not establish that rain has no influence. October-November rain, lagged effects, other flows and observation differences are omitted.',
        "limits": ['A single predictor on seven to eleven seasons is a thin instrument. Individual fits and group comparisons need uncertainty estimates and independent validation.', 'The stronger class starts at R² 0.40 with a water-level rise associated with wetter years. This is a project threshold, not evidence that rain explains most variation or controls the aquifer.', 'Irrigated-area differences between groups are descriptive associations. They do not identify pumping as the cause or show that rainfall control has changed over time.'],
    }


def main():
    payload = build()
    if payload is None:
        return 1
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"  {payload['scored']} mandals fitted on {MIN_SEASONS}+ seasons; "
          f"median R2 {payload['medianR2']}")
    for group in payload["groups"]:
        print(f"    {group['class']:<14} {group['mandals']:>4} mandals  "
              f"irrigated {group['medianIrrigatedPct']}%  stressed {group['stressedPct']}%  "
              f"rise {group['medianRisePer100mm']} m/100mm  {group['aquifers']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
