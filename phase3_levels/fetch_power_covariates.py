"""#3 experiment, step 1 — pull the water-balance signals the model is MISSING.

The current model has rainfall (the recharge side) but no soil moisture / temperature.
This pulls, from the SAME free no-key NASA POWER monthly API you already use:
  GWETROOT : root-zone soil wetness (0-1)  -> integrated soil-water state (recharge memory)
  GWETTOP  : surface soil wetness (0-1)
  T2M      : 2 m air temperature (deg C)    -> evaporative demand proxy

Writes phase3_levels/data/mandal_power_covariates.csv (district, mandal, date, sm_root, sm_top, temp).
Run from the gw-workbench folder:  python phase3_levels/fetch_power_covariates.py
Then A/B test with:                python phase3_levels/train_ab_covariates.py

NOTE: if POWER rejects a parameter, it errors the whole request — edit PARAMS below and rerun.
Takes ~10-20 min (632 mandals, one polite request each). Resumable: it skips mandals already in the CSV.
"""
import csv, json, os, ssl, time, urllib.request

BASE = "gw-workbench" if os.path.isdir("gw-workbench") else "."
API = "https://power.larc.nasa.gov/api/temporal/monthly/point"
START, END = "2014", "2025"
PARAMS = "GWETROOT,GWETTOP,T2M"
OUT = os.path.join(BASE, "phase3_levels/data/mandal_power_covariates.csv")

def _ctx():
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c
CTX = _ctx()

def centroids():
    geo = json.load(open(os.path.join(BASE, "app/data/ap_map_geometry.json")))
    out = []
    for m in geo["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts:
            continue
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out.append((m["d"], m["m"], round(lat, 4), round(lon, 4)))
    return out

def fetch_point(lat, lon, timeout=60):
    url = (f"{API}?parameters={PARAMS}&community=AG"
           f"&latitude={lat}&longitude={lon}&start={START}&end={END}&format=JSON")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        p = json.load(r)["properties"]["parameter"]
    return p.get("GWETROOT", {}), p.get("GWETTOP", {}), p.get("T2M", {})

def already_done():
    if not os.path.exists(OUT):
        return set()
    done = set()
    with open(OUT) as f:
        for row in csv.reader(f):
            if row and row[0] != "district":
                done.add((row[0], row[1]))
    return done

def main():
    rows = centroids()
    done = already_done()
    new = not os.path.exists(OUT)
    print(f"POWER covariates ({PARAMS}) for {len(rows)} mandals {START}-{END}; {len(done)} already done")
    with open(OUT, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["district", "mandal", "date", "sm_root", "sm_top", "temp"])
        for i, (d, m, lat, lon) in enumerate(rows, 1):
            if (d, m) in done:
                continue
            try:
                sr, st, t = fetch_point(lat, lon)
            except Exception as e:
                print(f"  [{i}/{len(rows)}] {m}: {str(e)[:70]}")
                continue
            def g(dd, ym):
                v = dd.get(ym)
                return "" if (v is None or v < -900) else round(v, 4)
            for ym in sr:
                if ym.endswith("13"):
                    continue  # POWER annual rollup
                w.writerow([d, m, f"{ym[:4]}-{ym[4:6]}", g(sr, ym), g(st, ym), g(t, ym)])
            f.flush()
            if i % 50 == 0:
                print(f"  {i}/{len(rows)} ...")
            time.sleep(0.2)
    print(f"wrote -> {OUT}")

if __name__ == "__main__":
    main()
