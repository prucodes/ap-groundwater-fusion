#!/usr/bin/env python3
"""Where the drinking water itself is unsafe: habitations the Jal Jeevan Mission
has marked as quality affected, by mandal and contaminant.

The drinking-water section already counts sources that failed a chemical or
bacterial test (build_drinking_water.py). This is the State's own stronger
statement: habitations formally marked as affected since April 2019, by
contaminant. In Andhra Pradesh that is almost entirely fluoride, which comes from
the granite and gneiss the water sits in, with a little salinity on the coast.

Source: WQMIS Format L3, read from the public report page into
phase3_levels/data/jjm_quality_affected_habitations.csv with a sidecar .meta.json
(the page encrypts its query parameters, so it is read through the page and
refreshed by hand rather than by the weekly job).

Blocks are matched to mandal outlines by a reviewed alias table first
(phase3_levels/data/jjm_wq_block_aliases.csv: spellings, and outlines filed under
the wrong district, placed by location), then by a name unique within the block's
district, then by a name unique in the State. The test the data can carry is
descriptive: do the fluoride mandals sit on hard rock and deeper water than the
rest? Nothing here says why a particular habitation is affected.

Output: app/data/water_quality.json
"""
import csv
import datetime
import json
import os
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
SOURCE = os.path.join(HERE, "data", "jjm_quality_affected_habitations.csv")
META = os.path.join(HERE, "data", "jjm_quality_affected_habitations.meta.json")
ALIASES = os.path.join(HERE, "data", "jjm_wq_block_aliases.csv")  # reviewed, each row with its reason
OUT = os.path.join(APP, "water_quality.json")
CONTAMINANTS = ("fluoride", "salinity", "nitrate", "iron", "arsenic", "heavy_metal")

sys.path.insert(0, HERE)
from source_identity import key  # noqa: E402


def district_key(name):
    # The report spells some districts differently from the outlines.
    k = key(name)
    return {"DRBRAMBEDKARKONASEEMA": "KONASEEMA", "YSR": "YSRKADAPA"}.get(k, k)


def match(rows, boundaries):
    by_name, by_pair = {}, {}
    for index, b in enumerate(boundaries):
        by_name.setdefault(key(b["m"]), []).append(index)
        by_pair.setdefault((district_key(b["d"]), key(b["m"])), []).append(index)
    aliases = {(r["district"], r["block"]): int(r["boundary_index"]) for r in csv.DictReader(open(ALIASES))}
    matched, unmatched = {}, []
    for row in rows:
        if (row["district"], row["block"]) in aliases:
            matched[(row["district"], row["block"])] = aliases[(row["district"], row["block"])]
            continue
        name = key(row["block"])
        pair = by_pair.get((district_key(row["district"]), name), [])
        anywhere = by_name.get(name, [])
        if len(pair) == 1:
            matched[(row["district"], row["block"])] = pair[0]
        elif len(anywhere) == 1:
            matched[(row["district"], row["block"])] = anywhere[0]
        else:
            unmatched.append(f"{row['district']}: {row['block']}")
    taken = list(matched.values())
    if len(taken) != len(set(taken)):
        raise SystemExit("two blocks matched one mandal outline: review the alias table")
    return matched, unmatched


def main():
    rows = list(csv.DictReader(open(SOURCE)))
    meta = json.load(open(META))
    boundaries = json.load(open(os.path.join(APP, "ap_map_display.json")))["mandals"]
    watch = {m["boundaryIndex"]: m for m in json.load(open(os.path.join(APP, "monsoon_watch.json")))["mandals"]}
    matched, unmatched = match(rows, boundaries)

    mandals = {}
    for row in rows:
        index = matched.get((row["district"], row["block"]))
        if index is None:
            continue
        counts = [int(row[c]) for c in CONTAMINANTS]
        # Keyed as the map keys its outlines, "DISTRICT|MANDAL", so a fill is one lookup.
        mandals[f'{boundaries[index]["d"].upper()}|{boundaries[index]["m"].upper()}'] = (
            counts + [int(row["habitations"]), int(row["households"]), int(row["tap_connections"])])

    totals = {c: sum(int(r[c]) for r in rows) for c in CONTAMINANTS}
    totals.update(habitations=sum(int(r["habitations"]) for r in rows), households=sum(int(r["households"]) for r in rows))
    if totals["habitations"] != meta["stateTotals"]["habitations"]:
        raise SystemExit("block rows do not add up to the State total in the meta file: re-read the report")

    # Descriptive: where the fluoride mandals sit, against every other mandal with a reading.
    index_of = {f'{b["d"].upper()}|{b["m"].upper()}': i for i, b in enumerate(boundaries)}
    fluoride = {index_of[k] for k, v in mandals.items() if v[0] > 0}
    depth_f = [watch[i]["latestDepthM"] for i in fluoride if i in watch and watch[i].get("latestDepthM") is not None]
    depth_o = [m["latestDepthM"] for i, m in watch.items() if i not in fluoride and m.get("latestDepthM") is not None]
    rock_f = [watch[i]["aquifer"] == "hard_rock" for i in fluoride if i in watch]
    rock_o = [m["aquifer"] == "hard_rock" for i, m in watch.items() if i not in fluoride]
    top = sorted(((v[0], index_of[k]) for k, v in mandals.items()), reverse=True)[:5]

    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": meta["source"], "url": meta["url"], "since": meta["since"], "readOn": meta["readOn"],
        "method": ("Habitations the Jal Jeevan Mission has marked as quality affected since April 2019, by block and "
                   "contaminant, matched to mandal outlines by name."),
        "caveat": ("A habitation is marked affected when its sources test above the drinking-water limit; this counts "
                   "habitations, not people tested or wells. It says nothing about why a habitation is affected, and "
                   "a mandal with none may simply have fewer tests."),
        "totals": totals,
        "contaminants": list(CONTAMINANTS),
        "fields": list(CONTAMINANTS) + ["habitations", "households", "tapConnections"],
        "mandals": mandals,
        "matched": len(matched), "unmatched": unmatched,
        "fluorideMandals": len(fluoride),
        "fluorideTopMandals": [{"mandal": boundaries[i]["m"], "district": boundaries[i]["d"], "habitations": n} for n, i in top],
        "where": {
            "fluorideMedianDepthM": round(statistics.median(depth_f), 1) if depth_f else None,
            "otherMedianDepthM": round(statistics.median(depth_o), 1) if depth_o else None,
            "fluorideHardRockPct": round(100 * sum(rock_f) / len(rock_f)) if rock_f else None,
            "otherHardRockPct": round(100 * sum(rock_o) / len(rock_o)) if rock_o else None,
            "fluorideWithDepth": len(depth_f),
        },
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
    w = payload["where"]
    print(f"{len(matched)}/{len(rows)} blocks matched; unmatched {unmatched}")
    print(f"fluoride mandals {len(fluoride)}: median depth {w['fluorideMedianDepthM']} m vs {w['otherMedianDepthM']} m; "
          f"hard rock {w['fluorideHardRockPct']}% vs {w['otherHardRockPct']}%")


if __name__ == "__main__":
    sys.exit(main())
