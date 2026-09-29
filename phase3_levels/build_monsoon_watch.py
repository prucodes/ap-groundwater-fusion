"""Is this monsoon actually recharging the aquifer? Measured per mandal, against its own normal.

The nowcast says how deep the water is. It does not say whether the season that
is supposed to refill it is working. Those are different questions, and the
second one is the one an irrigation officer has to answer in September, while
there is still time to act on the rabi sowing.

The measure here is deliberately the simplest trend-free one available: for each
mandal, the change in depth from the pre-monsoon May reading to the latest
reading of the same year, compared with the median of that SAME mandal's own
May-to-that-month change over the previous ten years. Because both sides are
within-year differences on one mandal, neither the long-term drift in a district
nor the differences between mandals can move it. A mandal that normally rises a
metre by August and this year has fallen half a metre is short by one and a half
metres, and no model was involved in saying so.

ENSO is carried as CONTEXT, not as a predictor. Adding the Oceanic Nino Index to
the three-month forecast was tested on rolling origin and made it worse
(1.7762 -> 1.8496 m MAE): two El Nino events inside the training record are not
enough to learn a response from. What thirteen events in the rainfall archive
DO support is a rainfall composite -- what June-September and October-December
have historically done in El Nino years -- which is reported per district with
its own sample size beside it.

Outputs app/data/monsoon_watch.json.
"""
import csv
import datetime
import json
import math
import os
import statistics
import sys

import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_levels_engine import (aquifer_of, build_frame, identity_norm,  # noqa: E402
                                 resolve_locations)
from shapely.geometry import Polygon  # noqa: E402
from fetch_chirps_history import history_paths  # noqa: E402

APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(APP, "monsoon_watch.json")
CONTRACT_VERSION = "1.0.0"

# The pre-monsoon reference month. In Andhra Pradesh the water table is at its
# deepest in May, before the south-west monsoon arrives, so May-to-now is the
# season's recharge and it cannot be confused with the dry-season decline.
PRE_MONSOON_MONTH = 5
# How many previous years a mandal needs before we will say what is normal for it.
MIN_COMPARABLE_YEARS = 7
LOOKBACK_YEARS = 10
# A mandal is called short when it misses its own normal by at least this much
# AND by at least this many times its own year-to-year spread. One test alone
# fails in opposite ways: metres alone flags every naturally volatile hard-rock
# mandal, spread alone flags a delta mandal that varies by centimetres.
SHORTFALL_M = 1.0
SHORTFALL_Z = 2.0
# Floor under that spread, so a mandal with a near-constant history cannot
# divide its way to an alarming score.
MIN_SPREAD_M = 0.30
SEVERE_M = 2.0

EL_NINO = 0.5
LA_NINA = -0.5
SW_MONSOON = (6, 7, 8, 9)
NE_MONSOON = (10, 11, 12)
ONI_SOURCE = "https://psl.noaa.gov/data/correlation/oni.data"
CHIRPS_SOURCE = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs"


# Andhra Pradesh's mid-latitude, for turning degrees into kilometres. Across one
# state a flat projection is accurate to well under a percent.
MID_LAT = 16.0


def mandal_areas(geo):
    """Each boundary's area in square kilometres, by boundary index."""
    out = {}
    for index, feature in enumerate(geo["mandals"]):
        rings = [ring for ring in feature.get("rings", []) if len(ring) >= 4]
        if not rings:
            continue
        polygon = Polygon(rings[0])
        if not polygon.is_valid:
            polygon = polygon.buffer(0)
        if polygon.is_empty:
            continue
        out[index] = polygon.area * 111.32 * 110.57 * math.cos(math.radians(MID_LAT))
    return out


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def load_oni():
    path = os.path.join(HERE, "data", "enso_oni.csv")
    if not os.path.exists(path):
        return {}
    with open(path) as handle:
        return {row["date"]: (row["season"], float(row["oni_c"]))
                for row in csv.DictReader(handle)}


def strength(value):
    """CPC's descriptive bands for the peak of an event."""
    size = abs(value)
    if size < EL_NINO:
        return "neutral"
    if size < 1.0:
        return "weak"
    if size < 1.5:
        return "moderate"
    if size < 2.0:
        return "strong"
    return "very strong"


# How much of the index to carry for the card's sparkline. Two years shows the
# climb out of the last La Nina as well as this year's rise.
ENSO_TRAIL_MONTHS = 24


def enso_context(oni):
    if not oni:
        return None
    dates = sorted(oni)
    latest = dates[-1]
    season, value = oni[latest]
    prior = oni.get(dates[-4])[1] if len(dates) >= 4 else None
    state = "el_nino" if value >= EL_NINO else "la_nina" if value <= LA_NINA else "neutral"
    trail = [
        {"date": date, "season": oni[date][0], "oniC": round(oni[date][1], 2)}
        for date in dates[-ENSO_TRAIL_MONTHS:]
    ]
    return {
        "recent": trail,
        "asOf": latest,
        "season": season,
        "oniC": round(value, 2),
        "state": state,
        "strength": strength(value),
        "trend3moC": None if prior is None else round(value - prior, 2),
        "source": ONI_SOURCE,
        "index": "Oceanic Nino Index (NOAA CPC, ERSST v6)",
    }


def seasonal_totals(rain, months, label):
    """Per mandal-year rainfall over `months`, only where every month is present."""
    part = rain[rain.mon.isin(months)]
    grouped = part.groupby(["boundary_index", "year"])["rain_mm"].agg(["sum", "size"])
    grouped = grouped[grouped["size"] == len(months)].reset_index()
    return grouped.rename(columns={"sum": label})[["boundary_index", "year", label]]


def composite(totals, label, oni, index, district_of):
    """What El Nino years did to this season's rain, statewide and per district.

    Percentages are each district's own long-run mean, so a dry district and a
    wet one are both reported as a share of themselves. The frequency of
    below-normal years is carried beside the average because the average alone
    reads as a forecast: the north-east monsoon's El Nino years run from +40%
    to -55%, and a reader who sees only the mean would plan on the mean.
    """
    frame = totals.copy()
    frame["oni"] = frame["year"].map(lambda y: oni.get(f"{y}-{index + 1:02d}", (None, None))[1])
    frame = frame.dropna(subset=["oni"])
    if frame.empty:
        return None
    frame["district"] = frame["boundary_index"].map(district_of)

    def anomaly(rows, selection):
        yearly = rows.groupby("year")[label].mean()
        chosen = yearly[rows.groupby("year")["oni"].first().pipe(selection)]
        base = yearly.mean()
        if chosen.empty or not base:
            return None, 0, None
        return round(100 * (chosen.mean() / base - 1), 1), int(len(chosen)), (yearly, chosen, base)

    warm_pct, warm_years, warm_detail = anomaly(frame, lambda o: o >= EL_NINO)
    cool_pct, cool_years, _ = anomaly(frame, lambda o: o <= LA_NINA)
    yearly = frame.groupby("year")[label].mean()
    base = yearly.mean()
    warm_series = warm_detail[1] if warm_detail else pd.Series(dtype=float)
    districts = []
    for name, rows in frame.groupby("district"):
        pct, years, _ = anomaly(rows, lambda o: o >= EL_NINO)
        if pct is None:
            continue
        districts.append({"district": name, "elNinoAnomalyPct": pct, "elNinoYears": years,
                          "meanMm": round(float(rows.groupby("year")[label].mean().mean()), 1)})
    return {
        "years": int(frame["year"].nunique()),
        "firstYear": int(frame["year"].min()),
        "lastYear": int(frame["year"].max()),
        "elNinoYears": warm_years,
        "elNinoAnomalyPct": warm_pct,
        "laNinaYears": cool_years,
        "laNinaAnomalyPct": cool_pct,
        "meanMm": round(float(base), 1),
        # How often it came in under the long-run mean, in El Nino years and in
        # all years. The gap between the two is the whole forecast value.
        "elNinoBelowNormal": int((warm_series < base).sum()),
        "belowNormalAllYears": int((yearly < base).sum()),
        "allYears": int(len(yearly)),
        "elNinoRangePct": None if warm_series.empty else [
            round(float(100 * (warm_series.min() / base - 1)), 1),
            round(float(100 * (warm_series.max() / base - 1)), 1),
        ],
        "elNinoYearDetail": [
            {"year": int(year), "mm": round(float(value), 1),
             "anomalyPct": round(float(100 * (value / base - 1)), 1)}
            for year, value in warm_series.items()
        ],
        "byDistrict": sorted(districts, key=lambda row: row["elNinoAnomalyPct"]),
    }


def volume_summary(table):
    """The shortfall as water rather than as water table.

    Only mandals that reconciled to a polygon have an area, so the total is
    stated with the count it covers rather than implied to be statewide.
    """
    placed = table[table.shortfallMm3.notna()]
    if placed.empty:
        return None
    total = float(placed.shortfallMm3.sum())
    area = float(placed.areaKm2.sum())
    return {
        "shortfallMm3": round(total, 0),
        "mandals": int(len(placed)),
        "ofMandals": int(len(table)),
        "areaKm2": round(area, 0),
        # The same quantity as a depth spread over the ground it was measured
        # on, which is the one comparison that needs no outside figure.
        "asDepthMm": round(1000 * total * 1e6 / (area * 1e6), 1) if area else None,
        "note": ("shortfall in metres of water table x the mandal's specific yield x its area; "
                 "specific yield is the CGWB measurement where one exists for that mandal, "
                 "otherwise the documented aquifer proxy"),
    }


def score_recharge(levels, meta, year, target_mm):
    """Each mandal's May-to-target change against its own median for that stretch.

    `levels` is mandals x "YYYY-MM"; `meta` carries district, mandal and aquifer.
    Both sides are within-year differences on one mandal, so neither the drift in
    a district nor the difference between mandals can move the answer.
    """
    pre = f"{year}-{PRE_MONSOON_MONTH:02d}"
    target = f"{year}-{target_mm:02d}"
    if pre not in levels.columns or target not in levels.columns:
        raise SystemExit(f"no pre-monsoon reference for {target}; nothing to compare")
    prior_columns = [
        (f"{y}-{PRE_MONSOON_MONTH:02d}", f"{y}-{target_mm:02d}")
        for y in range(year - LOOKBACK_YEARS, year)
        if f"{y}-{PRE_MONSOON_MONTH:02d}" in levels.columns and f"{y}-{target_mm:02d}" in levels.columns
    ]
    prior = pd.concat([levels[end] - levels[start] for start, end in prior_columns], axis=1)
    typical = prior.median(axis=1)
    # Median absolute deviation, not the standard deviation: one displaced well
    # inflates a standard deviation enough to hide the very season it should flag.
    spread = (prior.sub(typical, axis=0)).abs().median(axis=1) * 1.4826

    table = pd.DataFrame({
        "thisSeasonM": levels[target] - levels[pre],
        "typicalM": typical,
        "spreadM": spread,
        "comparableYears": prior.notna().sum(axis=1),
        "latestDepthM": levels[target],
    }).join(meta, how="inner").dropna(subset=["thisSeasonM", "typicalM"])
    table = table[table.comparableYears >= MIN_COMPARABLE_YEARS].copy()
    table["shortfallM"] = table.thisSeasonM - table.typicalM
    table["z"] = table.shortfallM / table.spreadM.clip(lower=MIN_SPREAD_M)
    table["short"] = (table.shortfallM >= SHORTFALL_M) & (table.z >= SHORTFALL_Z)
    table["severe"] = table.short & (table.shortfallM >= SEVERE_M)
    # Rank by how far past BOTH gates a mandal is, never by either alone: metres
    # alone put the naturally swinging hard-rock mandals on top, and spread alone
    # put delta mandals that had moved twenty centimetres more than usual there.
    table["severity"] = np.minimum(table.shortfallM / SHORTFALL_M, table.z / SHORTFALL_Z)
    return table


def season_trajectory(levels, keys, year, target_mm):
    """Each season's path from May, on one fixed set of mandals.

    Plotted as change from May rather than depth, so every year starts at zero
    and the lines can be read against each other: the difference between a year
    that recharges and one that does not is the whole point, and absolute depth
    would spread them apart by the long-term drift instead.
    """
    out = []
    for y in range(year - LOOKBACK_YEARS, year + 1):
        start = f"{y}-{PRE_MONSOON_MONTH:02d}"
        if start not in levels.columns:
            continue
        points = []
        for month in range(PRE_MONSOON_MONTH, 13):
            column = f"{y}-{month:02d}"
            if column not in levels.columns:
                continue
            change = (levels.loc[keys, column] - levels.loc[keys, start]).dropna()
            if len(change) < 100:
                continue
            points.append({"month": month, "changeM": round(float(change.median()), 3)})
        if len(points) >= 3:
            out.append({"year": y, "current": y == year, "points": points})
    return out


def rainfall_history(rain, months, oni):
    """Every year's total over `months`, with the ocean state that came with it."""
    totals = seasonal_totals(rain, months, "mm")
    yearly = totals.groupby("year")["mm"].mean()
    mean = float(yearly.mean())
    out = []
    for y, value in yearly.items():
        season = oni.get(f"{int(y)}-07", (None, None))[1]
        out.append({
            "year": int(y),
            "mm": round(float(value), 1),
            "anomalyPct": round(float(100 * (value / mean - 1)), 1),
            "oniJjaC": season,
            "state": "el_nino" if season is not None and season >= EL_NINO
                     else "la_nina" if season is not None and season <= LA_NINA else "neutral",
        })
    return {"months": f"{months[0]:02d}-{months[-1]:02d}", "meanMm": round(mean, 1), "years": out}


def season_history(levels, keys, year, target_mm, oni):
    """The same May-to-target measure in each earlier season, on the same mandals."""
    out = []
    for y in range(year - LOOKBACK_YEARS, year + 1):
        start, end = f"{y}-{PRE_MONSOON_MONTH:02d}", f"{y}-{target_mm:02d}"
        if start not in levels.columns or end not in levels.columns:
            continue
        change = (levels.loc[keys, end] - levels.loc[keys, start]).dropna()
        if len(change) < 100:
            continue
        out.append({
            "year": y,
            "mandals": int(len(change)),
            "medianChangeM": round(float(change.median()), 3),
            "fallingPct": round(float(100 * (change > 0).mean()), 1),
            "oniJjaC": oni.get(f"{y}-07", (None, None))[1],
        })
    return out


def build():
    frame = build_frame()
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    _, _, boundary_index = resolve_locations(
        frame.drop_duplicates("mkey")[["mandal_uuid", "district", "mandal"]], geo)

    levels = frame.pivot_table(index="mkey", columns="date", values="level_mbgl", aggfunc="last")
    latest_month = sorted(levels.columns)[-1]
    year, target_mm = int(latest_month[:4]), int(latest_month[5:7])
    meta = frame.drop_duplicates("mkey").set_index("mkey")[
        ["district", "mandal", "aquifer_type", "specific_yield"]]
    table = score_recharge(levels, meta, year, target_mm)
    table["boundaryIndex"] = [boundary_index.get(key) for key in table.index]

    # Metres of water table are not water. A metre lost from hard rock holds a
    # fraction of the water a metre lost from the delta does, so a map coloured
    # by metres answers "will my bore still reach it" and not "how much has this
    # district actually lost". Both are wanted; only the first was published.
    # Specific yield is taken from the frame, so this inherits the engine's own
    # decision about where the measured CGWB value overrides the aquifer proxy.
    areas = mandal_areas(geo)
    table["areaKm2"] = [
        areas.get(int(index)) if index is not None and not pd.isna(index) else None
        for index in table.boundaryIndex
    ]
    table["shortfallMm3"] = [
        None if area is None or pd.isna(area) or pd.isna(yield_) else shortfall * float(yield_) * area
        for shortfall, yield_, area in zip(table.shortfallM, table.specific_yield, table.areaKm2)
    ]

    oni = load_oni()
    seasons = season_history(levels, table.index, year, target_mm, oni)
    trajectory = season_trajectory(levels, table.index, year, target_mm)
    pre = f"{year}-{PRE_MONSOON_MONTH:02d}"

    districts = []
    for name, rows in table.groupby("district"):
        districts.append({
            "district": name,
            "mandals": int(len(rows)),
            "thisSeasonM": round(float(rows.thisSeasonM.median()), 2),
            "typicalM": round(float(rows.typicalM.median()), 2),
            "shortfallM": round(float(rows.shortfallM.median()), 2),
            "shortMandals": int(rows.short.sum()),
        })

    mandals = []
    for key, row in table.sort_values("severity", ascending=False).iterrows():
        mandals.append({
            "mandalUuid": key,
            "boundaryIndex": None if row.boundaryIndex is None or pd.isna(row.boundaryIndex) else int(row.boundaryIndex),
            "district": row.district, "mandal": row.mandal, "aquifer": row.aquifer_type,
            "thisSeasonM": round(float(row.thisSeasonM), 2),
            "typicalM": round(float(row.typicalM), 2),
            "shortfallM": round(float(row.shortfallM), 2),
            # Four decimals, not three: hard-rock yields sit near 0.02, where a
            # third-decimal rounding moves the product by about 3% and the
            # published columns stop multiplying out to the published volume.
            "specificYield": None if pd.isna(row.specific_yield) else round(float(row.specific_yield), 4),
            "areaKm2": None if pd.isna(row.areaKm2) else round(float(row.areaKm2), 1),
            "shortfallMm3": None if pd.isna(row.shortfallMm3) else round(float(row.shortfallMm3), 1),
            "spreadM": round(float(row.spreadM), 2),
            "latestDepthM": round(float(row.latestDepthM), 2),
            "comparableYears": int(row.comparableYears),
            "severity": round(float(row.severity), 2),
            "status": "severe" if row.severe else "short" if row.short else "normal",
        })

    # Both halves of the CHIRPS record: the archive that stops in 2013 and the
    # file the weekly refresh appends to. The composites want all 45 years.
    rain_paths = history_paths()
    rainfall = sw = ne = history = None
    if rain_paths:
        rain = pd.concat([pd.read_csv(path) for path in rain_paths], ignore_index=True)
        rain["year"] = rain.date.str.slice(0, 4).astype(int)
        rain["mon"] = rain.date.str.slice(5, 7).astype(int)
        district_of = rain.drop_duplicates("boundary_index").set_index("boundary_index").district.to_dict()
        elapsed = tuple(m for m in SW_MONSOON if m <= target_mm)
        if elapsed:
            totals = seasonal_totals(rain, elapsed, "mm")
            yearly = totals.groupby("year")["mm"].mean()
            if year in yearly.index and len(yearly) > 5:
                other = yearly.drop(year)
                rainfall = {
                    "months": f"{elapsed[0]:02d}-{elapsed[-1]:02d}",
                    "mm": round(float(yearly[year]), 1),
                    "normalMm": round(float(other.mean()), 1),
                    "anomalyPct": round(float(100 * (yearly[year] / other.mean() - 1)), 1),
                    "rankDriest": int((yearly <= yearly[year]).sum()),
                    "ofYears": int(len(yearly)),
                    "firstYear": int(yearly.index.min()),
                    "source": CHIRPS_SOURCE,
                    "product": "CHIRPS v2.0 monthly, 0.05 degrees, mandal mean",
                }
        # index 6 is the JJA season of ONI, 10 is OND: the seasons that drive
        # the south-west and north-east monsoons respectively.
        # The elapsed months only, so every year in the chart covers the same
        # stretch as the year being read against them.
        if elapsed:
            history = rainfall_history(rain, elapsed, oni)
        sw = composite(seasonal_totals(rain, SW_MONSOON, "mm"), "mm", oni, 6, district_of)
        ne = composite(seasonal_totals(rain, NE_MONSOON, "mm"), "mm", oni, 10, district_of)

    return {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": utc_now(),
        "season": {
            "year": year, "preMonsoonMonth": pre, "latestMonth": latest_month,
            "monthsElapsed": target_mm - PRE_MONSOON_MONTH,
        },
        "enso": enso_context(oni),
        "recharge": {
            "mandals": int(len(table)),
            "falling": int((table.thisSeasonM > 0).sum()),
            "fallingPct": round(float(100 * (table.thisSeasonM > 0).mean()), 1),
            "shortOfNormal": int((table.shortfallM > 0).sum()),
            "shortOfNormalPct": round(float(100 * (table.shortfallM > 0).mean()), 1),
            "flaggedShort": int(table.short.sum()),
            "flaggedSevere": int(table.severe.sum()),
            # Flagged mandals whose source series never reconciled to a polygon,
            # so the map cannot draw them. Published as a number because a map
            # that quietly omits nine flagged mandals is worse than one that
            # says it does. They are still in the table and the export.
            "flaggedWithoutBoundary": int(
                (table.short & table.boundaryIndex.isna()).sum()),
            "medianShortfallM": round(float(table.shortfallM.median()), 2),
            "byAquifer": [
                {"aquifer": name,
                 "mandals": int(len(rows)),
                 "medianShortfallM": round(float(rows.shortfallM.median()), 2),
                 "medianSpecificYield": round(float(rows.specific_yield.median()), 3),
                 "shortfallMm3": round(float(rows.shortfallMm3.sum(skipna=True)), 0),
                 "fallingPct": round(float(100 * (rows.thisSeasonM > 0).mean()), 1)}
                for name, rows in table.groupby("aquifer_type")
            ],
            "volume": volume_summary(table),
            "rule": (f"May-to-{latest_month} change against the same mandal's median over the "
                     f"previous {LOOKBACK_YEARS} years; flagged short at >= {SHORTFALL_M} m AND "
                     f">= {SHORTFALL_Z}x its own year-to-year spread"),
        },
        "seasons": seasons,
        "trajectory": trajectory,
        "rainfall": rainfall,
        "rainfallHistory": history,
        "elNinoRainfall": {"swMonsoon": sw, "neMonsoon": ne},
        "districts": sorted(districts, key=lambda row: -row["shortfallM"]),
        "mandals": mandals,
    }


def main():
    payload = build()
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    r = payload["recharge"]
    print(f"  season {payload['season']['preMonsoonMonth']} -> {payload['season']['latestMonth']}")
    print(f"  {r['mandals']} mandals compared; {r['falling']} ({r['fallingPct']}%) lower than in May; "
          f"{r['flaggedShort']} flagged short, {r['flaggedSevere']} severe")
    if payload["enso"]:
        e = payload["enso"]
        print(f"  ENSO {e['season']} {e['oniC']:+.2f} C -> {e['state']} ({e['strength']})")
    if payload["rainfall"]:
        rain = payload["rainfall"]
        print(f"  rain {rain['mm']} mm vs {rain['normalMm']} normal ({rain['anomalyPct']:+.1f}%), "
              f"{rain['rankDriest']} of {rain['ofYears']} driest since {rain['firstYear']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
