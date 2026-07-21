"""Build the production viz dataset: the MODEL's per-mandal yearly predictions
(2014-2025) + a 2-year forecast (2026-2027) + CGWB extraction + polygons.
Run from phase3_levels/:  python gw_viz_prep.py
"""
import json, csv, difflib, os
import numpy as np, pandas as pd
from build_levels_engine import build_frame, mk_est, NUM, CAT, norm

OUT = "/private/tmp/claude-501/-Users-pruthviyannam-Documents/9b397bdf-f050-4626-996d-7f40d340a5f4/scratchpad/gw_viz_data2.json"
YEARS = list(range(2014, 2026)); FC = [2026, 2027]

def simp(r, t=24):
    return r if len(r) <= t else [r[int(i*len(r)/t)] for i in range(t)]

def main():
    df = build_frame()
    df["year"] = df.date.str.slice(0, 4).astype(int)
    # train the display model + uncertainty bands on all data (fitted estimates)
    m50, m10, m90 = mk_est(), mk_est(0.1), mk_est(0.9)
    y = df.level_mbgl.values
    m50.fit(df[NUM+CAT], y); m10.fit(df[NUM+CAT], y); m90.fit(df[NUM+CAT], y)
    df["pred"] = m50.predict(df[NUM+CAT])
    df["p10"] = m10.predict(df[NUM+CAT]); df["p90"] = m90.predict(df[NUM+CAT])

    # per-mandal yearly MODEL estimate + band width
    ye = df.groupby(["mkey", "year"]).pred.mean().unstack("year").reindex(columns=YEARS)
    ye = ye.interpolate(axis=1, limit_direction="both")
    band = (df.p90 - df.p10).abs().groupby(df.mkey).mean()

    # geometry polygons keyed by model mkey
    geo = json.load(open("../app/data/ap_map_geometry.json"))
    gp = {}
    for m in geo["mandals"]:
        rings = m.get("rings", [])
        if not rings: continue
        poly = simp([(round(p[0], 4), round(p[1], 4)) for p in max(rings, key=len)])
        if len(poly) >= 3: gp[norm(m["m"])] = {"poly": poly, "d": m.get("d", "")}
    gk = list(gp)

    # extraction (fuzzy-matched on the same mkey that gave 549 before)
    ex = {}
    with open("data/mandal_extraction_cgwb2024.csv") as f:
        for r in csv.DictReader(f):
            try: ex[norm(r["mandal"])] = (round(float(r["stage_pct"]), 1), r["category"])
            except: pass
    exk = list(ex)

    out = []; exmatched = 0
    for mk, row in ye.iterrows():
        series = [round(float(v), 1) if pd.notna(v) else None for v in row.values]
        vals = [v for v in series if v is not None]
        if not vals: continue
        series = [v if v is not None else vals[0] for v in series]
        # per-mandal recent trend (2018+) for the forecast
        rec = [(YEARS[i], series[i]) for i in range(len(YEARS)) if YEARS[i] >= 2018]
        slope = float(np.polyfit([r[0] for r in rec], [r[1] for r in rec], 1)[0]) if len(rec) >= 3 else 0.0
        slope = max(-2.0, min(2.0, slope))
        fc = [round(min(60, max(0, series[-1] + slope*(fy-2025))), 1) for fy in FC]

        g = gp.get(mk)
        if g is None:
            h = difflib.get_close_matches(mk, gk, n=1, cutoff=0.85); g = gp[h[0]] if h else None
        if g is None: continue
        e = ex.get(mk)
        if e is None:
            h = difflib.get_close_matches(mk, exk, n=1, cutoff=0.84); e = ex[h[0]] if h else None
        if e: exmatched += 1
        out.append({"n": mk.title(), "d": (g["d"] or "").title(), "poly": g["poly"],
                    "lvl": series + fc, "band": round(float(band.get(mk, 3.0)), 1),
                    "stage": e[0] if e else None, "cat": e[1] if e else None,
                    "trend": round(slope, 2)})

    lons = [p[0] for m in out for p in m["poly"]]; lats = [p[1] for m in out for p in m["poly"]]
    res = {"bbox": [min(lons), min(lats), max(lons), max(lats)],
           "years": [str(y) for y in YEARS] + [str(y) for y in FC], "nForecast": len(FC),
           "mandals": out}
    json.dump(res, open(OUT, "w"), separators=(",", ":"))
    print(f"mandals: {len(out)} | extraction matched: {exmatched} | forecast yrs: {FC}")
    print(f"years: {res['years'][0]}..{res['years'][-1]} | size {os.path.getsize(OUT)/1024:.0f} KB")

if __name__ == "__main__":
    main()
