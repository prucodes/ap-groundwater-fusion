"""Historical monthly rainfall per mandal — the cheap way (NASA POWER point API).

NASA POWER (https://power.larc.nasa.gov) serves a free, no-key JSON time series
per lat/lon point. We pull monthly corrected precipitation (PRECTOTCORR, mm/day)
for every mandal centroid, 2014-2026, in ONE small call per mandal — far lighter
than downloading 144 global CHIRPS rasters. Satellite/reanalysis blend, open data,
NOT groundwater depth: used only as the recharge/supply driver for the level model.

Output: phase3_levels/data/mandal_rain_history.csv  (mandal, date, rain_mm)
"""
import csv, json, os, ssl, sys, time, urllib.request
import os as _os, sys as _sys, ssl as _ssl
def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (loud, opt-in)."""
    if _os.environ.get('ALLOW_INSECURE_TLS') == '1':
        _sys.stderr.write('WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n')
        return _ssl._create_unverified_context()
    return _ssl.create_default_context()

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(HERE, "data", "mandal_rain_history.csv")
API = "https://power.larc.nasa.gov/api/temporal/monthly/point"
START, END = "2014", "2025"   # POWER monthly lags ~6 months; 2026 not yet served

_ctx = _tls_context()  # verified by default; unverified only via ALLOW_INSECURE_TLS=1


def centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = []
    seen = set()
    for m in g["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts:
            continue
        key = f"{m['d']}|{m['m']}"
        if key in seen:
            continue
        seen.add(key)
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out.append((m["d"], m["m"], round(lat, 4), round(lon, 4)))
    return out


def fetch_point(lat, lon, timeout=60):
    url = (f"{API}?parameters=PRECTOTCORR&community=AG"
           f"&latitude={lat}&longitude={lon}&start={START}&end={END}&format=JSON")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=_ctx) as r:
        d = json.loads(r.read())
    # {"properties":{"parameter":{"PRECTOTCORR":{"201406": mm_per_day, ...}}}}
    series = d["properties"]["parameter"]["PRECTOTCORR"]
    rows = []
    for ym, mmday in series.items():
        if not (len(ym) == 6 and ym.isdigit()) or not ("01" <= ym[4:] <= "12"):
            continue  # POWER appends a "YYYY13" annual rollup — skip it
        if mmday is None or mmday < -900:  # POWER fill value -999
            continue
        # mm/day -> monthly mm (approx 30.44 days)
        rows.append((f"{ym[:4]}-{ym[4:]}", round(mmday * 30.44, 1)))
    return rows


def main():
    test = "--test" in sys.argv
    rows = centroids()
    if test:
        rows = rows[:3]
    print(f"  Pulling NASA POWER monthly rainfall for {len(rows)} mandals ({START}-{END}) ...")
    n_written = 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out_rows = []
    for i, (d, m, lat, lon) in enumerate(rows, 1):
        try:
            series = fetch_point(lat, lon)
            for ym, mm in series:
                out_rows.append([d, m, ym, mm]); n_written += 1
            if i % 25 == 0 or test:
                print(f"    [{i}/{len(rows)}] {d}|{m}: {len(series)} months")
            time.sleep(0.2)
        except Exception as e:
            print(f"    [warn] {d}|{m}: {e}")
    if test:
        print("  TEST sample:", out_rows[:3], "...", out_rows[-1:])
        return 0
    with open(OUT, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["district", "mandal", "date", "rain_mm"])
        w.writerows(out_rows)
    print(f"  Wrote {n_written} rows -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
