"""Validate the model's metres against CGWB (India-WRIS) — the truly INDEPENDENT
check (CGWB's own network, not the APWRIMS data we trained on).

Run fetch_cgwb_indiawris.py first (from a network that can reach India-WRIS).
This joins CGWB station readings to our per-mandal estimates by nearest centroid
(<= ~15 km) and reports MAE / RMSE / correlation — the honest cross-network number.
"""
import json, math, os, re
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
CGWB = os.path.join(HERE, "cgwb", "cgwb_gw_levels.csv")


def haversine_km(la1, lo1, la2, lo2):
    R = 6371.0; p1, p2 = np.radians(la1), np.radians(la2)
    dla = np.radians(la2 - la1); dlo = np.radians(lo2 - lo1)
    a = np.sin(dla/2)**2 + np.cos(p1)*np.cos(p2)*np.sin(dlo/2)**2
    return 2*R*np.arcsin(np.sqrt(a))


def main():
    if not os.path.exists(CGWB):
        print(f"  No CGWB file yet at {CGWB}")
        print("  Run:  python3 fetch_cgwb_indiawris.py   (from a network that reaches India-WRIS)")
        return 1
    est = json.load(open(os.path.join(APP, "mandal_levels_estimated.json")))["mandals"]
    elat = np.array([m["lat"] for m in est]); elon = np.array([m["lon"] for m in est])
    eval_ = np.array([m["estimate_mbgl"] for m in est])

    c = pd.read_csv(CGWB)
    c = c.dropna(subset=["lat", "lon", "level_mbgl"])
    c = c[(c.level_mbgl > 0) & (c.level_mbgl < 60)]
    # one reading per station closest to our as_of (use latest)
    c["date"] = pd.to_datetime(c["date"], errors="coerce")
    c = c.sort_values("date").groupby(["lat", "lon"], as_index=False).tail(1)

    pairs = []
    for _, r in c.iterrows():
        d = haversine_km(float(r.lat), float(r.lon), elat, elon)
        j = int(np.argmin(d))
        if d[j] <= 15.0:
            pairs.append((float(r.level_mbgl), float(eval_[j]), d[j]))
    if not pairs:
        print("  No CGWB stations matched within 15 km."); return 1
    cg = np.array([p[0] for p in pairs]); md = np.array([p[1] for p in pairs])
    mae = np.mean(np.abs(md - cg)); rmse = math.sqrt(np.mean((md - cg)**2)); corr = np.corrcoef(md, cg)[0, 1]
    print(f"  INDEPENDENT (CGWB vs model): n={len(pairs)} stations matched <=15 km")
    print(f"    MAE {mae:.2f} m   RMSE {rmse:.2f} m   corr {corr:.2f}")
    print(f"    (CGWB = separate network from APWRIMS training data -> this is the real external test)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
