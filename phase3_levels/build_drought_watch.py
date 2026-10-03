"""Kharif drought indicators for every mandal, read by India's Manual for Drought Management (2020).

The manual (Department of Agriculture & Farmers Welfare, updated December 2020)
is the procedure a State must follow to declare drought. It runs in three steps,
and this file computes the first two for every mandal with the manual's own
thresholds. It declares nothing: the third step, ground truthing, and the
declaration itself are the State's.

Step 1, Trigger 1 (Table 3.11): rainfall deviation or SPI, and dry spells.
  - Rainfall deviation, in IMD's categories (Table 3.1), from AP DES mandal rain
    gauges via APWRIMS, for the season so far.
  - Dry spell (3.2.1 B): consecutive weeks after the monsoon's due onset with
    less than 50% of the normal in each week; usually 4 weeks, 3 on light soils.
    Weekly totals are the differences between the portal's season-to-date
    figures at successive week ends.
  - SPI (3.2.1 C), from CHIRPS v3 monthly rainfall since 1981 on the same
    mandal boundaries: a second rainfall route, reported beside the gauges.
  Trigger 1 is set by a dry spell, or without one by large-deficient rainfall
  (SPI below -1.5 on the SPI route). Deficient rainfall alone does not set it.

Step 2, Trigger 2 (Table 3.12): any three of the four kinds of impact indicator,
one from each. Three are available per mandal without a login:
  - Remote sensing: Vegetation Condition Index (Table 3.4), from NOAA STAR's
    blended Vegetation Health Product, 4 km weekly, averaged over the last four
    weeks. Coarser than the manual's preferred 56-500 m; all vegetation, not
    cropland alone.
  - Soil moisture: Percent Available Soil Moisture (Table 3.6), the NRSC VIC
    model's plant-available water at 30 cm via APWRIMS, averaged over four
    weekly values as the manual asks (3.2.3.2), not read on one date.
  - Hydrology: Groundwater Drought Index (Table 3.9), from the APWRIMS monthly
    groundwater record, 10 years or more for the same month.
  The fourth, area sown (3.2.3.1), is collected by the Agriculture department
  by district and is not published per mandal. District figures the
  department has reported are carried as context, never folded into a
  mandal's result. Reservoir storage (Table 3.8) is reported per reservoir and
  district for the same reason: which mandals a reservoir serves is not public.

  Severity (3.3.1 Step 2): severe if at least two of the three are severe and
  the third at least moderate; moderate if at least two are moderate or worse;
  otherwise normal. "Moderate" is read as "moderate or worse": read literally,
  two severe indicators and one normal would rank below two moderate ones.

Where one indicator is missing, both readings of it are tried. A result that
holds either way is kept; otherwise the mandal is reported as a range
("moderate or severe") instead of being guessed.

Every number carries its source, its window and whether it is measured or
modelled. Outputs app/data/drought_watch.json (the drought page and mandal
pages, server-rendered) and app/data/drought_watch_summary.json (small, safe
for client pages).
"""
import datetime
import json
import math
import os
import statistics
import sys
import time
from collections import Counter, defaultdict

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)

APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(APP, "drought_watch.json")
SUMMARY_OUT = os.path.join(APP, "drought_watch_summary.json")
GEOMETRY = os.path.join(APP, "ap_map_geometry.json")
WATER_CONTEXT = os.path.join(APP, "water_context.json")
RECORDS = os.path.join(APP, "mandal_groundwater_records_v2.json")
SERIES = os.path.join(APP, "mandal_observation_series_v2.json")
BOUNDARIES = os.path.join(ROOT, "data", "processed", "boundaries", "ap_mandal_boundaries_prototype.geojson")
CHIRPS = [os.path.join(HERE, "data", "mandal_rain_history_chirps_archive.csv"),
          os.path.join(HERE, "data", "mandal_rain_history_chirps.csv")]
REPORTED_SOWING = os.path.join(HERE, "data", "crop_coverage_reported.json")
RECEIPT = os.path.join(ROOT, "data", "refresh_receipts", "drought_watch.json")
CONTRACT_VERSION = "1.0.0"

MANUAL = {
    "title": "Manual for Drought Management (updated 2020)",
    "publisher": "Department of Agriculture & Farmers Welfare, Government of India",
    "url": "https://vedas.sac.gov.in/static/pdf/Drought%20Manual-2020.pdf",
}
VHP_BASE = "https://www.star.nesdis.noaa.gov/data/pub0018/VHPdata4users/data/Blended_VH_4km/geo_TIFF/"
VHP_FILE = "VHP.G04.C07.j01.P{year}{week:03d}.VH.VCI.tif"
AP_BOUNDS = (76.5, 12.4, 85.0, 19.95)

# --- the manual's numbers ----------------------------------------------------
SEASON_START = (6, 1)                 # kharif: the south-west monsoon season from 1 June
# The manual counts dry weeks "after the due date for the onset of monsoon". The
# monsoon's normal onset over Andhra Pradesh falls in the first half of June, so
# the first week (1-7 June) is shown but never counted toward a dry spell.
FIRST_COUNTED_WEEK = 1                # zero-based index of 8-14 June
DRY_WEEK_SHARE = 0.5                  # 3.2.1 B: rainfall less than 50% of normal in the week
DRY_SPELL_WEEKS = 4                   # "usually 4 weeks"
DRY_SPELL_WEEKS_LIGHT = 3             # "upto 3 weeks in case of light soils"
SPI_MIN_YEARS = 30                    # 3.2.1 C: a minimum of 30 years
VCI_WEEKS = 4                         # September's VCI for a September/October declaration (3.2.2)
PASM_WEEKS = 4                        # "Averaging period should not be less than 3-4 weeks" (3.2.3.2)
GWDI_MIN_YEARS = 10                   # 3.2.4.2: "a minimum period of 10 years"
RSI_YEARS = 10                        # Table 3.8: "Average Storage of last 10 years"
RSI_MIN_YEARS = 5
DECLARE_BY = (10, 31)                 # 3.4: kharif drought declared not later than 31 October
RAIN_SETTLE_DAYS = 2
PAUSE_S = 1.0
MIN_MANDALS = 600
PAST_WEEK_TOLERANCE = 0.25            # a published week's statewide sum may move this much on re-asking

IMPACT_RANK = {"normal": 0, "moderate": 1, "severe": 2}


def pause():
    time.sleep(PAUSE_S)


def r1(value):
    return None if value is None else round(float(value), 1)


def r2(value):
    return None if value is None else round(float(value), 2)


# --- classifications, straight from the manual's tables ----------------------

def rain_class(deviation):
    """Table 3.1, IMD's categories. Excess is IMD's own class above +19%."""
    if deviation is None:
        return None
    deviation = round(deviation, 1)
    if deviation <= -100:
        return "noRain"
    if deviation <= -60:
        return "largeDeficient"
    if deviation <= -20:
        return "deficient"
    if deviation < 20:
        return "normal"
    return "excess"


def spi_class(value):
    if value is None:
        return None
    if value < -2:
        return "extremelyDry"
    if value < -1.5:
        return "severelyDry"
    if value < -1:
        return "moderatelyDry"
    if value <= 1:
        return "nearNormal"
    return "wet"


def vci_class(value):
    """Table 3.4: 60-100 normal, 40-60 moderate, 0-40 severe."""
    if value is None:
        return None
    if value >= 60:
        return "normal"
    if value >= 40:
        return "moderate"
    return "severe"


def pasm_class(value):
    """Table 3.6 (2020): 76-100 no drought, 51-75 moderate, 0-50 severe."""
    if value is None:
        return None
    value = round(value)
    if value >= 76:
        return "normal"
    if value >= 51:
        return "moderate"
    return "severe"


def gwdi_band(value):
    """Table 3.9's five classes."""
    if value is None:
        return None
    value = round(value, 2)
    if value >= -0.15:
        return "normal"
    if value >= -0.30:
        return "mild"
    if value >= -0.45:
        return "moderate"
    if value >= -0.60:
        return "severe"
    return "extreme"


def rsi_band(deficit_pct):
    """Table 3.8: % deficit in live storage against the last 10 years' average."""
    if deficit_pct is None:
        return None
    if deficit_pct < 20:
        return "normal"
    if deficit_pct < 30:
        return "mild"
    if deficit_pct < 40:
        return "moderate"
    if deficit_pct <= 60:
        return "severe"
    return "extreme"


def impact_of(band):
    """Five-class hydrology bands onto the three classes the matrix uses."""
    return {"normal": "normal", "mild": "normal", "moderate": "moderate",
            "severe": "severe", "extreme": "severe"}.get(band)


def sown_class(pct_of_normal):
    """3.2.3.1: below 85% of the normal sown area is drought; 75% or less is severe."""
    if pct_of_normal is None:
        return None
    if pct_of_normal <= 75:
        return "severe"
    if pct_of_normal < 85:
        return "moderate"
    return "normal"


# --- step 1 -------------------------------------------------------------------

def trigger_one(dry_spell, rain=None, spi=None):
    """Table 3.11 for one rainfall route: give rain (a Table 3.1 class) or spi.

    Returns (set, reason). None means the inputs cannot decide it.
    """
    if spi is not None:
        deficit, strong = spi < -1, spi < -1.5
    elif rain is not None:
        deficit = rain in ("deficient", "largeDeficient", "noRain")
        strong = rain in ("largeDeficient", "noRain")
    else:
        deficit = strong = None
    if dry_spell:
        return True, "drySpell"
    if strong:
        return True, "spiBelow-1.5" if spi is not None else "largeDeficient"
    if dry_spell is None or deficit is None:
        return None, "insufficient"
    return False, "deficitWithoutDrySpell" if deficit else "normalRainfall"


def dry_spells(weeks, first=FIRST_COUNTED_WEEK, share=DRY_WEEK_SHARE):
    """Runs of consecutive dry weeks among the counted ones.

    weeks: [(actual mm, normal mm)] per week from 1 June. A week is dry when its
    rain is below `share` of its normal. Returns (dry flags per week, runs as
    [first week, last week] inclusive, longest run).
    """
    flags = []
    for index, (actual, normal) in enumerate(weeks):
        if actual is None or normal is None or normal <= 0:
            flags.append(None)
        else:
            flags.append(actual < share * normal)
    runs, start = [], None
    for index in range(first, len(flags) + 1):
        dry = index < len(flags) and flags[index] is True
        if dry and start is None:
            start = index
        elif not dry and start is not None:
            runs.append([start, index - 1])
            start = None
    longest = max((b - a + 1 for a, b in runs), default=0)
    return flags, runs, longest


# --- step 2 -------------------------------------------------------------------

def decide(classes):
    """3.3.1 Step 2 for exactly three impact classes."""
    severe = sum(1 for c in classes if c == "severe")
    at_least_moderate = sum(1 for c in classes if c in ("moderate", "severe"))
    if severe >= 2 and at_least_moderate == 3:
        return "severe"
    if at_least_moderate >= 2:
        return "moderate"
    return "normal"


def severity(classes):
    """Step 2 with up to one indicator missing: the result if both readings agree, else a range."""
    known = [c for c in classes if c]
    if len(known) == 3:
        return decide(known)
    if len(known) < 2:
        return "insufficient"
    low, high = decide(known + ["normal"]), decide(known + ["severe"])
    return low if low == high else f"{low}|{high}"


def overall(t1, impact):
    if t1 is None:
        return "insufficient"
    if not t1:
        return "noTrigger"
    return impact


# --- SPI ---------------------------------------------------------------------

def spi_value(history, current):
    """SPI from a gamma distribution fitted to the same months in earlier years."""
    from scipy import stats

    data = np.asarray([v for v in history if v is not None], dtype=float)
    if len(data) < SPI_MIN_YEARS or current is None:
        return None
    positive = data[data > 0]
    zeros = 1 - len(positive) / len(data)
    if len(positive) < SPI_MIN_YEARS - 5:
        return None
    shape, _, scale = stats.gamma.fit(positive, floc=0)
    probability = zeros + (1 - zeros) * stats.gamma.cdf(current, shape, loc=0, scale=scale) if current > 0 else zeros
    probability = min(max(probability, 1e-6), 1 - 1e-6)
    return float(stats.norm.ppf(probability))


def chirps_seasons(year, last_month, paths=CHIRPS):
    """{boundary index: {year: season total}} for June..last_month of each year."""
    import csv

    months = {f"{m:02d}" for m in range(6, last_month + 1)}
    totals = defaultdict(lambda: defaultdict(float))
    counts = defaultdict(lambda: defaultdict(int))
    for path in paths:
        with open(path) as handle:
            for row in csv.DictReader(handle):
                stamp = row["date"]
                if stamp[5:7] not in months or int(stamp[:4]) > year:
                    continue
                index, y = int(row["boundary_index"]), int(stamp[:4])
                totals[index][y] += float(row["rain_mm"])
                counts[index][y] += 1
    need = len(months)
    return {index: {y: total for y, total in years.items() if counts[index][y] == need}
            for index, years in totals.items()}


def latest_chirps_month(year, paths=CHIRPS):
    import csv

    latest = None
    with open(paths[-1]) as handle:
        for row in csv.DictReader(handle):
            if row["date"].startswith(str(year)):
                month = int(row["date"][5:7])
                latest = month if latest is None else max(latest, month)
    return latest


def build_spi(year):
    last = latest_chirps_month(year)
    if last is None or last < 6:
        return None, {}
    last = min(last, 9)
    seasons = chirps_seasons(year, last)
    out = {}
    for index, years in seasons.items():
        history = [total for y, total in sorted(years.items()) if y < year]
        value = spi_value(history, years.get(year))
        if value is not None:
            out[index] = {"v": round(value, 2), "cls": spi_class(value), "mm": r1(years.get(year))}
    first_year = min((min(y) for y in seasons.values() if y), default=None)
    meta = {"months": f"{year}-06 to {year}-{last:02d}", "baselineFirstYear": first_year,
            "baselineLastYear": year - 1, "product": "CHIRPS v3.0 monthly, zonal mean per mandal boundary",
            "kind": "satellite estimate"}
    return meta, out


# --- weekly gauge rainfall ---------------------------------------------------

def week_ends(start, last_day):
    ends, end = [], start + datetime.timedelta(days=6)
    while end <= last_day:
        ends.append(end)
        end += datetime.timedelta(days=7)
    return ends


def season_snapshots(start, ends, fetch):
    """{end date: {uuid: (cumulative actual, cumulative normal)}}."""
    import fetch_apwrims_context as apw

    out = {}
    for end in ends:
        rows = fetch(start, end)
        snapshot = {}
        for row in rows if isinstance(rows, list) else []:
            if str(row.get("locUuid")).upper() == "TOTAL" or str(row.get("locName")).upper() == "TOTAL":
                continue
            season = (row.get("responseMap") or {}).get("monm") or {}
            actual, normal = season.get("actual"), season.get("normal")
            if apw.number(actual) and apw.number(normal):
                snapshot[row.get("locUuid")] = (float(actual), float(normal))
        if len(snapshot) < MIN_MANDALS:
            raise RuntimeError(f"gauge rainfall to {end} answered for {len(snapshot)} mandals")
        out[end] = snapshot
        pause()
    return out


def weekly_series(snapshots, ends, uid):
    weeks, previous = [], (0.0, 0.0)
    for end in ends:
        current = snapshots[end].get(uid)
        if current is None:
            weeks.append((None, None))
            previous = None
            continue
        if previous is None or current[0] < previous[0] - 0.5:
            # A season-to-date total that shrinks is a portal revision, not rain.
            weeks.append((None, None))
        else:
            weeks.append((round(current[0] - previous[0], 1), round(current[1] - previous[1], 1)))
        previous = current
    return weeks


def check_past_weeks(previous, mandals, season_start, tolerance=PAST_WEEK_TOLERANCE):
    """Weeks already published should not move much when the portal is asked
    again. If one does, the portal is mid-revision (on 3 Oct 2026 it briefly
    dropped September for whole districts), and publishing would invent a dry
    spell. Raise, so the weekly refresh keeps the previous file."""
    if not previous or (previous.get("season") or {}).get("start") != season_start.isoformat():
        return
    old = {(r["d"], r["m"]): r.get("weeks") or [] for r in previous.get("mandals", [])}
    new = {(r["d"], r["m"]): r.get("weeks") or [] for r in mandals}
    shared = [key for key in new if key in old]
    settled = min((len(old[key]) for key in shared), default=0) - 1  # the latest week may still be filling in
    for week in range(max(settled, 0)):
        pairs = [(old[k][week], new[k][week]) for k in shared
                 if week < len(new[k]) and old[k][week] is not None and new[k][week] is not None]
        before = sum(a for a, _ in pairs)
        after = sum(b for _, b in pairs)
        if pairs and before / len(pairs) >= 2 and abs(after - before) > tolerance * before:
            raise RuntimeError(f"week {week + 1} of the season moved from {before:.0f} to {after:.0f} mm summed over "
                               f"{len(pairs)} mandals since it was published; the portal looks mid-revision")


# --- vegetation condition (NOAA STAR VHP) -------------------------------------

def vhp_week_label(year, week):
    start = datetime.date(year, 1, 1) + datetime.timedelta(days=7 * (week - 1))
    return {"year": year, "week": week, "approxStart": start.isoformat(),
            "approxEnd": (start + datetime.timedelta(days=6)).isoformat()}


def vhp_available(year, listing=None):
    """Week numbers of `year` published in the VCI listing."""
    import re
    import urllib.request
    from fetch_nasa_power_rainfall import _tls_context

    if listing is None:
        with urllib.request.urlopen(VHP_BASE, timeout=90, context=_tls_context()) as response:
            listing = response.read().decode("utf-8", "replace")
    return sorted({int(m) for m in re.findall(rf"VHP\.G04\.C07\.j01\.P{year}(\d{{3}})\.VH\.VCI\.tif", listing)})


def vhp_window(year, week):
    """The AP window of one weekly VCI file: (array, transform), read by range requests."""
    import rasterio
    from rasterio.windows import from_bounds

    url = "/vsicurl/" + VHP_BASE + VHP_FILE.format(year=year, week=week)
    env = dict(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif",
               GDAL_HTTP_MAX_RETRY="3", GDAL_HTTP_RETRY_DELAY="2")
    with rasterio.Env(**env), rasterio.open(url) as source:
        window = from_bounds(*AP_BOUNDS, source.transform).round_offsets().round_lengths()
        data = source.read(1, window=window).astype("float64")
        transform = source.window_transform(window)
    data[(data < 0) | (data > 100) | ~np.isfinite(data)] = np.nan
    return data, transform


def mandal_labels(shape, transform, boundaries=BOUNDARIES):
    """A grid of boundary indexes (-1 outside), one per raster cell.

    Cells are assigned by centre; a mandal too small to hold a cell centre takes
    the cell under its centroid instead, so every mandal gets a value.
    """
    import geopandas as gpd
    from rasterio.features import rasterize
    from rasterio.transform import rowcol

    frame = gpd.read_file(boundaries)
    if frame.crs is not None and str(frame.crs).upper() not in {"EPSG:4326", "OGC:CRS84"}:
        frame = frame.to_crs("EPSG:4326")
    labels = rasterize(((geom, index) for index, geom in enumerate(frame.geometry) if geom is not None),
                       out_shape=shape, transform=transform, fill=-1, dtype="int32")
    present = set(np.unique(labels).tolist())
    extra = {}
    for index, geom in enumerate(frame.geometry):
        if geom is None or index in present:
            continue
        point = geom.representative_point()
        row, col = rowcol(transform, point.x, point.y)
        if 0 <= row < shape[0] and 0 <= col < shape[1]:
            extra[index] = (row, col)
    return labels, extra, len(frame)


def zonal_means(data, labels, extra, count):
    valid = np.isfinite(data) & (labels >= 0)
    sums = np.bincount(labels[valid], weights=data[valid], minlength=count)
    cells = np.bincount(labels[valid], minlength=count)
    out = [float(sums[i] / cells[i]) if cells[i] else None for i in range(count)]
    for index, (row, col) in extra.items():
        value = data[row, col]
        out[index] = float(value) if np.isfinite(value) else None
    return out


def build_vci(year, start, fetch=vhp_window):
    # Weeks that begin in the season (NOAA numbers weeks from 1 January).
    weeks = [w for w in vhp_available(year)
             if datetime.date(year, 1, 1) + datetime.timedelta(days=7 * (w - 1)) >= start - datetime.timedelta(days=3)]
    if not weeks:
        return None, {}
    series, labels, extra, count = {}, None, None, None
    for week in weeks:
        data, transform = fetch(year, week)
        if labels is None:
            labels, extra, count = mandal_labels(data.shape, transform)
        series[week] = zonal_means(data, labels, extra, count)
    recent = weeks[-VCI_WEEKS:]
    out = {}
    for index in range(count):
        values = [series[w][index] for w in recent if series[w][index] is not None]
        if len(values) < max(2, len(recent) - 1):
            continue
        mean = statistics.fmean(values)
        out[index] = {"v": r1(mean), "cls": vci_class(mean),
                      "weeks": [None if series[w][index] is None else round(series[w][index]) for w in weeks]}
    meta = {"product": "NOAA STAR Blended Vegetation Health Product (VIIRS), VCI, 4 km weekly",
            "url": VHP_BASE, "kind": "satellite index",
            "weeks": [vhp_week_label(year, w) for w in weeks],
            "averaged": [vhp_week_label(year, w) for w in recent],
            "caveat": "4 km cells over all vegetation, not cropland alone; the manual prefers 56-500 m NDVI/NDWI over agricultural areas. A screening value, not a declaration-grade one."}
    return meta, out


# --- soil moisture (PASM) -----------------------------------------------------

def soil_as_of(today):
    try:
        context = json.load(open(WATER_CONTEXT))
        stamp = (context.get("soil") or {}).get("asOf")
        if stamp:
            day = datetime.date.fromisoformat(stamp)
            if 0 <= (today - day).days <= 14:
                return day
    except (OSError, ValueError):
        pass
    import fetch_apwrims_context as apw
    _, day = apw.soil_as_of(today, apw.soil_table)
    return day or today


def build_pasm(as_of, tree, boundaries, fetch=None):
    import fetch_apwrims_context as apw

    fetch = fetch or apw.soil_table
    depth = apw.SOIL_DEPTHS_CM.index(apw.HEADLINE_DEPTH_CM)
    dates = [as_of - datetime.timedelta(days=7 * k) for k in range(PASM_WEEKS + 1)]
    snapshots = {}
    for day in dates:
        snapshots[day] = fetch(day)
        pause()
    past, _, _ = apw.baseline_years(as_of, fetch)
    by_index = defaultdict(list)
    for uid, (index, _) in boundaries.items():
        by_index[index].append(uid)
    out = {}
    for index, uids in by_index.items():
        if len(uids) != 1:
            continue  # one boundary, two portal mandals: ambiguous, left out
        uid = uids[0]
        current = [snapshots[d][uid]["pct"][depth] for d in dates[:PASM_WEEKS] if uid in snapshots[d]]
        previous = [snapshots[d][uid]["pct"][depth] for d in dates[1:] if uid in snapshots[d]]
        if len(current) < PASM_WEEKS - 1:
            continue
        mean = statistics.fmean(current)
        history = [snap[uid]["pct"][depth] for snap in past.values() if uid in snap]
        out[index] = {
            "v": r1(mean), "cls": pasm_class(mean),
            "usual": r1(statistics.median(history)) if len(history) >= 5 else None,
            # How often this date read Severe in earlier years: where the manual's
            # fixed classes fire almost every year, the State may recalibrate them
            # (Table 3.6 note), and a reader should know.
            "severeYears": sum(1 for v in history if pasm_class(v) == "severe") if len(history) >= 5 else None,
            "years": len(history) if len(history) >= 5 else None,
            "prev": r1(statistics.fmean(previous)) if len(previous) >= PASM_WEEKS - 1 else None,
        }
    meta = {"source": "NRSC VIC land-surface model via APWRIMS, plant-available water at 30 cm",
            "kind": "modelled", "asOf": as_of.isoformat(),
            "averaged": [d.isoformat() for d in dates[:PASM_WEEKS]],
            "baselineYears": sorted(past)}
    return meta, out


# --- groundwater (GWDI) -------------------------------------------------------

def gwdi(values, current):
    """Table 3.9's index: (mean depth for the month - this year's depth) / the month's deepest.

    The manual writes the mean as MGWD_j; it is read here as the mean for the
    same calendar month across the record, matching GWD_imax beside it.
    """
    if current is None or len(values) < GWDI_MIN_YEARS:
        return None
    deepest = max(values)
    if deepest <= 0:
        return None
    return (statistics.fmean(values) - current) / deepest


def build_gwdi():
    records = json.load(open(RECORDS))["records"]
    series = json.load(open(SERIES))["series"]
    if isinstance(series, list):
        series = {s["mandalId"]: s for s in series}
    uses = Counter(sid for r in records for sid in r["identity"].get("joinedSourceSeriesIds") or [])
    latest = Counter()
    for r in records:
        s = series.get(r["identity"]["mandalId"])
        if s and s["observations"]:
            latest[s["observations"][-1]["period"]] += 1
    if not latest:
        return None, {}
    target = latest.most_common(1)[0][0]
    month = target[5:7]
    out = {}
    for index, r in enumerate(records):
        ids = r["identity"].get("joinedSourceSeriesIds") or []
        if len(ids) != 1 or uses[ids[0]] != 1:
            continue  # a series shared by boundaries, or several series: not this boundary's own
        s = series.get(r["identity"]["mandalId"])
        if not s:
            continue
        by_year = {o["period"][:4]: o["value"] for o in s["observations"]
                   if o["period"][5:7] == month and o.get("value") is not None}
        current = by_year.get(target[:4])
        value = gwdi(list(by_year.values()), current)
        if value is None:
            continue
        band = gwdi_band(value)
        out[index] = {"v": r2(value), "band": band, "cls": impact_of(band), "years": len(by_year),
                      "depth": r2(current), "mean": r2(statistics.fmean(by_year.values()))}
    meta = {"source": "APWRIMS monthly groundwater depth, the site's own mandal series",
            "kind": "measured", "month": target,
            "rule": f"same calendar month in every year on record, at least {GWDI_MIN_YEARS} years"}
    return meta, out


# --- reservoirs (RSI) ---------------------------------------------------------

def build_rsi(day, fetch=None):
    import fetch_apwrims_context as apw

    fetch = fetch or apw.reservoir_component

    def storages(when):
        raw = fetch(when)
        out = {}
        for kind in ("major", "medium"):
            block = raw.get(kind) if isinstance(raw, dict) else None
            items = block if isinstance(block, list) else (block or {}).get("data") or []
            for item in items:
                row = apw.reservoir_row(item, kind)
                if row["name"] and apw.number(row["storageTmc"]):
                    out[row["name"]] = row
        return out

    now = storages(day)
    pause()
    # A reservoir whose latest reading is days older than the rest has stopped
    # reporting; its "storage" would read as a deficit that is really a silence.
    stamps = sorted(row["observedAt"] for row in now.values() if row["observedAt"])
    newest = datetime.datetime.fromisoformat(stamps[-1]) if stamps else None
    silent = [name for name, row in now.items() if not row["observedAt"] or (newest and newest - datetime.datetime.fromisoformat(row["observedAt"]) > datetime.timedelta(days=apw.STALE_AFTER_DAYS))]
    for name in silent:
        del now[name]
    years = []
    history = defaultdict(list)
    for back in range(1, RSI_YEARS + 1):
        past = apw.same_day(day.year - back, day.month, day.day)
        snapshot = storages(past)
        pause()
        if len(snapshot) < 50:
            continue
        years.append(past.year)
        for name, row in snapshot.items():
            history[name].append(row["storageTmc"])
    reservoirs, by_district = [], defaultdict(lambda: [0.0, 0.0, 0])
    for name, row in now.items():
        values = history.get(name, [])
        if len(values) < RSI_MIN_YEARS:
            continue
        average = statistics.fmean(values)
        if average <= 0:
            continue
        deficit = 100 * (average - row["storageTmc"]) / average
        band = rsi_band(deficit)
        reservoirs.append({"name": name, "district": row["district"], "type": row["type"],
                           "storageTmc": row["storageTmc"], "averageTmc": round(average, 3),
                           "deficitPct": r1(deficit), "band": band, "cls": impact_of(band), "years": len(values)})
        totals = by_district[row["district"] or "Unknown"]
        totals[0] += row["storageTmc"]
        totals[1] += average
        totals[2] += 1
    reservoirs.sort(key=lambda r: -(r["deficitPct"] or -999))
    districts = []
    for district, (storage, average, count) in sorted(by_district.items()):
        deficit = 100 * (average - storage) / average if average else None
        districts.append({"district": district, "reservoirs": count, "storageTmc": round(storage, 3),
                          "averageTmc": round(average, 3), "deficitPct": r1(deficit),
                          "band": rsi_band(deficit), "cls": impact_of(rsi_band(deficit))})
    storage = sum(r["storageTmc"] for r in reservoirs)
    average = sum(r["averageTmc"] for r in reservoirs)
    state_deficit = 100 * (average - storage) / average if average else None
    meta = {"source": "APWRIMS reservoir storage, the same date in each of the last ten years",
            "kind": "measured", "date": day.isoformat(), "years": sorted(years), "notReporting": sorted(silent),
            "state": {"reservoirs": len(reservoirs), "storageTmc": round(storage, 3), "averageTmc": round(average, 3),
                      "deficitPct": r1(state_deficit), "band": rsi_band(state_deficit)}}
    return meta, reservoirs, districts


# --- sown area, as the department has reported it -----------------------------

def reported_sowing():
    try:
        data = json.load(open(REPORTED_SOWING))
    except (OSError, ValueError):
        return None
    for entry in data.get("districts", []):
        entry["cls"] = sown_class(entry.get("pctOfNormal"))
    if data.get("state"):
        data["state"]["cls"] = sown_class(data["state"].get("pctOfNormal"))
    return data


# --- assembly -----------------------------------------------------------------

def week_axis(ends):
    return [{"start": (end - datetime.timedelta(days=6)).isoformat(), "end": end.isoformat(),
             "counted": index >= FIRST_COUNTED_WEEK} for index, end in enumerate(ends)]


def classify_mandal(rain, weeks, spi, vci, pasm, gw, light_soil=False):
    """Everything the manual's two triggers need, for one boundary."""
    flags, runs, longest = dry_spells(weeks) if weeks else ([], [], None)
    need = DRY_SPELL_WEEKS_LIGHT if light_soil else DRY_SPELL_WEEKS
    dry = None if longest is None else longest >= need
    t1, why = trigger_one(dry, rain=rain["cls"] if rain else None)
    t1_spi, _ = trigger_one(dry, spi=spi["v"]) if spi else (None, None)
    impact = {"rs": vci["cls"] if vci else None, "sm": pasm["cls"] if pasm else None, "hy": gw["cls"] if gw else None}
    level = severity([impact["rs"], impact["sm"], impact["hy"]])
    return {"flags": flags, "runs": runs, "longest": longest, "dry": dry, "t1": t1, "why": why,
            "t1Spi": t1_spi, "impact": impact, "severity": level, "category": overall(t1, level)}


def assemble(today, geometry, ends, snapshots, tree, boundaries, spi, vci, pasm, gw):
    """The per-mandal rows, the week-earlier rows, and the summaries."""
    owners = unique_uids(boundaries)
    last_end = ends[-1]
    mandals, previous = [], {}
    for index, feature in enumerate(geometry):
        uid = owners.get(index)
        rain = weeks = rain_prev = weeks_prev = None
        if uid and uid in snapshots[last_end]:
            actual, normal = snapshots[last_end][uid]
            deviation = 100 * (actual / normal - 1) if normal > 0 else None
            rain = {"mm": r1(actual), "normal": r1(normal), "dev": r1(deviation), "cls": rain_class(deviation)}
            weeks = weekly_series(snapshots, ends, uid)
            if len(ends) > 1 and uid in snapshots[ends[-2]]:
                a, n = snapshots[ends[-2]][uid]
                deviation = 100 * (a / n - 1) if n > 0 else None
                rain_prev = {"cls": rain_class(deviation)}
                weeks_prev = weeks[:-1]
        v, p, g, s = vci.get(index), pasm.get(index), gw.get(index), spi.get(index)
        now = classify_mandal(rain, weeks, s, v, p, g)
        light = classify_mandal(rain, weeks, s, v, p, g, light_soil=True)
        # A week earlier: rain to the previous week end, VCI one week back, PASM
        # one week back, the same groundwater month.
        v_prev = None
        if v and len(v["weeks"]) > VCI_WEEKS:
            back = [x for x in v["weeks"][-VCI_WEEKS - 1:-1] if x is not None]
            v_prev = {"cls": vci_class(statistics.fmean(back))} if back else None
        p_prev = {"cls": pasm_class(p["prev"])} if p and p.get("prev") is not None else None
        before = classify_mandal(rain_prev, weeks_prev, None, v_prev, p_prev, g)
        previous[index] = before["category"]
        mandals.append({
            "i": index, "d": feature["d"], "m": feature["m"],
            "rain": rain,
            "weeks": [None if a is None or n is None or n <= 0 else round(100 * a / n) for a, n in weeks] if weeks else None,
            "dry": {"longest": now["longest"], "runs": now["runs"], "set": now["dry"], "setLight": light["dry"]} if weeks else None,
            "spi": s, "t1": now["t1"], "t1Why": now["why"], "t1Spi": now["t1Spi"], "t1Light": light["t1"],
            "vci": v, "pasm": p, "gwdi": g,
            "impact": now["impact"], "severity": now["severity"],
            "category": now["category"], "categoryLight": light["category"],
            "prev": before["category"],
        })
    return mandals, previous


CATEGORY_ORDER = ["severe", "moderate|severe", "moderate", "normal|moderate", "normal", "noTrigger", "insufficient"]


def tally(rows, key="category"):
    counts = Counter(row[key] for row in rows)
    return {name: counts.get(name, 0) for name in CATEGORY_ORDER}


def unique_uids(boundaries):
    """{boundary index: portal mandal}, for boundaries exactly one portal mandal reaches."""
    by_index = defaultdict(list)
    for uid, (index, _) in boundaries.items():
        by_index[index].append(uid)
    return {index: uids[0] for index, uids in by_index.items() if len(uids) == 1}


def timeline(ends, snapshots, boundaries):
    """Mandals by rainfall class and dry-spell state at each week end of the season."""
    out = []
    uids = list(unique_uids(boundaries).values())
    for k, end in enumerate(ends):
        classes = Counter()
        spell = trigger = 0
        for uid in uids:
            if uid not in snapshots[end]:
                continue
            actual, normal = snapshots[end][uid]
            cls = rain_class(100 * (actual / normal - 1) if normal > 0 else None)
            classes[cls] += 1
            weeks = weekly_series(snapshots, ends[:k + 1], uid)
            _, _, longest = dry_spells(weeks)
            dry = longest >= DRY_SPELL_WEEKS
            spell += dry
            t1, _ = trigger_one(dry, rain=cls)
            trigger += bool(t1)
        out.append({"end": end.isoformat(), "classes": {name: classes.get(name, 0) for name in
                    ("excess", "normal", "deficient", "largeDeficient", "noRain")},
                    "drySpell": spell, "trigger1": trigger})
    return out


def district_rows(mandals, sowing, rsi_districts):
    sown = {e["district"]: e for e in (sowing or {}).get("districts", [])}
    groups = defaultdict(list)
    for row in mandals:
        groups[row["d"]].append(row)
    out = []
    for district, rows in groups.items():
        assessed = [r for r in rows if r["category"] != "insufficient"]
        devs = [r["rain"]["dev"] for r in rows if r["rain"] and r["rain"]["dev"] is not None]
        out.append({
            "district": district, "mandals": len(rows), "assessed": len(assessed),
            "trigger1": sum(1 for r in rows if r["t1"]), "drySpell": sum(1 for r in rows if r["dry"] and r["dry"]["set"]),
            "counts": tally(rows),
            "medianRainDev": r1(statistics.median(devs)) if devs else None,
            "medianVci": r1(statistics.median([r["vci"]["v"] for r in rows if r["vci"]])) if any(r["vci"] for r in rows) else None,
            "medianPasm": r1(statistics.median([r["pasm"]["v"] for r in rows if r["pasm"]])) if any(r["pasm"] for r in rows) else None,
            "medianGwdi": r2(statistics.median([r["gwdi"]["v"] for r in rows if r["gwdi"]])) if any(r["gwdi"] for r in rows) else None,
            "sown": sown.get(district),
        })
    out.sort(key=lambda d: (-(d["counts"]["severe"] + d["counts"]["moderate|severe"]), -d["counts"]["moderate"], d["district"]))
    return out


def changes(mandals):
    moved = [{"i": r["i"], "d": r["d"], "m": r["m"], "from": r["prev"], "to": r["category"]}
             for r in mandals if r["prev"] != r["category"]]
    rank = {name: index for index, name in enumerate(reversed(CATEGORY_ORDER))}
    worse = [c for c in moved if rank.get(c["to"], 0) > rank.get(c["from"], 0) and c["from"] != "insufficient"]
    better = [c for c in moved if rank.get(c["to"], 0) < rank.get(c["from"], 0) and c["to"] != "insufficient"]
    return {"worse": worse, "better": better, "total": len(moved)}


def summary_of(payload):
    """The small digest client pages may import."""
    return {
        "contractVersion": payload["contractVersion"], "generatedAt": payload["generatedAt"],
        "season": payload["season"], "manual": payload["manual"],
        "state": payload["state"],
        "districts": [{k: d[k] for k in ("district", "mandals", "trigger1", "counts")} for d in payload["districts"]],
        # One short code per map boundary, in map order: enough for a map layer.
        "categories": [row["category"] for row in payload["mandals"]],
    }


def write_json(path, payload, compact_lists=("mandals",)):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lines = ["{"]
    keys = list(payload)
    for n, key in enumerate(keys):
        value = payload[key]
        tail = "," if n < len(keys) - 1 else ""
        if key in compact_lists and isinstance(value, list):
            lines.append(f' "{key}": [')
            for m, item in enumerate(value):
                lines.append("  " + json.dumps(item, separators=(",", ":")) + ("," if m < len(value) - 1 else ""))
            lines.append(" ]" + tail)
        else:
            lines.append(f' "{key}": ' + json.dumps(value, indent=1).replace("\n", "\n ") + tail)
    lines.append("}")
    with open(path + ".tmp", "w") as handle:
        handle.write("\n".join(lines) + "\n")
    os.replace(path + ".tmp", path)


def main():
    import fetch_apwrims_context as apw

    today = datetime.datetime.now(apw.IST).date()
    year = today.year if today.month >= 6 else today.year - 1
    start = datetime.date(year, *SEASON_START)
    last_day = min(today - datetime.timedelta(days=RAIN_SETTLE_DAYS), datetime.date(year, 12, 31))
    geometry = json.load(open(GEOMETRY))["mandals"]

    tree = apw.location_tree()
    boundaries = apw.boundaries_for(tree)
    ends = week_ends(start, last_day)
    if len(ends) < 6:
        print("  The season is too young for dry spells; nothing written.")
        return 0
    snapshots = season_snapshots(start, ends, apw.rainfall_table)
    spi_meta, spi = build_spi(year)
    vci_meta, vci = build_vci(year, start)
    pasm_meta, pasm = build_pasm(soil_as_of(today), tree, boundaries)
    gw_meta, gw = build_gwdi()
    rsi_meta, rsi_reservoirs, rsi_districts = build_rsi(last_day)
    sowing = reported_sowing()

    mandals, _ = assemble(today, geometry, ends, snapshots, tree, boundaries, spi, vci, pasm, gw)
    if sum(1 for r in mandals if r["rain"]) < MIN_MANDALS:
        raise RuntimeError("too few mandals with gauge rainfall; previous drought watch kept")
    try:
        with open(OUT) as handle:
            published = json.load(handle)
    except (OSError, ValueError):
        published = None
    check_past_weeks(published, mandals, start)
    declare_by = datetime.date(year, *DECLARE_BY)
    payload = {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "manual": {**MANUAL, "tables": {
            "trigger1": "Table 3.11", "rain": "Table 3.1", "vci": "Table 3.4", "pasm": "Table 3.6",
            "gwdi": "Table 3.9", "rsi": "Table 3.8", "sown": "3.2.3.1", "severity": "3.3.1 Step 2",
            "groundTruth": "3.2.6", "declaration": "3.4"}},
        "season": {"name": f"Kharif {year}", "start": start.isoformat(), "asOf": last_day.isoformat(),
                   "declareBy": declare_by.isoformat(), "earlyFrom": f"{year}-08-01",
                   "weeks": week_axis(ends)},
        "rules": {
            "drySpell": {"share": DRY_WEEK_SHARE, "weeks": DRY_SPELL_WEEKS, "weeksLightSoil": DRY_SPELL_WEEKS_LIGHT,
                         "countedFrom": ends[FIRST_COUNTED_WEEK].isoformat() if len(ends) > FIRST_COUNTED_WEEK else None},
            "trigger1Route": "gauge rainfall deviation (Table 3.1 classes) with dry spells; SPI route reported beside it",
            "severity": "severe: two or more severe and the third at least moderate; moderate: two or more at least moderate; otherwise normal",
            "interpretations": [
                "'Moderate' in the severity rule is read as 'moderate or worse'.",
                "Hydrology bands mild and extreme (Tables 3.8, 3.9) are folded into normal and severe.",
                "The first week of June precedes the monsoon's normal onset over most of the state and is not counted toward a dry spell.",
                "GWDI's mean depth is read as the mean for the same month across the record.",
            ],
            "groundTruth": {"villageShare": 0.10, "sitesPerCrop": 5, "qualifyingLossPct": 33, "severeLossPct": 50},
            "irrigationDowngradePct": 75,
        },
        "sources": {
            "rain": {"source": "AP DES mandal rain gauges via APWRIMS", "kind": "measured",
                     "window": {"start": start.isoformat(), "end": ends[-1].isoformat()},
                     "note": "Weekly totals are differences between the portal's season-to-date figures at successive week ends."},
            "spi": spi_meta, "vci": vci_meta, "pasm": pasm_meta, "gwdi": gw_meta,
            "rsi": rsi_meta, "sowing": sowing and {k: v for k, v in sowing.items() if k != "districts"},
        },
        "timeline": timeline(ends, snapshots, boundaries),
        "state": {},
        "districts": [],
        "reservoirs": rsi_reservoirs,
        "reservoirDistricts": rsi_districts,
        "sowingDistricts": (sowing or {}).get("districts", []),
        "mandals": mandals,
    }
    payload["districts"] = district_rows(mandals, sowing, rsi_districts)
    assessed = [r for r in mandals if r["category"] != "insufficient"]
    payload["state"] = {
        "mandals": len(mandals), "assessed": len(assessed),
        "trigger1": sum(1 for r in mandals if r["t1"]),
        "trigger1Spi": sum(1 for r in mandals if r["t1Spi"]),
        "trigger1Light": sum(1 for r in mandals if r["t1Light"]),
        "drySpell": sum(1 for r in mandals if r["dry"] and r["dry"]["set"]),
        "counts": tally(mandals), "countsLight": tally(mandals, "categoryLight"),
        "previous": tally([{"category": r["prev"]} for r in mandals]),
        "changes": changes(mandals),
        "impactKnown": {k: sum(1 for r in mandals if r["impact"][k]) for k in ("rs", "sm", "hy")},
    }
    write_json(OUT, payload)
    write_json(SUMMARY_OUT, summary_of(payload), compact_lists=())
    os.makedirs(os.path.dirname(RECEIPT), exist_ok=True)
    with open(RECEIPT, "w") as handle:
        json.dump({"generatedAt": payload["generatedAt"], "asOf": last_day.isoformat(),
                   "state": payload["state"]["counts"], "weeks": len(ends),
                   "vciWeeks": len((vci_meta or {}).get("weeks", [])), "pasm": len(pasm), "gwdi": len(gw),
                   "spi": len(spi), "reservoirs": len(rsi_reservoirs)}, handle, indent=1)
        handle.write("\n")
    print(f"  drought watch: {payload['state']['counts']} (trigger 1 in {payload['state']['trigger1']} mandals)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
