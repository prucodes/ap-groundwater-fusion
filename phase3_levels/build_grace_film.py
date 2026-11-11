"""Andhra Pradesh's water from space: a monthly film of GRACE and GRACE-FO, beside the wells.

The GRACE satellites (2002 to 2017) and GRACE Follow-On (2018 on) measure the pull
of gravity as they pass, and a change in the water held on and under the ground
changes it. The Center for Space Research (University of Texas) turns that into
monthly mascons: the change in all the water a place holds, soil, surface and
groundwater together, as centimetres of water against the 2004 to 2009 average.

This draws one frame a month over the same window as the cyclone cloud film, with
the State's outline on top, and averages the mascons inside the State into one
line. Beside it, the State's own wells: the median mandal's water table against
its own average, from the APWRIMS monthly readings. The two are independent, and
how closely they move together is the point.

Output: app/public/films/grace/grace.mp4 (+ poster) and app/data/grace_film.json.
Monthly, when CSR posts a new month (it lags two to three months); run by hand.
"""
import collections
import csv
import datetime
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, zoom

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from build_cyclone_clouds import EAST, NORTH, SOUTH, WEST, frame_size, state_outline  # noqa: E402
from build_enso_pacific import download  # noqa: E402

CACHE = os.path.join("/tmp", "ap-gw-video-assets")
SOURCE = "https://download.csr.utexas.edu/outgoing/grace/RL0603_mascons/"
MASCONS = "CSR_GRACE_GRACE-FO_RL0603_Mascons_all-corrections.nc"
LANDMASK = "CSR_GRACE_GRACE-FO_RL06_Mascons_v02_LandMask.nc"
HISTORY = os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")
DISTRICTS = os.path.join(ROOT, "app", "data", "ap_district_geometry.json")
PUBLIC = os.path.join(ROOT, "app", "public", "films", "grace")
OUT = os.path.join(ROOT, "app", "data", "grace_film.json")
FPS = 8
SPAN_CM = 25.0            # the colour scale runs from -25 to +25 cm of water
MIN_SERIES_MONTHS = 60    # a well series needs five years to have an average worth comparing with
MIN_MANDALS = 200         # a month counts for the wells only when this many mandals read

NAVY = np.array([11, 29, 51], dtype=np.float32)
SEA = np.array([8, 21, 38], dtype=np.float32)
DRY = np.array([214, 112, 72], dtype=np.float32)     # less water than the 2004-09 average
WET = np.array([74, 196, 230], dtype=np.float32)     # more


def cached(name):
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        os.makedirs(CACHE, exist_ok=True)
        download(SOURCE + name, path)
    return path


def months_between(first, last):
    out, (y, m) = [], map(int, first.split("-"))
    while f"{y}-{m:02d}" <= last:
        out.append(f"{y}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def state_mask(lat, lon):
    from shapely import prepared
    from shapely.geometry import Point, Polygon
    from shapely.ops import unary_union
    districts = json.load(open(DISTRICTS))["districts"]
    state = prepared.prep(unary_union([Polygon(r).buffer(0) for d in districts for r in d["rings"] if len(r) > 2]))
    return np.array([[state.contains(Point(x, y)) for x in lon] for y in lat])


def wells_by_month():
    """The median mandal's water table against its own average, metres (positive is deeper)."""
    series = collections.defaultdict(dict)
    for row in csv.DictReader(open(HISTORY)):
        if row["level_mbgl"]:
            series[row["mandal_uuid"]][row["date"]] = float(row["level_mbgl"])
    gaps = collections.defaultdict(list)
    for readings in series.values():
        if len(readings) < MIN_SERIES_MONTHS:
            continue
        mean = statistics.mean(readings.values())
        for month, depth in readings.items():
            gaps[month].append(depth - mean)
    return {m: round(statistics.median(v), 2) for m, v in gaps.items() if len(v) >= MIN_MANDALS}


def colour(field, land):
    t = np.clip(field / SPAN_CM, -1, 1)[..., None]
    rgb = np.where(t < 0, NAVY + (DRY - NAVY) * np.abs(t) ** 0.8, NAVY + (WET - NAVY) * np.abs(t) ** 0.8)
    return np.where(land[..., None], rgb, SEA).astype(np.uint8)


def main():
    import xarray as xr
    data = xr.open_dataset(cached(MASCONS))
    land_all = xr.open_dataset(cached(LANDMASK)).LO_val
    sub = data.lwe_thickness.sel(lat=slice(SOUTH, NORTH), lon=slice(WEST, EAST))
    land = land_all.sel(lat=slice(SOUTH, NORTH), lon=slice(WEST, EAST)).values > 0.5
    lat, lon = sub.lat.values, sub.lon.values
    # Months as CSR labels them: the middle of each solution's span.
    stamps = [(datetime.date(2002, 1, 1) + datetime.timedelta(days=float(t))).isoformat()[:7] for t in data.time.values]
    by_month = {}
    for i, month in enumerate(stamps):
        by_month.setdefault(month, i)   # two solutions in one calendar month: keep the first
    inside = state_mask(lat, lon)
    weights = np.cos(np.radians(lat))[:, None] * inside
    months = months_between(stamps[0], stamps[-1])

    width, height = frame_size()
    # The coast, from the same land mask, softened so it does not step in quarter-degree blocks.
    coast = gaussian_filter(zoom(np.flipud(land).astype(float), (height / land.shape[0], width / land.shape[1]), order=1), 9) > 0.5
    frames, missing, state, last = [], [], [], None
    with tempfile.TemporaryDirectory() as tmp:
        for k, month in enumerate(months):
            i = by_month.get(month)
            if i is None:
                missing.append(month)
                state.append(None)
                rgb = last if last is not None else np.zeros((height, width, 3), np.uint8)
            else:
                field = sub.values[i]
                state.append(round(float((field * weights).sum() / weights.sum()), 2))
                # The grid is a quarter degree and a mascon is wider than that, so the field is
                # smoothed before it is drawn: the satellite cannot see edges sharper than this.
                big = zoom(gaussian_filter(np.flipud(field), 1.0), (height / field.shape[0], width / field.shape[1]), order=3)
                rgb = last = colour(big, coast)
            Image.fromarray(rgb).save(os.path.join(tmp, f"f{k:04d}.png"))
            frames.append(month)
        os.makedirs(PUBLIC, exist_ok=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "f%04d.png"),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
                        os.path.join(PUBLIC, "grace.mp4")], check=True)
        shutil.copy(os.path.join(tmp, f"f{len(frames) - 1:04d}.png"), os.path.join(tmp, "poster.png"))
        Image.open(os.path.join(tmp, "poster.png")).convert("RGB").save(os.path.join(PUBLIC, "grace-poster.jpg"), quality=86)

    wells = wells_by_month()
    both = [(s, -wells[m]) for m, s in zip(months, state) if s is not None and m in wells]
    r = float(np.corrcoef([a for a, _ in both], [b for _, b in both])[0, 1]) if len(both) > 24 else None
    # Removing each calendar month's own average: do the two agree on the year-to-year swings, not just the seasons?
    def deseason(pairs_months):
        groups = collections.defaultdict(list)
        for m, a, b in pairs_months:
            groups[m[5:]].append((a, b))
        mean = {k: (np.mean([a for a, _ in v]), np.mean([b for _, b in v])) for k, v in groups.items()}
        return [(a - mean[m[5:]][0], b - mean[m[5:]][1]) for m, a, b in pairs_months]
    pm = [(m, s, -wells[m]) for m, s in zip(months, state) if s is not None and m in wells]
    ds = deseason(pm)
    r_swings = float(np.corrcoef([a for a, _ in ds], [b for _, b in ds])[0, 1]) if len(ds) > 24 else None
    slope = float(np.polyfit([b for _, b in both], [a for a, _ in both], 1)[0]) if len(both) > 24 else None

    seen = [(m, s) for m, s in zip(months, state) if s is not None]
    low = min(seen, key=lambda x: x[1])
    high = max(seen, key=lambda x: x[1])
    latest = seen[-1]
    same_month = sorted((s for m, s in seen if m[5:] == latest[0][5:]), reverse=True)
    payload = {
        "contractVersion": "1.0.0",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": ("GRACE and GRACE-FO (NASA, DLR, GFZ) mascons, CSR RL06.3 (Save, Bettadpur and Tapley 2016; "
                   "Center for Space Research, University of Texas at Austin), all corrections applied"),
        "measures": "all the water a place holds, soil, surface and groundwater together, as cm of water against the 2004 to 2009 average",
        "wellsSource": "APWRIMS monthly groundwater readings: the median mandal's water table against its own average",
        "bbox": {"west": WEST, "east": EAST, "south": SOUTH, "north": NORTH},
        "width": width, "height": height, "fps": FPS, "spanCm": SPAN_CM,
        "months": months, "missing": missing,
        "stateCm": state,
        "wellsM": [wells.get(m) for m in months],
        "agreement": {"months": len(both), "r": round(r, 2) if r is not None else None,
                      "rSwings": round(r_swings, 2) if r_swings is not None else None,
                      "cmPerMetre": round(slope, 1) if slope is not None else None},
        "low": {"month": low[0], "cm": low[1]}, "high": {"month": high[0], "cm": high[1]},
        "latest": {"month": latest[0], "cm": latest[1], "rankOfSameMonth": same_month.index(latest[1]) + 1, "ofYears": len(same_month)},
        "outline": state_outline(),
        "video": "films/grace/grace.mp4", "posterImage": "films/grace/grace-poster.jpg",
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    print(f"{len(frames)} months ({len(missing)} without a solution), agreement with wells r={payload['agreement']}, "
          f"low {low}, high {high}, latest {payload['latest']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
