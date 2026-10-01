"""Reconcile watch figures with stored inputs and optionally probe public sources.

This is a bounded verification, not a bulk refresh or official certification.
It never replaces the source histories or the published watch snapshot.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "phase3_levels"))
from fetch_enso_index import parse as parse_oni, URL as ONI_URL
from fetch_apwrims_history import _tls_context, series_rows, AP_STATE_UUID

CHIRPS_URL = "https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/"
AP_URL = "https://apwrims.ap.gov.in/api/v2/gwlevels/chart"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def close(a, b, tolerance=.011):
    return a is not None and b is not None and math.isfinite(a) and math.isfinite(b) and abs(a - b) <= tolerance


def reconcile(watch, history):
    by_id = {}
    for row in history:
        value = float(row["level_mbgl"])
        if not 0 < value < 60:
            continue
        series = by_id.setdefault(row["mandal_uuid"], {})
        if row["date"] in series:
            raise ValueError("Duplicate source UUID/month; audit stopped")
        series[row["date"]] = value
    mismatches = []
    year = watch["season"]["year"]
    month = watch["season"]["latestMonth"][5:]
    for row in watch["mandals"]:
        series = by_id.get(row["mandalUuid"], {})
        prior = [series[f"{y}-{month}"] - series[f"{y}-05"] for y in range(year - 10, year)
                 if f"{y}-{month}" in series and f"{y}-05" in series]
        expected = {}
        if len(prior) >= 7 and f"{year}-{month}" in series and f"{year}-05" in series:
            typical = statistics.median(prior)
            change = series[f"{year}-{month}"] - series[f"{year}-05"]
            shortfall = change - typical
            spread = statistics.median(abs(x - typical) for x in prior) * 1.4826
            flag = shortfall >= 1 and shortfall / max(.3, spread) >= 2
            expected = {"latestDepthM": series[f"{year}-{month}"], "thisSeasonM": change,
                        "typicalM": typical, "shortfallM": shortfall, "comparableYears": len(prior)}
            status = "severe" if flag and shortfall >= 2 else "short" if flag else "normal"
        else:
            status = None
        bad = [k for k, value in expected.items() if not close(row[k], value)]
        if not expected or status != row["status"] or bad:
            mismatches.append({"mandalUuid": row["mandalUuid"], "fields": bad, "statusMatches": status == row["status"]})
    return {"checkedSeries": len(watch["mandals"]), "mismatches": mismatches}


def get(url, payload=None):
    headers = {"User-Agent": "AP-groundwater-source-audit/1.0"}
    body = None
    if payload:
        headers.update({"Content-Type": "application/json", "Origin": "https://apwrims.ap.gov.in", "Referer": "https://apwrims.ap.gov.in/mis/groundwater/levels"})
        body = json.dumps(payload).encode()
    request = urllib.request.Request(url, data=body, headers=headers)
    with urllib.request.urlopen(request, context=_tls_context(), timeout=35) as response:
        return response.read()


def online_checks(watch, history):
    checks = {}
    try:
        raw = get(ONI_URL)
        rows = parse_oni(raw.decode())
        published = watch["enso"]
        matched = next((r for r in rows if r["date"] == published["asOf"]), None) if published else None
        checks["enso"] = {"status": "checked", "source": ONI_URL, "sha256": hashlib.sha256(raw).hexdigest(), "latest": rows[-1],
                          "snapshotMatches": bool(matched and close(matched["oni_c"], published["oniC"]))}
    except Exception as error:
        checks["enso"] = {"status": "unavailable", "source": ONI_URL, "error": str(error)}
    try:
        listing = get(CHIRPS_URL).decode()
        import re
        months = sorted(set(re.findall(r"chirps-v2\.0\.(\d{4}\.\d{2})\.tif\.gz", listing)))
        checks["rainfall"] = {"status": "availability_checked", "source": CHIRPS_URL, "latest": months[-1] if months else None,
                              "snapshotMonthAvailable": watch["season"]["latestMonth"].replace("-", ".") in months,
                              "scope": "Publisher file listing checked; historical raster pixel values not re-downloaded in this audit."}
    except Exception as error:
        checks["rainfall"] = {"status": "unavailable", "source": CHIRPS_URL, "error": str(error)}
    # Three source-series checks, spaced out, without cookies or credentials.
    identities = {row["mandal_uuid"]: row for row in history}
    selected, districts = [], set()
    for row in watch["mandals"]:
        if row["district"] not in districts and row["mandalUuid"] in identities:
            selected.append(row); districts.add(row["district"])
        if len(selected) == 3:
            break
    probes = []
    for row in selected:
        identity = identities[row["mandalUuid"]]
        probe = {"mandal": row["mandal"], "district": row["district"], "sourceSeriesId": row["mandalUuid"]}
        try:
            payload = {"aggr": "SUM", "component": "GROUNDWATER", "summary": False, "sUUID": AP_STATE_UUID,
                       "pDate": "2018", "src": "AWS", "timePeriod": "LAST10DAYSHOULRY", "chartType": "stock",
                       "source": "MANUAL", "lUUID": row["mandalUuid"], "cType": "MANDAL", "pUUID": identity["district_uuid"],
                       "sDate": f"{watch['season']['year']}05", "eDate": dt.datetime.now(dt.timezone.utc).strftime("%Y%m"),
                       "view": "ADMIN", "lType": "MANDAL", "format": "yyyyMM", "page": "MANUAL"}
            raw = get(AP_URL, payload)
            series = dict(series_rows(json.loads(raw)))
            value = series.get(watch["season"]["latestMonth"])
            probe.update({"status": "checked" if value is not None else "no_comparable_response", "latestPeriod": max(series) if series else None,
                          "portalDepthM": value, "snapshotDepthM": row["latestDepthM"],
                          "snapshotMatches": close(value, row["latestDepthM"]), "responseSha256": hashlib.sha256(raw).hexdigest()})
        except Exception as error:
            probe.update({"status": "unavailable", "error": str(error)})
        probes.append(probe)
        time.sleep(1)
    checks["groundwater"] = {"source": AP_URL, "scope": "Three public portal probes only; not all-mandal verification or authorization.", "probes": probes}
    return checks


def reuse_online_check(previous, snapshot_hash, history_hash):
    if previous.get("snapshotHash") != snapshot_hash or previous.get("historyHash") != history_hash:
        raise ValueError("Previous online check belongs to different inputs; run a new online check")
    return previous.get("online"), previous.get("onlineCheckedAt")


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--online", action="store_true")
    mode.add_argument("--reuse-online", type=Path, help="Retain a previous dated network check while re-running local calculations")
    parser.add_argument("--output", type=Path, default=ROOT / "reports/watch-source-audit.json")
    args = parser.parse_args()
    watch_path = ROOT / "app/data/monsoon_watch.json"
    history_path = ROOT / "phase3_levels/apwrims/apwrims_gw_history.csv"
    watch = json.loads(watch_path.read_text())
    with history_path.open() as handle:
        history = list(csv.DictReader(handle))
    from build_levels_engine import build_frame
    published_history = build_frame().to_dict("records")
    raw_check = reconcile(watch, history)
    baseline_check = reconcile(watch, published_history)
    online = online_checks(watch, history) if args.online else None
    checked_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    if args.reuse_online:
        previous = json.loads(args.reuse_online.read_text())
        online, online_checked_at = reuse_online_check(previous, sha(watch_path), sha(history_path))
    else:
        online_checked_at = checked_at if args.online else None
    report = {"checkedAt": checked_at, "onlineCheckedAt": online_checked_at,
              "snapshotPeriod": watch["season"]["latestMonth"], "snapshotHash": sha(watch_path), "historyHash": sha(history_path),
              "localReconciliation": baseline_check, "unfilteredHistoryComparison": raw_check, "online": online,
              "baselineCaveat": "The published seasonal baseline reuses the model-eligible observation frame (location and lag-1/lag-12 availability). This omits otherwise valid source observations. Recomputed values match that implementation, not an independently approved hydrological baseline. Rebuilding on unfiltered observations requires a versioned data and film update.",
              "limitations": ["No real-time feed or field certification.", "Crop inputs are illustrative; crop booking and supply are not connected.",
                              "Public prototype boundaries and source-use authorization require departmental approval."]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({**report, "localReconciliation": {"checkedSeries": baseline_check["checkedSeries"], "mismatchCount": len(baseline_check["mismatches"])},
                     "unfilteredHistoryComparison": {"changedSeries": len(raw_check["mismatches"])}}, indent=2))
    return 1 if report["localReconciliation"]["mismatches"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
