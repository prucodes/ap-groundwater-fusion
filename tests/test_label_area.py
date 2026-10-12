"""The basemap names only places inside Andhra Pradesh.

Neighbouring states' cities drew the eye away from the State the maps are about, so
the basemap tests each place against app/data/ap_label_area.json. The outline must
cover the whole State, keep the coastal city whose point sits just offshore, and
stop short of the towns across its land borders.
"""
import json
import os

from shapely.geometry import Point, shape
from shapely.prepared import prep

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
AREA = shape(json.load(open(os.path.join(APP, "ap_label_area.json")))["geometry"])
DISTRICTS = json.load(open(os.path.join(APP, "ap_district_geometry.json")))["districts"]

# OpenStreetMap's points for these places, as the basemap tiles carry them.
INSIDE = {"Visakhapatnam": (83.292, 17.693), "Srikakulam": (83.894, 18.295), "Kurnool": (78.042, 15.831), "Tirupati": (79.423, 13.632)}
OUTSIDE = {
    "Hyderabad": (78.474, 17.36), "Chennai": (80.27, 13.084), "Bengaluru": (77.59, 12.977), "Ballari": (76.917, 15.143),
    "Hosur": (77.831, 12.733), "Bhadrachalam": (80.894, 17.669), "Konta": (81.383, 17.811), "Paralakhemundi": (84.089, 18.781),
}


def test_the_outline_covers_every_district_point():
    # A stale outline after the district geometry changes would leave part of the State unnamed.
    area = prep(AREA)
    missing = [d["d"] for d in DISTRICTS for ring in d["rings"] for x, y in ring if not area.contains(Point(x, y))]
    assert not missing, f"rebuild with scripts/build_label_area.py; outside: {sorted(set(missing))}"


def test_state_places_are_named_and_neighbours_are_not():
    assert all(AREA.contains(Point(xy)) for xy in INSIDE.values()), "an Andhra Pradesh place falls outside the outline"
    named = [name for name, xy in OUTSIDE.items() if AREA.contains(Point(xy))]
    assert not named, f"neighbouring places inside the outline: {named}"
