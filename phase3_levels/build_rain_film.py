"""The 2026 season's rain from space: a day a frame of NASA's IMERG, 1 June to 10 November.

IMERG (GPM, NASA and JAXA) merges every rain-measuring satellite into one daily
estimate. NASA GIBS serves it as a coloured picture of the day's mean rain rate;
this turns each colour back into millimetres for the day and redraws the rain
over a plain land and sea, with the State's outline, so a reader watches the
monsoon arrive, stall and leave, and then the two cyclones come ashore.

Beside the film, the State's average day by day and its running total, against
what the State's own rain gauges counted for the same season: a check that the
satellite and the ground agree before the picture is trusted.

Output: app/public/films/rain/rain.mp4 (+ poster) and app/data/rain_film.json.
Run once for the season; frames are cached.
"""
import datetime
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_cyclone_clouds import EAST, NORTH, SOUTH, WEST, frame_size, get, state_outline, to_frame  # noqa: E402
from build_grace_film import LANDMASK, cached, state_mask  # noqa: E402

CACHE = os.path.join("/tmp", "ap-gw-video-assets", "imerg_daily")
PUBLIC = os.path.join(ROOT, "app", "public", "films", "rain")
OUT = os.path.join(ROOT, "app", "data", "rain_film.json")
CONTEXT = os.path.join(ROOT, "app", "data", "water_context.json")
LAYER = "IMERG_Precipitation_Rate"
WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
COLORMAP = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/GPM_Precipitation_Rate.xml"
FIRST, LAST = datetime.date(2026, 6, 1), datetime.date(2026, 11, 10)
FPS = 10
AP_KM2 = 162_975            # the State's area, for turning gauge TMC into millimetres
TMC_M3 = 28.316846592e6     # one thousand million cubic feet

SEA = np.array([8, 21, 38], dtype=np.float32)
LAND = np.array([22, 42, 64], dtype=np.float32)
LIGHT = np.array([96, 170, 230], dtype=np.float32)    # a few millimetres
HEAVY = np.array([235, 250, 255], dtype=np.float32)   # 100 mm and more in a day


def days():
    d = FIRST
    while d <= LAST:
        yield d
        d += datetime.timedelta(days=1)


def frame_url(day):
    width, height = frame_size()
    return (f"{WMS}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS={LAYER}&CRS=EPSG:4326&BBOX={SOUTH},{WEST},{NORTH},{EAST}"
            f"&WIDTH={width}&HEIGHT={height}&FORMAT=image/png&TIME={day.isoformat()}")


def fetch():
    os.makedirs(CACHE, exist_ok=True)
    for day in days():
        path = os.path.join(CACHE, f"{day.isoformat()}.png")
        if os.path.exists(path):
            continue
        data = get(frame_url(day))
        Image.open(io.BytesIO(data)).verify()
        with open(path + ".part", "wb") as f:
            f.write(data)
        os.replace(path + ".part", path)
        time.sleep(0.4)


def scale():
    """The colour scale inverted: packed RGB to the middle of its mm/hr bin (0 for the 'under 0.1' class)."""
    path = os.path.join(CACHE, "colormap.xml")
    if not os.path.exists(path):
        with open(path, "wb") as f:
            f.write(get(COLORMAP))
    table = {}
    for e in ET.parse(path).iter():
        if not e.tag.endswith("ColorMapEntry") or e.get("nodata") == "true" or not e.get("value"):
            continue
        lo, hi = (v.strip() for v in e.get("value").strip("[]()").split(","))
        lo = 0.0 if "INF" in lo else float(lo)
        hi = lo * 1.06 if "INF" in hi else float(hi)
        r, g, b = (int(v) for v in e.get("rgb").split(","))
        table[(r << 16) | (g << 8) | b] = 0.0 if e.get("transparent") == "true" else (lo + hi) / 2
    return table


def mm_per_day(img, table):
    rgba = np.asarray(img.convert("RGBA")).astype(np.int32)
    packed = (rgba[..., 0] << 16) | (rgba[..., 1] << 8) | rgba[..., 2]
    keys = np.fromiter(table.keys(), dtype=np.int64)
    values = np.fromiter(table.values(), dtype=np.float32)
    seen, inverse = np.unique(packed, return_inverse=True)
    rgb = np.stack([seen >> 16, (seen >> 8) & 255, seen & 255], 1).astype(np.float32)
    ref = np.stack([keys >> 16, (keys >> 8) & 255, keys & 255], 1).astype(np.float32)
    rate = values[np.argmin(((rgb[:, None] - ref[None]) ** 2).sum(2), 1)][inverse].reshape(packed.shape)
    rate[rgba[..., 3] == 0] = 0.0   # transparent: under 0.1 mm/hr, or no rain at all
    return rate * 24.0


def draw(rain, coast):
    base = np.where(coast[..., None], LAND, SEA)
    t = np.clip(np.log1p(rain) / np.log1p(100.0), 0, 1)[..., None]
    colour = LIGHT + (HEAVY - LIGHT) * t
    alpha = np.clip(rain / 4.0, 0, 1)[..., None] * (0.55 + 0.45 * t)
    return (base * (1 - alpha) + colour * alpha).astype(np.uint8)


def main():
    import xarray as xr
    fetch()
    table = scale()
    width, height = frame_size()
    land = xr.open_dataset(cached(LANDMASK)).LO_val.sel(lat=slice(SOUTH, NORTH), lon=slice(WEST, EAST)).values > 0.5
    coast = gaussian_filter(zoom(np.flipud(land).astype(float), (height / land.shape[0], width / land.shape[1]), order=1), 9) > 0.5
    # The State on the frame's own pixels, for its daily average.
    lat = np.linspace(NORTH, SOUTH, 140)
    lon = np.linspace(WEST, EAST, 160)
    inside = zoom(state_mask(lat, lon).astype(float), (height / 140, width / 160), order=0) > 0.5
    frames, daily = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for k, day in enumerate(days()):
            rain = mm_per_day(Image.open(os.path.join(CACHE, f"{day.isoformat()}.png")), table)
            daily.append(round(float(rain[inside].mean()), 1))
            # IMERG is a tenth of a degree, five pixels here: softened so its cells do not read as blocks.
            Image.fromarray(draw(gaussian_filter(rain, 3.0), coast)).save(os.path.join(tmp, f"f{k:04d}.png"))
            frames.append(day.isoformat())
        os.makedirs(PUBLIC, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
                        os.path.join(PUBLIC, "rain.mp4")], check=True)
        wettest = int(np.argmax(daily))
        Image.open(os.path.join(tmp, f"f{wettest:04d}.png")).convert("RGB").save(os.path.join(PUBLIC, "rain-poster.jpg"), quality=86)

    context = json.load(open(CONTEXT))["rainfall"]
    gauges_mm = context["state"]["actualTmc"] * TMC_M3 / (AP_KM2 * 1e6) * 1000
    normal_mm = context["state"]["normalTmc"] * TMC_M3 / (AP_KM2 * 1e6) * 1000
    total = float(np.sum(daily))
    ongole = to_frame(80.05, 15.50)
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "NASA IMERG (GPM, NASA and JAXA), daily, via NASA GIBS; decoded from the served colour scale",
        "width": width, "height": height, "fps": FPS,
        "days": frames, "stateMm": daily,
        "satelliteSeasonMm": round(total), "wettestDay": {"date": frames[wettest], "mm": daily[wettest]},
        "gauges": {"window": [context["window"]["start"], context["window"]["end"]], "mm": round(gauges_mm), "normalMm": round(normal_mm),
                   "gauges": context["state"]["gauges"]},
        "landfalls": [{"name": "Arnab", "date": "2026-10-28"}, {"name": "Murasu", "date": "2026-11-03", "x": round(ongole[0], 1), "y": round(ongole[1], 1)}],
        "outline": state_outline(),
        "video": "films/rain/rain.mp4", "posterImage": "films/rain/rain-poster.jpg",
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    print(f"{len(frames)} days; satellite season {total:.0f} mm against gauges {gauges_mm:.0f} mm (normal {normal_mm:.0f}); "
          f"wettest {frames[wettest]} {daily[wettest]} mm")
    return 0


if __name__ == "__main__":
    sys.exit(main())
