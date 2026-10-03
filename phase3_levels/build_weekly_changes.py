"""What changed since the last published refresh, for the "This week" page.

Run inside the weekly refresh after every builder and before the commit, so the
files in the working tree are this week's and the files at HEAD are what the
site has been showing. Each headline is read from both and set side by side,
with the date each one is "as of": a reader sees what moved, by how much, and
whether either side is stale. Nothing is recomputed here; a number that is not
in a published file is not reported.
"""
import datetime
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "app", "data")
OUT = os.path.join(DATA, "weekly_changes.json")
CONTRACT_VERSION = "1.0.0"
MOVED_LIMIT = 40

FILES = {
    "water": "water_context_summary.json",
    "drought": "drought_watch_summary.json",
    "groundwater": "mandal_groundwater_records_v2.json",
    "monsoon": "monsoon_watch.json",
    "enso": "enso_outlook.json",
}
STATUS_RANK = {"stable": 0, "watch": 1, "stress": 2}


def current(name):
    try:
        with open(os.path.join(DATA, name)) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def published(name, ref="HEAD"):
    """The file as the site last published it: its version at HEAD."""
    try:
        text = subprocess.run(["git", "show", f"{ref}:app/data/{name}"], cwd=ROOT, capture_output=True,
                              text=True, check=True, timeout=60).stdout
        return json.loads(text)
    except (OSError, subprocess.SubprocessError, ValueError):
        return None


def head_commit():
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%h %cI"], cwd=ROOT, capture_output=True,
                             text=True, check=True, timeout=30).stdout.split()
        return {"commit": out[0], "committedAt": out[1]} if len(out) == 2 else None
    except (OSError, subprocess.SubprocessError):
        return None


def dig(node, *path):
    for key in path:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
    return node


def direction(before, after, better):
    """'better', 'worse' or 'same' given which way is better; None when either side is missing."""
    if before is None or after is None:
        return None
    if after == before:
        return "same"
    if better == "context":
        return "moved"
    return "better" if (after > before) == (better == "higher") else "worse"


def item(key, label, unit, better, href, before, after, before_as_of, after_as_of, note=None):
    out = {"key": key, "label": label, "unit": unit, "better": better, "href": href,
           "before": before, "after": after, "beforeAsOf": before_as_of, "afterAsOf": after_as_of,
           "change": round(after - before, 1) if isinstance(before, (int, float)) and isinstance(after, (int, float)) else None,
           "direction": direction(before, after, better),
           "refreshed": before_as_of != after_as_of if before_as_of and after_as_of else None}
    if note:
        out["note"] = note
    return out


def water_items(old, new):
    rain_as = (dig(old, "rain", "end"), dig(new, "rain", "end"))
    soil_as = (dig(old, "soil", "asOf"), dig(new, "soil", "asOf"))
    store_as = (dig(old, "reservoirs", "asOf"), dig(new, "reservoirs", "asOf"))
    return [
        item("rain", "Gauge rain against normal, water year to date", "%", "higher", "/climate/",
             dig(old, "rain", "deviationPct"), dig(new, "rain", "deviationPct"), *rain_as),
        item("soilBelow", "Mandals with soil drier than their usual for the date", "mandals", "lower", "/agriculture/",
             dig(old, "soil", "belowOwnMedian"), dig(new, "soil", "belowOwnMedian"), *soil_as),
        item("soilDriest", "Mandals at their driest on record for the date", "mandals", "lower", "/agriculture/",
             dig(old, "soil", "driestOnRecord"), dig(new, "soil", "driestOnRecord"), *soil_as),
        item("reservoirs", "Reservoir storage, share of capacity", "%", "higher", "/agriculture/",
             dig(old, "reservoirs", "storagePct"), dig(new, "reservoirs", "storagePct"), *store_as),
    ]


def drought_items(old, new):
    as_of = (dig(old, "season", "asOf"), dig(new, "season", "asOf"))
    counts = lambda d, k: dig(d, "state", "counts", k)  # noqa: E731
    return [
        item("trigger1", "Mandals meeting the drought manual's Trigger 1", "mandals", "lower", "/drought/",
             dig(old, "state", "trigger1"), dig(new, "state", "trigger1"), *as_of),
        item("droughtSevere", "Mandals reading severe on the manual's indicators", "mandals", "lower", "/drought/",
             counts(old, "severe"), counts(new, "severe"), *as_of),
        item("droughtModerate", "Mandals reading moderate", "mandals", "lower", "/drought/",
             counts(old, "moderate"), counts(new, "moderate"), *as_of),
    ]


def groundwater_rows(records):
    rows = {}
    for record in (records or {}).get("records", []):
        identity, assessment = record.get("identity") or {}, record.get("assessment") or {}
        rows[identity.get("mandalId")] = {
            "id": identity.get("mandalId"), "mandal": identity.get("mandalName"), "district": identity.get("districtName"),
            "status": assessment.get("monitoringStatus"), "month": dig(record, "observation", "observationPeriod"),
            "depth": dig(record, "observation", "latestMeasuredValue")}
    return rows


def groundwater_items(old, new):
    before, after = groundwater_rows(old), groundwater_rows(new)
    month = lambda rows: max((r["month"] for r in rows.values() if r["month"]), default=None)  # noqa: E731
    stress = lambda rows: sum(1 for r in rows.values() if r["status"] == "stress") if rows else None  # noqa: E731
    moved = []
    for key, row in after.items():
        was = before.get(key)
        if was and was["status"] != row["status"] and was["status"] in STATUS_RANK and row["status"] in STATUS_RANK:
            moved.append({"id": key, "mandal": row["mandal"], "district": row["district"], "from": was["status"],
                          "to": row["status"], "worse": STATUS_RANK[row["status"]] > STATUS_RANK[was["status"]]})
    moved.sort(key=lambda r: (not r["worse"], r["district"] or "", r["mandal"] or ""))
    items = [item("gwStress", "Mandals whose groundwater reads stress", "mandals", "lower", "/map/",
                  stress(before), stress(after), month(before), month(after))]
    summary = {"worse": sum(1 for r in moved if r["worse"]), "better": sum(1 for r in moved if not r["worse"]),
               "moved": moved[:MOVED_LIMIT], "truncated": len(moved) > MOVED_LIMIT,
               "latestMonth": {"before": month(before), "after": month(after)}}
    return items, summary


def enso_items(old, new):
    as_of = (dig(old, "issued"), dig(new, "issued"))
    return [item("ensoPeak", "NOAA's expected El Niño peak (median, °C above normal)", "°C", "context", "/monsoon/",
                 dig(old, "peak", "medianC"), dig(new, "peak", "medianC"), *as_of,
                 note=dig(new, "alert"))]


def build(load_before=published, load_after=current):
    old = {key: load_before(name) for key, name in FILES.items()}
    new = {key: load_after(name) for key, name in FILES.items()}
    gw_items, gw_summary = groundwater_items(old["groundwater"], new["groundwater"])
    items = (water_items(old["water"], new["water"]) + drought_items(old["drought"], new["drought"])
             + gw_items + enso_items(old["enso"], new["enso"]))
    drought_changes = dig(new["drought"], "state", "changes") or {"worse": [], "better": []}
    return {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "comparedWith": {"label": "the data the site was showing before this refresh", **(head_commit() or {})},
        "items": items,
        "groundwater": gw_summary,
        "drought": {"worse": drought_changes.get("worse", [])[:MOVED_LIMIT],
                    "better": drought_changes.get("better", [])[:MOVED_LIMIT],
                    "basis": "each mandal's manual reading now against the same reading one week of rain earlier"},
        "counts": {
            "better": sum(1 for i in items if i["direction"] == "better"),
            "worse": sum(1 for i in items if i["direction"] == "worse"),
            "same": sum(1 for i in items if i["direction"] == "same"),
            "unknown": sum(1 for i in items if i["direction"] is None),
        },
    }


def main():
    payload = build()
    with open(OUT + ".tmp", "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    os.replace(OUT + ".tmp", OUT)
    counts = payload["counts"]
    print(f"  weekly changes: {counts['better']} better, {counts['worse']} worse, {counts['same']} unchanged, "
          f"{counts['unknown']} without a previous value; groundwater {payload['groundwater']['worse']} mandals worse, "
          f"{payload['groundwater']['better']} better")
    return 0


if __name__ == "__main__":
    sys.exit(main())
