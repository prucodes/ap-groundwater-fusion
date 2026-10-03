"""The State's own groundwater snapshot, beside our monthly series.

The AWARE groundwater feed in the AI Living Labs data lake carries, per state,
district and mandal: the monitoring stations behind it, the pre-monsoon (May)
and post-monsoon (November) levels, the level a year earlier and the current
level -- a single recent reading, not a monthly mean. Its pre-monsoon value is
the same department figure as our APWRIMS May reading (checked here per
mandal), so the current level is a month or so ahead of our series and is
shown beside it, never merged into it, and never fed to the model.

Reads data/raw/datalake/tables/groundwater_aggregatedreadings_api.json (from
fetch_datalake.py, run by a signed-in user); writes app/data/gw_state_snapshot.json.
"""
import collections
import csv
import datetime
import difflib
import json
import os
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw", "datalake", "tables", "groundwater_aggregatedreadings_api.json")
GEOMETRY = os.path.join(ROOT, "app", "data", "ap_map_geometry.json")
HISTORY = os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")
OUT = os.path.join(ROOT, "app", "data", "gw_state_snapshot.json")
SUMMARY_OUT = os.path.join(ROOT, "app", "data", "gw_state_summary.json")  # no mandal rows: safe for client pages
CONTRACT_VERSION = "1.0.0"
NAME_MATCH = 0.86   # difflib ratio for spelling variants within one district (Akividu / Akiveedu)

# The feed's district names against the names our boundaries use.
DISTRICTS = {"anantapuramu": "ananthapuramu", "konaseema": "konaseema", "manyam": "parvathipurammanyam",
             "spsnellore": "sripottisriramulunellore", "srisatyasai": "srisathyasai", "ysrkadapa": "ysrkadapa"}


def norm(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def number(value):
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None


def reading_date(egt):
    try:
        return datetime.datetime.fromtimestamp(int(egt) / 1000, datetime.timezone.utc).date().isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def district_key(name):
    key = norm(name)
    return DISTRICTS.get(key, key)


def our_series():
    """{(district, mandal) normalised: {month: level}} from the APWRIMS history."""
    series = collections.defaultdict(dict)
    with open(HISTORY) as handle:
        for row in csv.DictReader(handle):
            series[(norm(row["district"]), norm(row["mandal"]))][row["date"]] = float(row["level_mbgl"])
    return series


def our_name(name):
    """Our boundary names carry notes the feed does not: 'CHILAKALURIPET H/O.PURUSHOTH*', 'VIJAYAWADA (URBAN)'."""
    name = re.split(r"\s+h/o", name, flags=re.I)[0]
    return norm(re.sub(r"\((urban|rural)\)", "", name, flags=re.I))


def feed_name(name):
    """The feed splits towns into rural and urban halves our map draws as one."""
    return norm(re.sub(r"[_\s]*(\()?(rural|urban)(\))?\s*$", "", name, flags=re.I))


def closest(key, candidates):
    close = difflib.get_close_matches(key, list(candidates), n=2, cutoff=NAME_MATCH)
    if len(close) == 1 or (len(close) == 2 and difflib.SequenceMatcher(None, key, close[0]).ratio()
                           - difflib.SequenceMatcher(None, key, close[1]).ratio() > 0.05):
        return candidates[close[0]]
    return None


def match(name, district, index, statewide):
    """Our geometry key for a feed row: the name in its district (exactly, then
    the one close spelling), else the name anywhere in the state when only one
    mandal has it -- mandals moved district in the 2022 and later reorganisations."""
    candidates = index.get(district, {})
    for key in (norm(name), feed_name(name)):
        if key in candidates:
            return candidates[key], "district"
    found = closest(feed_name(name), candidates)
    if found:
        return found, "spelling"
    elsewhere = statewide.get(feed_name(name), [])
    if len(elsewhere) == 1:
        return elsewhere[0], "moved district"
    return None, None


def row_values(row):
    current, pre, prev = number(row.get("cl")), number(row.get("premonsoon")), number(row.get("prevyear"))
    return {
        "stations": int(number(row.get("nst")) or 0),
        "currentM": None if current is None else round(current, 2),
        "date": reading_date(row.get("egt")),
        "preMonsoonM": None if pre is None else round(pre, 2),
        "postMonsoonM": None if number(row.get("postmonsoon")) is None else round(number(row["postmonsoon"]), 2),
        "yearAgoM": None if prev is None else round(prev, 2),
        # Metres below ground: positive is deeper, i.e. the water table fell.
        "sinceMayM": None if current is None or pre is None else round(current - pre, 2),
        "vsYearAgoM": None if current is None or prev is None else round(current - prev, 2),
    }


def combine(parts):
    """Rural and urban halves as one polygon: levels weighted by stations (equal
    weights when none report a count), dates as the latest, stations summed."""
    if len(parts) == 1:
        return parts[0]
    weights = [p["stations"] or 0 for p in parts]
    if not any(weights):
        weights = [1] * len(parts)
    out = {"stations": sum(p["stations"] for p in parts),
           "date": max((p["date"] for p in parts if p["date"]), default=None)}
    for field in ("currentM", "preMonsoonM", "postMonsoonM", "yearAgoM"):
        pairs = [(p[field], w) for p, w in zip(parts, weights) if p[field] is not None and w]
        out[field] = round(sum(v * w for v, w in pairs) / sum(w for _, w in pairs), 2) if pairs else None
    out["sinceMayM"] = None if out["currentM"] is None or out["preMonsoonM"] is None else round(out["currentM"] - out["preMonsoonM"], 2)
    out["vsYearAgoM"] = None if out["currentM"] is None or out["yearAgoM"] is None else round(out["currentM"] - out["yearAgoM"], 2)
    return out


def build(records, geometry, series):
    index, statewide = collections.defaultdict(dict), collections.defaultdict(list)
    for feature in geometry:
        key = f'{feature["d"]}|{feature["m"]}'
        index[norm(feature["d"])][our_name(feature["m"])] = key
        statewide[our_name(feature["m"])].append(key)
    state = next((r for r in records if r.get("name") == "TOTAL"), None)
    districts = [r for r in records if r.get("pname") == "Andhra Pradesh"]
    mandal_rows = [r for r in records if r.get("pname") not in ("Andhra Pradesh", "", None) and r.get("name") != "TOTAL"]

    groups, how, unmatched = collections.defaultdict(list), {}, []
    for row in mandal_rows:
        key, why = match(row["name"], district_key(row["pname"]), index, statewide)
        if key is None:
            unmatched.append(f'{row["name"]} ({row["pname"]})')
            continue
        groups[key].append(row)
        how[key] = why

    mandals, same_may, compared = {}, 0, 0
    for key, rows in groups.items():
        values = combine([row_values(r) for r in rows])
        values["feedName"] = " + ".join(r["name"] for r in rows)
        values["matchedBy"] = how[key] if len(rows) == 1 else "rural and urban halves combined"
        d, m = key.split("|")
        ours = series.get((norm(d), norm(m)))
        if ours:
            may, latest_month = ours.get(f"{values['date'][:4]}-05") if values["date"] else None, max(ours)
            values["ourLatestMonth"] = latest_month
            values["ourLatestM"] = round(ours[latest_month], 2)
            if may is not None and values["preMonsoonM"] is not None:
                compared += 1
                same_may += abs(may - values["preMonsoonM"]) < 0.02
            if values["currentM"] is not None:
                values["vsOurLatestM"] = round(values["currentM"] - ours[latest_month], 2)
        mandals[key] = values

    dates = sorted(v["date"] for v in mandals.values() if v["date"])
    with_change = [v for v in mandals.values() if v["sinceMayM"] is not None]
    with_year = [v for v in mandals.values() if v["vsYearAgoM"] is not None]
    vs_ours = [v["vsOurLatestM"] for v in mandals.values() if v.get("vsOurLatestM") is not None]
    stations = collections.Counter(min(v["stations"], 4) for v in mandals.values())
    return {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "AP AWARE groundwater feed (groundwater_aggregatedreadings_api) via the AI Living Labs data lake",
        "kind": "measured-snapshot",
        "note": ("One recent reading per location from the State's monitoring network, not a monthly mean. "
                 "Shown beside our monthly series; not merged into it and not used by the model."),
        "readingDates": {"first": dates[0] if dates else None, "last": dates[-1] if dates else None,
                         "mostCommon": collections.Counter(dates).most_common(1)[0][0] if dates else None},
        "state": {**row_values(state), "stationsTotal": int(number(state.get("nst")) or 0)} if state else None,
        "summary": {
            "feedMandals": len(mandal_rows), "matched": len(mandals), "unmatched": unmatched,
            "preMonsoonComparable": compared, "preMonsoonSameAsOurMay": same_may,
            "deeperSinceMay": sum(v["sinceMayM"] > 0 for v in with_change), "withChange": len(with_change),
            "deeperThanYearAgo": sum(v["vsYearAgoM"] > 0 for v in with_year), "withYear": len(with_year),
            "medianVsOurLatestM": round(statistics.median(vs_ours), 2) if vs_ours else None,
            "stationsPerMandal": {("4+" if k == 4 else str(k)): n for k, n in sorted(stations.items())},
        },
        "districts": sorted(({"district": r["name"], **row_values(r)} for r in districts), key=lambda r: r["district"]),
        "mandals": mandals,
    }


TABLES = os.path.dirname(RAW)
# AWARE modules that speak to water and farming; their advisory and alert counts
# are statewide totals with no place or date attached.
WATER_MODULES = ("GROUNDWATER", "DRY_SPELL", "RAINFALL", "RESERVOIR", "RESERVOIR_RELEASES", "EL_NINO",
                 "CROP_HEALTH", "PEST_STRESS", "HEAT_WATCH", "FLOOD_WARNING")


def official_bands():
    """The department's own depth bands (ground_water_category), shallow to deep."""
    path = os.path.join(TABLES, "ground_water_category.json")
    if not os.path.exists(path):
        return None
    bands = []
    for row in json.load(open(path))["records"]:
        low, high = number(row.get("min_value")), number(row.get("max_value"))
        if low is None or high is None or low < 0:
            continue
        bands.append({"label": row["label"], "min": low, "max": high, "color": row.get("colorcode"),
                      "alert": str(row.get("send_alert")).lower() == "true"})
    return sorted(bands, key=lambda b: b["min"])


def band_for(depth, bands):
    for band in bands or []:
        if band["min"] <= depth < band["max"] or (band["max"] >= 1000 and depth >= band["min"]):
            return band["label"]
    return None


def aware_modules():
    path = os.path.join(TABLES, "gw_modulecounts_api.json")
    if not os.path.exists(path):
        return None
    rows = {r["module_name"]: r for r in json.load(open(path))["records"]}
    return [{"module": name, "advisories": int(number(rows[name]["advisory"]) or 0),
             "alerts": int(number(rows[name]["alert"]) or 0)} for name in WATER_MODULES if name in rows]


def main():
    if not os.path.exists(RAW):
        sys.exit(f"No data lake extract at {RAW}; run fetch_datalake.py first (signed in).")
    records = json.load(open(RAW))["records"]
    payload = build(records, json.load(open(GEOMETRY))["mandals"], our_series())
    bands = official_bands()
    if bands:
        payload["officialBands"] = bands
        for row in payload["mandals"].values():
            row["band"] = band_for(row["currentM"], bands) if row["currentM"] is not None else None
        if payload["state"] and payload["state"]["currentM"] is not None:
            payload["state"]["band"] = band_for(payload["state"]["currentM"], bands)
        counts = collections.Counter(row["band"] for row in payload["mandals"].values() if row.get("band"))
        payload["summary"]["byOfficialBand"] = {b["label"]: counts.get(b["label"], 0) for b in bands}
    payload["awareModules"] = aware_modules()
    with open(OUT + ".tmp", "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    os.replace(OUT + ".tmp", OUT)
    digest = {key: value for key, value in payload.items() if key != "mandals"}
    digest["summary"] = {key: value for key, value in payload["summary"].items() if key != "unmatched"}
    with open(SUMMARY_OUT, "w") as handle:
        json.dump(digest, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    s = payload["summary"]
    print(f"  State snapshot {payload['readingDates']['first']}..{payload['readingDates']['last']}: "
          f"{s['matched']}/{s['feedMandals']} mandals matched; May same as ours {s['preMonsoonSameAsOurMay']}/{s['preMonsoonComparable']}; "
          f"deeper than May {s['deeperSinceMay']}/{s['withChange']}; deeper than a year ago {s['deeperThanYearAgo']}/{s['withYear']}; "
          f"median vs our latest {s['medianVsOurLatestM']:+.2f} m; unmatched {len(s['unmatched'])}: {s['unmatched'][:12]}")


if __name__ == "__main__":
    main()
