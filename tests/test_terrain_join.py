"""The terrain cache must describe the mandals the project actually has.

This file went stale once already: it was built against the pre-2022 districts, so
Veeraghattam sat under SRIKAKULAM where the geometry says PARVATHIPURAM MANYAM, and
only 238 of 653 mandals joined. Nothing failed. The 415 that missed quietly took an
aquifer-wide proxy elevation instead, and the gap was only found when a question
needed real ground levels.
"""
import csv
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TERRAIN = os.path.join(ROOT, "phase3_levels", "data", "mandal_terrain.csv")
GEOMETRY = os.path.join(ROOT, "app", "data", "ap_map_geometry.json")

# Districts that stopped existing in the 2022 reorganisation. Their reappearance
# means the cache was rebuilt against an old boundary file.
RETIRED_DISTRICTS = {"ANANTAPUR", "Y.S.R.", "VISAKHAPATNAM RURAL"}


def terrain():
    with open(TERRAIN, encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def geometry_keys():
    with open(GEOMETRY, encoding="utf-8") as handle:
        return {f"{m['d']}|{m['m']}" for m in json.load(handle)["mandals"] if m.get("rings")}


def test_every_mandal_on_the_map_has_terrain():
    missing = geometry_keys() - {row["mandal_id"] for row in terrain()}
    assert not missing, f"{len(missing)} mandals would fall back to a proxy elevation: {sorted(missing)[:5]}"


def test_no_retired_district_names():
    seen = {row["mandal_id"].split("|")[0].upper() for row in terrain()}
    assert not (seen & RETIRED_DISTRICTS), seen & RETIRED_DISTRICTS


def test_the_columns_its_readers_expect_are_still_there():
    """build_mandal_features.py and train_from_apwrims.py read these three by name."""
    row = terrain()[0]
    for column in ("mandal_id", "elevation_m", "slope_deg", "twi"):
        assert column in row, column


def test_the_spread_is_published_beside_the_mean():
    """A single number cannot be checked against a threshold without knowing what it
    averages over, which is the whole reason this was rebuilt from a DEM."""
    row = terrain()[0]
    for column in ("elevation_min_m", "elevation_p10_m", "elevation_sd_m", "relief_m", "dem_pixels"):
        assert column in row, column


def test_elevations_are_physically_plausible():
    for row in terrain():
        mean = float(row["elevation_m"])
        assert -60 <= mean <= 1800, f"{row['mandal_id']} mean {mean}"
        assert float(row["elevation_min_m"]) <= mean <= float(row["elevation_p90_m"]) + 1e-6
        assert int(row["dem_pixels"]) >= 1


def test_the_coast_is_low_and_the_ghats_are_not():
    """A sanity check with a real edge: the delta should read tens of metres, not
    hundreds, and the hill mandals the other way about."""
    by_key = {row["mandal_id"]: float(row["elevation_m"]) for row in terrain()}
    delta = [v for k, v in by_key.items() if k.startswith(("KRISHNA|", "KONASEEMA|", "BAPATLA|"))]
    hills = [v for k, v in by_key.items() if k.startswith("ALLURI SITHARAMA RAJU|")]
    assert delta and hills
    assert sum(delta) / len(delta) < 100
    assert sum(hills) / len(hills) > 200
