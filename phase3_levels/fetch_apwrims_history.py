"""Pull APWRIMS mandal-level monthly groundwater-level history (the training labels).

Walks the location hierarchy (state -> districts -> mandals) and calls the
/api/v2/gwlevels/chart endpoint per mandal for 2014-06 .. 2026-05, writing one
row per (mandal, month): district, mandal, uuids, date, level_mbgl.

Auth is the browser session cookie (paste the current one below). The cookie is
short-lived; if calls start returning 0 rows / 401, refresh it from DevTools.
"""
import json, os, ssl, sys, time, urllib.request, csv, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "apwrims")
os.makedirs(OUT, exist_ok=True)

AP_STATE_UUID = "6f86292b-dd9a-4987-bb8f-c3940263b349"
BASE = "https://apwrims.ap.gov.in"
# Credentials must come from the environment — never hard-code a session cookie.
# This is an authenticated browser-session endpoint; use only with permitted access.
COOKIE = os.environ.get("APWRIMS_COOKIE")
if not COOKIE:
    sys.exit(
        "APWRIMS_COOKIE not set. Export a valid, authorized session cookie before running:\n"
        "  export APWRIMS_COOKIE='JSESSIONID=...; ...'\n"
        "Do not commit credentials. Use only where APWRIMS access is permitted."
    )
SDATE, EDATE = "201406", "202605"

# Verified TLS only — no unverified fallback. A cert failure should stop the run.
_ctx = ssl.create_default_context()


def post(path, payload, timeout=60):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(BASE + path, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": BASE,
        "Cookie": COOKIE,
        "User-Agent": "Mozilla/5.0",
    })
    with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
        return json.loads(r.read())


def children(parent_type, child_type, loc):
    d = post("/api/locations/allChildrenForParentChildType",
             {"pType": parent_type, "cType": child_type, "loc": loc})
    # response: {parentUUID: [{locationName, locationUUID}, ...], ...}
    out = {}
    for _, lst in d.items():
        for x in lst:
            out[x["locationUUID"]] = x["locationName"]
    return out  # uuid -> name (deduped)


def chart(state_uuid, parent_uuid, loc_uuid, ctype, ltype):
    return post("/api/v2/gwlevels/chart", {
        "aggr": "SUM", "component": "GROUNDWATER", "summary": False,
        "sUUID": state_uuid, "pDate": "2018", "src": "AWS",
        "timePeriod": "LAST10DAYSHOULRY", "chartType": "stock", "source": "MANUAL",
        "lUUID": loc_uuid, "cType": ctype, "pUUID": parent_uuid,
        "sDate": SDATE, "eDate": EDATE, "view": "ADMIN", "lType": ltype,
        "format": "yyyyMM", "page": "MANUAL",
    })


def series_rows(resp):
    """{epochMillis: {gwLevel: x}} -> list of (YYYY-MM, level)."""
    rows = []
    if not isinstance(resp, dict):
        return rows
    for k, v in resp.items():
        try:
            ep = int(k)
            lvl = v.get("gwLevel") if isinstance(v, dict) else v
            if lvl is None:
                continue
            ym = datetime.datetime.utcfromtimestamp(ep / 1000).strftime("%Y-%m")
            rows.append((ym, round(float(lvl), 3)))
        except (ValueError, TypeError):
            continue
    return rows


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None  # optional: district-name filter
    districts = children("STATE", "DISTRICT", [])
    # keep AP only (drop the other state's entries) by re-deriving from the AP key
    raw = post("/api/locations/allChildrenForParentChildType", {"pType": "STATE", "cType": "DISTRICT", "loc": []})
    ap = {x["locationUUID"]: x["locationName"] for x in raw.get(AP_STATE_UUID, [])}
    print(f"AP districts: {len(ap)}")

    out_path = os.path.join(OUT, "apwrims_gw_history.csv")
    n_rows = 0
    with open(out_path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["district", "district_uuid", "mandal", "mandal_uuid", "date", "level_mbgl"])
        for i, (duuid, dname) in enumerate(sorted(ap.items(), key=lambda x: x[1]), 1):
            if only and only.lower() not in dname.lower():
                continue
            try:
                mandals = children("DISTRICT", "MANDAL", [duuid])
            except Exception as e:
                print(f"  [warn] mandals {dname}: {e}"); continue
            print(f"[{i}/{len(ap)}] {dname}: {len(mandals)} mandals")
            for muuid, mname in mandals.items():
                try:
                    resp = chart(AP_STATE_UUID, duuid, muuid, "MANDAL", "MANDAL")
                    rows = series_rows(resp)
                    for ym, lvl in rows:
                        w.writerow([dname, duuid, mname, muuid, ym, lvl]); n_rows += 1
                    time.sleep(0.15)
                except Exception as e:
                    print(f"     [warn] {mname}: {e}")
            f.flush()
    print(f"\nWrote {n_rows} rows -> {out_path}")


if __name__ == "__main__":
    main()
