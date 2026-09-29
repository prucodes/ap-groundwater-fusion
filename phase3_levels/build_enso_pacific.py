"""Build the Pacific panel that explains what an El Nino actually is.

The site can say the index stands at +1.80 C and that the monsoon is down 28%.
It cannot say what the first has to do with the second, and a reader who has
never met the word has no way to get there. The explainers that circulate stop
at the ocean and are drawn for a global audience; none of them has India in
frame at all.

So this renders the thing itself: NOAA's measured sea-surface temperature
anomaly across a window that runs from India to South America, one frame per
month, with Andhra Pradesh marked on it. Stepping through the months, a reader
watches the warm water leave Indonesia and slide east, and sees the state it is
happening to sitting on the left-hand edge of the same picture.

Nothing here is drawn. The colour is the measurement.

Not part of the weekly refresh: the source file is 159 MB and the months it
adds are one at a time. Run it when the ocean state has moved enough to be
worth re-publishing, the way the boundary alias table is run.

    python3 phase3_levels/build_enso_pacific.py
"""
import argparse
import json
import os
import ssl
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
PUBLIC = os.path.join(ROOT, "app", "public", "enso")
CACHE = os.path.join("/tmp", "ap-gw-video-assets")

ERSST = "https://downloads.psl.noaa.gov/Datasets/noaa.ersst.v5/sst.mnmean.nc"
BLUE_MARBLE = ("https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/"
               "world.topo.bathy.200412.3x5400x2700.jpg")

# India on the left edge, South America on the right. The point of the panel is
# that both are in the same picture; a Pacific-only window is what every other
# explainer shows and is exactly what leaves a reader here stranded.
LON0, LON1 = 62, 292
LAT0, LAT1 = 42, -42
# Eighteen months, which covers the run-up to the present state without
# shipping two years of frames to every visitor.
MONTHS = 18
# Small enough to ship: the panel is a card, not a wall map. WebP with alpha
# takes a smooth anomaly field to about a fifth of the PNG -- 34 KB against
# 178 -- which is the difference between a panel and a download.
FRAME_WIDTH = 640
FRAME_QUALITY = 68
BASEMAP_WIDTH = 900

# Where to put the marker, from the state's own bounding box.
AP_LON, AP_LAT = 80.5, 15.9


def tls_context():
    if not ssl.get_default_verify_paths().cafile:
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
    return ssl.create_default_context()


def cached(url, name, note):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f"  fetching {note}")
        request = urllib.request.Request(url, headers={"User-Agent": "ap-groundwater-fusion"})
        with urllib.request.urlopen(request, timeout=900, context=tls_context()) as response, \
                open(path, "wb") as handle:
            handle.write(response.read())
    return path


def basemap():
    """A dark Earth for the frames to sit on, cropped to the same window.

    The source runs 180W to 180E, so a window that starts at 62E and ends at
    292E wraps off the right-hand edge and comes back at the left. Cropping it
    without rolling first gave Africa and the Atlantic under a Pacific anomaly
    field. Rolling so that 62E sits at x=0 makes the window continuous.
    """
    from PIL import Image

    source = Image.open(cached(BLUE_MARBLE, "blue_marble.jpg", "NASA Blue Marble (public domain)"))
    width, height = source.size

    def x_of(lon):
        return int(((lon + 180) % 360) / 360 * width)

    def y_of(lat):
        return int((90 - lat) / 180 * height)

    shift = x_of(LON0)
    rolled = Image.new("RGB", (width, height))
    rolled.paste(source.crop((shift, 0, width, height)), (0, 0))
    rolled.paste(source.crop((0, 0, shift, height)), (width - shift, 0))

    span = int((LON1 - LON0) / 360 * width)
    crop = rolled.crop((0, y_of(LAT0), span, y_of(LAT1)))
    scale = BASEMAP_WIDTH / crop.width
    crop = crop.resize((BASEMAP_WIDTH, max(1, round(crop.height * scale))), Image.LANCZOS)
    os.makedirs(PUBLIC, exist_ok=True)
    crop.convert("RGB").save(os.path.join(PUBLIC, "pacific.jpg"), quality=78, optimize=True)
    return crop.size


def frames():
    """One transparent anomaly frame per month, plus the index beside it."""
    import numpy as np
    import xarray as xr
    from PIL import Image
    from scipy.ndimage import zoom

    data = xr.open_dataset(cached(ERSST, "sst.mnmean.nc", "NOAA ERSST v5 (no constraints on use)"))
    climatology = data.sst.sel(time=slice("1991-01-01", "2020-12-31")).groupby("time.month").mean("time")
    anomaly = data.sst.groupby("time.month") - climatology
    lons = np.arange(LON0, LON1 + 1, 2) % 360
    window = anomaly.sel(lat=slice(LAT0, LAT1)).sel(lon=xr.DataArray(lons, dims="lon"))

    stops = [(-3, (12, 44, 132)), (-2, (30, 96, 190)), (-1, (110, 180, 230)),
             (-0.4, (205, 232, 246)), (0, (255, 255, 255)), (0.4, (253, 224, 180)),
             (1, (246, 160, 80)), (2, (222, 80, 40)), (3, (140, 18, 18))]

    def ramp(values):
        values = np.clip(values, -3, 3)
        out = np.zeros(values.shape + (3,), dtype=np.float32)
        for (a, colour_a), (b, colour_b) in zip(stops, stops[1:]):
            inside = (values >= a) & (values <= b)
            t = np.where(inside, (values - a) / (b - a), 0)[..., None]
            out += inside[..., None] * (np.array(colour_a) * (1 - t) + np.array(colour_b) * t)
        return out

    os.makedirs(PUBLIC, exist_ok=True)
    times = [str(t)[:10] for t in window.time.values][-MONTHS:]
    written = []
    for index, when in enumerate(times):
        field = window.sel(time=when).values.astype("float32")
        field = np.where(np.isfinite(field), field, 0.0)
        big = zoom(field, 6, order=3)
        # Transparent where nothing is happening, so the Earth shows through and
        # the eye goes to the anomaly rather than to a wash of pale colour.
        alpha = np.clip((np.abs(big) - 0.35) / 1.45, 0, 1) ** 0.8 * 250
        image = Image.fromarray(np.dstack([ramp(big), alpha[..., None]]).astype("uint8"), "RGBA")
        image = image.resize((FRAME_WIDTH, round(FRAME_WIDTH * image.height / image.width)), Image.LANCZOS)
        name = f"sst_{index:02d}.webp"
        image.save(os.path.join(PUBLIC, name), "WEBP", quality=FRAME_QUALITY, method=6)
        written.append({"month": when[:7], "file": f"enso/{name}"})

    # The Nino 3.4 box is what the published index is built from: 5N-5S,
    # 170W-120W. Both the month and the three-month running mean are carried,
    # because they are different quantities and a reader comparing the panel
    # with the site's headline figure will otherwise think one of them is wrong.
    # The published ONI is the running mean; the map shows a single month.
    box = anomaly.sel(lat=slice(5, -5), lon=slice(190, 240)).mean(dim=["lat", "lon"])
    series = {str(t)[:7]: float(v) for t, v in zip(box.time.values, box.values)}
    order = sorted(series)
    for row in written:
        i = order.index(row["month"])
        near = [series[m] for m in order[max(0, i - 1): i + 2]]
        row["nino34C"] = round(series[row["month"]], 2)
        row["nino34ThreeMonthC"] = round(sum(near) / len(near), 2)
    return written


def main():
    parser = argparse.ArgumentParser()
    parser.parse_args()

    width, height = basemap()
    months = frames()
    marker = {
        "xPct": round((AP_LON - LON0) / (LON1 - LON0) * 100, 2),
        "yPct": round((LAT0 - AP_LAT) / (LAT0 - LAT1) * 100, 2),
    }
    payload = {
        "contractVersion": "1.0.0",
        "window": {"lon0": LON0, "lon1": LON1, "lat0": LAT0, "lat1": LAT1},
        "basemap": "enso/pacific.jpg",
        "aspect": round(width / height, 4),
        "andhraPradesh": marker,
        "months": months,
        "source": "NOAA Extended Reconstructed SST v5; anomaly against 1991-2020",
        "basemapSource": "NASA Blue Marble Next Generation (public domain)",
    }
    out = os.path.join(APP, "enso_pacific.json")
    with open(out, "w") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    total = sum(os.path.getsize(os.path.join(PUBLIC, f)) for f in os.listdir(PUBLIC))
    print(f"  {len(months)} months, {months[0]['month']} to {months[-1]['month']}")
    print(f"  Andhra Pradesh at {marker['xPct']}% across, {marker['yPct']}% down")
    print(f"  {total / 1e6:.2f} MB of frames -> app/public/enso/")
    print(f"  wrote {os.path.relpath(out, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
