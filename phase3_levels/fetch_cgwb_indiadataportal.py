"""Pull CGWB station groundwater levels for Andhra Pradesh — the TRULY INDEPENDENT
validation source (CGWB's own National Hydrograph Network, separate from APWRIMS).

Source: India Data Portal (ISB) CKAN mirror of CGWB depth-to-water-level data.
This host is GLOBALLY accessible (no India geo-block, no API key) — unlike
indiawris.gov.in which blocks non-Indian IPs. CGWB measures 4x/year (Jan/May/Aug/Nov).

Output: phase3_levels/cgwb/cgwb_gw_levels.csv
        (state,district,station,lat,lon,date,level_mbgl,agency)
"""
import csv, json, os, ssl, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "cgwb"); os.makedirs(OUT, exist_ok=True)
RID = "580a8f6e-3d86-4ca7-ac7d-cd5df12b443c"
BASE = "https://ckandev.indiadataportal.com/api/3/action/datastore_search"
STATE = "Andhra Pradesh"
_ctx = ssl._create_unverified_context()


def get(params):
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60, context=_ctx) as r:
        return json.loads(r.read())


def main():
    flt = json.dumps({"state_name": STATE})
    first = get({"resource_id": RID, "filters": flt, "limit": 0})
    total = first["result"]["total"]
    print(f"  CGWB (India Data Portal) — {STATE}: {total} records")
    rows, offset, page = [], 0, 1000
    while offset < total:
        d = get({"resource_id": RID, "filters": flt, "limit": page, "offset": offset, "sort": "_id"})
        recs = d["result"]["records"]
        if not recs:
            break
        for r in recs:
            lvl = r.get("currentlevel")
            if lvl in (None, "", "NA"):
                continue
            rows.append([r.get("state_name"), r.get("district_name"), r.get("station_name"),
                         r.get("latitude"), r.get("longitude"), r.get("date"), lvl,
                         r.get("source") or "CGWB"])
        offset += len(recs)
        print(f"    {offset}/{total}")
    p = os.path.join(OUT, "cgwb_gw_levels.csv")
    with open(p, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["state", "district", "station", "lat", "lon", "date", "level_mbgl", "agency"])
        w.writerows(rows)
    print(f"  wrote {len(rows)} rows -> {p}")


if __name__ == "__main__":
    main()
