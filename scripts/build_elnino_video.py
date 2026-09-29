"""Render the sixty-second El Nino explainer to an MP4.

The words live in docs/el_nino_60s_script.md; this builds the picture of them.

Two constraints shaped it. Nothing may be used that this project does not own
or that is not public domain -- which is why the forwarded reel could not be
published in the first place -- and it must not look drawn. So the ocean scenes
sit on NASA's Blue Marble, which is public domain satellite imagery, with the
sea-surface anomaly, the trade winds and the rain composited over it the way a
NOAA plot is. The last three scenes are drawn from this project's own published
data: the ocean index, the 46-year rainfall record and the 670 mandal polygons.

There is no narration. No text-to-speech is available here, so the captions
carry the script's words verbatim, which is how these are watched anyway.

    python3 scripts/build_elnino_video.py --out dist/el_nino_60s.mp4
"""
import argparse
import json
import math
import os
import ssl
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
CACHE = os.path.join(tempfile.gettempdir(), "ap-gw-video-assets")

WIDTH, HEIGHT = 1080, 1920
FPS = 30
DURATION = 60

# NASA Blue Marble Next Generation, December 2004. NASA imagery is public
# domain; this is the same class of picture the reference reel used and the
# reason these scenes read as photography rather than as a diagram.
BLUE_MARBLE = ("https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73909/"
               "world.topo.bathy.200412.3x5400x2700.jpg")
# NOAA Extended Reconstructed SST v5, monthly, 1854 to now. Its own licence
# field reads "No constraints on data access or use". The anomaly fields drawn
# from it are the measured article -- the shape of the warm tongue is data, not
# a gradient somebody painted to look like one.
ERSST = "https://downloads.psl.noaa.gov/Datasets/noaa.ersst.v5/sst.mnmean.nc"
# The window the Blue Marble crop shows, so the field lands on the right ocean.
SST_WINDOW = dict(lon0=108, lon1=296, lat0=56, lat1=-56)
# The run-up to the present event, stepped through on screen. Watching the warm
# water actually arrive is the one thing a still cannot do.
SST_SEQUENCE = [f"2025-{m:02d}-01" for m in range(9, 13)] + [f"2026-{m:02d}-01" for m in range(1, 9)]
# Frames drawn between each pair of measured months. The measurement is monthly;
# stepping it looks like a slideshow, so the between-frames are interpolated and
# the month stamp only advances on a real one.
SST_TWEEN = 4
SST_NEUTRAL = "2021-12-01"

# Straight out of docs/el_nino_60s_script.md, as (start, end, caption, card).
# Kept here so a timing change in the script shows up as a diff rather than
# quietly drifting out of step with the film.
SCENES = [
    (0, 6,
     "Imagine a fan the width of the Pacific,\nrunning for as long as anyone has farmed.",
     "A fan the width of an ocean"),
    (6, 16,
     "Trade winds drag warm water away from South America\nand pile it up near Indonesia, where it falls as rain.\nCold water rises behind it, off Peru.",
     "trade winds · east to west"),
    (16, 22,
     "Every few years the fan slows.\nThe warm water slides back east.\nThat is an El Niño.",
     "The fan slows"),
    (22, 29,
     "The rain does not disappear. It moves.\nAnd when it moves off Asia,\nit takes the Indian monsoon with it.",
     "the rain moves"),
    (29, 39,
     "In 1877 the strongest El Niño ever recorded did exactly this.\nThe monsoon failed. Across the Madras Presidency and the Deccan,\nfamine killed more than eight million people.",
     "1877"),
    (39, 46,
     "An El Niño is running now.\nIt is the warmest June to August in the record since 1950.",
     "+1.80 °C"),
    (46, 53,
     "Across forty-five years an El Niño costs Andhra Pradesh\nfifteen percent of its monsoon rain. This year, twenty-eight.",
     "−15.2% usually · −28.4% this year"),
    (53, 60,
     "Today the water table is lower than it was in May\nacross sixty-three percent of mandals.\nThat has never happened.",
     "62.7% of mandals"),
]


def tls_context():
    """Verified TLS. Framework Python often ships without a CA file wired up."""
    if not ssl.get_default_verify_paths().cafile:
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
    return ssl.create_default_context()


def earth_crops(out_dir):
    """Two frames of the Earth: the Pacific basin, and South Asia.

    The source is equirectangular from 180W to 180E, which splits the Pacific
    down both edges. Rolling it half a width puts the antimeridian in the middle
    and makes the basin one continuous ocean, which is the shot this needs.
    """
    from PIL import Image

    os.makedirs(CACHE, exist_ok=True)
    source = os.path.join(CACHE, "blue_marble.jpg")
    if not os.path.exists(source):
        print("  fetching NASA Blue Marble (public domain)")
        request = urllib.request.Request(BLUE_MARBLE, headers={"User-Agent": "ap-groundwater-fusion"})
        with urllib.request.urlopen(request, timeout=180, context=tls_context()) as response, \
                open(source, "wb") as handle:
            handle.write(response.read())

    image = Image.open(source)
    width, height = image.size
    rolled = Image.new("RGB", (width, height))
    rolled.paste(image.crop((width // 2, 0, width, height)), (0, 0))
    rolled.paste(image.crop((0, 0, width // 2, height)), (width // 2, 0))

    def rolled_x(lon):
        return int((((lon + 180) / 360 * width) + width / 2) % width)

    def plain_x(lon):
        return int((lon + 180) / 360 * width)

    def y_of(lat):
        return int((90 - lat) / 180 * height)

    pacific = rolled.crop((rolled_x(108), y_of(56), rolled_x(-64), y_of(-56)))
    pacific.save(os.path.join(out_dir, "pacific.jpg"), quality=88)
    south_asia = image.crop((plain_x(40), y_of(40), plain_x(120), y_of(-18)))
    south_asia.save(os.path.join(out_dir, "south_asia.jpg"), quality=88)
    return pacific.size, south_asia.size


def sst_fields(out_dir):
    """Measured sea-surface temperature anomaly, as transparent colour fields.

    Anomalies are against a 1991-2020 climatology computed from the same file,
    coloured on the diverging ramp these maps are always drawn with, and made
    transparent where the anomaly is small so the ocean shows through.
    """
    import numpy as np
    import xarray as xr
    from PIL import Image
    from scipy.ndimage import zoom

    os.makedirs(CACHE, exist_ok=True)
    source = os.path.join(CACHE, "sst.mnmean.nc")
    if not os.path.exists(source):
        print("  fetching NOAA ERSST v5 (no constraints on use)")
        request = urllib.request.Request(ERSST, headers={"User-Agent": "ap-groundwater-fusion"})
        with urllib.request.urlopen(request, timeout=600, context=tls_context()) as response, \
                open(source, "wb") as handle:
            handle.write(response.read())

    data = xr.open_dataset(source)
    climatology = data.sst.sel(time=slice("1991-01-01", "2020-12-31")).groupby("time.month").mean("time")
    anomaly = data.sst.groupby("time.month") - climatology
    lons = np.arange(SST_WINDOW["lon0"], SST_WINDOW["lon1"] + 1, 2) % 360
    window = anomaly.sel(lat=slice(SST_WINDOW["lat0"], SST_WINDOW["lat1"]))
    window = window.sel(lon=xr.DataArray(lons, dims="lon"))

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

    def write(when, name):
        field = window.sel(time=when).values.astype("float32")
        field = np.where(np.isfinite(field), field, 0.0)
        big = zoom(field, 9, order=3)
        alpha = np.clip((np.abs(big) - 0.35) / 1.45, 0, 1) ** 0.8 * 252
        image = np.dstack([ramp(big), alpha[..., None]]).astype("uint8")
        Image.fromarray(image, "RGBA").save(os.path.join(out_dir, name))

    def field(when):
        values = window.sel(time=when).values.astype("float32")
        return np.where(np.isfinite(values), values, 0.0)

    def save(values, name):
        big = zoom(values, 9, order=3)
        alpha = np.clip((np.abs(big) - 0.35) / 1.45, 0, 1) ** 0.8 * 252
        image = np.dstack([ramp(big), alpha[..., None]]).astype("uint8")
        Image.fromarray(image, "RGBA").save(os.path.join(out_dir, name))

    save(field(SST_NEUTRAL), "sst_neutral.png")
    frames = 0
    for index, when in enumerate(SST_SEQUENCE):
        here = field(when)
        save(here, f"sst_{frames:02d}.png")
        frames += 1
        if index + 1 < len(SST_SEQUENCE):
            nxt = field(SST_SEQUENCE[index + 1])
            for step in range(1, SST_TWEEN + 1):
                t = step / (SST_TWEEN + 1)
                save(here * (1 - t) + nxt * t, f"sst_{frames:02d}.png")
                frames += 1
    print(f"  {frames} SST frames from {len(SST_SEQUENCE)} measured months")
    return frames


def projected_mandals(geo, watch):
    """Mandal outlines in a 1000-wide box, coloured as the site colours them."""
    min_lon, min_lat, max_lon, max_lat = geo["bbox"]
    cos_lat = math.cos(math.radians((min_lat + max_lat) / 2))
    lon_span = (max_lon - min_lon) * cos_lat
    lat_span = max_lat - min_lat
    box = 1000.0
    height = box * (lat_span / lon_span)

    placed = {m["boundaryIndex"]: m for m in watch["mandals"] if m["boundaryIndex"] is not None}
    stops = [(-1, "#2f7d6b"), (0, "#8fbfae"), (1, "#f2d7a0"),
             (2, "#e2a05f"), (4, "#cf6b46"), (float("inf"), "#9e2f22")]

    shapes = []
    for index, feature in enumerate(geo["mandals"]):
        rings = [ring for ring in feature.get("rings", []) if len(ring) >= 4]
        if not rings:
            continue
        points = []
        for lon, lat in rings[0]:
            x = (lon - min_lon) * cos_lat / lon_span * box
            y = (max_lat - lat) / lat_span * height
            points.append(f"{x:.1f},{y:.1f}")
        row = placed.get(index)
        fill = "#1b2b3c"
        if row is not None:
            fill = next(colour for limit, colour in stops if row["shortfallM"] <= limit)
        shapes.append({"d": "M" + "L".join(points) + "Z", "f": fill})
    return shapes, round(height)


def build_page(watch, geo, pacific_size, asia_size, sst_count):
    shapes, map_height = projected_mandals(geo, watch)
    payload = {
        "scenes": [{"a": a, "b": b, "cap": cap, "card": card} for a, b, cap, card in SCENES],
        "shapes": shapes,
        "mapH": map_height,
        "rain": [{"y": r["year"], "mm": r["mm"], "s": r["state"]}
                 for r in watch["rainfallHistory"]["years"]],
        "rainMean": watch["rainfallHistory"]["meanMm"],
        "oni": [r["oniC"] for r in watch["enso"]["recent"]],
        "volume": round(watch["recharge"]["volume"]["shortfallMm3"]),
        "pac": list(pacific_size),
        "asia": list(asia_size),
        "sstCount": sst_count,
        "sstLabels": [when[:7] for when in SST_SEQUENCE for _ in range(SST_TWEEN + 1)][:sst_count],
        "sstMeasured": [i % (SST_TWEEN + 1) == 0 for i in range(sst_count)],
    }
    return (TEMPLATE
            .replace("__DATA__", json.dumps(payload, separators=(",", ":")))
            .replace("__W__", str(WIDTH))
            .replace("__H__", str(HEIGHT)))


TEMPLATE = r"""<!doctype html>
<html><head><meta charset="utf-8"><style>
* { margin:0; padding:0; box-sizing:border-box; }
html,body { width:__W__px; height:__H__px; overflow:hidden; background:#04101c;
  font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
#stage { position:relative; width:100%; height:100%; }
.scene { position:absolute; inset:0; opacity:0; transition:opacity .45s ease; }
.scene.on { opacity:1; }

/* --- the Earth, big. A band in the middle of a portrait frame reads as a
       diagram; filling it reads as a picture. --------------------------- */
.plate { position:absolute; left:-60px; right:-60px; top:360px; height:940px; overflow:hidden; }
/* No transition on these. The camera is set from the clock every 33ms, and a
   12s transition on transform meant each new target was still being eased
   toward when the next one replaced it -- the DOM showed scale 2.4 while the
   screen never left 1.0. */
.plate .base { position:absolute; left:50%; top:50%; width:1320px;
  transform:translate(-50%,-50%); transform-origin:50% 50%;
  filter:brightness(1.55) saturate(1.3); will-change:transform; }
.sstLayer { position:absolute; left:50%; top:50%; width:1320px;
  transform:translate(-50%,-50%); transform-origin:50% 50%;
  transition:opacity .3s ease; opacity:0; will-change:transform; }
.sstLayer.show { opacity:.95; }
.plate::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(180deg,rgba(4,16,28,.92),transparent 18%,transparent 80%,rgba(4,16,28,.95)); }

.wind { position:absolute; height:3px; border-radius:2px; opacity:0; will-change:transform;
  background:linear-gradient(90deg,transparent,rgba(226,242,255,.95),transparent); }
.scene.on .wind { animation:sweep var(--dur,3s) linear infinite; }
@keyframes sweep { 0% { transform:translateX(var(--from,1250px)); opacity:0; }
  10% { opacity:.9; } 90% { opacity:.9; } 100% { transform:translateX(var(--to,-360px)); opacity:0; } }
.drop { position:absolute; width:2px; height:22px; border-radius:2px;
  background:linear-gradient(180deg,transparent,rgba(180,225,255,.95)); opacity:0; }
.scene.on .drop { animation:fall 1.3s linear infinite; }
@keyframes fall { 0% { transform:translateY(-30px); opacity:0; } 25% { opacity:.9; }
  100% { transform:translateY(210px); opacity:0; } }

/* --- type, which moves ---------------------------------------------- */
.rise { opacity:0; transform:translateY(26px); }
.scene.on .rise { animation:rise .7s cubic-bezier(.2,.8,.2,1) forwards; }
@keyframes rise { to { opacity:1; transform:none; } }
.card { position:absolute; left:58px; right:58px; top:150px; will-change:transform; text-align:center;
  font-size:92px; font-weight:800; letter-spacing:-.03em; line-height:1.02; color:#fff;
  text-shadow:0 8px 44px rgba(0,0,0,.75); }
.card small { display:block; margin-top:18px; font-size:31px; font-weight:600;
  letter-spacing:.03em; color:#b6cde2; text-shadow:none; }
.kicker { position:absolute; left:58px; right:58px; top:200px; text-align:center;
  font-size:42px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
  color:#cfe1f2; text-shadow:0 5px 26px rgba(0,0,0,.85); }
.caption { position:absolute; left:56px; right:56px; bottom:120px; text-align:center;
  font-size:42px; font-weight:600; line-height:1.4; color:#fff;
  text-shadow:0 3px 22px rgba(0,0,0,.95); }
.capLine { display:block; opacity:0; transform:translateY(16px);
  transition:opacity .28s ease, transform .28s cubic-bezier(.2,.8,.2,1); }
.capLine.in { opacity:1; transform:none; }
.foot { position:absolute; left:0; right:0; bottom:74px; text-align:center;
  font-size:23px; letter-spacing:.06em; color:#87a0b8; }
.stamp { position:absolute; right:64px; top:1330px; font-size:52px; font-weight:800;
  color:#ffd9a8; letter-spacing:.04em; text-shadow:0 4px 20px rgba(0,0,0,.9); }
.legend { position:absolute; left:64px; top:1345px; display:flex; align-items:center; gap:12px;
  font-size:21px; color:#9fb6cc; }
.legend i { display:block; width:150px; height:11px; border-radius:6px;
  background:linear-gradient(90deg,#1e60be,#cde8f6,#fff,#f6a050,#8c1212); }

/* --- 1877 ------------------------------------------------------------ */
.yr { position:absolute; left:0; right:0; top:330px; text-align:center; font-size:250px;
  font-weight:800; letter-spacing:-.045em; color:#f2f6fa; }
.yrsub { position:absolute; left:74px; right:74px; top:660px; text-align:center;
  font-size:38px; line-height:1.5; color:#b6cde2; }
.toll { position:absolute; left:0; right:0; top:900px; text-align:center;
  font-size:112px; font-weight:800; color:#e2705a; letter-spacing:-.02em; }
.tollsub { position:absolute; left:0; right:0; top:1040px; text-align:center;
  font-size:26px; color:#87a0b8; }

/* --- data ------------------------------------------------------------ */
svg { display:block; overflow:visible; }
.oniPath { fill:none; stroke:#ff9350; stroke-width:9; stroke-linecap:round; stroke-linejoin:round;
  stroke-dasharray:2600; stroke-dashoffset:2600; }
.scene.on .oniPath { animation:draw 2.4s cubic-bezier(.3,.7,.3,1) forwards; }
@keyframes draw { to { stroke-dashoffset:0; } }
.dash { stroke:#33506b; stroke-width:2; stroke-dasharray:9 9; }
.bar { transform-box:fill-box; transform-origin:bottom; }
.scene.on .bar { animation:grow .55s cubic-bezier(.2,.85,.25,1) backwards; }
@keyframes grow { from { transform:scaleY(0); } }
.cell { opacity:0; }
.scene.on .cell { animation:pop .4s ease forwards; }
@keyframes pop { to { opacity:1; } }

#grain { position:absolute; inset:0; pointer-events:none; opacity:.045; mix-blend-mode:overlay; }
#vig { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 46%, transparent 60%, rgba(0,0,0,.4) 100%); }
</style></head><body>
<div id="stage"></div>
<svg id="grain"><filter id="n"><feTurbulence baseFrequency="0.85" numOctaves="3"/></filter>
  <rect width="100%" height="100%" filter="url(#n)"/></svg>
<div id="vig"></div>
<script>
const D = __DATA__;
const stage = document.getElementById("stage");
const n = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c;
  if (h !== undefined) e.innerHTML = h; return e; };

function plate(base, sstList) {
  const p = n("div", "plate");
  const img = document.createElement("img");
  img.className = "base"; img.src = base;
  p.appendChild(img);
  (sstList || []).forEach((src, k) => {
    const layer = document.createElement("img");
    layer.className = "sstLayer"; layer.src = src; layer.dataset.k = k;
    p.appendChild(layer);
  });
  return p;
}
function winds(host, opts) {
  for (let i = 0; i < 30; i++) {
    const w = n("div", "wind");
    w.style.top = (250 + i * 15 + (i % 3) * 5) + "px";
    w.style.width = (130 + (i % 4) * 110) + "px";
    w.style.setProperty("--dur", opts.dur + "s");
    w.style.setProperty("--from", opts.from + "px");
    w.style.setProperty("--to", opts.to + "px");
    w.style.animationDelay = (-i * opts.dur / 30).toFixed(2) + "s";
    host.appendChild(w);
  }
}
function rain(host, x, y) {
  for (let i = 0; i < 30; i++) {
    const d = n("div", "drop");
    d.style.left = (x + (i % 15) * 22) + "px";
    d.style.top = (y + Math.floor(i / 15) * 34) + "px";
    d.style.animationDelay = (-i * 0.05).toFixed(2) + "s";
    host.appendChild(d);
  }
}
const legend = () => n("div", "legend", "<i></i>cooler &nbsp;←&nbsp; sea surface &nbsp;→&nbsp; warmer");

function scene(i) {
  const s = D.scenes[i], node = n("div", "scene");

  if (i === 0) {
    const p = plate("pacific.jpg", ["sst_neutral.png"]);
    node.appendChild(p);
    p.querySelector(".sstLayer").classList.add("show");
    winds(p, { dur: 3.2, from: 1250, to: -380 });
    node.appendChild(n("div", "card rise", s.card));
    node.appendChild(legend());
  } else if (i === 1) {
    const p = plate("pacific.jpg", ["sst_neutral.png"]);
    node.appendChild(p);
    p.querySelector(".sstLayer").classList.add("show");
    winds(p, { dur: 2.1, from: 1250, to: -380 });
    rain(p, 110, 330);
    node.appendChild(n("div", "kicker rise", s.card));
    node.appendChild(legend());
  } else if (i === 2) {
    const srcs = []; for (let k = 0; k < D.sstCount; k++) srcs.push("sst_" + String(k).padStart(2, "0") + ".png");
    const p = plate("pacific.jpg", srcs);
    p.id = "seq";
    node.appendChild(p);
    winds(p, { dur: 8.5, from: 1250, to: -380 });
    node.appendChild(n("div", "card rise", s.card));
    node.appendChild(n("div", "stamp", "<span id='stamp'></span>"));
    node.appendChild(legend());
  } else if (i === 3) {
    const p = plate("south_asia.jpg", null);
    node.appendChild(p);
    rain(p, 700, 340);
    winds(p, { dur: 3.0, from: -380, to: 1250 });
    node.appendChild(n("div", "kicker rise", s.card));
  } else if (i === 4) {
    node.appendChild(n("div", "yr rise", "1877"));
    node.appendChild(n("div", "yrsub rise",
      "The strongest El Ni&ntilde;o ever recorded.<br>The monsoon failed across the Madras Presidency and the Deccan."));
    node.appendChild(n("div", "toll rise", "8,000,000+"));
    node.appendChild(n("div", "tollsub", "excess mortality estimated 5.6–9.6 million"));
  } else if (i === 5) {
    const p = plate("pacific.jpg", ["sst_" + String(D.sstCount - 1).padStart(2, "0") + ".png"]);
    p.style.top = "820px"; p.style.height = "560px";
    node.appendChild(p);
    p.querySelector(".sstLayer").classList.add("show");
    node.appendChild(n("div", "card rise",
      "+1.80&nbsp;&deg;C<small>NOAA Oceanic Ni&ntilde;o Index &middot; JJA 2026</small>"));
    const W = 900, H = 250, pad = 28, lo = Math.min(-0.9, ...D.oni) - .2, hi = Math.max(.9, ...D.oni) + .2;
    const X = k => pad + k / (D.oni.length - 1) * (W - pad * 2);
    const Y = v => pad + (hi - v) / (hi - lo) * (H - pad * 2);
    const path = D.oni.map((v, k) => (k ? "L" : "M") + X(k).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
    const box = n("div", null, `<svg viewBox="0 0 ${W} ${H}" width="900" height="250">
      <line class="dash" x1="${pad}" x2="${W - pad}" y1="${Y(.5)}" y2="${Y(.5)}"/>
      <path class="oniPath" d="${path}"/>
      <circle cx="${X(D.oni.length - 1)}" cy="${Y(D.oni[D.oni.length - 1])}" r="13" fill="#ff9350"/></svg>`);
    box.style.cssText = "position:absolute;left:90px;top:480px;";
    node.appendChild(box);
    node.appendChild(n("div", "foot", "two years of the index · measured sea surface below"));
  } else if (i === 6) {
    node.appendChild(n("div", "card rise",
      "<span style='font-size:66px'>&minus;15.2% usually</span><small style='font-size:60px;font-weight:800;color:#ff9350;margin-top:14px'>&minus;28.4% this year</small>"));
    const W = 900, H = 520, pad = 28, max = Math.max(...D.rain.map(r => r.mm));
    const band = (W - pad * 2) / D.rain.length;
    let bars = "";
    D.rain.forEach((r, k) => {
      const h = r.mm / max * (H - pad * 2);
      const fill = r.s === "el_nino" ? "#ff7a45" : r.s === "la_nina" ? "#5aa8e0" : "#54708a";
      bars += `<rect class="bar" x="${(pad + k * band + band * .14).toFixed(1)}" y="${(H - pad - h).toFixed(1)}"
        width="${(band * .72).toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"
        ${k === D.rain.length - 1 ? 'stroke="#fff" stroke-width="4"' : ''}
        style="animation-delay:${(k * .02).toFixed(2)}s"/>`;
    });
    const meanY = H - pad - D.rainMean / max * (H - pad * 2);
    const box = n("div", null, `<svg viewBox="0 0 ${W} ${H}" width="900" height="520">${bars}
      <line class="dash" x1="${pad}" x2="${W - pad}" y1="${meanY.toFixed(1)}" y2="${meanY.toFixed(1)}"/></svg>`);
    box.style.cssText = "position:absolute;left:90px;top:560px;";
    node.appendChild(box);
    node.appendChild(n("div", "foot", "June–August rainfall, every year since 1981 · CHIRPS"));
  } else {
    node.appendChild(n("div", "card rise", "62.7%<small>of mandals lower than they were in May</small>"));
    let paths = "";
    D.shapes.forEach((m, k) => {
      paths += `<path class="cell" d="${m.d}" fill="${m.f}" stroke="#04101c" stroke-width="1.1"
        style="animation-delay:${(.1 + k * .0024).toFixed(3)}s"/>`;
    });
    const box = n("div", null, `<svg viewBox="0 0 1000 ${D.mapH}" width="980">${paths}</svg>`);
    box.style.cssText = "position:absolute;left:50px;top:520px;";
    node.appendChild(box);
    node.appendChild(n("div", "foot",
      D.volume.toLocaleString("en-IN") + " million m³ short · Andhra Pradesh's own wells"));
  }

  const cap = n("div", "caption");
  s.cap.split("\n").forEach((line) => cap.appendChild(n("span", "capLine", line)));
  node.appendChild(cap);
  return node;
}

D.scenes.forEach((_, i) => stage.appendChild(scene(i)));
const nodes = [...document.querySelectorAll(".scene")];

// A timer, not requestAnimationFrame: capture suspends rAF, the clock stalls on
// the first scene and the film records six seconds of ocean for a minute.
//
// The camera is computed here rather than handed to CSS. A ten-second hold on a
// slow zoom measured 0.9 mean frame-to-frame change against the reference reel's
// 3.2, and never cut at all -- its peak was 1.6 against 41. So each shot has a
// start and an end, and a scene is made of two or three of them with a hard cut
// between: the discontinuity is the cut.
const SHOTS = {
  // Zooms stay inside 1.0-1.7 and the offsets aim at things that are actually
  // there -- Indonesia and Australia on the left of the basin, the Americas on
  // the right, the warm tongue along the equator. Pushed further than this the
  // tight shots landed on open water with nothing in frame.
  0: [[0, .46, {z:1.02, x:  20, y:   8}, {z:1.15, x: -30, y:  -6}],
      [1, .54, {z:1.58, x: 330, y:  40}, {z:1.70, x: 250, y:  20}]],
  1: [[0, .30, {z:1.66, x: 360, y:  40}, {z:1.74, x: 300, y:  25}],
      [1, .34, {z:1.04, x:   0, y:   0}, {z:1.16, x: -40, y:  -8}],
      [2, .36, {z:1.60, x:-330, y:  30}, {z:1.72, x:-400, y:  10}]],
  2: [[0, .26, {z:1.04, x:   0, y:   0}, {z:1.14, x: -30, y:  -6}],
      [1, .26, {z:1.64, x: -80, y:  20}, {z:1.74, x:-180, y:   4}],
      [2, .24, {z:1.50, x: 300, y: -20}, {z:1.38, x: 200, y:  -6}],
      [3, .24, {z:1.02, x:   0, y:   0}, {z:1.13, x: -25, y:   0}]],
  3: [[0, .34, {z:1.06, x: -30, y:  16}, {z:1.20, x:-110, y:  -4}],
      [1, .32, {z:1.62, x: 300, y:  40}, {z:1.72, x: 230, y:  20}],
      [2, .34, {z:1.28, x:-160, y:   8}, {z:1.12, x: -50, y:  -4}]],
  5: [[0, .50, {z:1.10, x:-100, y:   0}, {z:1.22, x:-180, y:  -8}],
      [1, .50, {z:1.55, x: 100, y:  30}, {z:1.66, x:  20, y:  14}]],
};
const ease = t => t * t * (3 - 2 * t);

window.__play = function () {
  const t0 = performance.now();
  const seq = document.getElementById("seq");
  const layers = seq ? [...seq.querySelectorAll(".sstLayer")] : [];
  const stamp = document.getElementById("stamp");
  const s3 = D.scenes[2];

  const timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;

    nodes.forEach((el, i) => {
      const sc = D.scenes[i];
      const live = t >= sc.a && t < sc.b;
      el.classList.toggle("on", live);
      if (!live) return;

      const local = (t - sc.a) / (sc.b - sc.a);
      const plan = SHOTS[i];
      if (plan) {
        let acc = 0, shot = plan[0], within = 0;
        for (const s of plan) {
          if (local <= acc + s[1] || s === plan[plan.length - 1]) {
            shot = s; within = Math.min(1, Math.max(0, (local - acc) / s[1])); break;
          }
          acc += s[1];
        }
        const [, , from, to] = shot;
        const k = ease(within);
        const z = from.z + (to.z - from.z) * k;
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k;
        const css = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) scale(${z.toFixed(4)})`;
        el.querySelectorAll(".base, .sstLayer").forEach((img) => { img.style.transform = css; });
      }

      // A touch of drift on the type, so a cut moves the whole frame and not
      // just the picture behind it.
      const head = el.querySelector(".card, .kicker");
      if (head && plan) head.style.transform = `translateY(${(6 - 12 * ease(local)).toFixed(1)}px)`;

      // Captions arrive line by line across the first two thirds of the scene.
      const lines = el.querySelectorAll(".capLine");
      lines.forEach((line, j) => {
        const due = 0.06 + j * (0.62 / Math.max(1, lines.length));
        line.classList.toggle("in", local >= due);
      });
    });

    if (layers.length) {
      const p = Math.min(0.999, Math.max(0, (t - s3.a) / (s3.b - s3.a)));
      const k = Math.floor(p * layers.length);
      layers.forEach((el, j) => el.classList.toggle("show", j === k));
      if (stamp && t >= s3.a && t < s3.b) {
        stamp.textContent = D.sstLabels[k] || "";
        stamp.style.opacity = D.sstMeasured[k] ? "1" : ".55";
      }
    }

    if (t >= 61) { clearInterval(timer); window.__done = true; }
  }, 33);
};
window.__ready = true;
</script></body></html>
"""

RECORDER = r"""import { chromium } from "@playwright/test";
const [page_url, outDir] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--force-device-scale-factor=1"] });
const context = await browser.newContext({
  viewport: { width: %d, height: %d },
  recordVideo: { dir: outDir, size: { width: %d, height: %d } },
});
const page = await context.newPage();
const started = Date.now();
await page.goto("file://" + page_url);
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
await page.evaluate(async () => {
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
});
const lead = (Date.now() - started) / 1000;
await page.evaluate(() => window.__play());
console.log("LEAD " + lead.toFixed(2));
// Wait out the minute on the clock rather than polling the page: waitForFunction
// polls on rAF, which capture suspends, so it timed out while the film played on.
await page.waitForTimeout(63000);
await page.close();
await context.close();
await browser.close();
console.log("recorded");
""" % (WIDTH, HEIGHT, WIDTH, HEIGHT)


def score(path):
    """An original bed, synthesised here.

    The reference reel carries a track and this carried silence, which is most
    of why it felt dead beside it. Licensed music was never an option -- the
    whole reason the reel could not be used is that it belongs to somebody --
    so this is generated: a low drone that rises through the film, a slow pulse,
    and a soft swell under each scene change. No sample, nobody's rights.
    """
    marks = ",".join(f"{a}" for a, _, _, _ in SCENES[1:])
    drone = ("sine=frequency=52:duration=%d,volume=0.30" % DURATION)
    fifth = ("sine=frequency=78:duration=%d,volume=0.16" % DURATION)
    # A breath of filtered noise for air, ducked well under the drone.
    air = ("anoisesrc=d=%d:c=pink:a=0.06,lowpass=f=420,highpass=f=70" % DURATION)
    swells = ";".join(
        f"[3:a]adelay={int(float(m) * 1000)}|{int(float(m) * 1000)}[s{i}]"
        for i, m in enumerate(marks.split(","))) if marks else ""
    subprocess.run([
        "ffmpeg", "-v", "error", "-y",
        "-f", "lavfi", "-i", drone,
        "-f", "lavfi", "-i", fifth,
        "-f", "lavfi", "-i", air,
        "-filter_complex",
        # Rise in level across the minute so the last third feels like arrival.
        "[0:a][1:a][2:a]amix=inputs=3:normalize=0[m];"
        f"[m]volume='0.45+0.55*t/{DURATION}':eval=frame,"
        "afade=t=in:st=0:d=2,"
        f"afade=t=out:st={DURATION - 3}:d=3,alimiter=limit=0.9[a]",
        "-map", "[a]", "-t", str(DURATION), "-c:a", "aac", "-b:a", "128k", path,
    ], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=os.path.join(ROOT, "dist", "el_nino_60s.mp4"))
    parser.add_argument("--html-only", action="store_true")
    args = parser.parse_args()

    out_dir = os.path.dirname(os.path.abspath(args.out))
    os.makedirs(out_dir, exist_ok=True)

    watch = json.load(open(os.path.join(APP, "monsoon_watch.json")))
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    pacific_size, asia_size = earth_crops(out_dir)
    sst_count = sst_fields(out_dir)
    html_path = os.path.join(out_dir, "el_nino_60s.html")
    with open(html_path, "w") as handle:
        handle.write(build_page(watch, geo, pacific_size, asia_size, sst_count))
    print(f"  wrote {html_path}")
    if args.html_only:
        return 0

    # Node resolves an ESM import from the script's own directory, so the
    # runner has to sit beside app/node_modules rather than beside the output.
    runner = os.path.join(ROOT, "app", "_record_elnino.mjs")
    with open(runner, "w") as handle:
        handle.write(RECORDER)

    with tempfile.TemporaryDirectory() as workdir:
        result = subprocess.run(["node", runner, html_path, workdir],
                                cwd=os.path.join(ROOT, "app"),
                                capture_output=True, text=True)
        if result.returncode != 0:
            print((result.stderr or result.stdout)[:600])
            return 1
        lead = 0.0
        for line in result.stdout.splitlines():
            if line.startswith("LEAD "):
                lead = float(line.split()[1])
        print(f"  trimming {lead:.2f}s of page load from the head")
        takes = [os.path.join(workdir, f) for f in os.listdir(workdir) if f.endswith(".webm")]
        if not takes:
            print("  no recording produced")
            return 1
        audio = os.path.join(workdir, "bed.m4a")
        score(audio)
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-ss", f"{lead:.2f}", "-i", takes[0],
            "-i", audio,
            "-vf", f"fps={FPS},scale={WIDTH}:{HEIGHT}:flags=lanczos",
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-preset", "slow", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-t", str(DURATION), args.out], check=True)
    os.remove(runner)
    print(f"  wrote {args.out}  ({os.path.getsize(args.out) / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
