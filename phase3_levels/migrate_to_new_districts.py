"""Migrate the app from the OLD 13-district AP map to the CURRENT 26/28-district
structure (the 2022 reorganization), using APWRIMS as the source of truth for
which new district each mandal belongs to.

No external boundary file needed: we already have every mandal polygon, so the new
district boundaries are the dissolve (union) of their constituent mandals.

Rewrites (with .bak backups):
  app/data/ap_map_geometry.json     mandal 'd' -> new district
  app/data/ap_mandal_heat.json      value keys "OLD|M" -> "NEW|M"
  app/data/ap_district_geometry.json  rebuilt: new districts, dissolved rings,
                                       re-aggregated layer values
  app/data/mandal_fusion_seed.json  the 10 sample mandals' district_name -> new

GRACE percentile / ET per new district are the mean of constituent mandals' OLD-
district values (GRACE is coarse ~25 km, so this is an honest proxy — flagged in
the file's caveat). Rainfall / water-balance come from the per-mandal heat data.
"""
import json, os, re, shutil, datetime, collections
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")


def norm(s):
    s = str(s).upper().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def backup(path):
    if os.path.exists(path) and not os.path.exists(path + ".bak"):
        shutil.copy2(path, path + ".bak")


def mandal_to_new_district():
    """norm(mandal) -> new district name (APWRIMS spelling, Title Case)."""
    import csv
    counts = collections.defaultdict(collections.Counter)
    with open(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")) as f:
        for r in csv.DictReader(f):
            counts[norm(r["mandal"])][r["district"].strip()] += 1
    return {mk: c.most_common(1)[0][0] for mk, c in counts.items()}


def poly_from_rings(rings):
    polys = []
    for ring in rings:
        if len(ring) >= 4:
            try:
                p = Polygon(ring)
                if not p.is_valid:
                    p = p.buffer(0)
                if p.area > 0:
                    polys.append(p)
            except Exception:
                pass
    if not polys:
        return None
    return unary_union(polys)


def geom_to_rings(geom, tol=0.004):
    geom = geom.simplify(tol, preserve_topology=True)
    polys = geom.geoms if isinstance(geom, MultiPolygon) else [geom]
    rings = []
    for p in polys:
        if p.is_empty:
            continue
        rings.append([[round(x, 4), round(y, 4)] for x, y in p.exterior.coords])
        for hole in p.interiors:
            rings.append([[round(x, 4), round(y, 4)] for x, y in hole.coords])
    return rings


def main():
    m2d = mandal_to_new_district()
    mg_path = os.path.join(APP, "ap_map_geometry.json")
    dg_path = os.path.join(APP, "ap_district_geometry.json")
    heat_path = os.path.join(APP, "ap_mandal_heat.json")
    fs_path = os.path.join(APP, "mandal_fusion_seed.json")

    mg = json.load(open(mg_path))
    old_dg = json.load(open(dg_path))
    heat = json.load(open(heat_path))
    old_dval = {d["d"].upper(): d for d in old_dg["districts"]}

    # mandal centroids (for spatial fallback)
    def centroid(m):
        pts = [pt for ring in m["rings"] for pt in ring]
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)) if pts else None

    # ---- assign each mandal its new district; unmatched -> nearest matched ----
    matched = 0
    mandal_new = {}  # geometry index -> new district (UPPER)
    unmatched = []
    matched_pts = []  # (lon, lat, new_district)
    for i, m in enumerate(mg["mandals"]):
        nd = m2d.get(norm(m["m"]))
        if nd:
            matched += 1
            mandal_new[i] = nd.upper()
            c = centroid(m)
            if c:
                matched_pts.append((c[0], c[1], nd.upper()))
        else:
            unmatched.append(i)
    # spatial fallback: nearest matched mandal centroid -> avoids old-name ghosts
    mp = np.array([[p[0], p[1]] for p in matched_pts])
    for i in unmatched:
        c = centroid(mg["mandals"][i])
        if c is None:
            mandal_new[i] = matched_pts[0][2]
            continue
        d2 = (mp[:, 0] - c[0]) ** 2 + (mp[:, 1] - c[1]) ** 2
        mandal_new[i] = matched_pts[int(np.argmin(d2))][2]
    print(f"  mandal -> new district: matched {matched}, spatial-fallback {len(unmatched)} "
          f"({matched/len(mg['mandals'])*100:.0f}% direct)")

    # heat per-mandal values keyed by old "OLD|M"
    heat_by_mandal = {}  # norm(M) -> value dict
    for k, v in heat["values"].items():
        _, mm = k.split("|", 1)
        heat_by_mandal[norm(mm)] = v

    # ---- group mandals by new district, dissolve + aggregate ----
    groups = collections.defaultdict(list)  # new district -> [mandal idx]
    for i, m in enumerate(mg["mandals"]):
        groups[mandal_new[i]].append(i)

    new_districts = []
    for nd, idxs in sorted(groups.items()):
        polys = []
        gw, rz, sf, et, rain, wb = [], [], [], [], [], []
        statuses = collections.Counter()
        for i in idxs:
            m = mg["mandals"][i]
            p = poly_from_rings(m["rings"])
            if p is not None:
                polys.append(p)
            od = old_dval.get(m["d"].upper())  # original old-district GRACE/ET
            if od:
                for arr, key in [(gw, "gw_percentile"), (rz, "rootzone_percentile"),
                                 (sf, "surface_percentile"), (et, "annual_et_mm")]:
                    if od.get(key) is not None:
                        arr.append(od[key])
            hv = heat_by_mandal.get(norm(m["m"]))
            if hv:
                if hv.get("rainfall_mm") is not None: rain.append(hv["rainfall_mm"])
                if hv.get("water_balance_mm") is not None: wb.append(hv["water_balance_mm"])
                if hv.get("water_balance_status"): statuses[hv["water_balance_status"]] += 1
        if not polys:
            continue
        diss = unary_union(polys)
        rings = geom_to_rings(diss)
        c = diss.centroid
        def mean(a): return round(float(np.mean(a)), 2) if a else None
        wb_mean = mean(wb)
        new_districts.append({
            "d": nd, "rings": rings, "c": [round(c.x, 4), round(c.y, 4)],
            "mandal_count": len(idxs),
            "gw_percentile": mean(gw), "rootzone_percentile": mean(rz),
            "surface_percentile": mean(sf),
            "rainfall_mm": mean(rain), "annual_et_mm": mean(et),
            "water_balance_mm": wb_mean,
            "water_balance_status": (statuses.most_common(1)[0][0] if statuses else None),
        })

    # recompute layer min/max, preserving label/unit from the existing layers
    old_layers = old_dg.get("layers", {})
    def rng(key):
        vals = [d[key] for d in new_districts if d.get(key) is not None]
        meta = {k: v for k, v in old_layers.get(key, {}).items() if k in ("label", "unit")}
        meta.update({"min": round(min(vals), 2), "max": round(max(vals), 2)} if vals else {"min": 0, "max": 1})
        return meta
    layers = {"gw_percentile": rng("gw_percentile"), "rainfall_mm": rng("rainfall_mm"),
              "water_balance_mm": rng("water_balance_mm")}

    # ---- write everything (with backups) ----
    for p in (mg_path, dg_path, heat_path, fs_path):
        backup(p)

    # map geometry: relabel mandal d
    for i, m in enumerate(mg["mandals"]):
        m["d"] = mandal_new[i]
    mg["feature_count"] = len(mg["mandals"])
    mg["district_structure"] = "AP 2022 reorganization (26/28 districts) — derived via APWRIMS mandal mapping"
    json.dump(mg, open(mg_path, "w"))

    # heat: re-key values using the resolved per-mandal assignment
    norm_to_new = {norm(mg["mandals"][i]["m"]): mandal_new[i] for i in range(len(mg["mandals"]))}
    new_vals = {}
    for k, v in heat["values"].items():
        old_d, mm = k.split("|", 1)
        nd = norm_to_new.get(norm(mm), old_d.upper())
        new_vals[f"{nd}|{mm}"] = v
    heat["values"] = new_vals
    json.dump(heat, open(heat_path, "w"))

    # district geometry
    new_dg = dict(old_dg)
    new_dg["districts"] = new_districts
    new_dg["district_count"] = len(new_districts)
    new_dg["layers"] = layers
    new_dg["district_structure"] = "AP 2022 reorganization (26/28 districts)"
    new_dg["caveat"] = ("Boundaries dissolved from mandal polygons grouped by APWRIMS district. "
                        "GRACE percentile & ET per district are the mean of constituent mandals' "
                        "coarse (~25 km) values — an honest proxy, not a per-district GRACE re-extraction.")
    json.dump(new_dg, open(dg_path, "w"))

    # fusion seed: relabel the sample mandals' district_name
    fs = json.load(open(fs_path))
    for r in fs:
        nd = m2d.get(norm(r.get("mandal_name", "")))
        if nd:
            r["district_name"] = nd.upper()
    json.dump(fs, open(fs_path, "w"))

    print(f"  new districts: {len(new_districts)}")
    print(f"  names: {sorted(d['d'] for d in new_districts)}")
    print(f"  wrote ap_map_geometry / ap_district_geometry / ap_mandal_heat / mandal_fusion_seed (.bak saved)")


if __name__ == "__main__":
    main()
