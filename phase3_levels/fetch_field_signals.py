"""This week in the fields: crop weather, crop vegetation and the official groundwater assessment.

Three public sources the Agriculture page did not have:

- Crop weather. Reference evapotranspiration (FAO-56 Penman-Monteith, as
  Open-Meteo computes it from the model) and rain, daily, for a point inside
  each mandal: the last seven days and the next seven, from ECMWF's open IFS
  forecast via Open-Meteo. Model values, not station measurements. With the
  APWRIMS soil moisture and SoilGrids' water-holding capacity, it drives the
  crop water check (crop_water.py; app/lib/cropWater.ts in the browser).
- Crop vegetation. NOAA STAR's weekly Vegetation Condition Index, the one
  Drought Watch reads (same files, same 4 km window), weighted towards cropland
  with ESA WorldCover so that forest does not stand in for fields
  (build_cropland_fraction.py). VCI compares this week's greenness with the same
  week in every year on record: 0 is the worst seen, 100 the best.
- Groundwater assessment. The Dynamic Ground Water Resources assessment of each
  assessment unit (in Andhra Pradesh, the mandal), made jointly by CGWB and the
  State Ground Water Department under the GEC-2015 method, from the public,
  no-login endpoint of INGRES's dashboard: category, stage of extraction, and
  extraction by use, for the latest assessment year and the one before.

Outputs:
- app/data/field_signals.json (server only): every section in full;
- app/data/field_signals_mandals.json (client-safe, ~30 KB): the map layers;
- data/refresh_receipts/field_signals.json.

A section that fails keeps its previous value, which carries its own date.
"""
import datetime
import difflib
import hashlib
import json
import os
import re
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from rasterio.features import rasterize
from rasterio.transform import rowcol
from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import crop_water  # noqa: E402
from build_drought_watch import VHP_BASE, vci_class, vhp_week_label, vhp_window  # noqa: E402 - the files Drought Watch reads
from fetch_chirps_history import mandal_shapes  # noqa: E402 - same mandal polygons as the rainfall record
from fetch_nasa_power_rainfall import _tls_context, is_transient  # noqa: E402 - verified TLS, one implementation

APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(APP, "field_signals.json")
MANDALS_OUT = os.path.join(APP, "field_signals_mandals.json")
GEOMETRY = os.path.join(APP, "ap_map_geometry.json")
WATER_CONTEXT = os.path.join(APP, "water_context.json")
CAPACITY = os.path.join(HERE, "data", "mandal_soil_water_capacity.json")
CROPLAND = os.path.join(HERE, "data", "vhp_cropland_fraction.json")
RECEIPT = os.path.join(HERE, "..", "data", "refresh_receipts", "field_signals.json")
CONTRACT_VERSION = "1.0.0"
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
LINE_LISTS = ("eto", "rain", "mandals", "values", "byWeek")

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
WEATHER_MODEL = "ecmwf_ifs"
PAST_DAYS = 7
FORECAST_DAYS = 7
# Open-Meteo counts each location as a call, 600 a minute at most: 50 locations
# every 6 seconds stays at 500.
BATCH = 50
BATCH_PAUSE_S = 6
RATE_LIMIT_WAIT_S = 65

VEG_WEEKS = 16           # the trend: about four months
VEG_AVERAGED = 4         # the headline: the last four weeks, as Drought Watch averages
MIN_CROP_CELLS = 0.5     # cropland worth at least half a 4 km cell, else the all-vegetation mean is used

INGRES = "https://ingres.iith.ac.in/api/gec/getBusinessDataForUserOpen"
INGRES_DASHBOARD = "https://ingres.iith.ac.in/gecdataonline/gis/INDIA"
AP_UUID = "609c5df4-6414-4bbd-a22d-ff5fbdad6836"
MIN_UNITS = 600
CATEGORIES = ("safe", "semi_critical", "critical", "over_exploited", "salinity")
FUZZY_MIN = 0.86
DISTRICT_ALIASES = {"TIRUPATHI": "TIRUPATI"}
# INGRES spellings of mandals the map spells differently, checked by hand: each
# pair is one mandal written two ways (and sometimes now in a redrawn district).
NAME_ALIASES = {
    "AKIVEEDU": "AKIVIDU", "BAPULAPAD": "BAPULAPADU", "CHAKNAYAPET": "CHAKRAYAPET",
    "LAXMINARASAMPET": "LAKSHMINARSUPETA", "GANGUVARISINGADAM": "GANGUVARISIGADAM",
    "GANGARAJUMADUGULA": "GMADUGULA", "MUDINAPALLE": "MUDINEPALLE",
}


# --- shared --------------------------------------------------------------------

def request_json(url, data=None, timeout=120, tries=4):
    body = None if data is None else json.dumps(data).encode()
    headers = {"Accept": "application/json", "User-Agent": "ap-water-intelligence/1.0 (research prototype)"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST" if body else "GET")
            with urllib.request.urlopen(req, timeout=timeout, context=_tls_context()) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:  # noqa: BLE001 - transient errors are retried, the rest raised
            if attempt == tries - 1 or not is_transient(error):
                raise
            limited = isinstance(error, urllib.error.HTTPError) and error.code == 429
            time.sleep(RATE_LIMIT_WAIT_S if limited else 5 * (attempt + 1))


def geometry():
    return json.load(open(GEOMETRY))["mandals"]


def r1(value):
    return None if value is None else round(float(value), 1)


# --- crop weather (Open-Meteo, ECMWF IFS) ---------------------------------------

def mandal_points(shapes, count):
    points = [None] * count
    for index, _, _, geom in shapes:
        point = shape(geom).representative_point()
        points[index] = (round(point.y, 4), round(point.x, 4))
    return points


def weather_batch(points):
    query = urllib.parse.urlencode({
        "latitude": ",".join(str(lat) for lat, _ in points), "longitude": ",".join(str(lon) for _, lon in points),
        "daily": "et0_fao_evapotranspiration,precipitation_sum", "timezone": "Asia/Kolkata",
        "past_days": PAST_DAYS, "forecast_days": FORECAST_DAYS, "models": WEATHER_MODEL})
    answer = request_json(f"{OPEN_METEO}?{query}")
    return answer if isinstance(answer, list) else [answer]


def build_weather(today, fetch=weather_batch):
    shapes = mandal_shapes()
    count = len(geometry())
    points = mandal_points(shapes, count)
    wanted = [i for i, point in enumerate(points) if point]
    eto, rain, dates = [None] * count, [None] * count, None
    for start in range(0, len(wanted), BATCH):
        chunk = wanted[start:start + BATCH]
        answers = fetch([points[i] for i in chunk])
        if len(answers) != len(chunk):
            raise RuntimeError(f"Open-Meteo answered {len(answers)} locations for {len(chunk)}")
        for index, answer in zip(chunk, answers):
            daily = answer.get("daily") or {}
            days, e, r = daily.get("time"), daily.get("et0_fao_evapotranspiration"), daily.get("precipitation_sum")
            if dates is None:
                dates = days
            if days != dates or not e or not r or len(e) != len(days) or len(r) != len(days):
                continue
            if any(v is None or v < 0 for v in e) or any(v is None or v < 0 for v in r):
                continue
            eto[index] = [round(v, 2) for v in e]
            rain[index] = [round(v, 1) for v in r]
        time.sleep(BATCH_PAUSE_S)
    got = sum(1 for row in eto if row)
    if not dates or got < 0.9 * len(wanted):
        raise RuntimeError(f"weather for only {got} of {len(wanted)} mandals")
    if today.isoformat() not in dates:
        raise RuntimeError(f"forecast days {dates[0]}..{dates[-1]} do not include today {today}")
    return {
        "source": "ECMWF IFS open-data forecast, via Open-Meteo",
        "model": WEATHER_MODEL,
        "url": "https://open-meteo.com/en/docs/ecmwf-api",
        "licence": "CC BY 4.0 (ECMWF open data; Open-Meteo)",
        "kind": "forecast",
        "measure": "Daily reference evapotranspiration (FAO-56 Penman-Monteith, mm) and precipitation (mm) at a point inside each mandal. Days before today are the model's own recent runs, not station measurements.",
        "issued": today.isoformat(),
        "dates": dates,
        "mandals": got,
        "points": points,
        "eto": eto,
        "rain": rain,
    }


# --- crop vegetation (NOAA STAR VHP x ESA WorldCover) ---------------------------

def vhp_listing():
    with urllib.request.urlopen(VHP_BASE, timeout=120, context=_tls_context()) as response:
        return response.read().decode("utf-8", "replace")


def vhp_weeks(listing, today, keep=VEG_WEEKS):
    found = {(int(y), int(w)) for y, w in re.findall(r"VHP\.G04\.C07\.j01\.P(\d{4})(\d{3})\.VH\.VCI\.tif", listing)}
    return sorted(w for w in found if w[0] in (today.year, today.year - 1))[-keep:]


def cropland_grid():
    payload = json.load(open(CROPLAND))
    share = np.array(payload["share"], dtype="float64")
    return payload, np.where(share >= 0, share / 100.0, 0.0)


def cell_labels(shapes, data_shape, transform):
    labels = rasterize(((geom, index) for index, _, _, geom in shapes), out_shape=data_shape,
                       transform=transform, fill=-1, dtype="int32")
    present = set(np.unique(labels).tolist())
    extra = {}
    for index, _, _, geom in shapes:
        if index not in present:
            point = shape(geom).representative_point()
            row, col = rowcol(transform, point.x, point.y)
            if 0 <= row < data_shape[0] and 0 <= col < data_shape[1]:
                extra[index] = (row, col)
    return labels, extra


def weighted_means(data, weights, labels, extra, count):
    """(cropland-weighted, all-vegetation, cropland weight) per mandal for one week."""
    valid = np.isfinite(data) & (labels >= 0)
    w = weights[valid]
    crop_sum = np.bincount(labels[valid], weights=data[valid] * w, minlength=count)
    crop_w = np.bincount(labels[valid], weights=w, minlength=count)
    all_sum = np.bincount(labels[valid], weights=data[valid], minlength=count)
    cells = np.bincount(labels[valid], minlength=count)
    out = []
    for i in range(count):
        if i in extra:
            value = data[extra[i]]
            share = weights[extra[i]]
            out.append((float(value), float(value), float(share)) if np.isfinite(value) else (None, None, 0.0))
        elif cells[i]:
            all_mean = float(all_sum[i] / cells[i])
            crop_mean = float(crop_sum[i] / crop_w[i]) if crop_w[i] >= MIN_CROP_CELLS else None
            out.append((crop_mean, all_mean, float(crop_w[i])))
        else:
            out.append((None, None, 0.0))
    return out


def build_vegetation(today, fetch=vhp_window, listing=None):
    weeks = vhp_weeks(listing if listing is not None else vhp_listing(), today)
    if len(weeks) < VEG_AVERAGED:
        raise RuntimeError(f"only {len(weeks)} VHP weeks listed")
    shapes = mandal_shapes()
    count = len(geometry())
    meta, weights = cropland_grid()
    labels = extra = None
    series = []
    for year, week in weeks:
        data, transform = fetch(year, week)
        if labels is None:
            grid = meta["grid"]
            if list(data.shape) != grid["shape"] or any(abs(a - b) > 1e-6 for a, b in zip(transform[:6], grid["transform"])):
                raise RuntimeError("the VHP window no longer matches the cropland grid; rebuild build_cropland_fraction.py")
            labels, extra = cell_labels(shapes, data.shape, transform)
            # Cropland weight of each mandal: how many 4 km cells of fields it holds.
            land = np.bincount(labels[labels >= 0], minlength=count)
            fields = np.bincount(labels[labels >= 0], weights=weights[labels >= 0], minlength=count)
        series.append(weighted_means(data, weights, labels, extra, count))
    recent = range(len(weeks) - VEG_AVERAGED, len(weeks))
    mandals = []
    for i in range(count):
        crop_weeks = [series[k][i][0] for k in range(len(weeks))]
        all_weeks = [series[k][i][1] for k in range(len(weeks))]
        few = all(series[k][i][0] is None for k in recent)
        chosen = all_weeks if few else crop_weeks
        values = [chosen[k] for k in recent if chosen[k] is not None]
        if len(values) < VEG_AVERAGED - 1:
            mandals.append(None)
            continue
        mean = statistics.fmean(values)
        all_values = [all_weeks[k] for k in recent if all_weeks[k] is not None]
        share = None if i in extra or not land[i] else round(100 * fields[i] / land[i])
        # Classed on the value as shown, so "60" never reads as moderate.
        mandals.append({"v": r1(mean), "cls": vci_class(r1(mean)),
                        "all": r1(statistics.fmean(all_values)) if all_values else None,
                        "crop": share, "few": few,
                        "weeks": [None if v is None else round(v) for v in chosen]})
    by_week = []
    for k in range(len(weeks)):
        tally = {"normal": 0, "moderate": 0, "severe": 0}
        for i in range(count):
            value = series[k][i][0] if series[k][i][0] is not None else series[k][i][1]
            if value is not None:
                tally[vci_class(value)] += 1
        by_week.append(tally)
    known = [m for m in mandals if m]
    return {
        "product": "NOAA STAR Blended Vegetation Health Product (VIIRS), VCI, 4 km weekly",
        "url": VHP_BASE,
        "kind": "satellite index",
        "weighting": "Each 4 km cell weighted by its cropland share (ESA WorldCover 2021); a mandal with less than half a cell of cropland keeps the plain all-vegetation mean, and says so.",
        "classes": "Manual for Drought Management 2020, Table 3.4: 60-100 normal, 40-60 moderate, 0-40 severe",
        "cropland": {"source": meta["source"], "url": meta["url"], "caveat": meta["caveat"]},
        "weeks": [vhp_week_label(year, week) for year, week in weeks],
        "averaged": [vhp_week_label(*weeks[k]) for k in recent],
        "byWeek": by_week,
        "summary": {"mandals": len(known), "normal": sum(m["cls"] == "normal" for m in known),
                    "moderate": sum(m["cls"] == "moderate" for m in known), "severe": sum(m["cls"] == "severe" for m in known),
                    "fewFields": sum(m["few"] for m in known),
                    "medianVci": r1(statistics.median(m["v"] for m in known)) if known else None},
        "mandals": mandals,
    }


# --- groundwater assessment (INGRES) ----------------------------------------------

def ingres_body(name, loctype, uuid, year):
    return {"locname": name, "loctype": loctype, "view": "admin", "locuuid": uuid, "component": "recharge",
            "period": "annual", "category": "all", "computationType": "normal", "year": year,
            "approvalLevel": 1, "verificationStatus": 1, "parentuuid": AP_UUID, "stateuuid": None}


def ingres_post(body):
    rows = request_json(INGRES, body)
    return rows if isinstance(rows, list) else []


def total(node, key="total"):
    value = (node or {}).get(key) if isinstance(node, dict) else None
    return float(value) if isinstance(value, (int, float)) else None


def unit_record(row):
    draft = row.get("draftData") or {}
    return {
        "unit": row.get("locationName"),
        "cat": (row.get("category") or {}).get("total"),
        "stage": r1(total(row.get("stageOfExtraction"))),
        "resource": r1(total(row.get("currentAvailabilityForAllPurposes"))),
        "extraction": r1(total(draft.get("total"))),
        "irrigation": r1(total(draft.get("agriculture"))),
        "domestic": r1(total(draft.get("domestic"))),
        "industry": r1(total(draft.get("industry"))),
        "future": r1(total(row.get("availabilityForFutureUse"))),
        "rainMm": r1(total(row.get("rainfall"))),
    }


def assessment_year(year, post=ingres_post):
    """(state, districts, units) for one assessment year, or None when INGRES has no such year.

    The state's own row (INGRES's "total") is kept as published: its stage of
    extraction is the assessment's figure, not a sum recomputed from the units.
    """
    rows = post(ingres_body("ANDHRA PRADESH", "STATE", AP_UUID, year))
    districts = [d for d in rows if d.get("locationUUID")]
    state = next((d for d in rows if str(d.get("locationName", "")).lower() == "total"), None)
    if len(districts) < 20:
        return None
    units = []
    for district in districts:
        time.sleep(1)
        for row in post(ingres_body(district["locationName"], "DISTRICT", district["locationUUID"], year)):
            if row.get("locationUUID"):
                units.append({"district": district["locationName"], **unit_record(row)})
    if len(units) < MIN_UNITS:
        raise RuntimeError(f"INGRES {year}: only {len(units)} assessment units")
    return (unit_record(state) if state else None), [{"district": d["locationName"], **unit_record(d)} for d in districts], units


def clean_name(text):
    text = (text or "").upper().replace("&", "AND").replace("_", " ")
    return re.sub(r"\s+H/O\b.*$", "", text)   # "CHERUKUPALLE H/O ARUMBAKA": the mandal, then its headquarters


def full_name(text):
    """Every letter, parenthetical words included: "KAKINADA (RURAL)" stays apart from "KAKINADA (URBAN)"."""
    return re.sub(r"[^A-Z]", "", clean_name(text))


def norm_name(text):
    """The base name: no parenthetical hint, no rural/urban/mandal word."""
    text = re.sub(r"\(.*?\)", " ", clean_name(text))
    text = re.sub(r"\b(RURAL|URBAN|MANDAL)\b", " ", text)
    return re.sub(r"[^A-Z]", "", text)


def norm_district(text):
    key = norm_name(text)
    return norm_name(DISTRICT_ALIASES.get(key, key))


def unit_kind(name):
    upper = (name or "").upper()
    return "urban" if "URBAN" in upper else "rural" if "RURAL" in upper else None


def neighbour_districts(features):
    """Each mandal's district as its neighbours have it: the prototype map labels some same-named
    mandals with another's district (all three ATMAKURs carry Ananthapuramu), but a mandal's
    neighbours are almost always labelled right."""
    from collections import Counter
    from shapely.strtree import STRtree

    shapes = {index: shape(geom) for index, _, _, geom in mandal_shapes()}
    order = sorted(shapes)
    geoms = [shapes[i] for i in order]
    tree = STRtree(geoms)
    out = {}
    for index in order:
        ring = shapes[index].buffer(0.004)
        votes = Counter()
        for j in tree.query(ring):
            other = order[int(j)]
            if other != index and geoms[int(j)].intersects(ring):
                votes[norm_district(features[other]["d"])] += 1
        if votes:
            district, count = votes.most_common(1)[0]
            if count >= 2 and count >= 0.6 * sum(votes.values()):
                out[index] = district
    return out


STEP_RANK = {"exact": 0, "located": 1, "name": 2, "alias": 2, "spelling": 3}


def match_units(units, features):
    """{mandal index: [units]} and the units left unmatched.

    Tried in order, each needing exactly one candidate:
    1. district and name, letter for letter ("exact"), then without the
       parenthetical hint or rural/urban word;
    2. the same, with the district the mandal's neighbours give it ("located"),
       for mandals the prototype map labels with another district;
    3. the name alone when it is unique in the state ("name");
    4. a close spelling within the district or the located district
       (difflib ratio >= 0.86, clearly ahead of the next candidate: "spelling").
    A mandal takes two units only as a rural/urban pair; otherwise the better
    match keeps it and the other unit stays unmatched, listed by name.
    """
    located = neighbour_districts(features)
    keys = {}
    for index, feature in enumerate(features):
        label = norm_district(feature["d"])
        for kind, name in (("full", full_name(feature["m"])), ("base", norm_name(feature["m"]))):
            keys.setdefault(("label", kind, label, name), []).append(index)
            if index in located:
                keys.setdefault(("located", kind, located[index], name), []).append(index)
            keys.setdefault(("state", kind, name), []).append(index)

    def only(key):
        hits = keys.get(key, [])
        return hits[0] if len(hits) == 1 else None

    def spelling(district, name):
        pool = {i for key, hits in keys.items() if key[0] in ("label", "located") and key[1] == "base" and key[2] == district for i in hits}
        scored = sorted(((difflib.SequenceMatcher(None, name, norm_name(features[i]["m"])).ratio(), i) for i in pool), reverse=True)
        if scored and scored[0][0] >= FUZZY_MIN and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.04):
            return scored[0][1]
        return None

    claims = {}
    unmatched = []
    for unit in units:
        d, full, base = norm_district(unit["district"]), full_name(unit["unit"]), norm_name(unit["unit"])
        how, index = None, None
        if base in NAME_ALIASES:
            index = only(("state", "base", NAME_ALIASES[base]))
            if index is not None:
                claims.setdefault(index, []).append({**unit, "match": "alias"})
                continue
        for step, key in (("exact", ("label", "full", d, full)), ("exact", ("label", "base", d, base)),
                          ("located", ("located", "full", d, full)), ("located", ("located", "base", d, base)),
                          ("name", ("state", "full", full)), ("name", ("state", "base", base))):
            index = only(key)
            if index is not None:
                how = step
                break
        if index is None:
            index = spelling(d, base)
            how = "spelling" if index is not None else None
        if index is None:
            unmatched.append(unit)
            continue
        claims.setdefault(index, []).append({**unit, "match": how})
    matched = {}
    for index, group in claims.items():
        group.sort(key=lambda u: STEP_RANK[u["match"]])
        kept = [group[0]]
        for unit in group[1:]:
            if all(unit_kind(unit["unit"]) and unit_kind(k["unit"]) and unit_kind(unit["unit"]) != unit_kind(k["unit"]) for k in kept):
                kept.append(unit)
            else:
                unmatched.append(unit)
        matched[index] = kept

    # Second pass, over mandals no unit has claimed: a name that was ambiguous
    # may now have one candidate left. A candidate whose neighbours place it in
    # another district is never taken.
    def fits(index, district):
        return located.get(index, district) == district or norm_district(features[index]["d"]) == district

    still = []
    for unit in unmatched:
        d, base = norm_district(unit["district"]), norm_name(unit["unit"])
        free = [i for i in range(len(features)) if i not in matched and fits(i, d)]
        same = [i for i in free if norm_name(features[i]["m"]) == base]
        index, how = (same[0], "name") if len(same) == 1 else (None, None)
        if index is None and base:
            near = [i for i in free if d in (norm_district(features[i]["d"]), located.get(i))] or free
            scored = sorted(((difflib.SequenceMatcher(None, base, norm_name(features[i]["m"])).ratio(), i) for i in near), reverse=True)
            floor = FUZZY_MIN - 0.01 if near is not free else 0.92
            if scored and scored[0][0] >= floor and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.04):
                index, how = scored[0][1], "spelling"
        if index is None:
            still.append(unit)
        else:
            matched[index] = [{**unit, "match": how}]
    return matched, still


def headline(units):
    """The unit that speaks for the mandal: the rural part of a rural/urban pair, else the larger resource."""
    rural = [u for u in units if unit_kind(u["unit"]) != "urban"]
    pool = rural or units
    return max(pool, key=lambda u: u["resource"] or 0)


def build_assessment(today, post=ingres_post):
    candidates = [f"{y}-{y + 1}" for y in range(today.year, today.year - 5, -1)]
    found = []
    for year in candidates:
        result = assessment_year(year, post)
        if result:
            found.append((year, *result))
        if len(found) == 2:
            break
    if not found:
        raise RuntimeError("no INGRES assessment year answered")
    (year, state, districts, units), previous = found[0], (found[1] if len(found) > 1 else None)
    features = geometry()
    matched, unmatched = match_units(units, features)
    prev_by_key = {(norm_district(u["district"]), norm_name(u["unit"]), unit_kind(u["unit"])): u for u in (previous[3] if previous else [])}
    mandals = [None] * len(features)
    for index, group in matched.items():
        lead = headline(group)
        prev = prev_by_key.get((norm_district(lead["district"]), norm_name(lead["unit"]), unit_kind(lead["unit"])))
        mandals[index] = {**{k: lead[k] for k in ("unit", "district", "match", "cat", "stage", "resource", "extraction",
                                                  "irrigation", "domestic", "industry", "future", "rainMm")},
                          "prev": {"cat": prev["cat"], "stage": prev["stage"]} if prev else None,
                          "others": [{"unit": u["unit"], "cat": u["cat"], "stage": u["stage"]} for u in group if u is not lead]}
    rank = {c: i for i, c in enumerate(CATEGORIES[:4])}
    worse = sum(1 for m in mandals if m and m["prev"] and m["cat"] in rank and m["prev"]["cat"] in rank and rank[m["cat"]] > rank[m["prev"]["cat"]])
    better = sum(1 for m in mandals if m and m["prev"] and m["cat"] in rank and m["prev"]["cat"] in rank and rank[m["cat"]] < rank[m["prev"]["cat"]])
    return {
        "source": "Dynamic Ground Water Resources assessment (CGWB and the AP State Ground Water Department, GEC-2015 method), via INGRES",
        "url": INGRES_DASHBOARD,
        "kind": "official assessment",
        "year": year,
        "previousYear": previous[0] if previous else None,
        "unitNote": "Volumes in hectare-metres (1 ham = 10,000 m3). Stage of extraction = annual extraction / annual extractable resource. Categories: safe up to 70%, semi-critical 70-90%, critical 90-100%, over-exploited above 100%; saline where the groundwater is too salty to use.",
        "state": {
            "units": len(units),
            "categories": {c: sum(u["cat"] == c for u in units) for c in CATEGORIES},
            "previousCategories": {c: sum(u["cat"] == c for u in previous[3]) for c in CATEGORIES} if previous else None,
            "stagePct": state["stage"] if state else None,
            "previousStagePct": previous[1]["stage"] if previous and previous[1] else None,
            "extractionMcm": r1(state["extraction"] / 100) if state and state["extraction"] is not None else None,
            "resourceMcm": r1(state["resource"] / 100) if state and state["resource"] is not None else None,
            "irrigationMcm": r1(state["irrigation"] / 100) if state and state["irrigation"] is not None else None,
            "matched": len(matched), "unmatchedUnits": [f"{u['unit']} ({u['district']})" for u in unmatched],
            "movedWorse": worse, "movedBetter": better,
        },
        "districts": districts,
        "mandals": mandals,
    }


# --- soil capacity and the cross-check -------------------------------------------

def soil_capacity():
    payload = json.load(open(CAPACITY))
    return {k: payload[k] for k in ("source", "url", "licence", "method", "unit", "depthsCm", "builtAt")} | {"values": payload["values"]}


def soil_by_boundary(context, count):
    """APWRIMS soil moisture (4 depths) per boundary; a boundary claimed twice is ambiguous and left out."""
    rows = ((context or {}).get("soilMoisture") or {}).get("mandals") or []
    seen = {}
    for row in rows:
        index = row.get("boundaryIndex")
        if isinstance(index, int) and 0 <= index < count:
            seen[index] = None if index in seen else row.get("pct")
    return [seen.get(i) for i in range(count)]


def cross_check(weather, capacity, context):
    """Every crop and stage, statewide: the counts the page must reproduce."""
    soil = context.get("soilMoisture") if context else None
    if not weather or not capacity or not soil:
        return None
    count = len(capacity["values"])
    pct = soil_by_boundary(context, count)
    dates = weather["dates"]
    if soil["asOf"] not in dates or weather["issued"] not in dates:
        return {"soilAsOf": soil["asOf"], "note": "soil-moisture date outside the weather window"}
    start, today = dates.index(soil["asOf"]), dates.index(weather["issued"])
    out = {"soilAsOf": soil["asOf"], "issued": weather["issued"], "counts": {}}
    for crop in crop_water.CROPS:
        for stage in range(3):
            results = [crop_water.check(pct[i], capacity["values"][i], weather["eto"][i] or [], weather["rain"][i] or [],
                                        start, today, crop, stage) if weather["eto"][i] else None for i in range(count)]
            out["counts"][f"{crop}-{stage}"] = crop_water.counts(results)
    return out


# --- outputs -----------------------------------------------------------------------

VCI_CODES = {"normal": 0, "moderate": 1, "severe": 2}
CATEGORY_CODES = {c: i for i, c in enumerate(CATEGORIES)}


def mandal_values(payload, features):
    """Client-safe map layers, keyed like water_context_mandals.json: "DISTRICT|MANDAL" -> [vci, class, category, stage]."""
    veg = (payload.get("vegetation") or {}).get("mandals") or []
    gw = (payload.get("assessment") or {}).get("mandals") or []
    values = {}
    for i, feature in enumerate(features):
        v = veg[i] if i < len(veg) else None
        g = gw[i] if i < len(gw) else None
        if v or g:
            values[f"{feature['d'].upper()}|{feature['m'].upper()}"] = [
                v["v"] if v else None, VCI_CODES.get(v["cls"]) if v else None,
                CATEGORY_CODES.get(g["cat"]) if g else None, g["stage"] if g else None]
    veg_meta, gw_meta = payload.get("vegetation") or {}, payload.get("assessment") or {}
    return {
        "generatedAt": payload["generatedAt"],
        "vegetation": {"averaged": veg_meta.get("averaged"), "product": veg_meta.get("product"),
                       "classes": veg_meta.get("classes")} if veg_meta else None,
        "assessment": {"year": gw_meta.get("year"), "source": gw_meta.get("source"), "url": gw_meta.get("url")} if gw_meta else None,
        "fields": ["vci", "vciClass", "category", "stagePct"],
        "codes": {"vciClass": list(VCI_CODES), "category": list(CATEGORIES)},
        "values": values,
    }


def render(payload):
    """Indented JSON, except that long per-mandal lists sit one item per line."""
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


def load_json(path):
    try:
        with open(path) as handle:
            value = json.load(handle)
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def main():
    today = datetime.datetime.now(IST).date()
    previous = load_json(OUT)
    # --only weather,assessment refreshes those sections and keeps the rest as stored.
    only = next((arg.split("=", 1)[1].split(",") for arg in sys.argv[1:] if arg.startswith("--only=")), None)
    print(f"Field signals for {today.isoformat()} (IST)")
    sections, status = {}, {}
    for name, build in (("weather", lambda: build_weather(today)),
                        ("vegetation", lambda: build_vegetation(today)),
                        ("assessment", lambda: build_assessment(today))):
        if only and name not in only:
            sections[name] = previous.get(name)
            status[name] = {"status": "kept" if sections[name] else "unavailable"}
            continue
        started = time.time()
        try:
            sections[name] = build()
            status[name] = {"status": "refreshed", "seconds": round(time.time() - started, 1)}
        except Exception as error:  # one source failing must not cost the others
            sections[name] = previous.get(name)
            status[name] = {"status": "retained" if sections[name] else "unavailable", "error": str(error)[:240]}
            print(f"  [warn] {name}: {error}")
    capacity = soil_capacity()
    context = load_json(WATER_CONTEXT)
    payload = {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "note": "Public sources fetched for research: a weather forecast (model values), a satellite vegetation index and the official groundwater assessment. Not crop advice or a declaration.",
        **sections,
        "soilCapacity": capacity,
    }
    payload["crossCheck"] = cross_check(payload.get("weather"), capacity, context)
    text = render(payload)
    write_text(OUT, text)
    write_text(MANDALS_OUT, json.dumps(mandal_values(payload, geometry()), ensure_ascii=False, separators=(",", ":")) + "\n")
    weather, veg, gw = payload.get("weather") or {}, payload.get("vegetation") or {}, payload.get("assessment") or {}
    write_text(RECEIPT, json.dumps({
        "checkedAt": payload["generatedAt"],
        "status": "refreshed" if all(s["status"] in ("refreshed", "kept") for s in status.values()) else "partial",
        "sections": status,
        "weatherIssued": weather.get("issued"),
        "vegetationWeeks": [w["approxStart"] for w in veg.get("averaged", [])],
        "assessmentYear": gw.get("year"),
        "outputSha256": hashlib.sha256(text.encode()).hexdigest(),
    }, indent=2) + "\n")
    if weather:
        print(f"  weather issued {weather['issued']}: {weather['mandals']} mandals, {weather['dates'][0]}..{weather['dates'][-1]}")
    if veg:
        s = veg["summary"]
        print(f"  vegetation, weeks {veg['averaged'][0]['approxStart']}..{veg['averaged'][-1]['approxEnd']}: median VCI {s['medianVci']}; "
              f"{s['severe']} severe, {s['moderate']} moderate, {s['normal']} normal; {s['fewFields']} with few fields")
    if gw:
        s = gw["state"]
        print(f"  assessment {gw['year']}: {s['units']} units {s['categories']}; stage {s['stagePct']}%; {s['matched']} mandals matched")
    check = payload["crossCheck"]
    if check and check.get("counts"):
        print(f"  crop water check, soil as of {check['soilAsOf']}: maize mid-season {check['counts']['maize-1']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
