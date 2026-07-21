"""Cross-network comparability check: CGWB wells vs APWRIMS mandals.

CGWB (National Hydrograph Network) and APWRIMS (AP state DWLR) are SEPARATE
networks. We join each CGWB station reading to the nearest APWRIMS mandal centroid
and compare levels for the SAME month (overlap 2014-2021). This is not a
ground-truth validation of either network or a universal model error floor.
"""
import argparse, csv, datetime, json, math, os, re
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")

def norm(s):
    s = str(s).upper().strip(); s = re.sub(r"[^A-Z0-9 ]", " ", s); return re.sub(r"\s+", " ", s).strip()

def hav(la1, lo1, la2, lo2):
    R=6371.0; p1,p2=np.radians(la1),np.radians(la2); dla=np.radians(la2-la1); dlo=np.radians(lo2-lo1)
    a=np.sin(dla/2)**2+np.cos(p1)*np.cos(p2)*np.sin(dlo/2)**2; return 2*R*np.arcsin(np.sqrt(a))

def evaluate():
    # APWRIMS mandal monthly + centroids
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    cents = {}
    for m in geo["mandals"]:
        pts=[pt for ring in m["rings"] for pt in ring]
        if pts: cents[norm(m["m"])]=(sum(p[1] for p in pts)/len(pts), sum(p[0] for p in pts)/len(pts))
    apw = {}  # (mkey, YYYY-MM) -> level
    mk_pts = {}
    for r in csv.DictReader(open(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))):
        try: lvl=float(r["level_mbgl"])
        except: continue
        if not (0<lvl<60): continue
        mk=norm(r["mandal"]); apw[(mk, r["date"])]=lvl
        if mk in cents: mk_pts[mk]=cents[mk]
    mks=list(mk_pts); mlat=np.array([mk_pts[k][0] for k in mks]); mlon=np.array([mk_pts[k][1] for k in mks])

    pairs=[]
    for r in csv.DictReader(open(os.path.join(HERE, "cgwb", "cgwb_gw_levels.csv"))):
        try:
            lvl=float(r["level_mbgl"]); la=float(r["lat"]); lo=float(r["lon"])
        except: continue
        if not (0<lvl<60): continue
        ym=r["date"][:7]
        d=hav(la,lo,mlat,mlon); j=int(np.argmin(d))
        if d[j]>20: continue
        key=(mks[j], ym)
        if key in apw:
            pairs.append((lvl, apw[key], d[j]))
    if not pairs:
        raise RuntimeError("no overlapping CGWB/APWRIMS pairs")
    cg=np.array([p[0] for p in pairs]); ap=np.array([p[1] for p in pairs])
    mae=np.mean(np.abs(cg-ap)); rmse=math.sqrt(np.mean((cg-ap)**2)); corr=np.corrcoef(cg,ap)[0,1]
    return {
        "task": "cross_network_comparison",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "comparison": "CGWB well versus nearest APWRIMS mandal aggregate in the same month",
        "overlapPeriod": {"start": "2014-06", "end": "2021-12"},
        "maximumDistanceKm": 20,
        "sampleCount": len(pairs),
        "maeM": round(float(mae), 4),
        "rmseM": round(float(rmse), 4),
        "correlation": round(float(corr), 4),
        "medianAbsoluteDifferenceM": round(float(np.median(np.abs(cg-ap))), 4),
        "biasCgwbMinusApwrimsM": round(float((cg-ap).mean()), 4),
        "interpretation": "network comparability diagnostic; not model accuracy",
        "limitations": [
            "Different wells and sites",
            "Potentially different aquifers and well construction",
            "Nearest-centroid spatial aggregation",
            "Observation timing and network protocol differences",
            "Potential location mismatches within the distance threshold"
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--json-out")
    args = parser.parse_args()
    result = evaluate()
    print(f"  CGWB well vs nearest APWRIMS mandal, SAME month (<=20 km):")
    print(f"    matched pairs: {result['sampleCount']:,}")
    print(f"    MAE {result['maeM']:.2f} m   RMSE {result['rmseM']:.2f} m   correlation {result['correlation']:.2f}")
    print(f"    median |diff| {result['medianAbsoluteDifferenceM']:.2f} m   bias(CGWB-APW) {result['biasCgwbMinusApwrimsM']:.2f} m")
    print("    Interpretation: cross-network comparability diagnostic, not model accuracy.")
    if args.json_out:
        with open(args.json_out, "w") as handle:
            json.dump(result, handle, indent=2)
            handle.write("\n")

if __name__ == "__main__":
    main()
