#!/usr/bin/env python3
"""Canal water this season against last season, from weekly snapshots of the
State's reservoir dashboard.

The water context (fetch_apwrims_context.py) records each reservoir's releases
on the day it is read: how many cusecs are going into each canal at the
headworks. A season's canal water is the sum of those flows over time, and the
dashboard serves no running total, so this keeps a weekly snapshot of every
canal release in phase3_levels/data/canal_release_samples.csv and adds them up
between snapshots (trapezoids, one cusec for a day being 2,446.6 m3).

The grid is every seventh day from 1 June, the start of the water year. Each
run fills any grid date up to today that is missing, one request per date, two
seconds apart; the first run also fills last season to the end of November, so
this season can be set against last season to the same date.

What it cannot say. A release is measured where water leaves the reservoir or
barrage, not where it reaches a field, and which mandals a canal serves needs the
command-area map, which is not public. Many outlets feed the next reservoir in a
chain (Srisailam to Pothireddypadu to the Galeru-Nagari reservoirs, for example),
so outlets are never summed into one State figure; the two delta heads, which
deliver to fields, lead instead. Reservoirs in neighbouring States are left out. Weekly snapshots miss what happens between
them, so the volumes are estimates of the scale and the comparison, not a water
account.

Output: app/data/canal_releases.json
"""
import csv
import datetime
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SAMPLES = os.path.join(HERE, "data", "canal_release_samples.csv")
OUT = os.path.join(ROOT, "app", "data", "canal_releases.json")
CUSEC_DAY_M3 = 2446.58
TMC_M3 = 28.3168e6
PAUSE_S = 2.0
STALE_DAYS = 3          # a reading this much older than the date asked for is not that date's flow
FIELDS = ["date", "reservoir", "district", "basin", "outlet", "cusecs"]
# Rows that are not an Andhra Pradesh canal release: reservoirs in a neighbouring
# State (the portal marks them "(KS)" or "(TS)"), and splits named as inflows or
# a catch-all.
NOT_A_CANAL = {"inflow", "others", "canals"}
# The two delta heads deliver to fields; most other outlets in the Krishna and
# Pennar chains feed the next reservoir, so outlets are never added into one
# State figure, which would count the same water several times.
DELTAS = {"SIR AURTHUR COTTON BARRAGE": "Godavari delta", "PRAKASAM BARRAGE": "Krishna delta"}


def in_scope(row):
    district = (row.get("district") or "")
    return not ("(KS)" in district or "(TS)" in district) and row["outlet"].strip().lower() not in NOT_A_CANAL

sys.path.insert(0, HERE)


def grid(start, end):
    day = start
    while day <= end:
        yield day
        day += datetime.timedelta(days=7)


def water_year_start(day):
    return datetime.date(day.year if day.month >= 6 else day.year - 1, 6, 1)


def snapshot(day):
    from fetch_apwrims_context import reservoir_component, reservoir_row  # the portal client: verified TLS, retries
    payload = reservoir_component(datetime.datetime.combine(day, datetime.time()))
    rows = []
    for kind in ("major", "medium"):
        for item in payload.get(kind) or []:
            row = reservoir_row(item, kind)
            seen = (row.get("observedAt") or "")[:10]
            if not seen or abs((datetime.date.fromisoformat(seen) - day).days) > STALE_DAYS:
                continue
            for release in row["releases"]:
                if release["kind"] == "canal" and release["cusecs"] > 0:
                    rows.append({"date": day.isoformat(), "reservoir": row["name"], "district": row["district"],
                                 "basin": row["basin"], "outlet": release["outlet"], "cusecs": release["cusecs"]})
    return rows


def load_samples():
    if not os.path.exists(SAMPLES):
        return [], set()
    rows = list(csv.DictReader(open(SAMPLES)))
    dates_file = SAMPLES + ".dates"
    dates = set(open(dates_file).read().split()) if os.path.exists(dates_file) else {r["date"] for r in rows}
    return rows, dates


def fill(today):
    """Fetch any missing grid date: this water year to today, and last season to 30 November."""
    rows, dates = load_samples()
    this_start = water_year_start(today)
    last_start = datetime.date(this_start.year - 1, 6, 1)
    wanted = [d for d in grid(last_start, datetime.date(last_start.year, 11, 30))] + list(grid(this_start, today))
    missing = [d for d in wanted if d.isoformat() not in dates]
    added = 0
    for day in missing:
        try:
            got = snapshot(day)
        except Exception as error:  # the portal is down: keep what we have, try again next week
            print(f"  {day}: no answer ({error}); stopping here")
            break
        rows.extend(got)
        dates.add(day.isoformat())
        added += 1
        time.sleep(PAUSE_S)
    if added:
        os.makedirs(os.path.dirname(SAMPLES), exist_ok=True)
        rows.sort(key=lambda r: (r["date"], r["reservoir"], r["outlet"]))
        with open(SAMPLES, "w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=FIELDS)
            writer.writeheader()
            writer.writerows(rows)
        # Dates asked for, including ones where nothing was flowing, so a quiet week is not re-asked.
        with open(SAMPLES + ".dates", "w") as handle:
            handle.write("\n".join(sorted(dates)) + "\n")
    return added


def volumes(rows, dates, start, end):
    """Mm3 per (reservoir, outlet) between start and end, trapezoids between sampled dates."""
    days = sorted(d for d in dates if start.isoformat() <= d <= end.isoformat())
    flows = {}
    for r in rows:
        if r["date"] in days:
            flows.setdefault((r["reservoir"], r["outlet"], r["basin"], r["district"]), {})[r["date"]] = float(r["cusecs"])
    out = {}
    for key, series in flows.items():
        total = 0.0
        for a, b in zip(days, days[1:]):
            gap = (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days
            total += (series.get(a, 0.0) + series.get(b, 0.0)) / 2 * gap * CUSEC_DAY_M3
        out[key] = total / 1e6
    return out, days


def main():
    today = datetime.date.today()
    print(f"  added {fill(today)} weekly snapshot(s)")
    rows, dates = load_samples()
    rows = [r for r in rows if in_scope(r)]
    this_start = water_year_start(today)
    sampled_this = sorted(d for d in dates if d >= this_start.isoformat())
    if len(sampled_this) < 2:
        print("  fewer than two snapshots this season; nothing to sum yet")
        return 0
    as_of = datetime.date.fromisoformat(sampled_this[-1])
    last_start = datetime.date(this_start.year - 1, 6, 1)
    last_same = as_of.replace(year=as_of.year - 1)
    now, now_days = volumes(rows, dates, this_start, as_of)
    then, then_days = volumes(rows, dates, last_start, last_same)
    if len(then_days) < 2:
        print("  last season has too few snapshots to compare")
        then = {}

    keys = sorted(set(now) | set(then), key=lambda k: -now.get(k, 0.0))
    deltas = []
    for reservoir, label in DELTAS.items():
        n = sum(v for k, v in now.items() if k[0] == reservoir)
        t = sum(v for k, v in then.items() if k[0] == reservoir)
        deltas.append({"system": label, "headworks": reservoir, "thisSeasonMm3": round(n, 1),
                       "lastSeasonMm3": round(t, 1) if then else None,
                       "thisSeasonTmc": round(n * 1e6 / TMC_M3, 1),
                       "lastSeasonTmc": round(t * 1e6 / TMC_M3, 1) if then else None})
    both = [k for k in keys if now.get(k, 0.0) >= 1 and then.get(k, 0.0) >= 1]
    less = sum(1 for k in both if now[k] < then[k])
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "APWRIMS reservoir dashboard (Water Resources Department), weekly snapshots of releases into each canal",
        "url": "https://apwrims.ap.gov.in/mis/reservoir",
        "method": ("Releases into each canal at the headworks, read every seventh day from 1 June and added up "
                   "between readings. This season to the latest reading, against last season to the same date."),
        "caveat": ("Measured where water leaves the reservoir or barrage, not where it reaches a field; which mandals "
                   "a canal serves is not public. Many outlets feed the next reservoir in a chain, so canals are not "
                   "added into one State figure. Weekly readings miss changes in between, so these are estimates."),
        "seasonStart": this_start.isoformat(), "asOf": as_of.isoformat(), "lastSeasonTo": last_same.isoformat(),
        "snapshotsThisSeason": len(now_days), "snapshotsLastSeason": len(then_days),
        "deltas": deltas,
        "canalsBothSeasons": len(both), "canalsWithLess": less,
        "canals": [{"reservoir": k[0], "outlet": k[1], "basin": k[2], "district": k[3],
                    "thisSeasonMm3": round(now.get(k, 0.0), 1),
                    "lastSeasonMm3": round(then.get(k, 0.0), 1) if then else None}
                   for k in keys if now.get(k, 0.0) >= 1 or then.get(k, 0.0) >= 1],
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
    for dl in deltas:
        print(f"  {dl['system']}: {dl['thisSeasonTmc']} TMC to {as_of} against {dl['lastSeasonTmc']} TMC to {last_same}")
    print(f"  {less} of {len(both)} canals running both seasons carried less this season; {len(payload['canals'])} listed")


if __name__ == "__main__":
    sys.exit(main())
