"""How the crop water check has fared: re-run on past kharif weeks, against what the crops' vegetation did next.

The check (crop_water.py) says, for a crop and stage, whether a mandal is short
of water now, will be within seven days, or is comfortable. This asks whether
those calls meant anything: in the weeks it called a mandal short of water, did
the vegetation on its cropland go on to fall more often than in the weeks it
called the mandal comfortable?

- Check dates: the middle of each NOAA VHP week from early July to early
  September, in the 2024 and 2025 kharif seasons and this one so far.
- Inputs, exactly as the live check uses them, except the weather: APWRIMS's
  NRSC soil moisture on the check date (the portal serves any past date),
  SoilGrids' water-holding capacity, and the FAO-56 crop references. The
  weather is ERA5 reanalysis (Copernicus / ECMWF, via Open-Meteo's archive):
  what happened, not what was forecast. So "short now" is tested as the live
  page makes it; "within seven days" is tested as if the forecast were perfect.
- Outcome: NOAA STAR's vegetation index over each mandal's cropland (weighted
  with ESA WorldCover, as on the page), three weeks after the check week
  against the check week. "Fell" means down by 5 points or more. VCI already
  compares each week with the same week in other years, so the season's own
  greening and drying is not mistaken for stress.

The vegetation index comes from a satellite and the soil moisture from a land
model driven by rain; neither is computed from the other, which is what makes
the comparison a test.

Two comparisons were run first and are kept for reference, because each one
flatters or hides the check for a reason that is not the check:
- pooled across mandals, the calls do not separate vegetation at all: the
  places called short most often are the chronically dry ones, the index
  compares each place with its own past, so their vegetation reads normal for
  them, and irrigated fields stay green whatever the soil model says;
- inside one mandal but pooled across seasons, the gap is large, mostly
  because "short" calls come in the drier seasons: the check tells a dry
  season from a wet one, as rainfall alone would.
The verdict holds both fixed: inside the same mandal and the same season,
vegetation three weeks after a "short" call (now or within seven days) against
three weeks after a "comfortable" one.

The check is a rainfed water balance, so the headline reading is over rainfed
fields: mandals where less than half the cropland is irrigated (ESA WorldCereal,
build_irrigated_fraction.py), with the vegetation index weighted to rainfed
cropland only. The same comparison over all cropland, irrigated fields
included, is kept beside it.

Verdict for each crop and stage, as the forecast notes do:
- backed by its record: at least 5 index points lower after "short", overall
  and in every season, with at least two seasons of 30 mandals or more (one
  season is not a record);
- weak record: at least 1 point lower, short of that;
- not borne out: less than 1 point lower, or higher;
- untested: fewer than 100 mandal-seasons with both kinds of call.

Output: app/data/crop_water_record.json (small, client-safe). Downloads are
cached in data/private/crop_water_record/ (git-ignored). Run by hand, or when
a season ends; the live check needs nothing from it.
"""
import datetime
import json
import os
import sys
import time
import urllib.parse

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import crop_water  # noqa: E402
from build_drought_watch import vhp_week_label, vhp_window  # noqa: E402
from fetch_apwrims_context import boundaries_for, location_tree, soil_table  # noqa: E402
from fetch_field_signals import (cell_labels, cropland_grid, geometry, mandal_points, request_json,  # noqa: E402
                                 weighted_means)
from fetch_chirps_history import mandal_shapes  # noqa: E402

ROOT = os.path.join(HERE, "..")
OUT = os.path.join(ROOT, "app", "data", "crop_water_record.json")
CACHE = os.path.join(ROOT, "data", "private", "crop_water_record")
CAPACITY = os.path.join(HERE, "data", "mandal_soil_water_capacity.json")
IRRIGATED_GRID = os.path.join(HERE, "data", "vhp_irrigated_fraction.json")
IRRIGATED_SHARE = os.path.join(HERE, "data", "mandal_irrigated_share.json")
SENTINEL = os.path.join(HERE, "data", "sentinel_outcomes.json")
# Sentinel-2's field-scale reading (build_sentinel_outcomes.py). Set before the outcomes were read:
SENTINEL_BACKED = 0.02        # NDVI: at least this much less three-week change after "short", same mandal and season
SENTINEL_NOTED = 0.005        # less than this is no difference worth the name

SEASONS = (2024, 2025, 2026)
WEEKS = range(27, 37)          # VHP weeks beginning about 2 July to 3 September
LEAD_WEEKS = 3
FALL = -5.0                    # VCI points
SEVERE_VCI = 40.0              # the drought manual's "severe" line (Table 3.4)
BACKED_POINTS = 5.0            # VCI points lower after "short" than after "comfortable", same mandal and season
NOTED_POINTS = 1.0             # less than this is no difference worth the name
MIN_MANDALS = 100              # mandal-seasons with both kinds of call
MIN_SEASON_MANDALS = 30
MIN_BACKED_SEASONS = 2         # a single season, however clear, is not a track record
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
ARCHIVE_PAUSE_S = 5            # one location-season (~6 calls) every 5 s stays under 5,000 calls an hour


def cached(name, build):
    path = os.path.join(CACHE, name)
    if os.path.exists(path):
        return json.load(open(path))
    value = build()
    os.makedirs(CACHE, exist_ok=True)
    with open(path + ".tmp", "w") as handle:
        json.dump(value, handle)
    os.replace(path + ".tmp", path)
    return value


def week_start(year, week):
    return datetime.date(year, 1, 1) + datetime.timedelta(days=7 * (week - 1))


def check_day(year, week):
    return week_start(year, week) + datetime.timedelta(days=3)


def cells_for(points):
    """Each mandal's ERA5 cell (0.25 degrees): many mandals share one, so it is fetched once."""
    return [None if p is None else (round(p[0] * 4) / 4, round(p[1] * 4) / 4) for p in points]


def archive(cell, start, end):
    query = urllib.parse.urlencode({
        "latitude": cell[0], "longitude": cell[1], "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": "et0_fao_evapotranspiration,precipitation_sum", "timezone": "Asia/Kolkata", "models": "era5"})
    answer = request_json(f"{ARCHIVE}?{query}")
    daily = answer.get("daily") or {}
    time.sleep(ARCHIVE_PAUSE_S)
    return {"dates": daily.get("time"), "eto": daily.get("et0_fao_evapotranspiration"), "rain": daily.get("precipitation_sum")}


def season_weather(year, cells, weeks):
    start, end = check_day(year, weeks[0]), check_day(year, weeks[-1]) + datetime.timedelta(days=crop_water.OUTLOOK_DAYS + 1)
    out = {}
    for cell in sorted({c for c in cells if c}):
        key = f"era5_{year}_{cell[0]:.2f}_{cell[1]:.2f}.json"
        out[cell] = cached(key, lambda cell=cell: archive(cell, start, end))
    return out


def season_soil(year, weeks, tree, boundaries, count):
    """APWRIMS soil moisture on each check date, by boundary; a boundary claimed twice is left out."""
    out = {}
    for week in weeks:
        day = check_day(year, week)

        def build(day=day):
            rows = soil_table(day)
            time.sleep(1)
            return {uid: [round(v, 1) for v in row["pct"]] for uid, row in rows.items()}
        rows = cached(f"soil_{day.isoformat()}.json", build)
        seen = {}
        for uid, pct in rows.items():
            index = boundaries.get(uid, (None, None))[0]
            if index is not None and 0 <= index < count:
                seen[index] = None if index in seen else pct
        out[week] = [seen.get(i) for i in range(count)]
    return out


def rainfed_grid():
    payload = json.load(open(IRRIGATED_GRID))
    share = np.array(payload["rainfed"], dtype="float64")
    return np.where(share >= 0, share / 100.0, 0.0)


def season_vegetation(year, weeks, count):
    """VCI per mandal for every week needed: weighted to cropland as the live page computes it, and to
    rainfed cropland only (None where a mandal has too little of it to read)."""
    shapes = mandal_shapes()
    meta, weights = cropland_grid()
    rainfed = rainfed_grid()
    labels = extra = None
    out, out_rainfed = {}, {}
    for week in sorted({w for w in weeks} | {w + LEAD_WEEKS for w in weeks}):
        window = {}

        def read(week=week):
            nonlocal labels, extra
            if "data" not in window:
                window["data"], transform = vhp_window(year, week)
                if labels is None:
                    labels, extra = cell_labels(shapes, window["data"].shape, transform)
            return window["data"]

        def build(week=week):
            means = weighted_means(read(), weights, labels, extra, count)
            return [crop if crop is not None else full for crop, full, _ in means]

        def build_rainfed(week=week):
            return [crop for crop, _, _ in weighted_means(read(), rainfed, labels, extra, count)]
        out[week] = cached(f"vci_{year}_{week:03d}.json", build)
        out_rainfed[week] = cached(f"vcir_{year}_{week:03d}.json", build_rainfed)
    return out, out_rainfed


def within_mandal(mandals, digits=1):
    """Inside each mandal with both kinds of call: vegetation after "short" (now or within 7 days) against after "comfortable"."""
    diffs_change, diffs_after = [], []
    for sides in mandals.values():
        short, ok = sides["short"], sides["ok"]
        if short["n"] and ok["n"]:
            diffs_change.append(short["change"] / short["n"] - ok["change"] / ok["n"])
            diffs_after.append(short["after"] / short["n"] - ok["after"] / ok["n"])
    if not diffs_change:
        return {"mandals": 0, "changeGap": None, "afterGap": None, "worsePct": None}
    return {"mandals": len(diffs_change),
            "changeGap": round(sum(diffs_change) / len(diffs_change), digits),
            "afterGap": round(sum(diffs_after) / len(diffs_after), digits),
            "worsePct": round(100 * sum(d < 0 for d in diffs_change) / len(diffs_change), 1)}


def verdict(inside):
    """On the comparison inside each mandal and season: vegetation three weeks after "short" against after "comfortable"."""
    same = inside["sameSeason"]
    if same["mandals"] < MIN_MANDALS:
        return "untested"
    seasons = [s for s in inside["seasons"].values() if s["mandals"] >= MIN_SEASON_MANDALS]
    if same["afterGap"] <= -BACKED_POINTS and len(seasons) >= MIN_BACKED_SEASONS and all(s["afterGap"] < 0 for s in seasons):
        return "backed"
    if same["afterGap"] <= -NOTED_POINTS:
        return "weak"
    return "not borne out"


def sentinel_verdict(inside):
    """The field-scale reading's verdict, on the change over three weeks (NDVI, relative to the State that week)."""
    same = inside["sameSeason"]
    if same["mandals"] < MIN_MANDALS:
        return "untested"
    seasons = [x for x in inside["seasons"].values() if x["mandals"] >= MIN_SEASON_MANDALS]
    if same["changeGap"] <= -SENTINEL_BACKED and len(seasons) >= MIN_BACKED_SEASONS and all(x["changeGap"] < 0 for x in seasons):
        return "backed"
    if same["changeGap"] <= -SENTINEL_NOTED:
        return "weak"
    return "not borne out"


def sentinel_outcomes():
    """{(year, week): [(relative change, relative level, pixels) or None per mandal]}: each mandal's NDVI change
    over the three weeks less the State's median change that week, so the season's common greening drops out."""
    if not os.path.exists(SENTINEL):
        return {}, None
    payload = json.load(open(SENTINEL))
    out = {}
    for entry in payload["weeks"]:
        rows = entry["mandals"]
        known = [r for r in rows if r]
        if len(known) < 30:
            continue
        mid_change = sorted(r[0] for r in known)[len(known) // 2]
        mid_after = sorted(r[1] for r in known)[len(known) // 2]
        out[(entry["year"], entry["week"])] = [None if r is None else (r[0] - mid_change, r[1] - mid_after, r[2]) for r in rows]
    return out, payload


def comparisons(pots, digits=1):
    """Every mandal-season with both kinds of call is one comparison ("mandals" counts mandal-seasons in sameSeason)."""
    by_season = pots["seasons"]
    return {"sameSeason": within_mandal({(year, i): sides for year, pot in by_season.items() for i, sides in pot.items()}, digits),
            "acrossSeasons": within_mandal(pots["across"], digits),
            "seasons": {year: within_mandal(pot, digits) for year, pot in sorted(by_season.items())}}


def tally():
    return {"n": 0, "fell": 0, "severe": 0, "change": 0.0, "after": 0.0}


def summarise(t):
    pct = lambda k: round(100 * t[k] / t["n"], 1) if t["n"] else None  # noqa: E731
    mean = lambda k: round(t[k] / t["n"], 1) if t["n"] else None  # noqa: E731
    return {"n": t["n"], "severePct": pct("severe"), "fellPct": pct("fell"), "meanAfter": mean("after"), "meanChange": mean("change")}


def main():
    count = len(geometry())
    capacity = json.load(open(CAPACITY))["values"]
    points = mandal_points(mandal_shapes(), count)
    cells = cells_for(points)
    tree = location_tree()
    boundaries = boundaries_for(tree)
    results = {f"{c}-{s}": {"all": {k: tally() for k in ("stressed", "soon", "ok")}, "seasons": {}} for c in crop_water.CROPS for s in range(3)}
    # Per mandal: the same comparisons inside one mandal, so a chronically dry place is
    # compared with itself, not with a wet one (the index is already relative to its own past).
    within = {key: {"across": {}, "seasons": {}} for key in results}
    within_rainfed = {key: {"across": {}, "seasons": {}} for key in results}
    within_sentinel = {key: {"across": {}, "seasons": {}} for key in results}
    sentinel, sentinel_meta = sentinel_outcomes()
    sentinel_pairs = sentinel_read = 0
    irrigated = json.load(open(IRRIGATED_SHARE))
    rainfed_mandals = {i for i, share in enumerate(irrigated["share"]) if share is not None and share < irrigated["mostlyRainfedBelowPct"]}
    weeks_used = []
    today = datetime.date.today()
    for year in SEASONS:
        weeks = [w for w in WEEKS if week_start(year, w + LEAD_WEEKS) + datetime.timedelta(days=9) <= today]
        if not weeks:
            continue
        print(f"{year}: weeks {weeks[0]}-{weeks[-1]}", flush=True)
        weather = season_weather(year, cells, weeks)
        soil = season_soil(year, weeks, tree, boundaries, count)
        veg, veg_rainfed = season_vegetation(year, weeks, count)
        for week in weeks:
            day = check_day(year, week)
            weeks_used.append({"year": year, "week": week, "checkDay": day.isoformat(), "outcomeWeek": vhp_week_label(year, week + LEAD_WEEKS)})
            for i in range(count):
                pct, cap, cell = soil[week][i], capacity[i], cells[i]
                before, after = veg[week][i], veg[week + LEAD_WEEKS][i]
                if pct is None or cap is None or cell is None or before is None or after is None:
                    continue
                series = weather[cell]
                if day.isoformat() not in (series["dates"] or []):
                    continue
                start = series["dates"].index(day.isoformat())
                eto, rain = series["eto"][start:start + 1 + crop_water.OUTLOOK_DAYS + 1], series["rain"][start:start + 1 + crop_water.OUTLOOK_DAYS + 1]
                if len(eto) < 1 + crop_water.OUTLOOK_DAYS + 1 or any(v is None for v in eto + rain):
                    continue
                change = after - before
                r_before, r_after = veg_rainfed[week][i], veg_rainfed[week + LEAD_WEEKS][i]
                rainfed_ok = i in rainfed_mandals and r_before is not None and r_after is not None
                field = (sentinel.get((year, week)) or [None] * count)[i]
                if i in rainfed_mandals:
                    sentinel_pairs += 1
                    sentinel_read += field is not None
                for crop in crop_water.CROPS:
                    for stage in range(3):
                        result = crop_water.check(pct, cap, eto, rain, 0, 1, crop, stage)
                        if result is None:
                            continue
                        entry = results[f"{crop}-{stage}"]
                        season = entry["seasons"].setdefault(str(year), {k: tally() for k in ("stressed", "soon", "ok")})
                        pots = within[f"{crop}-{stage}"]
                        sided = "ok" if result["state"] == "ok" else "short"
                        for pot in (pots["across"], pots["seasons"].setdefault(str(year), {})):
                            side = pot.setdefault(i, {"short": tally(), "ok": tally()})[sided]
                            side["n"] += 1
                            side["change"] += change
                            side["after"] += after
                        if field is not None:
                            pots_s = within_sentinel[f"{crop}-{stage}"]
                            for pot in (pots_s["across"], pots_s["seasons"].setdefault(str(year), {})):
                                side = pot.setdefault(i, {"short": tally(), "ok": tally()})[sided]
                                side["n"] += 1
                                side["change"] += field[0]
                                side["after"] += field[1]
                        if rainfed_ok:
                            pots_r = within_rainfed[f"{crop}-{stage}"]
                            for pot in (pots_r["across"], pots_r["seasons"].setdefault(str(year), {})):
                                side = pot.setdefault(i, {"short": tally(), "ok": tally()})[sided]
                                side["n"] += 1
                                side["change"] += r_after - r_before
                                side["after"] += r_after
                        for bucket in (entry["all"][result["state"]], season[result["state"]]):
                            bucket["n"] += 1
                            bucket["fell"] += 1 if change <= FALL else 0
                            bucket["severe"] += 1 if after < SEVERE_VCI else 0
                            bucket["change"] += change
                            bucket["after"] += after
    record = {}
    for key, entry in results.items():
        overall = {k: summarise(v) for k, v in entry["all"].items()}
        seasons = {year: {k: summarise(v) for k, v in s.items()} for year, s in entry["seasons"].items()}
        inside, inside_rainfed = comparisons(within[key]), comparisons(within_rainfed[key])
        inside_sentinel = comparisons(within_sentinel[key], digits=4)   # NDVI, not index points
        record[key] = {"rainfed": {"within": inside_rainfed, "verdict": verdict(inside_rainfed)},
                       **({"sentinel": {"within": inside_sentinel, "verdict": sentinel_verdict(inside_sentinel)}} if sentinel else {}),
                       "allCropland": {"within": inside, "verdict": verdict(inside)},
                       "across": {**overall, "seasons": seasons}}
    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "question": "Three weeks after the check called a mandal's crop short of water, was the vegetation on its cropland worse than three weeks after it called the same mandal comfortable in the same season?",
        "outcome": f"Crop vegetation (NOAA STAR VCI, weighted to cropland) {LEAD_WEEKS} weeks after the check week. 'within': inside each mandal with both kinds of call, mean VCI after 'short' (now or within 7 days) minus after 'comfortable' (afterGap), the same for the change over the three weeks (changeGap), and the share where it changed for the worse (worsePct); 'sameSeason' counts mandal-seasons and drives the verdict, 'acrossSeasons' pools a mandal's seasons, 'seasons' is each season alone. 'across': all calls pooled over mandals, for reference: severePct = VCI under {SEVERE_VCI:.0f}, fellPct = down {abs(FALL):.0f} points or more.",
        "acrossCaveat": "Two comparisons were run first and are kept on record. Pooled across mandals the check does not separate vegetation: the places called short most often are the chronically dry ones, VCI compares each place with its own past, and irrigated fields stay green whatever the soil model says. Inside one mandal but pooled across seasons the gap is large, mostly because “short” calls come in the drier seasons. The verdict holds both the place and the season fixed.",
        "weather": "ERA5 reanalysis (Copernicus / ECMWF) via Open-Meteo's archive: the weather that happened, not the forecast. 'Within 7 days' is therefore tested as if the forecast were perfect.",
        "soil": "APWRIMS / NRSC VIC soil moisture on each check date; SoilGrids 2.0 water-holding capacity.",
        "headline": "rainfed",
        **({"sentinel": {
            "source": sentinel_meta["source"], "pixels": sentinel_meta["pixels"], "composite": sentinel_meta["composite"],
            "resolutionM": 160, "minPixels": sentinel_meta["minPixels"],
            "outcome": "NDVI change over the three weeks on rainfed cropland pixels clear in both weeks, less the State's median change that week; compared inside the same mandal and season.",
            "rules": {"backedNdvi": SENTINEL_BACKED, "notedNdvi": SENTINEL_NOTED,
                      "text": "Backed: at least 0.02 less NDVI change after 'short' than after 'comfortable', same mandal and season, overall and in every season, with at least two seasons of 30 mandals or more. Weak: at least 0.005 less. Not borne out: less than that. Untested: fewer than 100 mandal-seasons with both kinds of call. Set before the outcomes were read."},
            "coverage": {"rainfedMandalWeeks": sentinel_pairs, "read": sentinel_read,
                         "readPct": round(100 * sentinel_read / sentinel_pairs, 1) if sentinel_pairs else None},
        }} if sentinel else {}),
        "rainfed": {"mandals": len(rainfed_mandals), "of": count, "belowPct": irrigated["mostlyRainfedBelowPct"],
                    "stateIrrigatedPct": irrigated["summary"]["stateIrrigatedPct"],
                    "text": "Mandals where less than half the cropland was mapped irrigated (ESA WorldCereal, rabi 2020-21), with the vegetation index weighted to rainfed cropland only."},
        "rules": {"backedPoints": BACKED_POINTS, "notedPoints": NOTED_POINTS, "minMandals": MIN_MANDALS,
                  "minSeasonMandals": MIN_SEASON_MANDALS, "minBackedSeasons": MIN_BACKED_SEASONS,
                  "text": "Backed by its record: inside the same mandal and season, crop vegetation three weeks after a 'short' call reads at least 5 index points lower than after a 'comfortable' call, overall and in every season, with at least two seasons of 30 mandals or more. Weak record: at least 1 point lower, short of that. Not borne out: less than 1 point lower, or higher. Untested: fewer than 100 mandal-seasons with both kinds of call."},
        "seasons": sorted({w["year"] for w in weeks_used}),
        "checks": len(weeks_used),
        "weeks": weeks_used,
        "record": record,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    if sentinel:
        print(f"Sentinel-2: {sentinel_read} of {sentinel_pairs} rainfed mandal-weeks had a clear pair")
        for key, r in record.items():
            w = r["sentinel"]["within"]
            print(f"  {key:<14} sentinel same season {w['sameSeason']['changeGap']} ({w['sameSeason']['mandals']}) "
                  f"{[(y, x['changeGap'], x['mandals']) for y, x in w['seasons'].items()]} -> {r['sentinel']['verdict']}")
    for key, r in record.items():
        a, f = r["allCropland"], r["rainfed"]
        print(f"  {key:<14} rainfed {f['within']['sameSeason']['afterGap']} ({f['within']['sameSeason']['mandals']}) "
              f"{[(y, s['afterGap'], s['mandals']) for y, s in f['within']['seasons'].items()]} -> {f['verdict']:<14} "
              f"| all cropland {a['within']['sameSeason']['afterGap']} ({a['within']['sameSeason']['mandals']}) -> {a['verdict']}")
    print(f"Wrote {OUT}: {len(weeks_used)} check weeks in {payload['seasons']}")


if __name__ == "__main__":
    main()
