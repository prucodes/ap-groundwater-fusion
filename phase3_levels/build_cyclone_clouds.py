"""Cyclones Arnab and Murasu from space: an hourly cloud film over Andhra Pradesh.

Himawari-9's clean infrared band (10.4 um, Japan Meteorological Agency) as NASA GIBS
serves it, one frame an hour from the day Arnab's rain began to the day Murasu's
ended. GIBS paints the band with a colour scale; this turns each colour back into the
cloud-top temperature it stands for and redraws it in the site's own palette: cold,
high storm tops bright, warm ground dark. The cloud film is the opening of the
cyclone page's "From cloud to aquifer" section; the rain, soil and reservoir figures
it is played against come from build_cyclone_arnab.py.

GIBS keeps Himawari for a limited window (it began on 1 Oct 2026 when this was
written), so the raw frames are cached and the film is built once, not weekly.

    python phase3_levels/build_cyclone_clouds.py            # fetch what is missing, build
    python phase3_levels/build_cyclone_clouds.py --fetch    # fetch only
"""
from __future__ import annotations

import argparse
import io
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

import numpy as np
from PIL import Image

from build_enso_pacific import tls_context

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join("/tmp", "ap-gw-video-assets", "himawari_b13")
PUBLIC = os.path.join(ROOT, "app", "public", "cyclones")
OUT_JSON = os.path.join(ROOT, "app", "data", "cyclone_clouds.json")

LAYER = "Himawari_AHI_Band13_Clean_Infrared"
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
COLORMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/Clean_Longwave_Infrared_Window_Band.xml"

# The Bay of Bengal side of the peninsula, with Andhra Pradesh in the middle.
WEST, EAST, SOUTH, NORTH = 74.0, 90.0, 8.0, 22.0
# Pixels per degree of latitude; longitude is narrowed by cos(latitude) so the
# land keeps its shape in a plain longitude-latitude frame.
PX_PER_DEG = 50
START = datetime(2026, 10, 25, 0, tzinfo=timezone.utc)
END = datetime(2026, 11, 7, 0, tzinfo=timezone.utc)
STEP = timedelta(hours=1)
FPS = 12

LANDFALLS = [
    {"name": "Arnab", "date": "2026-10-28"},
    {"name": "Murasu", "date": "2026-11-03", "near": "Ongole", "lon": 80.05, "lat": 15.50},
]
DISTRICTS = os.path.join(ROOT, "app", "data", "ap_district_geometry.json")

# Brightness-temperature stretch for the redraw, in degrees C.
WARM_C, COLD_C, DEEP_C = 32.0, -85.0, -60.0
# The page's navy for warm ground and sea, white for cloud tops, a pale cyan for
# the coldest convective towers.
NAVY = np.array([11, 29, 51], dtype=np.float32)
WHITE = np.array([244, 247, 250], dtype=np.float32)
ICE = np.array([150, 226, 240], dtype=np.float32)
RETRY_WAITS_S = (20, 60, 180)


def frame_size():
    mid = math.radians((SOUTH + NORTH) / 2)
    width = round((EAST - WEST) * math.cos(mid) * PX_PER_DEG)
    height = round((NORTH - SOUTH) * PX_PER_DEG)
    return width - width % 2, height - height % 2  # even, for the video encoder


def times():
    t = START
    while t < END:
        yield t
        t += STEP


def stamp(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def frame_url(t: datetime) -> str:
    width, height = frame_size()
    return (f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={LAYER}&CRS=EPSG:4326"
            f"&BBOX={SOUTH},{WEST},{NORTH},{EAST}&WIDTH={width}&HEIGHT={height}&FORMAT=image/png&TIME={stamp(t)}")


def get(url: str) -> bytes:
    for attempt, wait in enumerate((0, *RETRY_WAITS_S)):
        if wait:
            time.sleep(wait)
        try:
            with urllib.request.urlopen(url, timeout=120, context=tls_context()) as response:
                return response.read()
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt == len(RETRY_WAITS_S):
                raise
            print(f"  retrying after {error}", file=sys.stderr)
    raise AssertionError("unreachable")


def cache_path(t: datetime) -> str:
    return os.path.join(CACHE, t.strftime("%Y%m%dT%H%M") + ".png")


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    todo = [t for t in times() if not os.path.exists(cache_path(t))]
    print(f"{len(todo)} frames to fetch into {CACHE}")
    for i, t in enumerate(todo, 1):
        data = get(frame_url(t))
        Image.open(io.BytesIO(data)).verify()
        with open(cache_path(t) + ".part", "wb") as f:
            f.write(data)
        os.replace(cache_path(t) + ".part", cache_path(t))
        if i % 24 == 0:
            print(f"  {i}/{len(todo)} to {stamp(t)}")
        time.sleep(0.5)


def colour_to_celsius():
    """GIBS's colour scale, inverted: packed RGB to the middle of its temperature bin.

    The scale draws -80 to -70 C as a grey ramp, the same greys it uses for warm
    ground, so those entries are kept apart: (warm table, cold greys)."""
    path = os.path.join(CACHE, "colormap.xml")
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(get(COLORMAP))
    warm, cold_greys = {}, {}
    for entry in ET.parse(path).iter():
        if not entry.tag.endswith("ColorMapEntry") or entry.get("nodata") == "true":
            continue
        lo, hi = (float(v) for v in entry.get("value").strip("([])").split(","))
        r, g, b = (int(v) for v in entry.get("rgb").split(","))
        mid = (lo + hi) / 2
        if r == g == b and -80.5 < mid < -70:
            cold_greys[r] = mid
        else:
            warm.setdefault((r << 16) | (g << 8) | b, mid)
    return warm, cold_greys


def nearest(packed: np.ndarray, table: dict[int, float]) -> np.ndarray:
    """Each distinct colour to the temperature of its nearest entry: the served image is
    resampled, so many pixels carry a shade between two entries (mostly greys)."""
    keys = np.fromiter(table.keys(), dtype=np.int32)
    values = np.fromiter(table.values(), dtype=np.float32)
    scale = np.stack([keys >> 16, (keys >> 8) & 255, keys & 255], axis=1).astype(np.float32)
    seen, inverse = np.unique(packed, return_inverse=True)
    colours = np.stack([seen >> 16, (seen >> 8) & 255, seen & 255], axis=1).astype(np.float32)
    at = np.argmin(((colours[:, None, :] - scale[None, :, :]) ** 2).sum(axis=2), axis=1)
    return values[at][inverse].reshape(packed.shape)


def celsius(img: Image.Image, tables) -> np.ndarray:
    """Cloud-top temperature per pixel, NaN where GIBS has no data.

    A patch of grey is read as the cold ramp when it is small and most of what borders
    it is dark red or black (-62 C or colder): the coldest towers sit inside those,
    while warm ground is wide and bordered by the warmer colours of low cloud."""
    from scipy import ndimage

    warm, cold_greys = tables
    rgba = np.asarray(img.convert("RGBA")).astype(np.int32)
    packed = (rgba[..., 0] << 16) | (rgba[..., 1] << 8) | rgba[..., 2]
    out = nearest(packed, warm).astype(np.float32)
    grey = (np.abs(rgba[..., 0] - rgba[..., 1]) <= 2) & (np.abs(rgba[..., 1] - rgba[..., 2]) <= 2)
    patches, count = ndimage.label(grey)
    if count:
        edge = ndimage.grey_dilation(patches, size=3) * (~grey)
        ids = np.arange(1, count + 1)
        cold_share = ndimage.mean((out <= -62).astype(np.float32), labels=edge, index=ids)
        size = ndimage.sum(grey, labels=patches, index=ids)
        # Storm tops are compact; a patch over 2% of the frame is open ground or sea.
        cold_patch = np.concatenate([[False], (np.nan_to_num(cold_share) > 0.5) & (size < 0.02 * grey.size)])
        in_storm = cold_patch[patches] & grey
        if in_storm.any():
            levels = np.array(sorted(cold_greys), dtype=np.float32)
            temps = np.array([cold_greys[int(v)] for v in levels], dtype=np.float32)
            at = np.abs(rgba[..., 0][in_storm, None] - levels[None, :]).argmin(axis=1)
            out[in_storm] = temps[at]
    out[rgba[..., 3] == 0] = np.nan
    return out


def redraw(temp: np.ndarray) -> np.ndarray:
    """Warm ground navy, cloud tops white, the coldest towers touched with cyan.

    A 3x3 median first: where the served image blends two far-apart colours of the
    scale, the nearest entry can be wildly off, and those lone pixels sparkle."""
    from scipy.ndimage import median_filter

    t = median_filter(np.nan_to_num(temp, nan=WARM_C), size=3)
    wider = median_filter(t, size=7)
    t = np.where(t - wider > 25, wider, t)  # a warm speck inside a storm top
    bright = np.clip((WARM_C - t) / (WARM_C - COLD_C), 0, 1) ** 1.25
    rgb = NAVY + (WHITE - NAVY) * bright[..., None]
    ice = np.clip((DEEP_C - t) / (DEEP_C - COLD_C), 0, 1)[..., None] * 0.55
    rgb = rgb * (1 - ice) + ICE * ice
    return np.clip(rgb, 0, 255).astype(np.uint8)


def to_frame(lon: float, lat: float) -> tuple[float, float]:
    width, height = frame_size()
    return (lon - WEST) / (EAST - WEST) * width, (NORTH - lat) / (NORTH - SOUTH) * height


def state_outline() -> str:
    """The State's edge as an SVG path in frame pixels, dissolved from the district outlines."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    with open(DISTRICTS) as f:
        districts = json.load(f)["districts"]
    shapes = [Polygon(ring).buffer(0) for d in districts for ring in d["rings"] if len(ring) > 2]
    state = unary_union(shapes).buffer(0.005).buffer(-0.005).simplify(0.01)
    parts = [state] if state.geom_type == "Polygon" else list(state.geoms)
    path = []
    for part in sorted(parts, key=lambda p: -p.area):
        if part.area < 0.002:  # specks of coast and islands
            continue
        points = [to_frame(lon, lat) for lon, lat in part.exterior.coords]
        path.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in points) + "Z")
    return "".join(path)


def build():
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is needed to encode the film")
    table = colour_to_celsius()
    frames, missing, last = [], [], None
    with tempfile.TemporaryDirectory() as tmp:
        for i, t in enumerate(times()):
            path = cache_path(t)
            temp = celsius(Image.open(path), table) if os.path.exists(path) else None
            # A frame GIBS could not fill holds the hour before, and is listed as missing.
            if temp is None or np.isnan(temp).mean() > 0.2:
                missing.append(stamp(t))
                if last is None:
                    raise SystemExit(f"no usable first frame at {stamp(t)}")
                rgb = last
            else:
                rgb = last = redraw(temp)
            Image.fromarray(rgb).save(os.path.join(tmp, f"f{i:04d}.png"))
            frames.append(stamp(t))
        os.makedirs(PUBLIC, exist_ok=True)
        video = os.path.join(PUBLIC, "clouds.mp4")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "29", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                        "-an", video], check=True)
        # The poster is Murasu at landfall: the still a reader sees before the film plays.
        poster_at = frames.index("2026-11-03T06:00:00Z")
        Image.open(os.path.join(tmp, f"f{poster_at:04d}.png")).convert("RGB").save(
            os.path.join(PUBLIC, "clouds-poster.jpg"), quality=84, optimize=True, progressive=True)
    width, height = frame_size()
    out = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source": "Himawari-9 AHI band 13 (clean infrared, 10.4 um), Japan Meteorological Agency, via NASA GIBS",
        "layer": LAYER,
        "bbox": {"west": WEST, "east": EAST, "south": SOUTH, "north": NORTH},
        "width": width, "height": height, "fps": FPS,
        "start": stamp(START), "stepMinutes": int(STEP.total_seconds() // 60), "frames": len(frames),
        "missing": missing,
        "poster": "2026-11-03T06:00:00Z",
        "stretchC": {"warm": WARM_C, "cold": COLD_C},
        "landfalls": [{**l, **({"x": round(to_frame(l["lon"], l["lat"])[0], 1), "y": round(to_frame(l["lon"], l["lat"])[1], 1)} if "lon" in l else {})}
                      for l in LANDFALLS],
        "outline": state_outline(),
        "video": "cyclones/clouds.mp4",
        "posterImage": "cyclones/clouds-poster.jpg",
    }
    with open(OUT_JSON, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    size = os.path.getsize(os.path.join(PUBLIC, "clouds.mp4")) / 1e6
    print(f"{len(frames)} frames, {len(missing)} held, film {size:.1f} MB, {width}x{height}")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--fetch", action="store_true", help="fetch the frames only")
    args = parser.parse_args()
    fetch()
    if not args.fetch:
        build()
    return 0


if __name__ == "__main__":
    sys.exit(main())
