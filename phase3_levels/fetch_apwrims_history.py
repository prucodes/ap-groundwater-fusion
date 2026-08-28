"""Pull APWRIMS mandal-level monthly groundwater-level history (the training labels).

Walks the location hierarchy (state -> districts -> mandals) and calls the
/api/v2/gwlevels/chart endpoint per mandal for 2014-06 .. 2026-05, writing one
row per (mandal, month): district, mandal, uuids, date, level_mbgl.

No authentication is required: these endpoints back the public MIS dashboard and
answer requests carrying no Cookie header (verified 2026-08-28). APWRIMS_COOKIE is
optional and only needed if the portal later starts gating them.

Use only where access is permitted — technically open is not the same as
authorised to bulk-harvest. This is an authorization-pending research sample, not
official data, and the run is rate-limited on purpose.
"""
import json, os, ssl, sys, time, urllib.request, csv, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "apwrims")
os.makedirs(OUT, exist_ok=True)

AP_STATE_UUID = "6f86292b-dd9a-4987-bb8f-c3940263b349"
BASE = "https://apwrims.ap.gov.in"
# Verified 2026-08-28: these endpoints serve the public MIS dashboard and require
# NO authentication — a request carrying no Cookie header at all returns the full
# series. The cookie a browser sends here is analytics only (_ga / _clck), not a
# session token, so there is nothing session-shaped to keep fresh.
#
# APWRIMS_COOKIE therefore stays OPTIONAL: set it only if the portal later starts
# gating these endpoints. It is still read from the environment and never
# hard-coded. Access being technically open is not the same as being authorised to
# bulk-harvest: this remains an authorisation-pending research sample, not official
# data, and the polite crawl delay below is deliberate.
COOKIE = os.environ.get("APWRIMS_COOKIE")
# End date defaults to the current month so a refreshed cookie actually pulls
# newly published months; pin it with APWRIMS_END (YYYYMM) to reproduce a run.
SDATE = os.environ.get("APWRIMS_START", "201406")
EDATE = os.environ.get("APWRIMS_END", datetime.date.today().strftime("%Y%m"))


def _tls_context():
    """Verified TLS only — no unverified fallback; a cert failure stops the run.

    Framework Python builds often ship with no CA file wired up
    (ssl.get_default_verify_paths().cafile is None), which fails verification
    against otherwise-valid hosts. Fall back to certifi's bundle: still fully
    verified, just a trust store that actually exists.
    """
    if not ssl.get_default_verify_paths().cafile:
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
    return ssl.create_default_context()


_ctx = _tls_context()


def post(path, payload, timeout=60):
    body = json.dumps(payload).encode()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": BASE,
        "Referer": BASE + "/mis/groundwater/levels",
        "User-Agent": "Mozilla/5.0",
    }
    if COOKIE:
        headers["Cookie"] = COOKIE
    req = urllib.request.Request(BASE + path, data=body, headers=headers)
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


MIN_RETAINED_FRACTION = 0.9


def existing_row_count(path):
    """Data rows in an existing CSV (header excluded); 0 if absent."""
    if not os.path.exists(path):
        return 0
    with open(path, newline="") as handle:
        return max(0, sum(1 for _ in handle) - 1)


def publish_refusal(new_rows, previous_rows, is_subset):
    """Why this pull must not replace the stored history, or None to publish.

    Guards the unattended weekly run against silently degrading a good history
    when the portal returns empties or the district walk dies part-way. A
    district-filtered run is a deliberate subset, so it is exempt.
    """
    if is_subset or not previous_rows:
        return None
    floor = int(previous_rows * MIN_RETAINED_FRACTION)
    if new_rows < floor:
        return (
            f"Refusing to publish: pulled {new_rows} rows but the stored history "
            f"has {previous_rows} (floor {floor})."
        )
    return None


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None  # optional: district-name filter
    districts = children("STATE", "DISTRICT", [])
    # keep AP only (drop the other state's entries) by re-deriving from the AP key
    raw = post("/api/locations/allChildrenForParentChildType", {"pType": "STATE", "cType": "DISTRICT", "loc": []})
    ap = {x["locationUUID"]: x["locationName"] for x in raw.get(AP_STATE_UUID, [])}
    print(f"AP districts: {len(ap)}")

    out_path = os.path.join(OUT, "apwrims_gw_history.csv")
    # Write to a temp file and only swap it in on success. Streaming straight
    # into out_path means any mid-run failure (network drop, CI timeout) leaves
    # a truncated history behind — which matters now that this runs unattended.
    tmp_path = out_path + ".tmp"
    n_rows = 0
    with open(tmp_path, "w", newline="") as f:
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

    previous_rows = existing_row_count(out_path)
    refusal = publish_refusal(n_rows, previous_rows, is_subset=bool(only))
    if refusal:
        os.remove(tmp_path)
        sys.exit(f"{refusal} The existing history at {out_path} is untouched.")

    os.replace(tmp_path, out_path)
    delta = n_rows - previous_rows
    print(f"\nWrote {n_rows} rows ({delta:+d} vs previous) -> {out_path}")


if __name__ == "__main__":
    main()
