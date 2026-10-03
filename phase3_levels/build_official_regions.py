"""Official assembly-constituency and district outlines, rebuilt and checked
the same way as the mandal outlines (build_official_boundaries.py).

The data lake returns each region's boundary vertices in latitude/longitude,
unordered. Assemblies carry the official area (area_sqkm), so a rebuild is kept
only within REBUILD_GOOD of it. Districts carry no area, so each is checked
against the State's own mandal outlines in that district (as the State assigns
them): kept only when its area is within DISTRICT_AREA of theirs (grown by any
mandals not yet rebuilt) and it holds at least DISTRICT_HOLDS of them. Both
then pass the neighbour-overlap check, worst first.

Reads data/raw/datalake/{assembly_geo,district_geo}/ (fetch_datalake.py);
writes app/data/official_regions.json.
"""
import collections
import datetime
import glob
import json
import os
import re
import sys

import shapely
from pyproj import Transformer
from shapely.geometry import Polygon
from shapely.ops import transform

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_datalake_snapshot as names  # noqa: E402
from build_official_boundaries import REBUILD_GOOD, despike, rebuild, withhold_overlaps  # noqa: E402

ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw", "datalake")
DATA = os.path.join(ROOT, "app", "data")
OUT = os.path.join(DATA, "official_regions.json")
CONTRACT_VERSION = "1.0.0"
DISTRICT_AREA = 0.05     # a district's rebuilt area against its mandals' union
DISTRICT_HOLDS = 0.95    # and must hold this share of its own official mandal outlines
TOLERANCE = 0.003        # degrees for display, about 330 m

TO_M = Transformer.from_crs("EPSG:4326", "EPSG:32644", always_xy=True)
TO_LL = Transformer.from_crs("EPSG:32644", "EPSG:4326", always_xy=True)


def load_regions(folder, key):
    """{region code: {"attrs": first row, "points": unique (lon, lat)}}."""
    regions = {}
    for path in glob.glob(os.path.join(RAW, folder, "*.json")):
        if os.path.basename(path).startswith("_"):
            continue
        for row in json.load(open(path)):
            code = str(row.get(key))
            entry = regions.setdefault(code, {"attrs": row, "points": set()})
            try:
                entry["points"].add((float(row["longitude"]), float(row["latitude"])))
            except (TypeError, ValueError, KeyError):
                pass
    return regions


def to_metres(points):
    xs, ys = TO_M.transform([p[0] for p in points], [p[1] for p in points])
    return list(zip(xs, ys))


def rings_of(polygon_m):
    ll = transform(TO_LL.transform, polygon_m).simplify(TOLERANCE)
    parts = [p for p in getattr(ll, "geoms", [ll]) if p.geom_type == "Polygon" and p.area > 1e-6]
    return [[[round(x, 3), round(y, 3)] for x, y in p.exterior.coords] for p in parts]


def assemblies():
    rows, items, hulls = [], [], {}
    for code, region in sorted(load_regions("assembly_geo", "assembly_c").items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        a = region["attrs"]
        official = float(a.get("area_sqkm") or 0) * 1e6
        row = {"code": code, "name": a.get("assembly"), "reserved": a.get("assembly_t"), "parliament": a.get("parliament"),
               "district": a.get("district"), "officialKm2": round(official / 1e6, 2), "vertices": len(region["points"])}
        hull = rebuild(to_metres(list(region["points"])), official) if official > 0 and len(region["points"]) >= 4 else None
        hull = despike(hull) if hull is not None else None
        if hull is None:
            row["verdict"] = "cannot rebuild"
        else:
            row["rebuiltKm2"] = round(hull.area / 1e6, 2)
            row["rebuildError"] = round(hull.area / official - 1, 4)
            row["verdict"] = "official" if abs(row["rebuildError"]) <= REBUILD_GOOD else "rebuild not reliable"
            if row["verdict"] == "official":
                items.append((row, hull))
        rows.append(row)
    kept = withhold_overlaps(items)
    for i in kept:
        row, hull = items[i]
        hulls[row["code"]] = hull
    for row in rows:
        row["rings"] = rings_of(hulls[row["code"]]) if row["code"] in hulls else None
    return rows


def mandal_unions():
    """The State's own mandal outlines, unioned per district as the State assigns
    them -- not as our prototype map groups them, which predates the latest
    reorganisation -- with the share of the district's official mandal area
    they cover (rebuilds withheld or unreliable leave holes)."""
    features = json.load(open(os.path.join(RAW, "derived", "official_mandals.geojson")))["features"]
    check = json.load(open(os.path.join(RAW, "derived", "boundary_check.json")))["mandals"]
    groups, rebuilt_area, official_area = collections.defaultdict(list), collections.Counter(), collections.Counter()
    for feature in features:
        key = names.district_key(feature["properties"]["district"])
        polygon = shapely.geometry.shape(feature["geometry"])
        groups[key].append(polygon if polygon.is_valid else polygon.buffer(0))
        rebuilt_area[key] += feature["properties"]["officialKm2"]
    for row in check:
        official_area[names.district_key(row["district"])] += row["officialKm2"]
    out = {}
    for key, parts in groups.items():
        union = shapely.unary_union([p.buffer(0.0008) for p in parts]).buffer(-0.0008)
        out[key] = (transform(TO_M.transform, union), rebuilt_area[key] / official_area[key] if official_area[key] else 0)
    return out


def districts():
    unions = mandal_unions()
    rows, items, hulls = [], [], {}
    for code, region in sorted(load_regions("district_geo", "dstcodeind").items()):
        a = region["attrs"]
        key = names.district_key(a.get("district"))
        reference, coverage = unions.get(key, (None, 0))
        row = {"code": code, "apCode": a.get("dstcodeap"), "name": a.get("district"), "vertices": len(region["points"]),
               "ourDistrict": key if reference is not None else None}
        if reference is None or reference.is_empty:
            row["verdict"] = "no official mandals to check against"
            rows.append(row)
            continue
        # The State's mandal outlines cover `coverage` of the district's official
        # mandal area; the district itself is that union grown by the missing share.
        target = reference.area / max(coverage, 0.5)
        row["mandalsKm2"] = round(reference.area / 1e6, 1)
        row["mandalCoverage"] = round(coverage, 3)
        hull = rebuild(to_metres(list(region["points"])), target)
        hull = despike(hull) if hull is not None else None
        if hull is None:
            row["verdict"] = "cannot rebuild"
        else:
            row["rebuiltKm2"] = round(hull.area / 1e6, 1)
            row["areaVsMandals"] = round(hull.area / target - 1, 4)
            # Share of the State's mandal outlines that the district outline covers:
            # a correct district holds all of its own mandals.
            row["holdsMandals"] = round(hull.intersection(reference).area / reference.area, 3)
            ok = abs(row["areaVsMandals"]) <= DISTRICT_AREA and row["holdsMandals"] >= DISTRICT_HOLDS
            row["verdict"] = "official" if ok else "rebuild not reliable"
            if ok:
                items.append((row, hull))
        rows.append(row)
    kept = withhold_overlaps(items)
    for i in kept:
        row, hull = items[i]
        hulls[row["code"]] = hull
    for row in rows:
        row["rings"] = rings_of(hulls[row["code"]]) if row["code"] in hulls else None
    return rows


def main():
    if not os.path.isdir(os.path.join(RAW, "assembly_geo")):
        sys.exit("No region extracts yet; run fetch_datalake.py first (signed in).")
    acs, ds = assemblies(), districts()
    payload = {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "AP AWARE Assembly and District Geography via the AI Living Labs data lake",
        "method": (f"Ring order rebuilt from unordered official vertices; assemblies kept within {REBUILD_GOOD:.0%} of the "
                   f"official area; districts within {DISTRICT_AREA:.0%} of their official mandals' area and holding at least "
                   f"{DISTRICT_HOLDS:.0%} of those mandals; both withheld if lying over official neighbours. "
                   f"Simplified to about {TOLERANCE * 111000:.0f} m."),
        "summary": {
            "assemblies": len(acs), "assemblyOutlines": sum(1 for r in acs if r["rings"]),
            "assemblyVerdicts": dict(collections.Counter(r["verdict"] for r in acs)),
            "districts": len(ds), "districtOutlines": sum(1 for r in ds if r["rings"]),
            "districtVerdicts": dict(collections.Counter(r["verdict"] for r in ds)),
        },
        "assemblies": acs,
        "districts": ds,
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write("\n")

    print(f"  assemblies: {payload['summary']['assemblyOutlines']}/{len(acs)} official outlines {payload['summary']['assemblyVerdicts']}")
    print(f"  districts: {payload['summary']['districtOutlines']}/{len(ds)} official outlines {payload['summary']['districtVerdicts']}")
    print(f"  {os.path.getsize(OUT) // 1024} KB -> {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
