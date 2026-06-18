"""Refresh NASA GRACE-DA by sampling the latest rasters at ALL 28 district
centroids (not a handful of stations).

Downloads gws/rtzsm/sfsm percentile GeoTIFFs, samples each at every district
centroid, and rewrites:
  app/data/ap_district_geometry.json     (gw/rootzone/surface percentile per district + layer ranges)
  app/data/nasa_provenance.json          (fetch_date + per-raster stats over 28 districts + count)
  app/data/satellite_station_samples.json (28 district-centroid sample rows for the raw-extraction table)
"""
import hashlib, json, os, ssl, datetime, urllib.request, tempfile
import os as _os, sys as _sys, ssl as _ssl
def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (loud, opt-in)."""
    if _os.environ.get('ALLOW_INSECURE_TLS') == '1':
        _sys.stderr.write('WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n')
        return _ssl._create_unverified_context()
    return _ssl.create_default_context()
import rasterio

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
BASE = "https://nasagrace.unl.edu/globaldata/current/"
RASTERS = {
    "gws_perc_025deg_GL.tif": "gw_percentile",
    "rtzsm_perc_025deg_GL.tif": "rootzone_percentile",
    "sfsm_perc_025deg_GL.tif": "surface_percentile",
}
SAMPLE_KEY = {"gw_percentile": "groundwater_percentile",
              "rootzone_percentile": "rootzone_percentile",
              "surface_percentile": "surface_percentile"}
_ctx = _tls_context()


def download(name, dest):
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120, context=_ctx) as r:
        data = r.read()
    open(dest, "wb").write(data)
    return data


def main():
    dgeo = json.load(open(os.path.join(APP, "ap_district_geometry.json")))
    prov = json.load(open(os.path.join(APP, "nasa_provenance.json")))
    districts = dgeo["districts"]
    today = datetime.date.today().isoformat()
    tmp = tempfile.mkdtemp()

    # district -> {field: value}
    vals = {d["d"]: {} for d in districts}
    raster_stats = {}
    for name, field in RASTERS.items():
        data = download(name, os.path.join(tmp, name))
        sha = hashlib.sha256(data).hexdigest()[:12]
        size_kb = round(len(data) / 1024)
        with rasterio.open(os.path.join(tmp, name)) as ds:
            nodata = ds.nodata
            w, h = ds.width, ds.height
            valid = []
            for d in districts:
                lon, lat = d["c"][0], d["c"][1]
                try:
                    v = next(ds.sample([(lon, lat)]))[0]
                except Exception:
                    v = None
                if v is None or (nodata is not None and v == nodata) or v < 0 or v > 100:
                    v = None
                else:
                    v = round(float(v), 1)
                vals[d["d"]][field] = v
                if v is not None:
                    valid.append(v)
        raster_stats[name] = (sha, size_kb, valid, str(w), str(h))
        print(f"  {name}: sampled {len(valid)}/{len(districts)} districts, mean {round(sum(valid)/len(valid),2) if valid else 'n/a'}")

    # update district geometry percentiles
    for d in districts:
        for field in RASTERS.values():
            if vals[d["d"]].get(field) is not None:
                d[field] = vals[d["d"]][field]
    # refresh gw_percentile layer range
    gws = [d["gw_percentile"] for d in districts if d.get("gw_percentile") is not None]
    if "gw_percentile" in dgeo.get("layers", {}) and gws:
        dgeo["layers"]["gw_percentile"]["min"] = round(min(gws), 2)
        dgeo["layers"]["gw_percentile"]["max"] = round(max(gws), 2)

    # update provenance raster rows (stats over the 28 districts)
    for r in prov["rasters"]:
        st = raster_stats.get(r["raster_name"])
        if not st:
            continue
        sha, size_kb, valid, w, h = st
        r.update({"fetch_date": today, "file_size_kb": size_kb, "sha256_short": sha,
                  "min": round(min(valid), 2) if valid else None,
                  "mean": round(sum(valid) / len(valid), 2) if valid else None,
                  "max": round(max(valid), 2) if valid else None,
                  "count": len(valid), "width": w, "height": h})
    prov["fetch_date"] = today
    prov["station_points_sampled"] = len(districts)
    prov["total_null_or_nodata_samples"] = sum(
        1 for d in districts if vals[d["d"]].get("gw_percentile") is None)

    # rebuild the raw-extraction table as 28 district-centroid rows
    samples = []
    for d in districts:
        v = vals[d["d"]]
        samples.append({
            "station_id": d["d"].lower().replace(" ", "-"),
            "station_name": f"{d['d'].title()} (district centroid)",
            "district_name": d["d"], "mandal_name": "",
            "latitude": str(round(d["c"][1], 4)), "longitude": str(round(d["c"][0], 4)),
            "groundwater_percentile": "" if v.get("gw_percentile") is None else str(v["gw_percentile"]),
            "rootzone_percentile": "" if v.get("rootzone_percentile") is None else str(v["rootzone_percentile"]),
            "surface_percentile": "" if v.get("surface_percentile") is None else str(v["surface_percentile"]),
            "satellite_sample_date_or_fetch_date": today,
            "gws_source_file": "gws_perc_025deg_GL.tif",
            "rtzsm_source_file": "rtzsm_perc_025deg_GL.tif",
            "sfsm_source_file": "sfsm_perc_025deg_GL.tif",
            "data_label": "satellite-model",
            "notes": "GRACE-DA percentile (0-100), a stress/trend measure — not groundwater depth.",
        })

    json.dump(dgeo, open(os.path.join(APP, "ap_district_geometry.json"), "w"))
    json.dump(prov, open(os.path.join(APP, "nasa_provenance.json"), "w"), indent=2)
    json.dump(samples, open(os.path.join(APP, "satellite_station_samples.json"), "w"), indent=2)
    print(f"  refreshed {len(districts)} district samples -> fetch_date {today}")


if __name__ == "__main__":
    main()
