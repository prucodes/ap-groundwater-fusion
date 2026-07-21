"""Pull APWRIMS mandal-level monthly groundwater history from the vassarlabs
STAGING host (fresher: has June 2026). Auth is the `uscope` bearer-style header
(NOT a cookie). Provide it via env:  export APWRIMS_USCOPE='...'

Walks STATE -> districts -> mandals, calling /api/v2/gwlevels/chart per mandal for
2014-06 .. 2026-07, writing one row per (mandal, month). Backs up any existing CSV.
"""
import json, os, ssl, sys, time, csv, datetime, shutil, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "apwrims"); os.makedirs(OUT, exist_ok=True)
AP = "6f86292b-dd9a-4987-bb8f-c3940263b349"
BASE = "https://apwrims-staging.vassarlabs.com"
USCOPE = os.environ.get("APWRIMS_USCOPE", "")
SDATE, EDATE = "201406", "202607"


def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (loud, opt-in).
    Needed on machines behind a TLS-inspecting proxy (self-signed chain)."""
    if os.environ.get("ALLOW_INSECURE_TLS") == "1":
        sys.stderr.write("WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n")
        return ssl._create_unverified_context()
    return ssl.create_default_context()


_ctx = _tls_context()


def post(path, payload, timeout=60):
    req = urllib.request.Request(BASE + path, data=json.dumps(payload).encode(), method="POST", headers={
        "Content-Type": "application/json", "Accept": "application/json, text/plain, */*",
        "Origin": BASE, "uscope": USCOPE, "User-Agent": "Mozilla/5.0",
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
        return json.loads(r.read())


def children(pType, cType, loc):
    d = post("/api/locations/allChildrenForParentChildType", {"pType": pType, "cType": cType, "loc": loc})
    out = {}
    for _, lst in d.items():
        for x in lst:
            out[x["locationUUID"]] = x["locationName"]
    return out


def chart(parent_uuid, loc_uuid, ctype, ltype):
    return post("/api/v2/gwlevels/chart", {
        "aggr": "SUM", "component": "GROUNDWATER", "summary": False, "sUUID": AP, "pDate": "2018",
        "src": "AWS", "timePeriod": "LAST10DAYSHOULRY", "chartType": "stock", "source": "MANUAL",
        "lUUID": loc_uuid, "cType": ctype, "pUUID": parent_uuid, "sDate": SDATE, "eDate": EDATE,
        "view": "ADMIN", "lType": ltype, "format": "yyyyMM", "page": "MANUAL",
    })


def series_rows(resp):
    rows = []
    if not isinstance(resp, dict):
        return rows
    for k, v in resp.items():
        try:
            lvl = v.get("gwLevel") if isinstance(v, dict) else v
            if lvl is None:
                continue
            ym = datetime.datetime.utcfromtimestamp(int(k) / 1000).strftime("%Y-%m")
            rows.append((ym, round(float(lvl), 3)))
        except (ValueError, TypeError):
            continue
    return rows


def main():
    if not USCOPE:
        print("APWRIMS_USCOPE not set. export APWRIMS_USCOPE='<token>' first."); return 1
    out_path = os.path.join(OUT, "apwrims_gw_history.csv")
    if os.path.exists(out_path):
        shutil.copy2(out_path, out_path + ".may2026.bak")
    raw = post("/api/locations/allChildrenForParentChildType", {"pType": "STATE", "cType": "DISTRICT", "loc": []})
    ap = {x["locationUUID"]: x["locationName"] for x in raw.get(AP, [])}
    print(f"AP districts: {len(ap)}")
    n_rows = 0
    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["district", "district_uuid", "mandal", "mandal_uuid", "date", "level_mbgl"])
        for i, (duuid, dname) in enumerate(sorted(ap.items(), key=lambda x: x[1]), 1):
            try:
                mandals = children("DISTRICT", "MANDAL", [duuid])
            except Exception as e:
                print(f"  [warn] mandals {dname}: {e}"); continue
            print(f"[{i}/{len(ap)}] {dname}: {len(mandals)} mandals")
            for muuid, mname in mandals.items():
                try:
                    rows = series_rows(chart(duuid, muuid, "MANDAL", "MANDAL"))
                    for ym, lvl in rows:
                        w.writerow([dname, duuid, mname, muuid, ym, lvl]); n_rows += 1
                    time.sleep(0.12)
                except Exception as e:
                    print(f"     [warn] {mname}: {e}")
            f.flush()
    print(f"\nWrote {n_rows} rows -> {out_path}")


if __name__ == "__main__":
    sys.exit(main() or 0)
