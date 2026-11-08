"""Refile the mandal outlines that sit under the wrong district.

build_boundary_misplacements.py found nineteen polygons hundreds of kilometres
from the district they claim: names repeat across Andhra Pradesh, and a polygon
matched by name alone landed under the first district holding that name. Three
Atmakurs were all filed under Ananthapuramu; Gudur, Veldurthi, Mylavaram and
others the same way. The Agriculture page listed Nellore's Atmakur as
Ananthapuramu's, and every district total carried the stray mandals.

Each move in data/mandal_boundary_district_fixes.csv rests on two independent
sources, and the tests hold both:
  - APWRIMS, the source of the district structure, lists a mandal of that name
    in the target district (sometimes spelled differently: U Kothapalle,
    Raju Palem, Ungutur);
  - the polygon sits among that district's mandals, or, where the eight nearest
    neighbours split across a border, APWRIMS decides.
Outline 164 is the one exception to the name: it is drawn as PAMARRU but the
confirmed list already matched it to Kotipalli Gangavaram (Konaseema) against
the official outline, so only its district moves. Unguturu 199 is not far
enough out to be flagged by distance; it is the second Unguturu under Krishna,
among West Godavari and Eluru mandals, and APWRIMS has Ungutur in Eluru.

This rewrites the district field of both map files and redraws the affected
district outlines from their mandals. Values that are averaged per district are
left for the weekly refresh to recompute from the corrected map.

    python3 phase3_levels/fix_misfiled_districts.py
"""
import csv
import json
import os
import sys

from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from migrate_to_new_districts import geom_to_rings, poly_from_rings  # noqa: E402

APP = os.path.join(HERE, "..", "app", "data")
FIXES = os.path.join(HERE, "data", "mandal_boundary_district_fixes.csv")
GEOMETRY = os.path.join(APP, "ap_map_geometry.json")
DISPLAY = os.path.join(APP, "ap_map_display.json")
DISTRICTS = os.path.join(APP, "ap_district_geometry.json")
ALIASES = [os.path.join(HERE, "data", name)
           for name in ("mandal_boundary_aliases.csv", "mandal_boundary_confirmed.csv")]


def load_fixes():
    with open(FIXES) as handle:
        return [{**row, "boundary_index": int(row["boundary_index"])} for row in csv.DictReader(handle)]


def refile(path, fixes, compact):
    data = json.load(open(path))
    moved = 0
    for fix in fixes:
        feature = data["mandals"][fix["boundary_index"]]
        if feature["d"] == fix["district"]:
            continue
        if feature["d"] != fix["claimed_district"] or feature["m"] != fix["mandal"]:
            raise SystemExit(f"{os.path.basename(path)} #{fix['boundary_index']} is "
                             f"{feature['d']} / {feature['m']}, not {fix['claimed_district']} / {fix['mandal']}")
        feature["d"] = fix["district"]
        moved += 1
    with open(path, "w") as handle:
        json.dump(data, handle, separators=(",", ":") if compact else None)
    return data, moved


def redraw(mandals, touched):
    data = json.load(open(DISTRICTS))
    by_name = {row["d"]: row for row in data["districts"]}
    for name in sorted(touched):
        members = [m for m in mandals if m["d"] == name]
        polygons = [p for p in (poly_from_rings(m["rings"]) for m in members) if p is not None]
        shape = unary_union(polygons)
        row = by_name[name]
        row["rings"] = geom_to_rings(shape)
        row["c"] = [round(shape.centroid.x, 4), round(shape.centroid.y, 4)]
        row["mandal_count"] = len(members)
    with open(DISTRICTS, "w") as handle:
        json.dump(data, handle)


def relabel_aliases(fixes):
    """The review tables name the outline's district beside its index; keep them true."""
    district = {fix["boundary_index"]: fix["district"] for fix in fixes}
    for path in ALIASES:
        with open(path, newline="") as handle:
            ending = "\r\n" if "\r\n" in handle.readline() else "\n"
            handle.seek(0)
            reader = csv.DictReader(handle)
            fields, rows = reader.fieldnames, list(reader)
        for row in rows:
            index = int(row["boundary_index"])
            if index in district:
                row["boundary_district"] = district[index]
        with open(path, "w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields, lineterminator=ending)
            writer.writeheader()
            writer.writerows(rows)


def main():
    fixes = load_fixes()
    geometry, moved = refile(GEOMETRY, fixes, compact=False)
    refile(DISPLAY, fixes, compact=True)
    touched = {fix["district"] for fix in fixes} | {fix["claimed_district"] for fix in fixes}
    redraw(geometry["mandals"], touched)
    relabel_aliases(fixes)
    print(f"  {moved} of {len(fixes)} outlines refiled; {len(touched)} district outlines redrawn")
    return 0


if __name__ == "__main__":
    sys.exit(main())
