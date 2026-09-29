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


def build_page(watch, geo, pacific_size, asia_size):
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

.scene { position:absolute; inset:0; opacity:0; transition:opacity .6s ease; }
.scene.on { opacity:1; }

/* --- the Earth plates ------------------------------------------------ */
/* The basin has to fit the frame's width or Australia and South America are
   cropped off and the viewer is left looking at open water. The image is a
   hair wider than the frame so the slow push never reveals an edge. */
.plate { position:absolute; left:0; right:0; top:530px; height:690px; overflow:hidden; }
.plate img { position:absolute; left:50%; top:50%; width:1130px;
  transform:translate(-50%,-50%) scale(1); transition:transform 11s linear;
  filter:brightness(1.78) saturate(1.34) contrast(1.05); will-change:transform; }
.scene.on .plate img { transform:translate(-50%,-50%) scale(1.045); }
.plate::after { content:""; position:absolute; inset:0; pointer-events:none;
  background:linear-gradient(180deg,rgba(4,16,28,.55),transparent 16%,transparent 84%,rgba(4,16,28,.6)); }

/* Sea-surface anomaly, composited the way a NOAA plot is rather than painted. */
.sst { position:absolute; height:250px; border-radius:50%; mix-blend-mode:screen; filter:blur(34px);
  transition:left 4.5s cubic-bezier(.4,0,.2,1), width 4.5s ease, opacity 1.6s ease; will-change:left; }
.sst.warm { background:radial-gradient(ellipse,rgba(255,150,60,.95),rgba(214,70,30,.55) 55%,transparent 72%); }
.sst.cool { background:radial-gradient(ellipse,rgba(70,180,235,.85),rgba(20,90,150,.45) 55%,transparent 72%); }

/* Trade winds. Thin, fast, many -- read as flow, not as arrows on a diagram. */
.wind { position:absolute; height:3px; border-radius:2px; opacity:0; will-change:transform;
  background:linear-gradient(90deg,transparent,rgba(214,236,255,.9),transparent); }
.scene.on .wind { animation:sweep var(--dur,3s) linear infinite; }
@keyframes sweep {
  0% { transform:translateX(var(--from,900px)); opacity:0; }
  12% { opacity:.85; } 88% { opacity:.85; }
  100% { transform:translateX(var(--to,-300px)); opacity:0; } }
.drop { position:absolute; width:2px; height:20px; border-radius:2px;
  background:linear-gradient(180deg,transparent,rgba(170,220,255,.9)); opacity:0; }
.scene.on .drop { animation:fall 1.5s linear infinite; }
@keyframes fall { 0% { transform:translateY(-30px); opacity:0; }
  25% { opacity:.8; } 100% { transform:translateY(200px); opacity:0; } }

/* --- type ------------------------------------------------------------- */
.card { position:absolute; left:64px; right:64px; top:250px; text-align:center;
  font-size:86px; font-weight:800; letter-spacing:-.025em; line-height:1.05; color:#fff;
  text-shadow:0 6px 40px rgba(0,0,0,.7); }
.card small { display:block; margin-top:20px; font-size:31px; font-weight:600;
  letter-spacing:.03em; color:#a9c0d6; text-shadow:none; }
.kicker { position:absolute; left:64px; right:64px; top:300px; text-align:center;
  font-size:40px; font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  color:#bcd3e8; text-shadow:0 4px 24px rgba(0,0,0,.8); }
.caption { position:absolute; left:58px; right:58px; bottom:158px; text-align:center;
  font-size:41px; font-weight:600; line-height:1.42; color:#fff; white-space:pre-line;
  text-shadow:0 3px 20px rgba(0,0,0,.92); }
.foot { position:absolute; left:0; right:0; bottom:92px; text-align:center;
  font-size:23px; letter-spacing:.06em; color:#7b93aa; }

/* --- 1877 ------------------------------------------------------------- */
.yr { position:absolute; left:0; right:0; top:340px; text-align:center; font-size:240px;
  font-weight:800; letter-spacing:-.04em; color:#eef3f8; }
.yrsub { position:absolute; left:80px; right:80px; top:650px; text-align:center;
  font-size:37px; line-height:1.5; color:#a9c0d6; }
.toll { position:absolute; left:0; right:0; top:880px; text-align:center;
  font-size:104px; font-weight:800; color:#e2705a; letter-spacing:-.02em; }
.tollsub { position:absolute; left:0; right:0; top:1010px; text-align:center;
  font-size:26px; color:#7b93aa; }

/* --- data ------------------------------------------------------------- */
svg { display:block; overflow:visible; }
.oniPath { fill:none; stroke:#e2705a; stroke-width:8; stroke-linecap:round; stroke-linejoin:round;
  stroke-dasharray:2600; stroke-dashoffset:2600; }
.scene.on .oniPath { animation:draw 2.6s cubic-bezier(.3,.7,.3,1) forwards; }
@keyframes draw { to { stroke-dashoffset:0; } }
.dash { stroke:#2b4257; stroke-width:2; stroke-dasharray:9 9; }
.bar { transform-box:fill-box; transform-origin:bottom; }
.scene.on .bar { animation:grow .6s cubic-bezier(.2,.85,.25,1) backwards; }
@keyframes grow { from { transform:scaleY(0); } }
.cell { opacity:0; }
.scene.on .cell { animation:pop .5s ease forwards; }
@keyframes pop { to { opacity:1; } }

/* --- finish ----------------------------------------------------------- */
#grain { position:absolute; inset:0; pointer-events:none; opacity:.05; mix-blend-mode:overlay; }
#vig { position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(ellipse at 50% 45%, transparent 58%, rgba(0,0,0,.42) 100%); }
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

function plate(src, size, focusX) {
  const p = n("div", "plate");
  const img = document.createElement("img");
  img.src = src;
  // Fill the frame from the middle of the basin, cropping the rest.
  const scale = Math.max(1080 / size[0], 900 / size[1]) * 1.9;
  img.style.width = (size[0] * scale) + "px";
  img.style.marginLeft = (focusX || 0) + "px";
  p.appendChild(img);
  return p;
}
function winds(host, opts) {
  for (let i = 0; i < 26; i++) {
    const w = n("div", "wind");
    w.style.top = (160 + i * 14 + (i % 3) * 5) + "px";
    w.style.width = (120 + (i % 4) * 90) + "px";
    w.style.setProperty("--dur", opts.dur + "s");
    w.style.setProperty("--from", opts.from + "px");
    w.style.setProperty("--to", opts.to + "px");
    w.style.animationDelay = (-i * opts.dur / 26).toFixed(2) + "s";
    host.appendChild(w);
  }
}
function rain(host, x, y) {
  for (let i = 0; i < 26; i++) {
    const d = n("div", "drop");
    d.style.left = (x + (i % 13) * 22) + "px";
    d.style.top = (y + Math.floor(i / 13) * 34) + "px";
    d.style.animationDelay = (-i * 0.06).toFixed(2) + "s";
    host.appendChild(d);
  }
}
function sst(host, cls, left, width, top) {
  const s = n("div", "sst " + cls);
  s.style.left = left + "px"; s.style.width = width + "px";
  s.style.top = top + "px";
  host.appendChild(s);
  return s;
}

function scene(i) {
  const s = D.scenes[i], node = n("div", "scene");

  if (i < 3) {
    const p = plate("pacific.jpg", D.pac, i === 2 ? -120 : 0);
    node.appendChild(p);
    if (i === 0) { sst(p, "warm", 130, 470, 230); winds(p, { dur: 3.4, from: 1150, to: -320 }); }
    if (i === 1) { sst(p, "warm", 20, 430, 230); sst(p, "cool", 770, 290, 245);
      winds(p, { dur: 2.4, from: 1150, to: -320 }); rain(p, 110, 268); }
    if (i === 2) { sst(p, "warm", 540, 500, 230); winds(p, { dur: 8.5, from: 1150, to: -320 }); }
    node.appendChild(n("div", i === 0 || i === 2 ? "card" : "kicker", s.card));
  } else if (i === 3) {
    const p = plate("south_asia.jpg", D.asia, 0);
    node.appendChild(p);
    sst(p, "warm", 660, 400, 230);
    rain(p, 680, 262);
    winds(p, { dur: 3.2, from: -320, to: 980 });
    node.appendChild(n("div", "kicker", s.card));
  } else if (i === 4) {
    node.appendChild(n("div", "yr", "1877"));
    node.appendChild(n("div", "yrsub",
      "The strongest El Ni&ntilde;o ever recorded.<br>The monsoon failed across the Madras Presidency and the Deccan."));
    node.appendChild(n("div", "toll", "8,000,000+"));
    node.appendChild(n("div", "tollsub", "excess mortality estimated 5.6–9.6 million"));
  } else if (i === 5) {
    node.appendChild(n("div", "card", "+1.80&nbsp;&deg;C<small>NOAA Oceanic Ni&ntilde;o Index &middot; JJA 2026</small>"));
    const W = 900, H = 320, pad = 34, lo = Math.min(-0.9, ...D.oni) - .2, hi = Math.max(.9, ...D.oni) + .2;
    const X = k => pad + k / (D.oni.length - 1) * (W - pad * 2);
    const Y = v => pad + (hi - v) / (hi - lo) * (H - pad * 2);
    const path = D.oni.map((v, k) => (k ? "L" : "M") + X(k).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
    const box = n("div", null, `<svg viewBox="0 0 ${W} ${H}" width="900" height="320">
      <line class="dash" x1="${pad}" x2="${W - pad}" y1="${Y(.5)}" y2="${Y(.5)}"/>
      <line class="dash" x1="${pad}" x2="${W - pad}" y1="${Y(-.5)}" y2="${Y(-.5)}"/>
      <path class="oniPath" d="${path}"/>
      <circle cx="${X(D.oni.length - 1)}" cy="${Y(D.oni[D.oni.length - 1])}" r="12" fill="#e2705a"/></svg>`);
    box.style.cssText = "position:absolute;left:90px;top:720px;";
    node.appendChild(box);
    node.appendChild(n("div", "foot", "two years of the index · dashed lines are ±0.5 °C"));
  } else if (i === 6) {
    node.appendChild(n("div", "card",
      "<span style='font-size:64px'>&minus;15.2% usually</span><small style='font-size:56px;font-weight:800;color:#e2705a;margin-top:12px'>&minus;28.4% this year</small>"));
    const W = 900, H = 380, pad = 28, max = Math.max(...D.rain.map(r => r.mm));
    const band = (W - pad * 2) / D.rain.length;
    let bars = "";
    D.rain.forEach((r, k) => {
      const h = r.mm / max * (H - pad * 2);
      const fill = r.s === "el_nino" ? "#e2705a" : r.s === "la_nina" ? "#5aa8e0" : "#4e6a85";
      bars += `<rect class="bar" x="${(pad + k * band + band * .14).toFixed(1)}" y="${(H - pad - h).toFixed(1)}"
        width="${(band * .72).toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}"
        ${k === D.rain.length - 1 ? 'stroke="#fff" stroke-width="3"' : ''}
        style="animation-delay:${(k * .024).toFixed(2)}s"/>`;
    });
    const meanY = H - pad - D.rainMean / max * (H - pad * 2);
    const box = n("div", null, `<svg viewBox="0 0 ${W} ${H}" width="900" height="380">${bars}
      <line class="dash" x1="${pad}" x2="${W - pad}" y1="${meanY.toFixed(1)}" y2="${meanY.toFixed(1)}"/></svg>`);
    box.style.cssText = "position:absolute;left:90px;top:690px;";
    node.appendChild(box);
    node.appendChild(n("div", "foot", "June–August rainfall, every year since 1981 · CHIRPS"));
  } else {
    node.appendChild(n("div", "card", "62.7%<small>of mandals lower than they were in May</small>"));
    let paths = "";
    D.shapes.forEach((m, k) => {
      paths += `<path class="cell" d="${m.d}" fill="${m.f}" stroke="#04101c" stroke-width="1.1"
        style="animation-delay:${(.15 + k * .0026).toFixed(3)}s"/>`;
    });
    const box = n("div", null, `<svg viewBox="0 0 1000 ${D.mapH}" width="900">${paths}</svg>`);
    box.style.cssText = "position:absolute;left:90px;top:600px;";
    node.appendChild(box);
    node.appendChild(n("div", "foot",
      D.volume.toLocaleString("en-IN") + " million m³ short · Andhra Pradesh's own wells"));
  }

  node.appendChild(n("div", "caption", s.cap));
  return node;
}

D.scenes.forEach((_, i) => stage.appendChild(scene(i)));
const nodes = [...document.querySelectorAll(".scene")];

// A timer, not requestAnimationFrame: under video capture rAF stops firing,
// the clock stalls on the first scene and the film records six seconds of the
// Pacific for a minute. setInterval keeps running.
window.__play = function () {
  const t0 = performance.now();
  const timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    nodes.forEach((el, i) => el.classList.toggle("on", t >= D.scenes[i].a && t < D.scenes[i].b));
    if (t >= 61) { clearInterval(timer); window.__done = true; }
  }, 40);
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
await page.goto("file://" + page_url);
await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
// Let the imagery decode before the clock starts, or the first seconds record black.
await page.waitForTimeout(2500);
await page.evaluate(() => window.__play());
// Wait out the minute on the clock rather than polling the page: waitForFunction
// polls on rAF, which capture suspends, so it timed out while the film played on.
await page.waitForTimeout(63000);
await page.close();
await context.close();
await browser.close();
console.log("recorded");
""" % (WIDTH, HEIGHT, WIDTH, HEIGHT)


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
    html_path = os.path.join(out_dir, "el_nino_60s.html")
    with open(html_path, "w") as handle:
        handle.write(build_page(watch, geo, pacific_size, asia_size))
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
        takes = [os.path.join(workdir, f) for f in os.listdir(workdir) if f.endswith(".webm")]
        if not takes:
            print("  no recording produced")
            return 1
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", takes[0],
            "-vf", f"fps={FPS},scale={WIDTH}:{HEIGHT}:flags=lanczos",
            "-c:v", "libx264", "-preset", "slow", "-crf", "20",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            "-t", str(DURATION), args.out], check=True)
    os.remove(runner)
    print(f"  wrote {args.out}  ({os.path.getsize(args.out) / 1e6:.1f} MB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
