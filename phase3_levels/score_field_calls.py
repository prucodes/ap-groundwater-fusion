"""The crop water check's live scorecard: each week's calls frozen, then scored three weeks later.

The track record (build_crop_water_record.py) re-runs the check on past weeks
with the weather that happened. This is the stricter test: the calls the page
actually made, on the ECMWF forecast it actually had, written down the week
they were made and never changed, then compared with what the satellite saw.

Each weekly refresh, after the field signals:
1. freeze: this week's call for every mandal, crop and stage, from the same
   inputs and the same code as the page's cross-check (fetch_field_signals),
   into phase3_levels/data/field_calls/<issue date>.json. A week already
   frozen is never rewritten.
2. score: for every frozen week whose outcome week is published (the NOAA VHP
   week three weeks on, read nine days after it starts, as the track record
   does), the vegetation index per mandal at the call week and the outcome
   week, weighted to rainfed cropland and to all cropland, kept beside the
   calls (vci_<year>_<week>.json) so a score can be re-derived.
3. field scale: the same weeks against Sentinel-2 at 160 m over rainfed
   cropland pixels (build_sentinel_outcomes.py; the tile masks are committed),
   one pair of weekly composites per week, kept as s2_<issue date>.json. Rabi
   (October to March) is the clear season, when this test can read most mandals.
4. summarise: the track record's comparison, over rainfed fields, on the live
   calls so far: inside the same mandal and season, vegetation three weeks
   after "short" against after "comfortable". Seasons: kharif June to
   September, rabi October to May.

Output: app/data/crop_water_scorecard.json (small, client-safe).
"""
import datetime
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import crop_water  # noqa: E402
from build_crop_water_record import (IRRIGATED_SHARE, LEAD_WEEKS, comparisons, rainfed_grid, sentinel_verdict,  # noqa: E402
                                     tally, verdict, week_start)
from fetch_field_signals import (OUT as FIELD, WATER_CONTEXT, cell_labels, cropland_grid, geometry,  # noqa: E402
                                 load_json, soil_by_boundary, weighted_means)

ROOT = os.path.join(HERE, "..")
CALLS = os.path.join(HERE, "data", "field_calls")
OUT = os.path.join(ROOT, "app", "data", "crop_water_scorecard.json")
STATE_CODES = {"stressed": "s", "soon": "w", "ok": "o"}   # "u": no reading
KEYS = [f"{crop}-{stage}" for crop in crop_water.CROPS for stage in range(3)]
VHP_WEEKS_PER_YEAR = 52


def vhp_week(day):
    """The VHP week a date falls in, numbered as the track record numbers them (week 1 from 1 January)."""
    return day.year, min(VHP_WEEKS_PER_YEAR, (day - datetime.date(day.year, 1, 1)).days // 7 + 1)


def plus_weeks(year, week, n):
    week += n
    while week > VHP_WEEKS_PER_YEAR:
        year, week = year + 1, week - VHP_WEEKS_PER_YEAR
    return year, week


def season_of(day):
    if 6 <= day.month <= 9:
        return f"{day.year} kharif"
    first = day.year if day.month >= 10 else day.year - 1
    return f"{first}-{str(first + 1)[2:]} rabi"


def outcome_due(issued):
    year, week = plus_weeks(*vhp_week(issued), LEAD_WEEKS)
    return year, week, week_start(year, week) + datetime.timedelta(days=9)


def freeze(field, context, calls_dir=CALLS):
    """This week's calls, one string of 21 state codes per mandal (crop by crop, stage by stage)."""
    weather, capacity = field.get("weather"), field.get("soilCapacity")
    soil = (context or {}).get("soilMoisture")
    if not weather or not capacity or not soil or soil.get("asOf") not in weather["dates"] or weather["issued"] not in weather["dates"]:
        return None
    path = os.path.join(calls_dir, f"{weather['issued']}.json")
    if os.path.exists(path):
        return path
    count = len(capacity["values"])
    pct = soil_by_boundary(context, count)
    start, today = weather["dates"].index(soil["asOf"]), weather["dates"].index(weather["issued"])
    states = []
    for i in range(count):
        if not weather["eto"][i]:
            states.append(None)
            continue
        codes = ""
        for crop in crop_water.CROPS:
            for stage in range(3):
                result = crop_water.check(pct[i], capacity["values"][i], weather["eto"][i], weather["rain"][i], start, today, crop, stage)
                codes += STATE_CODES[result["state"]] if result else "u"
        states.append(codes if codes.strip("u") else None)
    issued = datetime.date.fromisoformat(weather["issued"])
    year, week = vhp_week(issued)
    payload = {"issued": weather["issued"], "soilAsOf": soil["asOf"], "forecast": weather.get("model"), "vhpWeek": [year, week],
               "keys": KEYS, "codes": {"s": "short now", "w": "short within 7 days", "o": "comfortable", "u": "no reading"},
               "frozenAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"), "states": states}
    os.makedirs(calls_dir, exist_ok=True)
    with open(path, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    return path


def vegetation(year, week, calls_dir=CALLS, read=None):
    """Per-mandal VCI for one VHP week, to cropland and to rainfed cropland; kept beside the calls."""
    path = os.path.join(calls_dir, f"vci_{year}_{week:03d}.json")
    if os.path.exists(path):
        return json.load(open(path))
    if read is None:
        from build_drought_watch import vhp_window
        from fetch_chirps_history import mandal_shapes
        data, transform = vhp_window(year, week)
        labels, extra = cell_labels(mandal_shapes(), data.shape, transform)
        count = len(geometry())
        _, crop_weights = cropland_grid()
        cropland = [round(c if c is not None else a, 2) if (c is not None or a is not None) else None
                    for c, a, _ in weighted_means(data, crop_weights, labels, extra, count)]
        rainfed = [round(c, 2) if c is not None else None for c, _, _ in weighted_means(data, rainfed_grid(), labels, extra, count)]
        value = {"year": year, "week": week, "cropland": cropland, "rainfed": rainfed}
    else:
        value = read(year, week)
    with open(path, "w") as handle:
        json.dump(value, handle, separators=(",", ":"))
        handle.write("\n")
    return value


_sentinel = {}


def field_outcome(calls, calls_dir=CALLS, compute=None):
    """Sentinel-2 at field scale for one frozen week: per mandal [NDVI change, NDVI after, pixels] over
    rainfed cropland pixels clear both in the call week and three weeks on (build_sentinel_outcomes.py),
    kept beside the calls as s2_<issue date>.json so each week is read once."""
    path = os.path.join(calls_dir, f"s2_{calls['issued']}.json")
    if os.path.exists(path):
        return json.load(open(path))["mandals"]
    if compute is not None:
        rows = compute(calls)
    else:
        import build_sentinel_outcomes as s2
        from fetch_chirps_history import mandal_shapes
        if not _sentinel:
            shapes = mandal_shapes()
            grids = s2.tiles(shapes)
            _sentinel.update(grids=grids, masks={name: s2.tile_masks(name, grid, shapes) for name, grid in grids.items()},
                             bounds=s2.state_shape(shapes).bounds)
        year, week = calls["vhpWeek"]
        later = plus_weeks(year, week, LEAD_WEEKS)
        before = s2.week_composite(year, week, _sentinel["grids"], _sentinel["masks"], _sentinel["bounds"])
        after = s2.week_composite(*later, _sentinel["grids"], _sentinel["masks"], _sentinel["bounds"])
        rows = s2.outcomes(before, after, _sentinel["masks"], len(geometry()))
    with open(path, "w") as handle:
        json.dump({"issued": calls["issued"], "fields": ["ndviChange", "ndviAfter", "pixels"], "mandals": rows}, handle, separators=(",", ":"))
        handle.write("\n")
    return rows


def summarise_field(frozen, fields):
    """As summarise, on the field-scale reading: each mandal's NDVI change less the State's median change that week."""
    pots = {key: {"across": {}, "seasons": {}} for key in KEYS}
    for calls in frozen:
        rows = fields.get(calls["issued"])
        known = [r for r in rows or [] if r]
        if len(known) < 30:
            continue
        mid_change = sorted(r[0] for r in known)[len(known) // 2]
        mid_after = sorted(r[1] for r in known)[len(known) // 2]
        season = season_of(datetime.date.fromisoformat(calls["issued"]))
        for i, codes in enumerate(calls["states"]):
            row = rows[i] if i < len(rows) else None
            if not codes or row is None:
                continue
            for k, code in enumerate(codes):
                if code == "u":
                    continue
                for pot in (pots[KEYS[k]]["across"], pots[KEYS[k]]["seasons"].setdefault(season, {})):
                    side = pot.setdefault(i, {"short": tally(), "ok": tally()})["ok" if code == "o" else "short"]
                    side["n"] += 1
                    side["change"] += row[0] - mid_change
                    side["after"] += row[1] - mid_after
    out = {}
    for key, pot in pots.items():
        inside = comparisons(pot, digits=4)
        out[key] = {"within": inside, "verdict": sentinel_verdict(inside)}
    return out


def summarise(frozen, outcomes, rainfed_mandals):
    """The track record's comparisons over the scored live weeks, rainfed fields only."""
    pots = {key: {"across": {}, "seasons": {}} for key in KEYS}
    for calls in frozen:
        pair = outcomes.get(calls["issued"])
        if not pair:
            continue
        before, after = pair
        season = season_of(datetime.date.fromisoformat(calls["issued"]))
        for i, codes in enumerate(calls["states"]):
            if not codes or i not in rainfed_mandals:
                continue
            b, a = before["rainfed"][i], after["rainfed"][i]
            if b is None or a is None:
                continue
            for k, code in enumerate(codes):
                if code == "u":
                    continue
                side_name = "ok" if code == "o" else "short"
                for pot in (pots[KEYS[k]]["across"], pots[KEYS[k]]["seasons"].setdefault(season, {})):
                    side = pot.setdefault(i, {"short": tally(), "ok": tally()})[side_name]
                    side["n"] += 1
                    side["change"] += a - b
                    side["after"] += a
    out = {}
    for key, pot in pots.items():
        inside = comparisons(pot)
        out[key] = {"within": inside, "verdict": verdict(inside)}
    return out


def main(today=None, read=None, compute=None):
    today = today or datetime.date.today()
    field, context = load_json(FIELD), load_json(WATER_CONTEXT)
    frozen_now = freeze(field, context)
    frozen = []
    for name in sorted(os.listdir(CALLS)) if os.path.isdir(CALLS) else []:
        if name[:4].isdigit() and name.endswith(".json") and not name.startswith("vci_"):
            frozen.append(json.load(open(os.path.join(CALLS, name))))
    irrigated = json.load(open(IRRIGATED_SHARE))
    rainfed_mandals = {i for i, s in enumerate(irrigated["share"]) if s is not None and s < irrigated["mostlyRainfedBelowPct"]}
    outcomes, fields, weeks = {}, {}, []
    for calls in frozen:
        issued = datetime.date.fromisoformat(calls["issued"])
        year, week, due = outcome_due(issued)
        scored = False
        if due <= today:
            try:
                before = vegetation(*calls["vhpWeek"], read=read)
                after = vegetation(year, week, read=read)
                outcomes[calls["issued"]] = (before, after)
                scored = True
            except Exception as error:  # an outcome week not yet published waits for next week
                print(f"  [wait] {calls['issued']}: {str(error)[:160]}")
            try:
                fields[calls["issued"]] = field_outcome(calls, compute=compute)
            except Exception as error:  # noqa: BLE001 - Sentinel-2 unreachable this week: read on the next run
                print(f"  [wait] field scale {calls['issued']}: {str(error)[:160]}")
        weeks.append({"issued": calls["issued"], "season": season_of(issued), "outcomeWeek": [year, week],
                      "due": due.isoformat(), "scored": scored, "fieldScored": calls["issued"] in fields,
                      "fieldMandals": sum(r is not None for r in fields.get(calls["issued"]) or [])})
    record = summarise(frozen, outcomes, rainfed_mandals)
    pending = [w["due"] for w in weeks if not w["scored"]]
    payload = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "method": "Each week's calls, made on that week's ECMWF forecast and frozen the day they were made, compared three weeks later with the NOAA STAR vegetation index over rainfed cropland, inside the same mandal and season, as the track record compares them. Seasons: kharif June-September, rabi October-May.",
        "rainfedMandals": len(rainfed_mandals),
        "frozen": len(weeks), "scored": sum(w["scored"] for w in weeks),
        "firstFrozen": weeks[0]["issued"] if weeks else None, "nextDue": min(pending) if pending else None,
        "weeks": weeks, "record": record,
        # The same calls against Sentinel-2 at 160 m over rainfed cropland: the stricter, field-scale test.
        "fieldScale": {
            "method": "Sentinel-2 NDVI at 160 m over rainfed cropland pixels, the greenest clear view of the call week and of three weeks on; each mandal's change less the State's median that week, compared inside the same mandal and season (build_sentinel_outcomes.py).",
            "scored": sum(w["fieldScored"] for w in weeks), "record": summarise_field(frozen, fields),
        },
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    print(f"Scorecard: {payload['frozen']} weeks frozen ({frozen_now and os.path.basename(frozen_now)}), {payload['scored']} scored, "
          f"{payload['fieldScale']['scored']} at field scale; next due {payload['nextDue']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
