"""Pull CGWB groundwater levels from India-WRIS — a TRULY INDEPENDENT validation
source (CGWB's own manual/piezometer network, separate from the APWRIMS DWLR data
the model is trained on).

NOTE: India-WRIS (indiawris.gov.in) blocks/timeouts from datacenter IPs and is
geo-restricted — it did NOT respond from the build sandbox. Run this from YOUR
machine's network (the same one your browser uses to open the portal).

If the default API shape below returns nothing, do what we did for APWRIMS:
open https://indiawris.gov.in -> Ground Water Level -> pick AP -> open DevTools
Network tab -> copy the exact request URL + JSON body into API_URL / payload().

Output: phase3_levels/cgwb/cgwb_gw_levels.csv (state,district,station,lat,lon,date,level_mbgl,agency)
"""
import csv, json, os, ssl, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "cgwb"); os.makedirs(OUT, exist_ok=True)

# India-WRIS data API used by the portal's "Ground Water Level" dataset download.
API_URL = "https://indiawris.gov.in/Dataset/Ground%20Water%20Level"
STATE = "Andhra Pradesh"
START, END = "2024-01-01", "2026-06-01"
AGENCY = "CGWB"            # the independent network (NOT 'AP-GWD'/'APWRIMS')

_ctx = ssl.create_default_context()
_ctx_unverified = ssl._create_unverified_context()


def post_json(url, payload, timeout=90):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Content-Type": "application/json", "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0", "Origin": "https://indiawris.gov.in",
    })
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        if "CERTIFICATE_VERIFY_FAILED" not in str(e):
            raise
        with urllib.request.urlopen(req, timeout=timeout, context=_ctx_unverified) as r:
            return json.loads(r.read())


def payload(page, size=1000):
    return {"stateName": STATE, "districtName": "", "agencyName": AGENCY,
            "startdate": START, "enddate": END, "download": False, "page": page, "size": size}


def rows_from(resp):
    """India-WRIS wraps records under 'data' (list of dicts). Be defensive about keys."""
    data = resp.get("data") if isinstance(resp, dict) else resp
    out = []
    for d in (data or []):
        out.append([
            d.get("stateName") or STATE,
            d.get("districtName") or d.get("district"),
            d.get("stationName") or d.get("station") or d.get("wellCode"),
            d.get("latitude") or d.get("lat"),
            d.get("longitude") or d.get("lon"),
            d.get("dataTime") or d.get("date") or d.get("dataDate"),
            d.get("dataValue") or d.get("value") or d.get("level"),
            d.get("agencyName") or AGENCY,
        ])
    return out


def main():
    print(f"  India-WRIS CGWB pull: {STATE} {START}..{END} (agency={AGENCY})")
    all_rows, page = [], 0
    while True:
        try:
            resp = post_json(API_URL, payload(page))
        except Exception as e:
            print(f"  [stop] page {page}: {e}")
            if page == 0:
                print("  -> Endpoint unreachable from here. Run from your machine's network,")
                print("     or paste the exact DevTools cURL into API_URL/payload().")
            break
        rows = rows_from(resp)
        if not rows:
            break
        all_rows += rows
        print(f"    page {page}: +{len(rows)} (total {len(all_rows)})")
        if len(rows) < 1000:
            break
        page += 1; time.sleep(0.3)
    if all_rows:
        p = os.path.join(OUT, "cgwb_gw_levels.csv")
        with open(p, "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["state", "district", "station", "lat", "lon", "date", "level_mbgl", "agency"])
            w.writerows(all_rows)
        print(f"  wrote {len(all_rows)} rows -> {p}  (now run validate_against_cgwb.py)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
