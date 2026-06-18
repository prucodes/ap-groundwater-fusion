"""Phase 3 — one-time DEM enrichment: real elevation per mandal centroid.

Terrain is static, so this is NOT part of the weekly job — run it once; the result
(data/mandal_terrain.csv) is cached and picked up by build_mandal_features.py.

Uses the open-elevation public API (free, no key) on mandal centroids. Slope/TWI
need a DEM raster zonal-stat (a heavier fetch); until then they stay a regional
proxy here. Swap the source for SRTM/Copernicus zonal stats for production.
"""
import csv, json, os, ssl, sys, time, urllib.request
import os as _os, sys as _sys, ssl as _ssl
def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (loud, opt-in)."""
    if _os.environ.get('ALLOW_INSECURE_TLS') == '1':
        _sys.stderr.write('WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n')
        return _ssl._create_unverified_context()
    return _ssl.create_default_context()

HERE = os.path.dirname(__file__)
APP = os.path.join(HERE, "..", "app", "data")
API = "https://api.open-elevation.com/api/v1/lookup"

# regional slope/twi proxy (point API gives elevation only)
HARD_ROCK = {"ANANTAPUR", "Y.S.R.", "KURNOOL", "CHITTOOR"}
DELTA = {"KRISHNA", "EAST GODAVARI", "WEST GODAVARI", "GUNTUR"}
def slope_twi(du):
    if du in HARD_ROCK: return 5.0, 7.0
    if du in DELTA: return 1.5, 11.0
    return 2.5, 9.0


def centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = []
    for m in g["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts:
            continue
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out.append((f"{m['d']}|{m['m']}", m["d"].upper(), round(lat, 5), round(lon, 5)))
    return out


def fetch_batch(locs, timeout=30):
    body = json.dumps({"locations": [{"latitude": la, "longitude": lo} for (_, _, la, lo) in locs]}).encode()
    req = urllib.request.Request(API, data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())["results"]
    except urllib.error.URLError as e:
        # macOS cert-store fallback (same TLS-fallback pattern as the project fetchers)
        if "CERTIFICATE_VERIFY_FAILED" in str(e):
            ctx = _tls_context()
            print("    [tls] verified fetch failed; retrying unverified (public elevation API)")
            with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                return json.loads(r.read())["results"]
        raise


def main():
    test = "--test" in sys.argv
    rows = centroids()
    if test:
        rows = rows[:3]
    print(f"  Enriching {len(rows)} mandal centroids via open-elevation ...")
    results = {}
    CHUNK = 100
    for i in range(0, len(rows), CHUNK):
        batch = rows[i:i + CHUNK]
        try:
            res = fetch_batch(batch)
            for (key, du, la, lo), rr in zip(batch, res):
                sl, twi = slope_twi(du)
                results[key] = (round(rr.get("elevation", 0.0), 1), sl, twi)
            print(f"    {min(i+CHUNK,len(rows))}/{len(rows)} ok")
            time.sleep(1)
        except Exception as e:
            print(f"    [warn] batch {i} failed: {e}")
            return 1 if test else None
    if test:
        print("  TEST ok, sample:", list(results.items())[:3])
        return 0
    out = os.path.join(HERE, "data", "mandal_terrain.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["mandal_id", "elevation_m", "slope_deg", "twi"])
        for k, (e, s, t) in results.items():
            w.writerow([k, e, s, t])
    print(f"  Wrote {len(results)} rows -> {out}  (build_mandal_features will use it)")


if __name__ == "__main__":
    sys.exit(main() or 0)
