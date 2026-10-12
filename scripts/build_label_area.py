#!/usr/bin/env python3
"""Build the outline that decides which basemap place names the maps show.

The site's maps name only places inside Andhra Pradesh: neighbouring states, their
cities and the sea drew the eye away from the State the map is about. The basemap
tests each city and town against this outline with MapLibre's `within`.

The outline is the State's districts dissolved into one shape, the slivers between
mandals filled, and padded 0.006 degrees (about 650 m) outward. The padding is for the
coast: OpenStreetMap puts Visakhapatnam's point 0.004 degrees out to sea from the
prototype coastline. It stays short of the nearest town across a land border,
Bhadrachalam in Telangana, 0.009 degrees out.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = REPO_ROOT / "app/data/ap_district_geometry.json"
DEFAULT_OUTPUT = REPO_ROOT / "app/data/ap_label_area.json"

PAD_DEG = 0.006
SIMPLIFY_DEG = 0.001  # keeps the padded edge between 0.005 and 0.007 degrees out
CLOSE_DEG = 0.002     # closes the hairline gaps between district rings before the union


def label_area(districts: list[dict]) -> MultiPolygon:
    rings = [make_valid(Polygon(ring)) for d in districts for ring in d["rings"] if len(ring) >= 4]
    state = unary_union(rings).buffer(CLOSE_DEG).buffer(-CLOSE_DEG)
    padded = state.buffer(PAD_DEG)
    parts = padded.geoms if hasattr(padded, "geoms") else [padded]
    # Holes are gaps between mandals, not places outside the State.
    filled = [Polygon(part.exterior).simplify(SIMPLIFY_DEG, preserve_topology=True) for part in parts]
    return MultiPolygon(filled)


def rounded(geometry: dict) -> dict:
    return {
        "type": geometry["type"],
        "coordinates": [[[[round(x, 3), round(y, 3)] for x, y in ring] for ring in polygon] for polygon in geometry["coordinates"]],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    districts = json.loads(args.input.read_text())["districts"]
    area = rounded(mapping(label_area(districts)))
    payload = {
        "note": "Andhra Pradesh, padded 0.006 degrees outward: the basemap names only places inside it. Built by scripts/build_label_area.py.",
        "padDeg": PAD_DEG,
        "geometry": area,
    }
    args.output.write_text(json.dumps(payload, separators=(",", ":")) + "\n")
    points = sum(len(ring) for polygon in area["coordinates"] for ring in polygon)
    print(f"wrote {args.output} ({len(area['coordinates'])} parts, {points} points)")


if __name__ == "__main__":
    main()
