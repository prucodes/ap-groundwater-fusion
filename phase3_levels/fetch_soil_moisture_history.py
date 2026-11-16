"""Monthly soil moisture for every mandal, kept as a history the forecast can learn from.

APWRIMS publishes the NRSC VIC land-surface model's plant-available water at 5, 30, 100
and 150 cm for any past date back to 2014, statewide in one request, keyed by the same
mandal UUIDs as the groundwater history (fetch_apwrims_context.soil_table). Water held
150 cm down is water still on its way to the water table, so the forecast takes it as an
input (train_multihorizon.SOIL).

One snapshot a month, the 28th, which is out before that month's well reading is
published, so it is known at every forecast origin. Dates after the portal's latest model
run are answered with that run's values: a month whose snapshot repeats another's is a
fill, not a run, and is left out, then asked for again on the next refresh.

Writes phase3_levels/data/soil_moisture_monthly.json:
  {"months": ["2014-01", ...], "depthCm": 150, "mandals": {uuid: [percent or null per month]}}
"""
import datetime
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_apwrims_context as context  # noqa: E402

OUT = os.path.join(HERE, "data", "soil_moisture_monthly.json")
FIRST = (2014, 1)
DEPTH_CM = 150
SNAPSHOT_DAY = 28
# Older gaps were fills when first asked and stay so; only recent ones are asked again.
RETRY_MONTHS = 24


def months_through(last):
    y, m = FIRST
    while (y, m) <= last:
        yield f"{y}-{m:02d}"
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def last_snapshot_month(today):
    """The latest month whose 28th has passed."""
    if today.day >= SNAPSHOT_DAY:
        return today.year, today.month
    return (today.year - 1, 12) if today.month == 1 else (today.year, today.month - 1)


def column(table):
    depth = context.SOIL_DEPTHS_CM.index(DEPTH_CM)
    return {uid: round(row["pct"][depth], 2) for uid, row in table.items()}


def load():
    if not os.path.exists(OUT):
        return {}
    d = json.load(open(OUT))
    return {month: {uid: values[i] for uid, values in d["mandals"].items() if values[i] is not None}
            for i, month in enumerate(d["months"])}


def drop_fills(by_month):
    """A snapshot identical to another month's is the portal repeating a run: drop every copy."""
    seen = {}
    for month, values in by_month.items():
        seen.setdefault(tuple(sorted(values.items())), []).append(month)
    repeated = {m for months in seen.values() if len(months) > 1 for m in months}
    return {m: v for m, v in by_month.items() if m not in repeated and len(v) >= context.MIN_MANDALS // 2}


def save(by_month, all_months):
    months = [m for m in all_months if m in by_month]
    uids = sorted({uid for values in by_month.values() for uid in values})
    payload = {"source": "APWRIMS soil moisture dashboard: NRSC VIC land-surface model, 0.05 degrees",
               "authorizationStatus": "research_pending", "depthCm": DEPTH_CM, "snapshotDay": SNAPSHOT_DAY,
               "months": months, "mandals": {uid: [by_month[m].get(uid) for m in months] for uid in uids}}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")


def main(today=None, fetch=context.soil_table, pause=context.PAUSE_S):
    today = today or datetime.date.today()
    all_months = list(months_through(last_snapshot_month(today)))
    by_month = load()
    wanted = [m for i, m in enumerate(all_months) if m not in by_month and (not by_month or i >= len(all_months) - RETRY_MONTHS)]
    for month in wanted:
        y, m = map(int, month.split("-"))
        try:
            by_month[month] = column(fetch(datetime.date(y, m, SNAPSHOT_DAY)))
        except Exception as error:  # one month the portal cannot answer stays missing
            print(f"  {month}: {error}")
        time.sleep(pause)
    by_month = drop_fills(by_month)
    save(by_month, all_months)
    print(f"  soil moisture at {DEPTH_CM} cm: {len(by_month)} months to {max(by_month) if by_month else '-'}, asked for {len(wanted)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
