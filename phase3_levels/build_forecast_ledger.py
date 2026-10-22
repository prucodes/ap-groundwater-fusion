#!/usr/bin/env python3
"""The forecast ledger: every published 3-month forecast, frozen the week it was
issued and scored when its month's reading arrives.

The rolling-origin backtest says how the method would have done. This says how
the forecasts the site actually published did, written down before anyone knew
the outcome and never changed afterwards. A track record like that cannot be
assembled after the fact, which is the point of keeping it from the start.

Each weekly refresh, after the V2 records are published:
1. freeze: this week's released forecast for every mandal (origin month, target
   month, value and its P10-P90 band) into phase3_levels/data/forecast_ledger/
   <issue date>.json. A week already frozen is never rewritten, and the weekly
   commit puts a timestamp on it that the ledger cannot alter.
2. score: for each mandal and target month, the earliest-issued forecast (the
   longest lead, so the hardest test) against the mandal's measured reading for
   that month, beside the no-change rule (the reading at the forecast's origin).
   A forecast counts only if its target month was later than the last month the
   mandal had measured when it was issued, which is true by construction.
3. summarise into app/data/forecast_ledger.json (small, client-safe).

--backfill seeds the ledger from the weekly snapshots already in git history:
each snapshot is frozen under its own issue date with the commit that published
it, so the earliest entries are exactly what the site showed at the time.
"""
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
RECORDS = os.path.join(APP, "mandal_groundwater_records_v2.json")
SERIES = os.path.join(APP, "mandal_observation_series_v2.json")
LEDGER = os.path.join(HERE, "data", "forecast_ledger")
OUT = os.path.join(APP, "forecast_ledger.json")
RECORDS_IN_GIT = "app/data/mandal_groundwater_records_v2.json"


def freeze_payload(records, issued, source):
    forecasts = {}
    for record in records:
        f = record.get("forecast")
        if not f or f.get("releaseStatus") != "released" or f.get("value") is None:
            continue
        forecasts[record["identity"]["mandalId"]] = [
            f["originPeriod"], f["targetDate"], f["value"], f.get("lower"), f.get("upper")]
    model = next((r["forecast"].get("modelVersion") for r in records if r.get("forecast")), None)
    return {"issued": issued, "source": source, "model": model,
            "fields": ["origin", "target", "valueM", "p10M", "p90M"], "forecasts": forecasts}


def write_once(payload):
    os.makedirs(LEDGER, exist_ok=True)
    path = os.path.join(LEDGER, f"{payload['issued']}.json")
    if os.path.exists(path) or not payload["forecasts"]:
        return False
    with open(path, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    return True


def records_issue_date(records):
    dates = sorted({r["forecast"].get("issueDate") for r in records if r.get("forecast")} - {None})
    return dates[-1] if dates else None


def backfill():
    log = subprocess.run(["git", "log", "--reverse", "--format=%H %cI", "--", RECORDS_IN_GIT],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout.split("\n")
    added = 0
    for line in log:
        if not line.strip():
            continue
        commit, when = line.split()
        raw = subprocess.run(["git", "show", f"{commit}:{RECORDS_IN_GIT}"], cwd=ROOT,
                             capture_output=True, text=True).stdout
        try:
            records = json.loads(raw)["records"]
        except (ValueError, KeyError):
            continue
        issued = records_issue_date(records)
        if issued and write_once(freeze_payload(records, issued, f"git {commit[:12]}, committed {when}")):
            added += 1
    return added


def observed_by_mandal():
    series = json.load(open(SERIES))["series"]
    return {mid: {o["period"]: o["value"] for o in s.get("observations", []) if o.get("value") is not None}
            for mid, s in series.items()}


def frozen_weeks():
    weeks = []
    if os.path.isdir(LEDGER):
        for name in sorted(os.listdir(LEDGER)):
            if name.endswith(".json"):
                path = os.path.join(LEDGER, name)
                blob = open(path, "rb").read()
                weeks.append((json.loads(blob), hashlib.sha256(blob).hexdigest()))
    return weeks


def summarise(weeks, observed):
    first = {}  # (mandal, target) -> earliest-issued forecast
    for week, _ in weeks:
        for mid, (origin, target, value, lower, upper) in week["forecasts"].items():
            key = (mid, target)
            if key not in first or week["issued"] < first[key]["issued"]:
                first[key] = {"issued": week["issued"], "origin": origin, "value": value,
                              "lower": lower, "upper": upper}
    scored, pending = [], {}
    for (mid, target), f in first.items():
        actual = observed.get(mid, {}).get(target)
        if actual is None:
            pending[target] = pending.get(target, 0) + 1
            continue
        start = observed.get(mid, {}).get(f["origin"])
        scored.append({"target": target, "error": f["value"] - actual,
                       "noChange": None if start is None else start - actual,
                       "inBand": None if f["lower"] is None or f["upper"] is None
                       else f["lower"] <= actual <= f["upper"]})

    def block(rows):
        if not rows:
            return None
        paired = [r for r in rows if r["noChange"] is not None]
        banded = [r for r in rows if r["inBand"] is not None]
        mae = sum(abs(r["error"]) for r in rows) / len(rows)
        out = {"forecasts": len(rows), "maeM": round(mae, 3),
               "biasM": round(sum(r["error"] for r in rows) / len(rows), 3),
               "bandCoveragePct": round(100 * sum(r["inBand"] for r in banded) / len(banded), 1) if banded else None}
        if paired:
            model = sum(abs(r["error"]) for r in paired) / len(paired)
            base = sum(abs(r["noChange"]) for r in paired) / len(paired)
            out.update({"pairedForecasts": len(paired), "pairedMaeM": round(model, 3),
                        "noChangeMaeM": round(base, 3),
                        "gainPct": round(100 * (1 - model / base), 1) if base else None})
        return out

    by_target = {t: block([r for r in scored if r["target"] == t]) for t in sorted({r["target"] for r in scored})}
    return {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "kind": "prospective_track_record",
        "rule": ("Each mandal's earliest-issued 3-month forecast for a target month, frozen the week it was "
                 "published and never changed, against the reading later measured for that month. The no-change "
                 "rule repeats the reading at the forecast's origin. Bias is forecast minus measured, metres below "
                 "ground: negative means more water was forecast than came."),
        "weeksFrozen": len(weeks),
        "firstIssued": weeks[0][0]["issued"] if weeks else None,
        "lastIssued": weeks[-1][0]["issued"] if weeks else None,
        "forecastsTracked": len(first),
        "scored": block(scored),
        "byTarget": by_target,
        "pendingByTarget": dict(sorted(pending.items())),
        "weeks": [{"issued": w["issued"], "forecasts": len(w["forecasts"]), "source": w["source"], "sha256": h}
                  for w, h in weeks],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--backfill", action="store_true", help="seed from the weekly snapshots in git history")
    args = parser.parse_args()
    if args.backfill:
        print(f"backfilled {backfill()} week(s) from git history")
    records = json.load(open(RECORDS))["records"]
    issued = records_issue_date(records)
    if issued and write_once(freeze_payload(records, issued, "weekly refresh")):
        print(f"froze {issued}")
    payload = summarise(frozen_weeks(), observed_by_mandal())
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
    s = payload["scored"]
    print(f"{payload['weeksFrozen']} weeks, {payload['forecastsTracked']} forecasts tracked; "
          + (f"{s['forecasts']} scored, MAE {s['maeM']} m vs no change {s.get('noChangeMaeM')} m, "
             f"band coverage {s['bandCoveragePct']}%" if s else "none scored yet")
          + f"; pending {payload['pendingByTarget']}")


if __name__ == "__main__":
    sys.exit(main())
