#!/usr/bin/env python3
"""Where the water table stands below sea level, against the official salinity map.

Ground elevation minus depth to water estimates the head of the water table above
sea level. Both terms are mandal averages, so it is not the height at any one well. Where that is negative the seaward gradient is reversed, which is the
physical precondition for seawater moving inland. This was not buildable until the
terrain cache was rebuilt from a DEM: on the old centroid readings only 238 of 653
mandals had a real elevation at all.

What this is for is checking the official map rather than replacing it. The
department already classifies assessment units, and `salinity` is one of its
categories. Setting head against that classification is a test of both: the
agreement is evidence the estimate tracks something real, and the disagreements
are the useful part.

The agreement is strong. Salinity units run a median head of a few metres where
the rest of the State runs over a hundred, and the share classed salinity falls
monotonically as head rises. That is INGRES and a satellite DEM arriving at the
same place by different routes, with no shared input.

Three things this deliberately does NOT do.

It does not call anywhere intruded. Head below sea level is a precondition, not a
measurement of chloride, and nothing here samples water quality. The output is a
list to verify in the field.

It does not report a mandal whose wells are deep. A mandal-mean depth past
DEEP_WELL_M is likely set by deeper wells, possibly into a confined aquifer, or by
an inland water table far from any coast, and subtracting that from a ground elevation says
nothing about the shallow aquifer intrusion threatens. Vetapalem at 44.3 m,
Denduluru at 48.4 m and Rajahmundry Rural at 46.3 m all drop out here, and all
three are either inland or deep. The cutoff is a precaution: depth alone does not
prove an aquifer is confined.

It does not treat the elevation as exact. The DEM is about +/-10 m on a single
pixel, and a mandal mean is taken over thousands of them, so the mean is far
better than that while remaining a mean: the spread travels with every row.
"""
import csv
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
TERRAIN = os.path.join(ROOT, "phase3_levels", "data", "mandal_terrain.csv")
OUT = os.path.join(APP, "seawater_watch.json")

# Past this, a mandal-mean depth is unlikely to describe the shallow aquifer; a
# precaution, not a test of confinement.
DEEP_WELL_M = 20.0
# The bands the head is reported in, as (upper bound, label).
BANDS = [(0.0, "at or below sea level"), (5.0, "0 to 5 m"), (20.0, "5 to 20 m"),
         (float("inf"), "above 20 m")]


def load(name):
    with open(os.path.join(APP, name), encoding="utf-8") as handle:
        return json.load(handle)


def categories():
    """Each mandal's official assessment category, including `salinity`."""
    signals = load("field_signals_mandals.json")
    index = signals["fields"].index("category")
    codes = signals["codes"]["category"]
    out = {}
    for key, values in signals["values"].items():
        code = values[index]
        out[key] = codes[code] if isinstance(code, int) and 0 <= code < len(codes) else None
    return out


def band_of(head):
    for edge, label in BANDS:
        if head <= edge:
            return label
    return BANDS[-1][1]


def build():
    with open(TERRAIN, encoding="utf-8") as handle:
        terrain = {row["mandal_id"]: row for row in csv.DictReader(handle)}
    category = categories()
    records = load("mandal_groundwater_records_v2.json")["records"]

    rows, period = [], None
    for record in records:
        identity = record["identity"]
        key = f"{identity['districtName']}|{identity['mandalName']}"
        ground = terrain.get(key)
        observation = record.get("observation") or {}
        depth = observation.get("latestMeasuredValue")
        if ground is None or depth is None:
            continue
        period = period or observation.get("observationPeriod")
        mean = float(ground["elevation_m"])
        rows.append({
            "key": key,
            "district": identity["districtName"],
            "mandal": identity["mandalName"],
            "depthM": round(float(depth), 1),
            "groundM": round(mean, 1),
            "groundP10M": round(float(ground["elevation_p10_m"]), 1),
            "reliefM": round(float(ground["relief_m"]), 1),
            "headM": round(mean - float(depth), 1),
            "headP10M": round(float(ground["elevation_p10_m"]) - float(depth), 1),
            "category": category.get(key),
        })

    bands = []
    for _, label in BANDS:
        members = [r for r in rows if band_of(r["headM"]) == label]
        salinity = [r for r in members if r["category"] == "salinity"]
        bands.append({
            "band": label,
            "mandals": len(members),
            "salinity": len(salinity),
            "salinityPct": round(100 * len(salinity) / len(members), 1) if members else None,
        })

    salinity_rows = [r for r in rows if r["category"] == "salinity"]
    others = [r for r in rows if r["category"] != "salinity"]
    median = lambda values: sorted(values)[len(values) // 2] if values else None

    below = [r for r in rows if r["headM"] <= 0]
    deep = [r for r in below if r["depthM"] > DEEP_WELL_M]
    shallow = [r for r in below if r["depthM"] <= DEEP_WELL_M]
    # Preserve the screening rule. P10 is a descriptive lower-ground value,
    # not independent corroboration: it is normally below the mean already.
    watch = sorted([r for r in shallow
                    if r["category"] != "salinity" and r["headP10M"] <= 0],
                   key=lambda r: r["headM"])
    confirmed = sorted([r for r in shallow if r["category"] == "salinity"],
                       key=lambda r: r["headM"])

    return {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
            .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "method": 'Screening proxy: mandal mean terrain elevation minus mandal mean measured depth; not a surveyed well head or a verified level relative to sea level',
        "observationPeriod": period,
        "elevationSource": "Terrarium terrain tiles (AWS open data), zonal mean over each "
                           "mandal, about 150 m a pixel",
        "classificationSource": "CGWB and the State's Dynamic Ground Water Resources "
                                "assessment, via the INGRES public dashboard",
        "deepWellThresholdM": DEEP_WELL_M,
        "scored": len(rows),
        "bands": bands,
        "medianHeadSalinityM": median([r["headM"] for r in salinity_rows]),
        "medianHeadOtherM": median([r["headM"] for r in others]),
        "salinityUnits": len(salinity_rows),
        "belowSeaLevel": len(below),
        "setAsideDeepWells": sorted(
            [{k: r[k] for k in ("district", "mandal", "depthM", "headM", "category")} for r in deep],
            key=lambda r: r["headM"]),
        "confirmed": [{k: r[k] for k in
                       ("district", "mandal", "depthM", "groundM", "headM", "category")}
                      for r in confirmed],
        "watch": [{k: r[k] for k in
                   ("district", "mandal", "depthM", "groundM", "groundP10M", "reliefM",
                    "headM", "headP10M", "category")}
                  for r in watch],
        "caveat": ("Below sea level is the precondition for intrusion, not a measurement of it. Ground "
                   "height and depth are mandal averages, not measured at the same well. Before reading any "
                   "of these as coastal risk, check the well's surveyed height, the aquifer it taps and the "
                   "water's salinity. This is a list to verify, not a finding of intrusion."),
    }


def main():
    payload = build()
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    print(f"  {payload['scored']} mandals scored on {payload['observationPeriod']}")
    for band in payload["bands"]:
        print(f"    head {band['band']:<22} {band['mandals']:>4} mandals, "
              f"{band['salinity']:>3} salinity ({band['salinityPct']}%)")
    print(f"  salinity units median head {payload['medianHeadSalinityM']} m "
          f"against {payload['medianHeadOtherM']} m elsewhere")
    print(f"  {payload['belowSeaLevel']} below sea level: "
          f"{len(payload['confirmed'])} already classed salinity, "
          f"{len(payload['watch'])} on the watch list, "
          f"{len(payload['setAsideDeepWells'])} set aside as deep wells")
    return 0


if __name__ == "__main__":
    sys.exit(main())
