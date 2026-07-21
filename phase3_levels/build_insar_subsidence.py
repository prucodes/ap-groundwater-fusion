"""Turn the HyP3 InSAR stack into a per-mandal SUBSIDENCE VELOCITY (mm/yr).

Chains the consecutive-pair LOS-displacement rasters (SBAS-style) and samples the
cumulative motion at each mandal centroid within the frame. Negative LOS (away from
satellite) = sinking = groundwater depletion signature.
-> data/mandal_insar_subsidence.csv  (mkey, subsidence_mm_yr, coherence, n_pairs)
Then checks: does subsidence agree with our pumping-pressure / decline flags?
"""
import csv, glob, json, os, re, datetime
import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
UNZ = os.path.join(HERE, "insar", "unz")


def norm(s):
    s = str(s).upper().strip(); s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


def pair_dates(name):
    m = re.findall(r"_(\d{8})T", name)
    return (datetime.datetime.strptime(m[0], "%Y%m%d"), datetime.datetime.strptime(m[1], "%Y%m%d"))


def centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json"))); out = {}
    for m in g["mandals"]:
        p = [pt for r in m["rings"] for pt in r]
        if p: out[norm(m["m"])] = (sum(x[1] for x in p)/len(p), sum(x[0] for x in p)/len(p))
    return out


def main():
    dirs = sorted(glob.glob(os.path.join(UNZ, "S1AA_*")), key=lambda d: pair_dates(os.path.basename(d))[0])
    dirs = [d for d in dirs if os.path.isdir(d)]
    print(f"  {len(dirs)} interferogram pairs, {pair_dates(os.path.basename(dirs[0]))[0].date()} -> {pair_dates(os.path.basename(dirs[-1]))[1].date()}")
    cents = centroids(); mks = list(cents)
    lons = np.array([cents[k][1] for k in mks]); lats = np.array([cents[k][0] for k in mks])
    cum = np.zeros(len(mks)); coh = np.zeros(len(mks)); npix = np.zeros(len(mks), int)
    span_days = (pair_dates(os.path.basename(dirs[-1]))[1] - pair_dates(os.path.basename(dirs[0]))[0]).days

    for d in dirs:
        base = os.path.basename(d)
        disp = glob.glob(os.path.join(d, "*_los_disp.tif")); corr = glob.glob(os.path.join(d, "*_corr.tif"))
        if not disp or not corr:
            continue
        with rasterio.open(disp[0]) as ds, rasterio.open(corr[0]) as cs:
            xs, ys = warp_transform("EPSG:4326", ds.crs, lons.tolist(), lats.tolist())
            dv = np.array([v[0] for v in ds.sample(list(zip(xs, ys)))], dtype=float)
            cv = np.array([v[0] for v in cs.sample(list(zip(xs, ys)))], dtype=float)
            nod = ds.nodata
            inside = np.isfinite(dv) & (dv != (nod if nod is not None else -9999)) & np.isfinite(cv)
            good = inside & (cv > 0.3)
            cum[good] += dv[good]          # metres, chained
            coh[good] += cv[good]; npix[good] += 1

    rows = []
    for i, mk in enumerate(mks):
        if npix[i] >= max(3, len(dirs)//2):     # covered by >= half the chain
            sub_mm_yr = round(-(cum[i]) * 1000.0 / (span_days/365.25), 2)  # +ve = sinking
            rows.append([mk, sub_mm_yr, round(coh[i]/npix[i], 2), npix[i]])
    with open(os.path.join(HERE, "data", "mandal_insar_subsidence.csv"), "w", newline="") as f:
        w = csv.writer(f); w.writerow(["mkey", "subsidence_mm_yr", "coherence", "n_pairs"]); w.writerows(rows)
    print(f"  mandals with InSAR coverage: {len(rows)} (delta frame)")
    if rows:
        s = np.array([r[1] for r in rows])
        print(f"  subsidence mm/yr: min {s.min():.1f}  max {s.max():.1f}  mean {s.mean():.1f}  (+ve = sinking)")
        # validate vs our pumping-pressure / trend
        ds = {norm(r["mandal_name"]): r for r in json.load(open(os.path.join(APP, "mandal_dataset.json")))}
        pairs = [(r[1], ds[r[0]]) for r in rows if r[0] in ds]
        sink = [x for x in pairs if x[0] > 5]
        oe = sum(1 for x in sink if x[1]["sensor_satellite_agreement"] == "over_extraction")
        dec = sum(1 for x in sink if (x[1].get("trend_m_per_yr") or 0) > 0)
        print(f"  of {len(sink)} strongly-sinking mandals (>5 mm/yr): {oe} flagged pumping-pressure, {dec} show deepening trend")


if __name__ == "__main__":
    main()
