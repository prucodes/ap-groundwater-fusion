"""Mandal rainfall is a zonal mean over a raster that may declare no nodata value
(CHIRPS does not). Pixels outside the mandal must never enter the mean."""
import importlib.util
import sys
from pathlib import Path

import numpy as np
import pytest

rasterio = pytest.importorskip("rasterio")
from rasterio.io import MemoryFile  # noqa: E402
from rasterio.transform import from_origin  # noqa: E402
from shapely.geometry import Polygon  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("build_mandal_heat", REPO_ROOT / "scripts" / "build_mandal_heat.py")
heat = importlib.util.module_from_spec(_spec)
sys.modules["build_mandal_heat"] = heat
_spec.loader.exec_module(heat)


def _raster(values, nodata=None):
    """A 1-degree-pixel raster whose top-left corner is (0, 4)."""
    memfile = MemoryFile()
    array = np.array(values, dtype="float32")
    with memfile.open(driver="GTiff", height=array.shape[0], width=array.shape[1], count=1,
                      dtype="float32", crs="EPSG:4326", transform=from_origin(0, 4, 1, 1),
                      nodata=nodata) as dst:
        dst.write(array, 1)
    return memfile


# An L-shaped mandal: its bounding box is 2x2 pixels but it covers only three.
L_SHAPE = Polygon([(0, 4), (2, 4), (2, 3), (1, 3), (1, 2), (0, 2)])


def test_pixels_outside_the_mandal_never_dilute_the_mean():
    # No nodata declared, as with CHIRPS. The pixel at (1..2, 2..3) is outside.
    memfile = _raster([[200, 200, 0, 0], [200, 999, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    with memfile.open() as ds:
        assert heat.zonal_mean(ds, L_SHAPE) == 200.0


def test_undeclared_ocean_fill_is_excluded():
    memfile = _raster([[200, 100, 0, 0], [-9999, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    with memfile.open() as ds:
        assert heat.zonal_mean(ds, L_SHAPE) == 150.0


def test_a_declared_nan_nodata_is_excluded():
    # TerraClimate declares NaN.
    memfile = _raster([[300, np.nan, 0, 0], [100, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], nodata=np.nan)
    with memfile.open() as ds:
        assert heat.zonal_mean(ds, L_SHAPE) == 200.0


def test_a_mandal_smaller_than_a_pixel_still_gets_a_value():
    sliver = Polygon([(0.1, 3.9), (0.3, 3.9), (0.3, 3.7), (0.1, 3.7)])
    memfile = _raster([[42, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])
    with memfile.open() as ds:
        assert heat.zonal_mean(ds, sliver) == 42.0
