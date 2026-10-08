"""Summer drinking-water outlook: where the water table may stand next May, against each mandal's own record.

Bore wells and hand pumps fail when the water table drops below them, and it
drops most from the end of the monsoon to the end of May. This projects each
mandal's May depth from its latest APWRIMS reading and its own past winters:

- anchor: the latest monthly reading (APWRIMS mandal average, metres below ground);
- drawdown in each past year: the depth in the target May minus the depth in
  the anchor month of that year (August to May, say), from the same series;
- typical: anchor plus the median of those drawdowns; dry winter: anchor plus
  the largest one on record;
- the mandal's deepest May on record, from the same series.

Risk, against the mandal's own record, not a fixed depth (the depth at which a
well fails depends on how deep it was drilled, which no public record gives).
Beside it, whether the May depth would be deeper than 10 m, a class boundary
on CGWB's depth-to-water maps: a delta mandal can break its own record and
still have water three metres down.
- beyond its record: the typical projection is deeper than any May on record;
- in a dry winter: only the dry-winter projection is;
- within its record: neither is.

Tested before it is shown: every past year is projected from the other years'
winters alone (leave one year out) and set against the May that followed: how
far off the typical projection was, how often the May fell between the typical
and dry-winter projections or shallower, and how often a mandal named "beyond
its record" did go deeper than its earlier deepest May.

Output: app/data/summer_outlook.json. Weekly, after the APWRIMS history refresh.
"""
import collections
import csv
import datetime
import json
import os
import statistics
import sys
from series_quality import history_carried_forward  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

ROOT = os.path.join(HERE, "..")
HISTORY = os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")
CONTEXT = os.path.join(ROOT, "app", "data", "water_context.json")
GEOMETRY = os.path.join(ROOT, "app", "data", "ap_map_display.json")
OUT = os.path.join(ROOT, "app", "data", "summer_outlook.json")
POPULATION = os.path.join(HERE, "data", "mandal_population.json")
TARGET_MONTH = 5
MIN_WINTERS = 4          # past winters needed to project a mandal
DEEP_M = 10.0            # a class boundary on CGWB's depth-to-water maps (5-10 m / 10-20 m)
TIERS = ("beyond", "dry", "within")


def load_json(path):
    try:
        return json.load(open(path))
    except (OSError, ValueError):
        return None


def load_history(path=HISTORY):
    series = collections.defaultdict(dict)
    names = {}
    carried = set(history_carried_forward(path))
    for row in csv.DictReader(open(path)):
        if row["level_mbgl"] and row["date"] not in carried:
            series[row["mandal_uuid"]][row["date"]] = float(row["level_mbgl"])
            names[row["mandal_uuid"]] = (row["district"], row["mandal"])
    return series, names


def target_year(anchor):
    year, month = int(anchor[:4]), int(anchor[5:7])
    return year if month < TARGET_MONTH else year + 1


def drawdowns(series, anchor_month, skip_year=None):
    """{year: depth in the following May minus depth in the anchor month} over the series' own past years."""
    out = {}
    for date, depth in series.items():
        if date[5:] != anchor_month:
            continue
        year = int(date[:4])
        target = year if int(anchor_month) < TARGET_MONTH else year + 1
        may = series.get(f"{target}-{TARGET_MONTH:02d}")
        if may is not None and year != skip_year:
            out[year] = may - depth
    return out


def project(series, anchor, skip_year=None, before=None):
    """Typical and dry-winter May depths from the anchor reading, or None with too few past winters.
    `before` limits the record (deepest May, winters) to Mays before that year: what was known then."""
    depth = series.get(anchor)
    if depth is None:
        return None
    target = target_year(anchor)
    limit = before if before is not None else target
    past = {y: d for y, d in drawdowns(series, anchor[5:], skip_year).items()
            if (y if int(anchor[5:]) < TARGET_MONTH else y + 1) < limit}
    mays = [v for k, v in series.items() if k[5:] == f"{TARGET_MONTH:02d}" and int(k[:4]) < limit]
    if len(past) < MIN_WINTERS or not mays:
        return None
    # Rounded before the tier is set, so the published depths always reproduce the published tier.
    typical = round(depth + statistics.median(past.values()), 2)
    dry = round(depth + max(past.values()), 2)
    deepest = round(max(mays), 2)
    tier = "beyond" if typical > deepest else "dry" if dry > deepest else "within"
    return {"anchor": round(depth, 2), "typical": typical, "dry": dry, "deepestMay": deepest,
            "winters": len(past), "medianDrawdown": round(statistics.median(past.values()), 2), "maxDrawdown": round(max(past.values()), 2),
            "tier": tier}


def at_depth(result):
    """Deeper than DEEP_M in the projection that sets its tier: typical for "beyond", dry winter otherwise."""
    return (result["typical"] if result["tier"] == "beyond" else result["dry"]) >= DEEP_M


def backtest(all_series):
    """Each past year projected from the other years' winters and set against the May that followed."""
    errors, persistence, inside, rows = [], [], 0, 0
    by_year = collections.defaultdict(list)
    tier_n, tier_hit = collections.Counter(), collections.Counter()   # how often each tier's May went past its record
    for series in all_series.values():
        for date in series:
            if date[5:] != "08":
                continue
            year = int(date[:4])
            actual = series.get(f"{year + 1}-{TARGET_MONTH:02d}")
            if actual is None:
                continue
            result = project(series, date, skip_year=year, before=year + 1)
            if result is None:
                continue
            rows += 1
            error = actual - result["typical"]
            errors.append(abs(error))
            persistence.append(abs(actual - result["anchor"]))
            by_year[year + 1].append(error)
            inside += actual <= result["dry"]
            tier_n[result["tier"]] += 1
            tier_hit[result["tier"]] += actual > result["deepestMay"]
    if not rows:
        return None
    records = sum(tier_hit.values())
    return {
        "anchorMonth": "August", "comparisons": rows, "years": sorted(by_year),
        "typicalErrorM": round(statistics.median(errors), 2),
        "persistenceErrorM": round(statistics.median(persistence), 2),
        "withinDryPct": round(100 * inside / rows, 1),
        # Of the mandal-years in each tier, the share whose May went deeper than any earlier May; and the base rate.
        "pastRecordPct": {tier: round(100 * tier_hit[tier] / tier_n[tier], 1) if tier_n[tier] else None for tier in TIERS},
        "tierCounts": {tier: tier_n[tier] for tier in TIERS},
        "baseRatePct": round(100 * records / rows, 1),
        # Of the Mays that did set a new record, the share the outlook had flagged (beyond or dry winter).
        "recordsFlaggedPct": round(100 * (tier_hit["beyond"] + tier_hit["dry"]) / records, 1) if records else None,
        "byYear": [{"may": year, "comparisons": len(errs), "medianErrorM": round(statistics.median(errs), 2)} for year, errs in sorted(by_year.items())],
    }


def boundaries():
    context = json.load(open(CONTEXT))
    out = {}
    for section in ("soilMoisture", "rainfall"):
        for row in (context.get(section) or {}).get("mandals") or []:
            if row.get("boundaryIndex") is not None:
                out.setdefault(row["uuid"], row["boundaryIndex"])
    return out


def main():
    all_series, names = load_history()
    where = boundaries()
    count = len(json.load(open(GEOMETRY))["mandals"])
    anchor = max(max(s) for s in all_series.values())
    per_uuid = {}
    for uuid, series in all_series.items():
        # A mandal whose latest reading is older than the State's latest month is projected from its own latest.
        own = max(series)
        result = project(series, own)
        if result:
            per_uuid[uuid] = {**result, "anchorMonth": own}
    rank = {tier: i for i, tier in enumerate(TIERS)}
    by_boundary = [None] * count
    for uuid, result in per_uuid.items():
        index = where.get(uuid)
        if index is None or not 0 <= index < count:
            continue
        held = by_boundary[index]
        # Two APWRIMS mandals on one outline: keep the one closer to its record (the cautious reading).
        if held is None or (rank[result["tier"]], result["deepestMay"] - result["typical"]) < (rank[held["tier"]], held["deepestMay"] - held["typical"]):
            by_boundary[index] = {**result, "district": names[uuid][0], "mandal": names[uuid][1]}
    # Counted by outline, as the map draws them and as people are counted: one row per mandal on the map.
    features = json.load(open(GEOMETRY))["mandals"]
    people = (load_json(POPULATION) or {}).get("people") or [None] * count
    rows = [(i, r) for i, r in enumerate(by_boundary) if r]
    for i, r in rows:
        r["people"] = people[i] if i < len(people) else None
    tiers = collections.Counter(r["tier"] for _, r in rows)
    deep = collections.Counter(r["tier"] for _, r in rows if at_depth(r))
    lives = collections.Counter()
    districts = collections.defaultdict(lambda: collections.Counter())
    for i, result in rows:
        place = features[i]["d"]
        districts[place][result["tier"]] += 1
        n = people[i] or 0
        lives[result["tier"]] += n
        if result["tier"] != "within" and at_depth(result):
            districts[place]["deep"] += 1
            districts[place]["people"] += n
            lives[f"{result['tier']}Deep"] += n
    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "APWRIMS monthly groundwater level by mandal (Ground Water and Water Audit Department piezometers), metres below ground",
        "anchor": anchor, "targetMay": f"{target_year(anchor)}-{TARGET_MONTH:02d}",
        "firstYear": int(min(min(s) for s in all_series.values())[:4]),
        "method": "May depth = latest reading plus the mandal's own past drawdowns from the same month to May: typical = median, dry winter = largest on record. Risk against the deepest May on record in the same series.",
        "deepM": DEEP_M,
        "summary": {"mandals": len(rows), **{tier: tiers.get(tier, 0) for tier in TIERS},
                    "beyondDeep": deep.get("beyond", 0), "dryDeep": deep.get("dry", 0),
                    "series": len(per_uuid), "boundaries": len(rows)},
        # People living in those mandals (WorldPop 2020, build_mandal_population.py): who the outlook concerns.
        "people": {"source": (load_json(POPULATION) or {}).get("source"), "year": (load_json(POPULATION) or {}).get("year"),
                   "beyond": lives["beyond"], "beyondDeep": lives["beyondDeep"], "dry": lives["dry"], "dryDeep": lives["dryDeep"]}
        if people and any(people) else None,
        "backtest": backtest(all_series),
        # Districts by their at-risk mandals that would also be deeper than DEEP_M.
        "districts": sorted(({"district": d, **{t: c.get(t, 0) for t in TIERS}, "deep": c.get("deep", 0), "people": c.get("people", 0),
                              "mandals": sum(c.get(t, 0) for t in TIERS)} for d, c in districts.items()),
                            key=lambda r: (-r["deep"], -r["people"], r["district"])),
        "mandals": by_boundary,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"Summer outlook to {payload['targetMay']} from {anchor}: {payload['summary']}; backtest {payload['backtest']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
