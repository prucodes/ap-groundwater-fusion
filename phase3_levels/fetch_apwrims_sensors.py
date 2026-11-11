"""Today's water table from the State's automatic sensors (APWRIMS telemetry).

APWRIMS runs about 1,700 automatic water-level recorders (Swan and Encardio
piezometers). Its public groundwater dashboard reads their latest values from the
portal's telemetry service in one request: every station with its location, its
latest depth to water, the same date last year and the time of the reading. This
pulls that one request, the same one the public page makes, with no login and no
borrowed headers, and reduces it to what the site shows:

- each station: name, place, latest level, a year ago, hours since its reading;
- each mandal outline: the median of its stations that reported in the last two
  days, against the same stations a year ago. Not against the hand-read record:
  the sensors stand in different wells from the monthly readings (mandal medians
  differ by 1.4 m in the typical mandal, though r = 0.9 across the State), so the
  only fair comparison for a sensor is the same sensor a year earlier;
- the State: active stations, the median level and how many are deeper than a
  year ago.

The monthly history (fetch_apwrims_history.py) stays the record the models use: it
is the hand-read network, long and checked; this is the sensors' reading today.
Use only where access is permitted; this is an authorization-pending research
sample, not official data. Verified TLS only.

Output: app/data/gw_sensors.json, and one line a day appended to
app/data/gw_sensors_history.json so the State's line builds up. Daily.
"""
import datetime
import json
import os
import statistics
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import fetch_apwrims_history as apwrims  # noqa: E402

APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(APP, "gw_sensors.json")
GEOMETRY = os.path.join(APP, "ap_map_display.json")
HISTORY = os.path.join(APP, "gw_sensors_history.json")
SERVICE = "https://apwrims2.0.vassarlabs.com/iot/api/groundwater/lastknown/aggregated"
ACTIVE_HOURS = 48          # a station counts as reporting if its latest reading is this recent
MIN_ACTIVE = 800           # fewer than this and the service is having a bad day: keep yesterday's file
WINDOW_DAYS = 30           # how far back the service looks for each station's latest reading


def request(now_ms):
    body = {"pEUUID": apwrims.AP_STATE_UUID, "pUUID": apwrims.AP_STATE_UUID, "pType": "STATE", "cType": "GROUNDWATER",
            "src": "MERGED_DWLR", "format": "HOURLY", "sDate": str(now_ms - WINDOW_DAYS * 86_400_000), "eDate": str(now_ms),
            "aggr": "LATEST", "includeAllLoc": True}
    req = urllib.request.Request(SERVICE, data=json.dumps(body).encode(), headers={
        "Content-Type": "application/json", "Accept": "application/json",
        "User-Agent": "ap-groundwater-fusion research (public dashboard request, no login)"})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(req, timeout=180, context=apwrims._ctx) as response:
                return json.loads(response.read())
        except Exception as error:  # noqa: BLE001 - retried, then raised
            if attempt == 3 or not apwrims.is_transient(error):
                raise
            time.sleep(30 * attempt)


def locate(stations):
    """Each station's mandal outline, by point in polygon."""
    from shapely import STRtree
    from shapely.geometry import MultiPolygon, Point, Polygon
    shapes = [MultiPolygon([Polygon(r) for r in m["rings"] if len(r) >= 4]).buffer(0) for m in json.load(open(GEOMETRY))["mandals"]]
    tree = STRtree(shapes)
    out = []
    for s in stations:
        hits = tree.query(Point(s["lng"], s["lat"]), predicate="within")
        out.append(int(hits[0]) if len(hits) else None)
    return out


def main():
    now = datetime.datetime.now(datetime.timezone.utc)
    raw = request(int(now.timestamp() * 1000))
    stations = [s for s in raw if isinstance(s, dict) and s.get("lat") and s.get("lng") and isinstance(s.get("averageLevel"), (int, float))]
    for s in stations:
        s["hours"] = round((now.timestamp() * 1000 - s["egt"]) / 3_600_000, 1) if s.get("egt") else None
    active = [s for s in stations if s["hours"] is not None and s["hours"] <= ACTIVE_HOURS]
    if len(active) < MIN_ACTIVE:
        sys.exit(f"Only {len(active)} of {len(stations)} stations reported in {ACTIVE_HOURS} h; the published file is untouched.")
    where = locate(stations)

    by_mandal = {}
    for s, index in zip(stations, where):
        if index is not None and s["hours"] is not None and s["hours"] <= ACTIVE_HOURS:
            by_mandal.setdefault(index, []).append(s)
    mandals = []
    for index, mine in sorted(by_mandal.items()):
        level = statistics.median(s["averageLevel"] for s in mine)
        year = [s["lastYearLevel"] for s in mine if isinstance(s.get("lastYearLevel"), (int, float))]
        mandals.append([index, len(mine), round(level, 2), round(statistics.median(year), 2) if year else None])
    changes = [s["averageLevel"] - s["lastYearLevel"] for s in active if isinstance(s.get("lastYearLevel"), (int, float))]
    latest = max(s["egt"] for s in active)
    payload = {
        "contractVersion": "1.0.0",
        "fetchedAt": now.isoformat(timespec="seconds"),
        "latestReading": datetime.datetime.fromtimestamp(latest / 1000, datetime.timezone.utc).isoformat(timespec="minutes"),
        "source": "APWRIMS groundwater telemetry (automatic water-level recorders), as its public dashboard reads it",
        "url": apwrims.BASE + "/mis/groundwater/levels",
        "authorizationStatus": "research_pending",
        "activeHours": ACTIVE_HOURS,
        "state": {
            "stations": len(stations), "active": len(active),
            "medianM": round(statistics.median(s["averageLevel"] for s in active), 2),
            "medianYearAgoM": round(statistics.median(s["lastYearLevel"] for s in active if isinstance(s.get("lastYearLevel"), (int, float))), 2),
            "deeperThanYearAgo": sum(1 for c in changes if c > 0.1), "shallowerThanYearAgo": sum(1 for c in changes if c < -0.1),
            "compared": len(changes),
            "mandalsReporting": len(mandals),
            "mandalsDeeperThanYearAgo": sum(1 for m in mandals if m[3] is not None and m[2] - m[3] > 0.1),
        },
        # [boundary index, stations reporting, median level m, median a year ago m]
        "mandals": mandals,
        # [name, lat, lng, district, mandal, level m, a year ago m, hours since the reading, boundary index]
        "stations": [[s.get("name"), round(s["lat"], 5), round(s["lng"], 5), s.get("dt"), s.get("mnm"), round(s["averageLevel"], 2),
                      round(s["lastYearLevel"], 2) if isinstance(s.get("lastYearLevel"), (int, float)) else None, s["hours"], where[i]]
                     for i, s in enumerate(stations)],
    }
    with open(OUT + ".tmp", "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")
    os.replace(OUT + ".tmp", OUT)
    st = payload["state"]
    # The State's line, a point a day by the date of the latest reading in India.
    day = (datetime.datetime.fromtimestamp(latest / 1000, datetime.timezone.utc) + datetime.timedelta(hours=5, minutes=30)).date().isoformat()
    history = json.load(open(HISTORY)) if os.path.exists(HISTORY) else {"note": "one point a day from fetch_apwrims_sensors.py", "days": []}
    history["days"] = [d for d in history["days"] if d[0] != day] + [[day, st["active"], st["medianM"], st["medianYearAgoM"], st["deeperThanYearAgo"], st["compared"]]]
    history["fields"] = ["date (IST)", "stations reporting", "median level m", "same stations a year ago m", "deeper than a year ago", "compared"]
    with open(HISTORY, "w") as handle:
        json.dump(history, handle, separators=(",", ":"))
        handle.write("\n")
    print(f"{len(active)} of {len(stations)} stations reporting; State median {st['medianM']} m against {st['medianYearAgoM']} m a year ago; "
          f"{st['deeperThanYearAgo']} of {st['compared']} deeper; {st['mandalsDeeperThanYearAgo']} of {st['mandalsReporting']} mandals deeper than a year ago")
    return 0


if __name__ == "__main__":
    sys.exit(main())
