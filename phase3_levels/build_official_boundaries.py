"""Rebuild official mandal boundaries from the data lake's vertex rows and
check each one against its official area and against our prototype polygon.

The data lake's Mandal Geography returns, per mandal, every boundary vertex as
a row (each twice, in no particular order), in projected metres, with the
official area (shape_area) and LGD codes. The ring order is lost, so the
outline is recovered as the concave hull of the vertices whose area best
matches the official area, and checked:

  rebuilt area vs official area   -> is the rebuild trustworthy?
  our prototype vs rebuilt         -> area ratio, overlap (IoU), centroid offset

Reads data/raw/datalake/mandal_geo/*.json (from fetch_datalake.py) and
app/data/ap_map_geometry.json; writes data/raw/datalake/derived/ (local,
git-ignored) and prints the verdict per mandal.
"""
import collections
import glob
import json
import math
import os
import re
import sys

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import MultiPoint, Polygon, shape, mapping
from shapely.ops import transform

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw", "datalake", "mandal_geo")
DERIVED = os.path.join(ROOT, "data", "raw", "datalake", "derived")
GEOMETRY = os.path.join(ROOT, "app", "data", "ap_map_geometry.json")
WATER = os.path.join(ROOT, "app", "data", "water_context.json")

CANDIDATE_CRS = ["EPSG:32644", "EPSG:32643", "EPSG:24344", "EPSG:24343"]
REBUILD_GOOD = 0.03      # rebuilt area within 3% of the official area
PROTOTYPE_OK_AREA = 0.05  # prototype within 5% of official area ...
PROTOTYPE_OK_IOU = 0.85   # ... and overlapping it this much counts as already right
WRONG_AREA = 0.15         # a prototype more than 15% off in area is the wrong shape
WRONG_IOU_MARGIN = 0.05   # or one overlapping 0.05 less than coarseness alone explains
NEIGHBOUR_OVERLAP = 0.05  # a rebuilt outline lying over official neighbours by more than this is withheld


def norm(text):
    return re.sub(r"[^a-z0-9]", "", (text or "").lower())


def load_official():
    """{(district code, mandal code): {attrs, points}} from every saved file."""
    groups = {}
    for path in glob.glob(os.path.join(RAW, "*.json")):
        if os.path.basename(path).startswith("_"):
            continue
        for row in json.load(open(path)):
            key = (str(row.get("dstcodeind")), str(row.get("mndcodeind")))
            entry = groups.setdefault(key, {"attrs": row, "points": set()})
            try:
                entry["points"].add((float(row["longitude"]), float(row["latitude"])))
            except (TypeError, ValueError, KeyError):
                pass
    return groups


def pick_crs(groups, prototypes):
    """The projection under which official centroids land on our prototype ones.
    Centroids of the rebuilt outline, not of the vertices: vertices crowd along
    wiggly stretches of a boundary and drag a plain average kilometres off."""
    sample = [g for g in groups.values() if g["proto"] is not None][:60]
    outlines = [(g, rebuild(list(g["points"]), float(g["attrs"]["shape_area"]))) for g in sample]
    outlines = [(g, o) for g, o in outlines if o is not None and abs(o.area / float(g["attrs"]["shape_area"]) - 1) <= REBUILD_GOOD]
    best = None
    for crs in CANDIDATE_CRS:
        to_ll = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
        offsets = []
        for g, outline in outlines:
            lon, lat = to_ll.transform(outline.centroid.x, outline.centroid.y)
            c = g["proto"].centroid
            offsets.append(km(lon, lat, c.x, c.y))
        median = float(np.median(offsets)) if offsets else math.inf
        if best is None or median < best[1]:
            best = (crs, median)
    return best


def km(lon1, lat1, lon2, lat2):
    dx = (lon2 - lon1) * 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
    dy = (lat2 - lat1) * 110.57
    return math.hypot(dx, dy)


def tour(points_xy):
    """The vertices in boundary order: nearest-neighbour walk, then 2-opt until no
    crossing segment can be shortened. A boundary is a short closed path through
    its own vertices, so the shortest tour is almost always the ring itself."""
    pts = np.asarray(points_xy, dtype=float)
    n = len(pts)
    order, used = [0], np.zeros(n, bool)
    used[0] = True
    for _ in range(n - 1):
        d = np.hypot(*(pts - pts[order[-1]]).T)
        d[used] = np.inf
        nxt = int(np.argmin(d))
        order.append(nxt)
        used[nxt] = True
    order = np.array(order)
    for _ in range(60):
        improved = False
        for i in range(n - 2):
            a, b = pts[order[i]], pts[order[i + 1]]
            c, d = pts[order[i + 2:]], pts[order[(np.arange(i + 2, n) + 1) % n]]
            gain = (np.hypot(*(a - b)) + np.hypot(*(c - d).T)) - (np.hypot(*(a - c).T) + np.hypot(*(b - d).T))
            j = int(np.argmax(gain))
            if gain[j] > 1e-6:
                j += i + 2
                order[i + 1:j + 1] = order[i + 1:j + 1][::-1]
                improved = True
        if not improved:
            break
    return pts[order]


def tour_polygon(points_xy):
    ring = tour(points_xy)
    polygon = shapely.make_valid(Polygon(ring))
    parts = [g for g in getattr(polygon, "geoms", [polygon]) if g.geom_type in ("Polygon", "MultiPolygon")]
    return shapely.unary_union(parts) if parts else None


def rebuild(points_xy, official_area):
    """The outline whose area best matches the official area: the ordered tour,
    or a concave hull tuned by bisection, whichever comes closer."""
    best = tour_polygon(points_xy) if len(points_xy) <= 4000 else None
    if best is not None and abs(best.area / official_area - 1) <= 0.01:
        return best
    cloud = MultiPoint(points_xy)
    lo, hi = 0.0, 1.0
    for _ in range(18):
        mid = (lo + hi) / 2
        hull = shapely.concave_hull(cloud, ratio=mid)
        if hull.geom_type not in ("Polygon", "MultiPolygon"):
            lo = mid
            continue
        if best is None or abs(hull.area - official_area) < abs(best.area - official_area):
            best = hull
        if hull.area < official_area:
            lo = mid
        else:
            hi = mid
    return best


def equal_area(lat0):
    """Local equal-area projection for comparing prototype and official shapes."""
    return Transformer.from_crs("EPSG:4326", f"+proj=laea +lat_0={lat0} +lon_0=80 +datum=WGS84 +units=m", always_xy=True)


PUBLISHED = os.path.join(ROOT, "app", "data", "ap_map_display.json")  # maps read this; the pipeline keeps ap_map_geometry.json
DISPLAY_TOLERANCE = 0.003    # degrees, about 330 m: under one pixel on the state and district maps
ATTRS = ("lgd", "assembly", "assemblyCode", "parliament", "revenueDivision", "officialKm2", "verdict")


def publish(results, features, crs):
    """Outlines the app draws in place of the prototype, keyed by our boundary
    index so every existing join still holds. Only rebuilds within tolerance
    of the official area are published; two official mandals that map to one
    prototype polygon (a mandal since split) are drawn as their union."""
    outlines = collections.defaultdict(list)
    for feature in features:
        if feature["properties"].get("boundaryIndex") is not None:
            outlines[feature["properties"]["boundaryIndex"]].append(shape(feature["geometry"]))
    by_index = collections.defaultdict(list)
    for row in results:
        if row.get("boundaryIndex") is not None:
            by_index[row["boundaryIndex"]].append(row)
    base = json.load(open(GEOMETRY))
    display, official_count = [], 0
    for index, mandal in enumerate(base["mandals"]):
        group = by_index.get(index, [])
        row = {**mandal, "src": "prototype"}
        if group:
            first = group[0]
            row.update({"lgd": first.get("lgd"), "ac": first.get("assembly"), "acCode": first.get("assemblyCode"),
                        "pc": first.get("parliament"), "div": first.get("revenueDivision"),
                        "officialKm2": round(sum(r["officialKm2"] for r in group), 1),
                        "verdict": first["verdict"] if len(group) == 1 else "split: " + ", ".join(r["mandal"] for r in group)})
            # An outline only when every official mandal behind this polygon rebuilt well.
            if len(outlines.get(index, [])) == len(group):
                outline = shapely.unary_union(outlines[index]).simplify(DISPLAY_TOLERANCE)
                parts = [p for p in getattr(outline, "geoms", [outline]) if p.geom_type == "Polygon" and p.area > 1e-7]
                if parts:
                    row["rings"] = [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in parts]
                    row["src"] = "official"
                    official_count += 1
        display.append(row)
    verdicts = collections.Counter(r["verdict"] for r in results)
    payload = {
        **{key: value for key, value in base.items() if key != "mandals"},
        "boundary_source": "official_rebuilt_with_prototype_fallback",
        "official_flag": False,
        "caveat": (f"{official_count} of {len(display)} mandal outlines are rebuilt from the State's official boundary "
                   "vertices (AWARE, via the AI Living Labs data lake) and checked against the official area; the rest "
                   "are public prototype outlines. Simplified for display. Model features still use the prototype outlines."),
        "official_source": "AP AWARE Mandal Geography (aware_mandal_geo_api), AI Living Labs data lake",
        "official_method": ("Ring order rebuilt from unordered official vertices (shortest tour, else an area-matched "
                            f"concave hull); kept only within {REBUILD_GOOD:.0%} of the official area; projection {crs}; "
                            f"simplified to about {DISPLAY_TOLERANCE * 111000:.0f} m."),
        "official_summary": {"official": len(results), "matched": sum(1 for r in display if r.get("lgd")),
                             "outlines": official_count, "verdicts": dict(verdicts)},
        "mandals": display,
    }
    os.makedirs(os.path.dirname(PUBLISHED), exist_ok=True)
    with open(PUBLISHED, "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")
    print(f"published display geometry: {official_count} official outlines, "
          f"{payload['official_summary']['matched']} with codes -> {os.path.relpath(PUBLISHED, ROOT)} "
          f"({os.path.getsize(PUBLISHED) // 1024} KB)")


def main():
    geometry = json.load(open(GEOMETRY))["mandals"]
    rain = json.load(open(WATER))["rainfall"]["mandals"]
    lgd_to_index = {str(r["lgdCode"]).lstrip("0"): r["boundaryIndex"] for r in rain
                    if r.get("lgdCode") and r.get("boundaryIndex") is not None}
    import build_datalake_snapshot as names  # one set of name rules for the State's spellings
    name_to_index = collections.defaultdict(list)
    district_name_to_index = {}
    for i, m in enumerate(geometry):
        name_to_index[names.our_name(m["m"])].append(i)
        district_name_to_index[(norm(m["d"]), names.our_name(m["m"]))] = i
    prototypes = {}
    for i, m in enumerate(geometry):
        try:
            # Each ring is a separate part, as the maps draw them (MultiPolygon of rings).
            prototypes[i] = shapely.make_valid(shapely.MultiPolygon([Polygon(ring) for ring in m["rings"]]))
        except Exception:
            prototypes[i] = None

    groups = load_official()
    if not groups:
        sys.exit("No mandal boundary files yet in " + RAW)
    for key, g in groups.items():
        a = g["attrs"]
        # LGD code first; then the name within its district (names repeat across
        # districts: two Devarapalles, two Prathipadus); then a name unique statewide.
        index, how = lgd_to_index.get(str(a.get("mndcodeind") or "").lstrip("0")), "lgd"
        if index is None:
            index, how = district_name_to_index.get((names.district_key(a.get("district")), names.feed_name(a.get("mandal")))), "district and name"
        if index is None:
            options = name_to_index.get(names.feed_name(a.get("mandal")), [])
            index, how = (options[0], "name") if len(options) == 1 else (None, None)
        g["index"], g["joinedBy"] = index, how
        g["proto"] = prototypes.get(index) if index is not None else None

    crs, offset = pick_crs(groups, prototypes)
    to_ll = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
    print(f"Projection of the official vertices: {crs} (median centroid offset to prototypes {offset:.2f} km)")

    results, features, candidates = [], [], []
    for key, g in sorted(groups.items()):
        a = g["attrs"]
        official = float(a.get("shape_area") or 0)
        pts = list(g["points"])
        row = {"district": a.get("district"), "mandal": a.get("mandal"), "lgd": a.get("mndcodeind"),
               "assembly": a.get("assembly"), "assemblyCode": a.get("assemcode"), "parliament": a.get("parliament"),
               "revenueDivision": a.get("redivision"), "officialKm2": round(official / 1e6, 2), "vertices": len(pts),
               "boundaryIndex": g["index"], "joinedBy": g["joinedBy"]}
        hull = rebuild(pts, official) if len(pts) >= 4 and official > 0 else None
        if hull is None:
            row["verdict"] = "cannot rebuild"
            results.append(row)
            continue
        row["rebuiltKm2"] = round(hull.area / 1e6, 2)
        row["rebuildError"] = round(hull.area / official - 1, 4)
        ll = transform(to_ll.transform, hull)
        if g["proto"] is not None:
            lat0 = ll.centroid.y
            ea = equal_area(lat0)
            mine = transform(ea.transform, g["proto"])
            theirs = transform(ea.transform, ll)
            union = mine.union(theirs).area
            row["prototypeKm2"] = round(mine.area / 1e6, 2)
            row["prototypeAreaError"] = round(mine.area / official - 1, 4)
            row["iou"] = round(mine.intersection(theirs).area / union, 3) if union else None
            row["centroidOffsetKm"] = round(km(g["proto"].centroid.x, g["proto"].centroid.y, ll.centroid.x, ll.centroid.y), 2)
            # Our prototype is drawn with few vertices. Simplify the official
            # outline to the same vertex count: the overlap that leaves is what
            # coarseness alone costs, so only a shortfall beyond it is an error.
            target = shapely.get_num_coordinates(g["proto"])
            tol, coarse = 0.0005, ll
            while shapely.get_num_coordinates(coarse) > target and tol < 0.05:
                tol *= 1.4
                coarse = ll.simplify(tol)
            row["coarsenessIou"] = round(ll.intersection(coarse).area / ll.union(coarse).area, 3)
        good = abs(row["rebuildError"]) <= REBUILD_GOOD
        if not good:
            row["verdict"] = "rebuild not reliable"
        elif g["proto"] is None:
            row["verdict"] = "new (no prototype to compare)"
        elif abs(row["prototypeAreaError"]) <= PROTOTYPE_OK_AREA and (row["iou"] or 0) >= PROTOTYPE_OK_IOU:
            row["verdict"] = "already matches"
        elif abs(row["prototypeAreaError"]) > WRONG_AREA or (row["iou"] or 0) < row["coarsenessIou"] - WRONG_IOU_MARGIN:
            row["verdict"] = "wrong shape: fixed"
        else:
            row["verdict"] = "right place: finer outline"
        results.append(row)
        if good:
            candidates.append((row, hull, ll))

    # Matching the official area is not proof of the right shape: a tour that
    # cuts across a narrow neck can keep the area and still be wrong. Real
    # neighbours do not overlap, so an outline that lies over other official
    # outlines by more than NEIGHBOUR_OVERLAP of its area is withheld.
    # Overlap is mutual, so a sound outline can be lapped by a broken neighbour:
    # withhold the worst offender first, then measure its neighbours again.
    tree = shapely.STRtree([hull for _, hull, _ in candidates])
    kept = set(range(len(candidates)))

    def overlap_share(i):
        hull = candidates[i][1]
        others = [j for j in tree.query(hull) if j != i and j in kept]
        return shapely.unary_union([candidates[j][1] for j in others]).intersection(hull).area / hull.area if others else 0.0

    shares = {i: overlap_share(i) for i in kept}
    while True:
        worst = max(kept, key=lambda i: shares[i], default=None)
        if worst is None or shares[worst] <= NEIGHBOUR_OVERLAP:
            break
        candidates[worst][0]["neighbourOverlap"] = round(shares[worst], 4)
        candidates[worst][0]["verdict"] = "overlaps neighbours: withheld"
        kept.discard(worst)
        for j in tree.query(candidates[worst][1]):
            if j in kept:
                shares[j] = overlap_share(j)
    for i in sorted(kept):
        row, hull, ll = candidates[i]
        row["neighbourOverlap"] = round(shares[i], 4)
        features.append({"type": "Feature", "properties": row,
                         "geometry": mapping(shapely.set_precision(ll.simplify(0.0005), 1e-5))})

    if "--publish" in sys.argv[1:]:
        publish(results, features, crs)

    os.makedirs(DERIVED, exist_ok=True)
    json.dump({"crs": crs, "medianCentroidOffsetKm": round(offset, 2), "mandals": results},
              open(os.path.join(DERIVED, "boundary_check.json"), "w"), ensure_ascii=False, indent=1)
    json.dump({"type": "FeatureCollection", "features": features},
              open(os.path.join(DERIVED, "official_mandals.geojson"), "w"), ensure_ascii=False)

    verdicts = collections.Counter(r["verdict"] for r in results)
    print(f"{len(results)} official mandals: " + ", ".join(f"{k} {v}" for k, v in verdicts.most_common()))
    joined = [r for r in results if r.get("iou") is not None]
    if joined:
        errs = sorted(abs(r["prototypeAreaError"]) for r in joined)
        ious = sorted(r["iou"] for r in joined)
        print(f"prototype area error: median {np.median(errs):.1%}, 90th pct {errs[int(.9 * len(errs))]:.1%}; "
              f"overlap (IoU): median {np.median(ious):.2f}, worst tenth below {ious[int(.1 * len(ious))]:.2f}")
    worst = sorted((r for r in joined if r["verdict"] == "wrong shape: fixed"), key=lambda r: r["iou"])[:15]
    for r in worst:
        print(f"  {r['mandal']} ({r['district']}): ours {r['prototypeKm2']} km², official {r['officialKm2']} km², "
              f"overlap {r['iou']:.2f}, centre {r['centroidOffsetKm']} km apart")


if __name__ == "__main__":
    main()
