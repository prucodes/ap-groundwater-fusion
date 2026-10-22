#!/usr/bin/env python3
"""Exploratory coastal elevation–depth screening.

Area-average terrain is not the elevation at the observed wells. This does not
call anywhere intruded or establish hydraulic head. Depth is not a confinement
test, and agreement with salinity categories is not independent validation.
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

# Precautionary project cutoff, not a test of confinement or well construction.
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
        "caveat": 'Area-average terrain and groundwater depths are not co-located measurements. Verify well coordinates, surveyed elevation and vertical datum, screened aquifer, hydraulic connection and water chemistry before interpreting coastal risk. This is a list to verify, not a finding of intrusion.',
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
