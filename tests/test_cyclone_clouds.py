"""The cloud film turns GIBS's coloured infrared back into temperatures.

GIBS's scale draws -80 to -70 C as a grey ramp, with the same greys it uses for
warm ground. Read naively, the coldest storm tops came out as dark holes in the
middle of each cyclone; a grey patch is cold only where dark red surrounds it.
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_cyclone_clouds as clouds  # noqa: E402

# A slice of the published scale: warm greys, low cloud, deep red, and the cold greys.
WARM = {(129 << 16) | (129 << 8) | 129: 10.0, (255 << 16) | (204 << 8): -52.6, 204 << 16: -62.6, 77 << 16: -67.6}
COLD = {129: -75.6, 54: -72.6}


def image(fill, core=None, ring=None):
    a = np.zeros((160, 160, 4), dtype=np.uint8)
    a[..., :3], a[..., 3] = fill, 255
    if ring is not None:
        a[68:92, 68:92, :3] = ring
    if core is not None:
        a[74:86, 74:86, :3] = core
    return Image.fromarray(a)


def test_a_grey_core_inside_dark_red_is_the_coldest_cloud():
    t = clouds.celsius(image((129, 129, 129), core=(129, 129, 129), ring=(77, 0, 0)), (WARM, COLD))
    assert abs(t[80, 80] + 75.6) < 1e-4
    assert abs(t[2, 2] - 10.0) < 1e-4  # the ground around the storm stays warm


def test_grey_bordered_by_warmer_cloud_stays_warm_ground():
    t = clouds.celsius(image((129, 129, 129), core=(129, 129, 129), ring=(255, 204, 0)), (WARM, COLD))
    assert abs(t[80, 80] - 10.0) < 1e-4


def test_the_redraw_makes_cold_bright_and_warm_dark():
    rgb = clouds.redraw(np.array([[30.0] * 9, [-80.0] * 9] * 5, dtype=np.float32).repeat(9, axis=0)[:45])
    assert rgb[0, 0].sum() < 150 and rgb[9, 0].sum() > 500


def test_the_frame_keeps_the_land_in_shape_and_even_for_the_encoder():
    width, height = clouds.frame_size()
    assert width % 2 == 0 and height % 2 == 0
    x, y = clouds.to_frame(clouds.WEST, clouds.NORTH)
    assert (x, y) == (0, 0)
    assert abs(width / height - (clouds.EAST - clouds.WEST) / (clouds.NORTH - clouds.SOUTH) * np.cos(np.radians(15))) < 0.01
