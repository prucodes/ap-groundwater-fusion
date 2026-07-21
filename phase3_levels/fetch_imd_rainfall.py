"""IMD 0.25-degree official gridded rainfall per mandal (India's own product,
generally more accurate over India than global CHIRPS/NASA-POWER).

Downloads yearly daily NetCDF from imdpune.gov.in (POST RF25=<year>), aggregates
daily -> monthly, samples at each mandal centroid. -> data/mandal_rain_history_imd.csv
"""
import csv, json, os, re, sys, ssl, urllib.request
import numpy as np
import netCDF4

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
URL = "https://www.imdpune.gov.in/cmpg/Griddata/RF25.php"
YEARS = range(2014, 2026)


def _tls_context():
    if os.environ.get("ALLOW_INSECURE_TLS") == "1":
        sys.stderr.write("WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n")
        return ssl._create_unverified_context()
    return ssl.create_default_context()


_ctx = _tls_context()


def norm(s):
    s = str(s).upper().strip(); s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()


def centroids():
    g = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out = {}
    for m in g["mandals"]:
        pts = [pt for ring in m["rings"] for pt in ring]
        if pts:
            out[norm(m["m"])] = (sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts))
    return out


def download_year(y):
    req = urllib.request.Request(URL, data=f"RF25={y}".encode(), method="POST", headers={
        "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0",
        "Origin": "https://www.imdpune.gov.in", "Referer": "https://www.imdpune.gov.in/cmpg/Griddata/Rainfall_25_NetCDF.html"})
    p = os.path.join(HERE, "imd", f"RF25_{y}.nc")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if not (os.path.exists(p) and os.path.getsize(p) > 1_000_000):
        open(p, "wb").write(urllib.request.urlopen(req, timeout=120, context=_ctx).read())
    return p


def main():
    cents = centroids()
    mks = list(cents); mlat = np.array([cents[k][0] for k in mks]); mlon = np.array([cents[k][1] for k in mks])
    rows = []
    for y in YEARS:
        try:
            ds = netCDF4.Dataset(download_year(y))
        except Exception as e:
            print(f"  [warn] {y}: {e}"); continue
        lats = ds.variables["LATITUDE"][:]; lons = ds.variables["LONGITUDE"][:]
        rain = ds.variables["RAINFALL"][:]                      # (days, lat, lon)
        rain = np.ma.filled(rain, np.nan); rain[rain < 0] = np.nan
        # nearest grid index per mandal
        yi = np.array([int(np.argmin(np.abs(lats - la))) for la in mlat])
        xi = np.array([int(np.argmin(np.abs(lons - lo))) for lo in mlon])
        days = ds.variables["TIME"][:]
        import datetime
        base = datetime.datetime(1900, 12, 31)
        months = [(base + datetime.timedelta(days=int(d))).strftime("%Y-%m") for d in days]
        # monthly sum per mandal
        month_ids = sorted(set(months)); midx = {m: [i for i, mm in enumerate(months) if mm == m] for m in month_ids}
        for mm in month_ids:
            block = rain[midx[mm]][:, yi, xi]                   # (days_in_month, n_mandals)
            monthly = np.nansum(block, axis=0)
            valid = ~np.all(np.isnan(rain[midx[mm]][:, yi, xi]), axis=0)
            for j, mk in enumerate(mks):
                if valid[j]:
                    rows.append([mk, mm, round(float(monthly[j]), 1)])
        print(f"  {y}: sampled {len(month_ids)} months x {len(mks)} mandals")
    out = os.path.join(HERE, "data", "mandal_rain_history_imd.csv")
    with open(out, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["mkey", "date", "rain_mm"]); w.writerows(rows)
    print(f"  wrote {len(rows)} rows -> {out}")


if __name__ == "__main__":
    main()
