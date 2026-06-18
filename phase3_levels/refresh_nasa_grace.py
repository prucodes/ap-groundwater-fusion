"""Refresh the NASA GRACE-DA provenance + station samples to the latest rasters.

Downloads the current gws/rtzsm/sfsm percentile GeoTIFFs from nasagrace.unl.edu,
re-samples them at the AP station points, and rewrites:
  app/data/nasa_provenance.json          (fetch_date + per-raster stats/sha/size)
  app/data/satellite_station_samples.json (per-station percentiles + date)

Only these two files (read solely by the /nasa page) are touched — safe blast radius.
"""
import csv, hashlib, json, os, ssl, datetime, urllib.request, tempfile
import rasterio

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
BASE = "https://nasagrace.unl.edu/globaldata/current/"
RASTERS = {
    "gws_perc_025deg_GL.tif": "groundwater_percentile",
    "rtzsm_perc_025deg_GL.tif": "rootzone_percentile",
    "sfsm_perc_025deg_GL.tif": "surface_percentile",
}
_ctx = ssl._create_unverified_context()


def download(name, dest):
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120, context=_ctx) as r:
        data = r.read()
        mod = r.headers.get("Last-Modified", "")
    open(dest, "wb").write(data)
    return data, mod


def main():
    samples = json.load(open(os.path.join(APP, "satellite_station_samples.json")))
    prov = json.load(open(os.path.join(APP, "nasa_provenance.json")))
    pts = [(s, float(s["latitude"]), float(s["longitude"])) for s in samples]
    today = datetime.date.today().isoformat()
    tmp = tempfile.mkdtemp()
    per_raster_vals = {}

    for name, field in RASTERS.items():
        dest = os.path.join(tmp, name)
        data, mod = download(name, dest)
        sha = hashlib.sha256(data).hexdigest()[:12]
        size_kb = round(len(data) / 1024)
        with rasterio.open(dest) as ds:
            nodata = ds.nodata
            vals = []
            for s, lat, lon in pts:
                try:
                    v = next(ds.sample([(lon, lat)]))[0]
                except Exception:
                    v = None
                if v is None or (nodata is not None and v == nodata) or v < 0 or v > 100:
                    v = None
                else:
                    v = round(float(v), 1)
                s[field] = "" if v is None else str(v)
                vals.append(v)
            valid = [v for v in vals if v is not None]
            per_raster_vals[name] = valid
            # update provenance raster row
            for r in prov["rasters"]:
                if r["raster_name"] == name:
                    r["fetch_date"] = today
                    r["file_size_kb"] = size_kb
                    r["sha256_short"] = sha
                    r["min"] = round(min(valid), 2) if valid else None
                    r["mean"] = round(sum(valid) / len(valid), 2) if valid else None
                    r["max"] = round(max(valid), 2) if valid else None
                    r["count"] = len(valid)
                    r["width"], r["height"] = str(ds.width), str(ds.height)
        print(f"  {name}: {len(valid)} valid samples, mean {round(sum(valid)/len(valid),2) if valid else 'n/a'}  ({mod})")

    for s in samples:
        s["satellite_sample_date_or_fetch_date"] = today
    prov["fetch_date"] = today
    prov["total_null_or_nodata_samples"] = sum(1 for s in samples if s.get("groundwater_percentile", "") == "")

    json.dump(samples, open(os.path.join(APP, "satellite_station_samples.json"), "w"), indent=2)
    json.dump(prov, open(os.path.join(APP, "nasa_provenance.json"), "w"), indent=2)
    print(f"  refreshed NASA provenance + {len(samples)} station samples -> fetch_date {today}")


if __name__ == "__main__":
    main()
