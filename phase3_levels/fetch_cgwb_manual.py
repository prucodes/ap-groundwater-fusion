"""CGWB's own manual well readings in Andhra Pradesh, from India Data Portal.

CGWB reads its National Hydrograph Network by hand four times a year (January, May,
August, November). None of these wells feeds the model, which learns only from the
State's APWRIMS series, so they are a network the model has never seen.

India-WRIS, CGWB's own portal, did not answer from this Mac or from a GitHub runner
on 8 October 2026. India Data Portal (ISB) republishes the same CGWB readings with an
open API; its copy runs to January 2025. The State's own wells in the same table
("Andhra Pradesh GW") are left out on purpose: they are not independent of APWRIMS.

Output: phase3_levels/cgwb/cgwb_manual_levels.csv, one row per station and date,
depth in metres below ground. Only stations inside the State's mandal outlines are kept.
"""
import csv
import json
import os
import ssl
import sys
import urllib.parse
import urllib.request

import shapely
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.strtree import STRtree

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(HERE, "cgwb", "cgwb_manual_levels.csv")
API = "https://ckandev.indiadataportal.com/api/3/action/datastore_search_sql"
RESOURCE = "06d6e79c-61ac-46bb-9e03-c7138911c619"  # "Groundwater Level Collected Manually"
BBOX = (12.6, 19.95, 76.7, 84.8)                   # lat, lat, lon, lon around the State
SINCE = "2013-01-01"
PAGE = 5000
FIELDS = ["station_code", "station_name", "lat", "lon", "well_type", "well_depth_m", "date", "level_mbgl"]


def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (loud, opt-in)."""
    if os.environ.get("ALLOW_INSECURE_TLS") == "1":
        sys.stderr.write("WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n")
        return ssl._create_unverified_context()
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def query(sql):
    url = API + "?" + urllib.parse.urlencode({"sql": sql})
    request = urllib.request.Request(url, headers={"User-Agent": "ap-groundwater-fusion/1.0"})
    with urllib.request.urlopen(request, timeout=180, context=_tls_context()) as response:
        body = json.loads(response.read())
    if not body.get("success"):
        raise RuntimeError(body.get("error"))
    return body["result"]["records"]


def state_outline():
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    shapes = [shapely.make_valid(MultiPolygon([Polygon(ring) for ring in m["rings"] if len(ring) >= 4]))
              for m in geo["mandals"] if m.get("rings")]
    return STRtree(shapes), shapes


def main():
    lat0, lat1, lon0, lon1 = BBOX
    where = (f"agency_name = 'CGWB' AND data_type_description = 'MANUAL-Water Level' "
             f"AND latitude BETWEEN {lat0} AND {lat1} AND longitude BETWEEN {lon0} AND {lon1} "
             f"AND date >= '{SINCE}'")
    rows, offset = [], 0
    while True:
        page = query(f'SELECT station_code, station_name, latitude, longitude, well_type, well_depth, date, data_value '
                     f'FROM "{RESOURCE}" WHERE {where} ORDER BY station_code, date LIMIT {PAGE} OFFSET {offset}')
        rows.extend(page)
        print(f"  fetched {len(rows)} readings in the box")
        if len(page) < PAGE:
            break
        offset += PAGE

    tree, shapes = state_outline()
    inside = {}
    kept = []
    for row in rows:
        if row["data_value"] is None or row["latitude"] is None:
            continue
        key = (row["latitude"], row["longitude"])
        if key not in inside:
            point = Point(row["longitude"], row["latitude"])
            inside[key] = any(shapes[i].contains(point) for i in tree.query(point))
        if inside[key]:
            kept.append([row["station_code"], row["station_name"], row["latitude"], row["longitude"],
                         row["well_type"], row["well_depth"], row["date"][:10], row["data_value"]])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(FIELDS)
        writer.writerows(kept)
    stations = len({row[0] for row in kept})
    dates = sorted(row[6] for row in kept)
    print(f"  kept {len(kept)} readings at {stations} CGWB stations inside the State, {dates[0]} to {dates[-1]}")
    print(f"  wrote {os.path.relpath(OUT, os.path.join(HERE, '..'))}")


if __name__ == "__main__":
    main()
