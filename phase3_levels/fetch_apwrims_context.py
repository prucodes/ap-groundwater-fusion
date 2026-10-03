"""Soil moisture, gauge rainfall and reservoir storage from APWRIMS: the water context beside the groundwater.

The groundwater history (fetch_apwrims_history.py) is one of several public
dashboards on the same Andhra Pradesh water portal. Three more answer questions
the Agriculture page could previously only mark "not connected":

- Soil moisture: the portal's per-mandal copy of the NRSC VIC land-surface
  model at 0.05 degrees -- plant-available water in the top 5, 30, 100 and
  150 cm, as a percentage of what that soil can hold. A model, not a probe in
  a field. Each mandal is set against the same calendar day in earlier years.
- Gauge rainfall: the AP Directorate of Economics and Statistics mandal
  rain-gauge network, against the department's own normal for the same window.
  The window is the water year to date, 1 June onward -- the portal computes it
  that way whatever start date is requested.
- Reservoirs: storage, inflow and outflow at every major and medium reservoir,
  and the release into each canal or other outlet, measured at the headworks.
  A release is not water delivered to a mandal: the canal-to-command-area map
  that would say which mandals a canal reaches is not public.

These are the endpoints behind the public dashboards, with the same
authorisation-pending status as the groundwater pull: technically open is not
the same as approved for bulk use. So the whole state comes in about twenty
requests, with a pause between each.

Outputs app/data/water_context.json and data/refresh_receipts/apwrims_context.json.
A feed that fails, or answers with far fewer mandals or reservoirs than it
should, keeps its previous section. Every section carries its own as-of date,
so a retained one shows its age instead of passing for current.
"""
import datetime
import hashlib
import json
import os
import re
import statistics
import sys
import time
from collections import Counter, defaultdict

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_apwrims_history import AP_STATE_UUID, BASE, post  # same portal client: verified TLS, bounded retries
from build_levels_engine import resolve_locations  # same boundary reconciliation as the groundwater

APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(APP, "water_context.json")
SUMMARY_OUT = os.path.join(APP, "water_context_summary.json")
MANDALS_OUT = os.path.join(APP, "water_context_mandals.json")
RECEIPT = os.path.join(HERE, "..", "data", "refresh_receipts", "apwrims_context.json")
CONTRACT_VERSION = "1.0.0"
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
PAUSE_S = 1.0

SOIL_DEPTHS_CM = (5, 30, 100, 150)
# 30 cm is the root zone of most field crops in their first weeks, and the
# depth the portal itself headlines.
HEADLINE_DEPTH_CM = 30
# The earliest year asked for when building a same-date baseline. Years the
# portal has nothing for are skipped, and recorded as skipped.
SOIL_FIRST_YEAR = 2014
MIN_BASELINE_YEARS = 5
# The portal answers a date after its latest model run with that run's values,
# so the real date is found by stepping back until the values change.
AS_OF_LOOKBACK_DAYS = 10
# Gauges report late; the newest days are left to settle before they count.
RAIN_SETTLE_DAYS = 2
# Below these, a response is a truncated or failed one, not the state.
MIN_MANDALS = 600
MIN_RESERVOIRS = 100
TOTALS_TOLERANCE = 0.005
# A reservoir whose latest reading is this much older than the newest is flagged.
STALE_AFTER_DAYS = 3
# Lists written one item per line: compact, and a weekly diff reads row by row.
LINE_LISTS = ("mandals", "reservoirs", "upstreamOutsideAp")

SOIL_URL = BASE + "/mis/soilmoisture"
RAIN_URL = BASE + "/mis/rainfall"
RESERVOIR_URL = BASE + "/mis/reservoir"


def pause():
    time.sleep(PAUSE_S)


def round_or_none(value, digits=1):
    return None if value is None else round(float(value), digits)


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value == value


def same_day(year, month, day):
    """The same calendar day in another year; 29 February becomes the 28th."""
    try:
        return datetime.date(year, month, day)
    except ValueError:
        return datetime.date(year, month, 28)


# --- location tree and boundaries ------------------------------------------

def location_tree():
    """{mandal uuid: (district, mandal)} for Andhra Pradesh, in two requests."""
    raw = post("/api/locations/allChildrenForParentChildType",
               {"pType": "STATE", "cType": "DISTRICT", "loc": [AP_STATE_UUID]})
    districts = {x["locationUUID"]: x["locationName"] for x in raw.get(AP_STATE_UUID, [])}
    if not districts:
        raise RuntimeError("APWRIMS returned no Andhra Pradesh districts")
    pause()
    raw = post("/api/locations/allChildrenForParentChildType",
               {"pType": "DISTRICT", "cType": "MANDAL", "loc": list(districts)})
    tree = {}
    for parent, children in raw.items():
        for child in children:
            tree[child["locationUUID"]] = (districts.get(parent), child["locationName"])
    if len(tree) < MIN_MANDALS:
        raise RuntimeError(f"location tree has {len(tree)} mandals, expected about 690")
    return tree


def boundaries_for(tree):
    """{uuid: (boundary index, how it was matched)}, exact or reviewed alias only.

    The district-centroid fallback the model uses is not a boundary, so a mandal
    that only reaches its district keeps no index here and is not mapped.
    """
    frame = pd.DataFrame([{"mandal_uuid": uid, "district": district, "mandal": mandal}
                          for uid, (district, mandal) in tree.items() if district and mandal])
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    _, basis, index = resolve_locations(frame, geo)
    return {uid: (int(index[uid]), basis[uid]) for uid in index}


def identity(uid, name, tree, boundaries):
    district, mandal = tree.get(uid, (None, name))
    boundary, match = boundaries.get(uid, (None, None))
    return {"uuid": uid, "district": district, "mandal": mandal or name,
            "boundaryIndex": boundary, "boundaryMatch": match}


# --- soil moisture -----------------------------------------------------------

def soil_table(day):
    """{uuid: {"name", "pct": [5, 30, 100, 150 cm]}} for the whole state on one day."""
    rows = post("/api/v2/sm/table", {
        "sUUID": AP_STATE_UUID, "format": "yyyyMMdd", "cType": "MANDAL", "pUUID": AP_STATE_UUID,
        "currentdate": day.strftime("%Y%m%d"), "view": "ADMIN", "pType": "STATE", "src": "NRSC_0.05"})
    out = {}
    for row in rows if isinstance(rows, list) else []:
        values = row.get("soilMoistureDataMap") or {}
        pct = [(values.get(f"current{depth}") or {}).get("availableSoilMoisturePercent") for depth in SOIL_DEPTHS_CM]
        if row.get("locationUUID") and all(number(value) for value in pct):
            out[row["locationUUID"]] = {"name": row.get("locationName"), "pct": [float(value) for value in pct]}
    return out


def fingerprint(snapshot):
    items = sorted((uid, tuple(round(value, 6) for value in row["pct"])) for uid, row in snapshot.items())
    return hashlib.sha256(json.dumps(items).encode()).hexdigest()


def soil_as_of(today, fetch):
    """Today's answer, and the date it really describes.

    Dates after the latest model run are answered with that run's values, so the
    run date is the earliest day, stepping back, whose answer is still the same.
    None when nothing changed across the whole lookback: the date is then unknown.
    """
    latest = fetch(today)
    if len(latest) < MIN_MANDALS:
        raise RuntimeError(f"soil moisture answered for {len(latest)} mandals, expected about 690")
    mark = fingerprint(latest)
    for back in range(1, AS_OF_LOOKBACK_DAYS + 1):
        pause()
        if fingerprint(fetch(today - datetime.timedelta(days=back))) != mark:
            return latest, today - datetime.timedelta(days=back - 1)
    return latest, None


def baseline_years(as_of, fetch, first_year=SOIL_FIRST_YEAR):
    """{year: snapshot} for the same day in each earlier year the portal has.

    A year whose answer is identical to another year's is a fill, not a model
    run, and every copy of it is dropped.
    """
    snapshots, skipped = {}, []
    for year in range(first_year, as_of.year):
        pause()
        snapshot = fetch(same_day(year, as_of.month, as_of.day))
        if len(snapshot) < MIN_MANDALS // 2:
            skipped.append(year)
            continue
        snapshots[year] = snapshot
    marks = {}
    for year, snapshot in snapshots.items():
        marks.setdefault(fingerprint(snapshot), []).append(year)
    duplicated = sorted(year for years in marks.values() if len(years) > 1 for year in years)
    for year in duplicated:
        del snapshots[year]
    return snapshots, skipped, duplicated


def baseline_stats(current, past):
    """Where today's value sits among the same day in earlier years."""
    if len(past) < MIN_BASELINE_YEARS:
        return None
    return {
        "years": len(past),
        "median": round(statistics.median(past), 1),
        "min": round(min(past), 1),
        "max": round(max(past), 1),
        # 1 is the driest of every year on record for this date, this one included.
        "rankDriest": 1 + sum(1 for value in past if value < current),
        "ofYears": len(past) + 1,
    }


def build_soil(today, tree, boundaries, fetch=soil_table):
    latest, as_of = soil_as_of(today, fetch)
    reference = as_of or today
    pause()
    week_ago = fetch(reference - datetime.timedelta(days=7))
    past, skipped, duplicated = baseline_years(reference, fetch)
    depth = SOIL_DEPTHS_CM.index(HEADLINE_DEPTH_CM)
    mandals = []
    for uid, row in latest.items():
        current = row["pct"][depth]
        history = [snapshot[uid]["pct"][depth] for snapshot in past.values() if uid in snapshot]
        mandals.append({
            **identity(uid, row["name"], tree, boundaries),
            "pct": [round(value, 1) for value in row["pct"]],
            "weekAgoPct": round_or_none(week_ago[uid]["pct"][depth]) if uid in week_ago else None,
            "baseline": baseline_stats(current, history),
        })
    mandals.sort(key=lambda m: (m["district"] or "~", m["mandal"]))
    headline = [m["pct"][depth] for m in mandals]
    ranked = [m for m in mandals if m["baseline"]]
    years = sorted(past)
    return {
        "source": "APWRIMS soil moisture dashboard: NRSC VIC land-surface model, 0.05 degrees",
        "url": SOIL_URL,
        "kind": "modelled",
        "measure": "Available soil moisture: plant-available water held to each depth, as % of what that soil can hold",
        "asOf": as_of.isoformat() if as_of else None,
        "asOfNote": None if as_of else f"Values unchanged since at least {(today - datetime.timedelta(days=AS_OF_LOOKBACK_DAYS)).isoformat()}; run date unconfirmed.",
        "weekAgo": (reference - datetime.timedelta(days=7)).isoformat(),
        "depthsCm": list(SOIL_DEPTHS_CM),
        "headlineDepthCm": HEADLINE_DEPTH_CM,
        "baseline": {
            "rule": "the same calendar day in each earlier year the portal holds",
            "firstYear": years[0] if years else None,
            "lastYear": years[-1] if years else None,
            "minYears": MIN_BASELINE_YEARS,
            "yearsSkippedEmpty": skipped,
            "yearsDroppedAsDuplicates": duplicated,
        },
        "summary": {
            "mandals": len(mandals),
            "mapped": sum(1 for m in mandals if m["boundaryIndex"] is not None),
            "withBaseline": len(ranked),
            "medianPct": round(statistics.median(headline), 1) if headline else None,
            "driestOnRecord": sum(1 for m in ranked if m["baseline"]["rankDriest"] == 1),
            "belowOwnMedian": sum(1 for m in ranked if m["pct"][depth] < m["baseline"]["median"]),
        },
        "mandals": mandals,
    }


# --- gauge rainfall ----------------------------------------------------------

def water_year_start(day):
    return datetime.date(day.year if day.month >= 6 else day.year - 1, 6, 1)


def rain_category(actual, normal):
    """IMD's departure bands, with the names the AP portal uses."""
    if not number(actual) or not number(normal) or normal <= 0:
        return None
    if actual == 0:
        return "noRain"
    # Rounded as published, so 80 mm against 100 mm is -20% and deficient,
    # not -19.999...% and normal.
    departure = round(100 * (actual / normal - 1), 1)
    if departure >= 20:
        return "excess"
    if departure > -20:
        return "normal"
    if departure > -60:
        return "deficient"
    return "scanty"


def rainfall_table(start, end, child="MANDAL"):
    return post("/api/rf/rfTable", {
        "aggr": "SUM", "component": "rainfall", "summary": True, "sUUID": AP_STATE_UUID,
        "format": "yyyyMMdd", "pDate": "2018", "src": "DES_MANDAL", "eDate": end.strftime("%Y%m%d"),
        "cType": child, "pUUID": AP_STATE_UUID, "sDate": start.strftime("%Y%m%d"), "view": "ADMIN",
        "lType": "STATE", "timePeriod": "monsoon"})


def district_rainfall(rows):
    """The department's own district figures for the same window, TOTAL row aside."""
    out = []
    for row in rows if isinstance(rows, list) else []:
        season = (row.get("responseMap") or {}).get("monm") or {}
        actual, normal = season.get("actual"), season.get("normal")
        name = str(row.get("locName") or "")
        if name.upper() == "TOTAL" or not (number(actual) and number(normal) and normal > 0):
            continue
        out.append({"district": name, "actualMm": round(float(actual), 1), "normalMm": round(float(normal), 1),
                    "deviationPct": round(100 * (actual / normal - 1), 1), "category": rain_category(actual, normal),
                    "rainyDays": season.get("rd"), "gauges": season.get("nst")})
    return sorted(out, key=lambda d: d["deviationPct"])


def build_rainfall(today, tree, boundaries, fetch=rainfall_table):
    end = today - datetime.timedelta(days=RAIN_SETTLE_DAYS)
    start = water_year_start(end)
    rows = fetch(start, end)
    pause()
    districts = district_rainfall(fetch(start, end, "DISTRICT"))
    if not isinstance(rows, list) or len(rows) < MIN_MANDALS:
        raise RuntimeError(f"gauge rainfall answered for {len(rows) if isinstance(rows, list) else 0} mandals")
    month_end = end.replace(day=1) - datetime.timedelta(days=1)
    # The statewide answer ends with the portal's own TOTAL row. It is not a
    # mandal; it is kept aside to check our sums against.
    portal_total = next(((r.get("responseMap") or {}).get("monm") or {} for r in rows
                         if str(r.get("locUuid")).upper() == "TOTAL"), {})
    rows = [r for r in rows if str(r.get("locUuid")).upper() != "TOTAL" and str(r.get("locName")).upper() != "TOTAL"]
    mandals, volume, normal_volume, gauges = [], 0.0, 0.0, 0
    for row in rows:
        season = (row.get("responseMap") or {}).get("monm") or {}
        last_month = (row.get("responseMap") or {}).get("l1m") or {}
        actual, normal = season.get("actual"), season.get("normal")
        if not (number(actual) and number(normal) and normal > 0):
            continue
        if number(season.get("rfs")) and number(season.get("rfns")):
            volume += season["rfs"]
            normal_volume += season["rfns"]
        gauges += int(season.get("nst") or 0)
        mandals.append({
            **identity(row.get("locUuid"), row.get("locName"), tree, boundaries),
            "lgdCode": row.get("lgdCode"),
            "actualMm": round(float(actual), 1),
            "normalMm": round(float(normal), 1),
            "deviationPct": round(100 * (actual / normal - 1), 1),
            "category": rain_category(actual, normal),
            "rainyDays": season.get("rd"),
            "gauges": season.get("nst"),
            "lastMonth": {"actualMm": round_or_none(last_month.get("actual")),
                          "normalMm": round_or_none(last_month.get("normal"))},
        })
    if len(mandals) < MIN_MANDALS:
        raise RuntimeError(f"gauge rainfall had usable values for {len(mandals)} mandals")
    if number(portal_total.get("rfs")) and abs(volume - portal_total["rfs"]) > TOTALS_TOLERANCE * max(portal_total["rfs"], 1):
        raise RuntimeError(f"mandal rainfall volumes sum to {volume:.1f} TMC; the portal's total says {portal_total['rfs']:.1f}")
    mandals.sort(key=lambda m: (m["district"] or "~", m["mandal"]))
    categories = {name: sum(1 for m in mandals if m["category"] == name)
                  for name in ("excess", "normal", "deficient", "scanty", "noRain")}
    return {
        "source": "APWRIMS rainfall dashboard: AP Directorate of Economics and Statistics mandal rain gauges",
        "url": RAIN_URL,
        "kind": "measured",
        "window": {"start": start.isoformat(), "end": end.isoformat(), "label": "water year to date",
                   "lastMonth": month_end.strftime("%Y-%m")},
        "normalBasis": "the department's published normal for each mandal over the same window",
        "categoryRule": "departure from normal: excess >= +20%, normal -19 to +19%, deficient -20 to -59%, scanty -60 to -99%, no rain",
        "state": {
            "actualTmc": round(volume, 1),
            "normalTmc": round(normal_volume, 1),
            # Area-weighted: rainfall volume over normal volume. The portal's own
            # headline divides a mandal-average actual by a district-average
            # normal, two different averages, and reads several points drier.
            "deviationPct": round(100 * (volume / normal_volume - 1), 1) if normal_volume else None,
            "basis": "area-weighted: total rainfall volume against total normal volume",
            "gauges": gauges,
        },
        "categories": categories,
        "summary": {"mandals": len(mandals), "mapped": sum(1 for m in mandals if m["boundaryIndex"] is not None)},
        "districts": districts,
        "mandals": mandals,
    }


# --- reservoirs --------------------------------------------------------------

# Outlet names as the portal writes them, folded to lower case. Anything not
# named here is a canal or another off-take, and is reported as one.
NOT_RELEASES = {"inflow from catchment", "inflow_split"}
OUTLET_KINDS = {
    "spill": {"spillway", "surplus_weir", "surplus weir", "crest / river sluice"},
    "river": {"river", "river sluice"},
    "losses": {"losses", "evaporation losses"},
    "drinking": {"drinking"},
    "industry": {"industries", "ucil", "rtpp"},
    "power": {"power house", "powerhouse1", "powerhouse2"},
}


def outlet_kind(name):
    folded = name.strip().lower()
    for kind, names in OUTLET_KINDS.items():
        if folded in names:
            return kind
    return "canal"


def outlets(splits, reservoir):
    """Each named release at the headworks, in cusecs, inflows excluded."""
    prefix = f"{reservoir}-".lower()
    out = []
    for key, value in (splits or {}).items():
        name = key[len(prefix):] if key.lower().startswith(prefix) else key
        if name.strip().lower() in NOT_RELEASES or not number(value):
            continue
        out.append({"outlet": name.strip(), "kind": outlet_kind(name), "cusecs": round(float(value), 1)})
    return sorted(out, key=lambda o: (-o["cusecs"], o["outlet"]))


def observed_at(epoch_ms):
    if not number(epoch_ms):
        return None
    return datetime.datetime.fromtimestamp(epoch_ms / 1000, IST).isoformat(timespec="minutes")


def share(part, whole):
    return round(100 * part / whole, 1) if number(part) and number(whole) and whole else None


def basin_name(value):
    name = str(value or "").strip().upper()
    return "OTHERS" if name in ("OTHER", "OTHERS", "") else name


def reservoir_row(item, kind):
    data = item.get("reservoirDataMap") or {}
    now, last_year = data.get("current") or {}, data.get("previousYearCurrent") or {}
    monsoon_start = data.get("currentMonsoonStart") or {}
    capacity = item.get("totalCapacity1")
    return {
        "name": item.get("locationName"),
        "type": kind,
        "district": item.get("locationDistrictName"),
        "basin": basin_name(item.get("basin")),
        "capacityTmc": round_or_none(capacity, 3),
        "storageTmc": round_or_none(now.get("totalStorage1"), 3),
        "storagePct": share(now.get("totalStorage1"), capacity),
        "lastYearStorageTmc": round_or_none(last_year.get("totalStorage1"), 3),
        "lastYearPct": share(last_year.get("totalStorage1"), capacity),
        "monsoonStartStorageTmc": round_or_none(monsoon_start.get("totalStorage1"), 3),
        "inflowCusecs": round_or_none(now.get("totalInFlow1")),
        "outflowCusecs": round_or_none(now.get("totalOutFlow1")),
        "observedAt": observed_at(now.get("eventGenTs")),
        "releases": outlets(now.get("splitsDataMap"), item.get("locationName") or ""),
    }


def totals(rows):
    def total(key):
        return round(sum(row[key] for row in rows if number(row[key])), 3)
    capacity, storage, last_year = total("capacityTmc"), total("storageTmc"), total("lastYearStorageTmc")
    return {"count": len(rows), "capacityTmc": capacity, "storageTmc": storage, "storagePct": share(storage, capacity),
            "lastYearStorageTmc": last_year, "lastYearPct": share(last_year, capacity),
            "monsoonStartStorageTmc": total("monsoonStartStorageTmc")}


def reservoir_component(day):
    stamp = day.strftime("%Y%m%d")
    return post("/api/wateraudit/data/component", {"data": {
        "page": "waterbalance", "component": "RESERVOIR", "period": "MONSOON", "view": "Admin",
        "locations": [], "locType": "State", "startDate": stamp, "endDate": stamp}})


def check_against_portal(rows, portal_total, kind):
    """Our storage sums must match the portal's own totals for the same reservoirs.

    Storage now and a year ago, not capacity: the portal's total block carries a
    medium-reservoir capacity (86.5 TMC on 2026-10-02) that disagrees with its own
    displayed table and with the sum of its reservoirs (91.986 TMC), while both
    storage figures agree to the litre.
    """
    data = (portal_total or {}).get("reservoirDataMap") or {}
    for label, ours, theirs in (
            ("storage", sum(r["storageTmc"] or 0 for r in rows), (data.get("current") or {}).get("totalStorage1")),
            ("last-year storage", sum(r["lastYearStorageTmc"] or 0 for r in rows),
             (data.get("previousYearCurrent") or {}).get("totalStorage1"))):
        if not number(theirs) or abs(ours - theirs) > TOTALS_TOLERANCE * max(abs(theirs), 1):
            raise RuntimeError(f"{kind} reservoirs' {label} sums to {ours:.3f} TMC; the portal's total says {theirs}")


def build_reservoirs(today, fetch=reservoir_component):
    raw = fetch(today)
    if not isinstance(raw, dict):
        raise RuntimeError("reservoir dashboard returned no data")
    rows = []
    for kind in ("major", "medium"):
        part = [reservoir_row(item, kind) for item in raw.get(kind) or []]
        check_against_portal(part, (raw.get("Total") or {}).get(kind), kind)
        rows += part
    if len(rows) < MIN_RESERVOIRS:
        raise RuntimeError(f"{len(rows)} reservoirs returned, expected about 110")
    upstream = [reservoir_row(item, "outside_ap") for item in raw.get("outside_ap") or []]
    stamps = sorted(row["observedAt"] for row in rows if row["observedAt"])
    newest = datetime.datetime.fromisoformat(stamps[-1]) if stamps else None
    for row in rows + upstream:
        # A reservoir whose last reading is days older than the rest is still
        # counted in the totals the portal shows, but it is marked as such.
        seen = datetime.datetime.fromisoformat(row["observedAt"]) if row["observedAt"] else None
        row["stale"] = seen is None or (newest is not None and newest - seen > datetime.timedelta(days=STALE_AFTER_DAYS))
    basins = sorted({row["basin"] for row in rows})
    rows.sort(key=lambda row: (-(row["capacityTmc"] or 0), row["name"] or ""))
    return {
        "source": "APWRIMS reservoir dashboard: Water Resources Department telemetry and reports",
        "url": RESERVOIR_URL,
        "kind": "measured",
        "asOf": stamps[-1] if stamps else None,
        "oldestObservation": stamps[0] if stamps else None,
        "units": {"storage": "TMC (thousand million cubic feet)", "flow": "cusecs"},
        "releaseNote": ("Releases are measured where water leaves the reservoir. Which mandals a canal reaches, "
                        "and how much arrives, needs the canal command-area map, which is not public."),
        "staleAfterDays": STALE_AFTER_DAYS,
        "staleCount": sum(1 for row in rows if row["stale"]),
        "state": totals(rows),
        "byType": [{"type": kind, **totals([row for row in rows if row["type"] == kind])} for kind in ("major", "medium")],
        "byBasin": sorted(({"basin": basin, **totals([row for row in rows if row["basin"] == basin])} for basin in basins),
                          key=lambda b: -b["capacityTmc"]),
        "reservoirs": rows,
        "upstreamOutsideAp": sorted(upstream, key=lambda row: -(row["capacityTmc"] or 0)),
    }


# --- the browser-safe digest -----------------------------------------------------

def district_key(name):
    return re.sub(r"[^A-Z0-9]", "", str(name or "").upper())


def unique_by_boundary(rows):
    """{boundary index: row}, leaving out any boundary two rows claim: ambiguous, so neither is shown."""
    claims = Counter(row["boundaryIndex"] for row in rows if row.get("boundaryIndex") is not None)
    return {row["boundaryIndex"]: row for row in rows
            if row.get("boundaryIndex") is not None and claims[row["boundaryIndex"]] == 1}


def mandal_values(payload, geometry):
    """Per-mandal map values, keyed "DISTRICT|MANDAL" as the map layers are.

    A key the prototype geometry repeats is left out rather than given to the
    wrong polygon, and so is a boundary two source rows claim.
    """
    soil, rain = payload.get("soilMoisture"), payload.get("rainfall")
    depth = soil["depthsCm"].index(soil["headlineDepthCm"]) if soil else None
    keys = [f"{feature['d']}|{feature['m']}" for feature in geometry["mandals"]]
    repeated = {key for key, count in Counter(keys).items() if count > 1}
    soil_rows = unique_by_boundary((soil or {}).get("mandals") or [])
    rain_rows = unique_by_boundary((rain or {}).get("mandals") or [])
    values = {}
    for index, key in enumerate(keys):
        s, r = soil_rows.get(index), rain_rows.get(index)
        if key in repeated or not (s or r):
            continue
        base = (s or {}).get("baseline") or {}
        values[key] = [r["deviationPct"] if r else None, s["pct"][depth] if s else None,
                       base.get("rankDriest"), base.get("ofYears")]
    return {
        "fields": ["rainDeviationPct", "soilPct", "soilRankDriest", "soilOfYears"],
        "rain": {"start": rain["window"]["start"], "end": rain["window"]["end"]} if rain else None,
        "soil": {"asOf": soil["asOf"], "depthCm": soil["headlineDepthCm"]} if soil else None,
        "values": values,
    }


def summarize(payload):
    """The state and district digest client-side pages read: a few kilobytes,
    derived from the payload alone. The full file is read only on the server."""
    soil, rain, store = payload.get("soilMoisture"), payload.get("rainfall"), payload.get("reservoirs")
    depth = soil["depthsCm"].index(soil["headlineDepthCm"]) if soil else None
    districts = {}

    def entry(name):
        return districts.setdefault(district_key(name), {"district": name, "key": district_key(name)})

    for row in (rain or {}).get("districts") or []:
        entry(row["district"])["rain"] = {key: row[key] for key in ("actualMm", "normalMm", "deviationPct", "category")}
    if soil:
        grouped = defaultdict(list)
        for row in soil["mandals"]:
            if row["district"]:
                grouped[row["district"]].append(row)
        for name, rows in grouped.items():
            ranked = [row for row in rows if row["baseline"]]
            entry(name)["soil"] = {
                "mandals": len(rows), "medianPct": round(statistics.median(row["pct"][depth] for row in rows), 1),
                "withBaseline": len(ranked),
                "belowOwnMedian": sum(1 for row in ranked if row["pct"][depth] < row["baseline"]["median"]),
                "driestOnRecord": sum(1 for row in ranked if row["baseline"]["rankDriest"] == 1),
            }
    if store:
        grouped = defaultdict(list)
        for row in store["reservoirs"]:
            grouped[row["district"] or "Unknown"].append(row)
        for name, rows in grouped.items():
            total = totals(rows)
            entry(name)["reservoirs"] = {key: total[key] for key in ("count", "capacityTmc", "storageTmc", "storagePct", "lastYearPct")}

    return {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": payload.get("generatedAt"),
        "authorizationStatus": payload.get("authorizationStatus"),
        "rain": {
            "start": rain["window"]["start"], "end": rain["window"]["end"], "deviationPct": rain["state"]["deviationPct"],
            "gauges": rain["state"]["gauges"], "mandals": rain["summary"]["mandals"], "categories": rain["categories"],
            "url": rain["url"],
        } if rain else None,
        "soil": {
            "asOf": soil["asOf"], "weekAgo": soil["weekAgo"], "depthCm": soil["headlineDepthCm"],
            "firstYear": soil["baseline"]["firstYear"], "lastYear": soil["baseline"]["lastYear"], "url": soil["url"],
            **{key: soil["summary"][key] for key in ("mandals", "medianPct", "belowOwnMedian", "withBaseline", "driestOnRecord")},
        } if soil else None,
        "reservoirs": {
            "asOf": store["asOf"], "staleCount": store["staleCount"], "url": store["url"],
            **{key: store["state"][key] for key in ("count", "capacityTmc", "storageTmc", "storagePct", "lastYearPct")},
            "byBasin": [{key: basin[key] for key in ("basin", "capacityTmc", "storagePct", "lastYearPct")} for basin in store["byBasin"]],
        } if store else None,
        "districts": sorted(districts.values(), key=lambda row: row["district"]),
    }


def write_summary(payload):
    geometry = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    write_text(SUMMARY_OUT, json.dumps(summarize(payload), ensure_ascii=False, indent=1) + "\n")
    write_text(MANDALS_OUT, json.dumps(mandal_values(payload, geometry), ensure_ascii=False, separators=(",", ":")) + "\n")


# --- assembly ------------------------------------------------------------------

def load_previous(path=OUT):
    try:
        with open(path) as handle:
            previous = json.load(handle)
        return previous if isinstance(previous, dict) else {}
    except (OSError, ValueError):
        return {}


def render(payload):
    """Indented JSON, except that each mandal or reservoir sits on one line."""
    rows = {}

    def hold(node):
        if isinstance(node, dict):
            out = {}
            for key, value in node.items():
                if key in LINE_LISTS and isinstance(value, list):
                    token = f"@rows{len(rows)}@"
                    rows[token] = value
                    out[key] = token
                else:
                    out[key] = hold(value)
            return out
        return node

    text = json.dumps(hold(payload), indent=1, ensure_ascii=False)
    for token, items in rows.items():
        body = ",\n".join("  " + json.dumps(item, ensure_ascii=False, separators=(",", ":")) for item in items)
        text = text.replace(json.dumps(token), f"[\n{body}\n ]" if items else "[]")
    return text + "\n"


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as handle:
        handle.write(text)
    os.replace(path + ".tmp", path)


def assemble(today, builders, previous):
    """Run each feed; a failure keeps that feed's previous section."""
    sections, status = {}, {}
    for name, build in builders:
        try:
            sections[name] = build()
            status[name] = {"status": "refreshed"}
        except Exception as error:  # one feed failing must not cost the others
            sections[name] = previous.get(name)
            status[name] = {"status": "retained" if sections[name] else "unavailable", "error": str(error)[:240]}
            print(f"  [warn] {name}: {error}")
        pause()
    return sections, status


def main():
    if "--summary-only" in sys.argv[1:]:
        # Rebuild the browser digest from the stored file, with no network at all.
        payload = load_previous()
        if not payload:
            sys.exit(f"No {OUT} to summarise.")
        write_summary(payload)
        print(f"  wrote {os.path.basename(SUMMARY_OUT)} from the stored water context")
        return 0
    today = datetime.datetime.now(IST).date()
    previous = load_previous()
    print(f"APWRIMS water context for {today.isoformat()} (IST)")
    try:
        tree = location_tree()
        boundaries = boundaries_for(tree)
        print(f"  {len(tree)} mandals in the location tree; {len(boundaries)} reconciled to a boundary")
    except Exception as error:
        tree, boundaries = None, None
        print(f"  [warn] location tree: {error}")

    def needs_tree(build):
        def run():
            if tree is None:
                raise RuntimeError("no location tree to name and place mandals with")
            return build(today, tree, boundaries)
        return run

    sections, status = assemble(today, [
        ("soilMoisture", needs_tree(build_soil)),
        ("rainfall", needs_tree(build_rainfall)),
        ("reservoirs", lambda: build_reservoirs(today)),
    ], previous)
    payload = {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "portal": BASE,
        "authorizationStatus": "research_pending",
        "note": ("Public APWRIMS dashboard data, fetched for research. Soil moisture is modelled; rainfall "
                 "and reservoir figures are departmental measurements. Not an official export."),
        **sections,
    }
    text = render(payload)
    write_text(OUT, text)
    write_summary(payload)
    digest = hashlib.sha256(text.encode()).hexdigest()
    soil, rain, store = sections.get("soilMoisture") or {}, sections.get("rainfall") or {}, sections.get("reservoirs") or {}
    write_text(RECEIPT, json.dumps({
        "source": BASE,
        "checkedAt": payload["generatedAt"],
        "status": "refreshed" if all(s["status"] == "refreshed" for s in status.values()) else "partial",
        "sections": status,
        "soilMoistureAsOf": soil.get("asOf"),
        "rainfallThrough": (rain.get("window") or {}).get("end"),
        "reservoirsAsOf": store.get("asOf"),
        "outputSha256": digest,
        "authorizationStatus": "research_pending",
    }, indent=2) + "\n")
    if soil:
        s = soil["summary"]
        print(f"  soil moisture as of {soil['asOf']}: {s['mandals']} mandals ({s['mapped']} mapped), "
              f"median {s['medianPct']}% at {soil['headlineDepthCm']} cm; {s['driestOnRecord']} driest on record for the date")
    if rain:
        print(f"  gauge rainfall {rain['window']['start']}..{rain['window']['end']}: {rain['state']['deviationPct']:+.1f}% "
              f"area-weighted; {rain['categories']}")
    if store:
        st = store["state"]
        print(f"  reservoirs as of {store['asOf']}: {st['storageTmc']} of {st['capacityTmc']} TMC ({st['storagePct']}%), "
              f"a year ago {st['lastYearPct']}%")
    failed = [name for name, s in status.items() if s["status"] != "refreshed"]
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
