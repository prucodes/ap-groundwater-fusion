"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import geometry from "./landscape.json";
import styles from "./Welcome.module.css";

/* Beneath the monsoon: the State's land, and the water held under it, as two maps in one stack.

   The first time it is on screen, the picture lands. A drop falls on the land and its first ring
   uncovers it; the layers beneath fall into place one after another, down to the water layer.
   Then the water layer fills the way the State fills with water elsewhere on the site: water wells
   up in the southern tip and climbs at the speed a steady inflow gives a vessel this shape, springs
   bubbling and boiling as it reaches them, its surface a row of springs that rocks and runs with
   waves, each mandal glinting as the water passes it. Once full, the layer stays water: pool light
   moves over the State's mandal lines, its edge glows, and drops land and ring out, bending the
   lines beneath them, with a ring too wherever one of the land's recharge pulses arrives.

   SVG for the land, the layers and the words; one canvas for the water layer, slid between the
   layers above and below it so the land still covers it; one canvas on top for the drop and its
   rings. No video, no images. The water steps 60 times a second whatever the screen. It starts
   only once the picture is on screen, holds still while the welcome's motion is paused, and with
   reduced motion is drawn once, landed, full and still. Illustration, not data. */

type Outlines = { mandals: string[]; districts: string };
/** A mandal on the water layer's floor: its outline (in the outlines' own view) and its middle (in picture units). */
type Mandal = { path: Path2D; x: number; y: number };
type Bit = { x: number; y: number; vx: number; vy: number; r: number; seed: number };
type Foam = { x: number; life: number; r: number; drift: number };
type Ripple = { x: number; y: number; at: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** The site's mandal outlines (a 1000 × 855 view) laid onto this picture's State, which is the same map
    tilted back: a circle on the ground looks about half as tall as it is wide. Fitted to the silhouette
    (97% overlap). In canvas order a, b, c, d, e, f. */
const FIT = [0.645195, -0.000142, 0.000408, 0.341924, 84.320589, 149.609334] as const;
const TILT = FIT[3] / FIT[0];
/** The drop lands on the north-east recharge point. */
const IMPACT = { x: 515, y: 236 };
const WATER = 103;
/** Every layer under the land, top to bottom, by how far below the land it lies once landed. */
const STACK = [14, 22, 30, 38, 57, WATER, 121, 133, 145, 170];
const WATER_AT = STACK.indexOf(WATER);
/** The layers that hide the water layer where they lie over it (the rock at 57 lets it show through). */
const COVERS = [0, 14, 22, 30, 38];
const RECHARGE = [{ x: 235, y: 350 }, { x: 340, y: 300 }, { x: 515, y: 236 }];
const RIVERS = ["M280 190C290 245 425 260 457 308S490 339 524 351", "M480 155C465 205 520 228 557 244S589 275 610 272"];
/** The cycle the land runs (rain, recharge, response, assessment), and when in it a pulse reaches the water. */
const CYCLE = 10_000, ARRIVES = 0.59;

/** The landing, in ms from when the picture is first on screen. */
const DROP = 700, RING_MS = 1600, RING_GAP = 230;
const UNFOLD = 1750, UNFOLD_MS = 950, UNFOLD_GAP = 45;
const RIVER_AT = 1300, RIVER_MS = 1400;
/** The water wells up as its layer lands and rises for FILL_MS; the land's own cycle starts once it is living water. */
const WELL = 2950, FILL_MS = 4300, DONE = 8300;
/** When each part of the picture fades in, [start, length]; anything not listed (the rain) waits for the end. */
const FADES: Record<string, [number, number]> = {
  ground: [0, 1400], clouds: [2200, 1200], names: [3000, 700], north: [3100, 700], flow: [3000, 700], monsoon: [3300, 700],
  fields: [3700, 700], recharge: [4700, 700], groundwater: [5300, 700], assessment: [5900, 700],
};

/** The water's step: 60 a second, whatever the screen's refresh. */
const STEP = 1000 / 60;
/** The surface as a row of springs: how many, how stiff, how quickly they calm, how far a push spreads. */
const COLUMNS = 180, SPRING = 0.02, DAMPING = 0.012, SPREAD = 0.25;
/** The spray thrown up where a spring boils falls back under this gravity (picture units per step²). */
const G_SPRAY = 0.12;
const GLINT_MS = 800, RAIN_EVERY = 1700, RIPPLE_MS = 3200, NODE_GLINT_MS = 700;

const POINTS = (geometry.path.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map(pair => pair.split(",").map(Number));
/** Distance on the ground, not on the screen. */
const planar = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, (y - cy) / TILT);
/** How far the rings must travel to uncover the whole State from the drop. */
const REACH = Math.max(...POINTS.map(([x, y]) => planar(x, y, IMPACT.x, IMPACT.y))) + 12;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeIn = (p: number) => p * p * p;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** Falls into place and settles: a little past, and back. */
const settle = (p: number) => { const c1 = 1.25, c3 = c1 + 1, q = p - 1; return 1 + c3 * q * q * q + c1 * q * q; };

/** A seeded sequence, so the water moves the same way every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** The middle of an outline written as M x y then relative l steps (the site's outline format). */
function middle(d: string) {
  let x = 0, y = 0, sx = 0, sy = 0, n = 0;
  for (const part of d.match(/[MmLlZz][^MmLlZz]*/g) ?? []) {
    const nums = part.slice(1).trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const cmd = part[0];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      if (cmd === "M" || cmd === "L") { x = nums[i]; y = nums[i + 1]; } else { x += nums[i]; y += nums[i + 1]; }
      sx += x; sy += y; n += 1;
    }
  }
  return n ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}

/** Light on the bottom of a pool: a net of bright lines that repeats seamlessly. */
function causticTile(size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"); if (!g) return c;
  const img = g.createImageData(size, size), k = (n: number) => (Math.PI * 2 * n) / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.sin(x * k(3) + 2.2 * Math.sin(y * k(2))) + Math.sin(y * k(3) + 2.2 * Math.sin(x * k(4)))
      + Math.sin((x + y) * k(2) + 1.6 * Math.sin((x - y) * k(1)));
    const line = Math.pow(1 - Math.min(1, Math.abs(v) / 1.15), 5), i = (y * size + x) * 4;
    img.data[i] = 175; img.data[i + 1] = 243; img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * line);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** A ring on the water, lit from the upper left: bright on that side, in shadow on the other. Drawn at the origin. */
function litRing(ctx: CanvasRenderingContext2D, r: number, a: number, width: number) {
  let style: string | CanvasGradient = `rgba(225, 253, 255, ${a})`;
  if (typeof ctx.createConicGradient === "function") {
    const g = ctx.createConicGradient(-Math.PI * 0.75, 0, 0);
    g.addColorStop(0, `rgba(242, 254, 255, ${a})`); g.addColorStop(0.25, `rgba(150, 232, 250, ${a * 0.45})`);
    g.addColorStop(0.5, `rgba(3, 28, 50, ${a * 0.75})`); g.addColorStop(0.75, `rgba(150, 232, 250, ${a * 0.45})`); g.addColorStop(1, `rgba(242, 254, 255, ${a})`);
    style = g;
  }
  ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
}

export function WaterLandscape({ paused = false }: { paused?: boolean }) {
  const stage = useRef<HTMLDivElement>(null);
  const waterCanvas = useRef<HTMLCanvasElement>(null);
  const lightCanvas = useRef<HTMLCanvasElement>(null);
  const hold = useRef(paused);
  hold.current = paused;

  useEffect(() => {
    const box = stage.current, wc = waterCanvas.current, fc = lightCanvas.current;
    const w = wc?.getContext("2d"), f = fc?.getContext("2d");
    if (!box || !wc || !fc || !w || !f) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const all = <E extends Element>(selector: string) => Array.from(box.querySelectorAll<E>(selector));
    const layers = STACK.map(depth => box.querySelector<SVGPathElement>(`[data-layer="${depth}"]`));
    const groups = all<SVGGElement>("[data-reveal-group]");
    const reveals = all<SVGEllipseElement>("[data-reveal]");
    const fades = all<SVGGraphicsElement>("[data-fade]");
    const rivers = all<SVGPathElement>("[data-river]").map(p => ({ p, length: p.getTotalLength() }));
    const pulse = box.querySelector<SVGPathElement>("[data-cycle]");

    // ---- The water layer as a vessel, in picture units: its shape, how wide it is at each height,
    // and how high water stands once a share of its area has been poured in from the bottom.
    const ground = new Path2D(geometry.path);
    const shape = new Path2D(); shape.addPath(ground, new DOMMatrix([1, 0, 0, 1, 0, WATER]));
    const covers = COVERS.map(dy => { const p = new Path2D(); p.addPath(ground, new DOMMatrix([1, 0, 0, 1, 0, dy])); return p; });
    const probe = document.createElement("canvas").getContext("2d");
    /** In the water layer and not hidden under the land: where a drop on the water can be seen. */
    const open = (x: number, y: number) => !!probe && probe.isPointInPath(shape, x, y) && !covers.some(c => probe.isPointInPath(c, x, y));
    const widths = new Float32Array(700), levels = new Float32Array(513);
    let top = 258, bottom = 540, left = 95, right = 720;
    {
      const mc = document.createElement("canvas"); mc.width = 820; mc.height = 700;
      const mg = mc.getContext("2d", { willReadFrequently: true });
      if (mg) {
        mg.fillStyle = "#fff"; mg.fill(shape);
        const img = mg.getImageData(0, 0, 820, 700).data;
        let first = -1, last = -1, minX = Infinity, maxX = -Infinity;
        for (let r = 0; r < 700; r++) {
          let n = 0;
          for (let x = 0; x < 820; x++) if (img[(r * 820 + x) * 4 + 3] > 127) { n += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; }
          widths[r] = n;
          if (n) { if (first < 0) first = r; last = r; }
        }
        if (first >= 0) {
          top = first; bottom = last + 1; left = minX; right = maxX + 1;
          let total = 0;
          for (let r = first; r <= last; r++) total += widths[r];
          let acc = 0, r = last;
          for (let i = 0; i <= 512; i++) {
            const want = (i / 512) * total;
            while (r >= first && acc + widths[r] < want) { acc += widths[r]; r -= 1; }
            const share = r >= first && widths[r] > 0 ? clamp((want - acc) / widths[r]) : 1;
            levels[i] = r + 1 - share;
          }
        }
      }
    }
    const levelAt = (share: number) => { const u = clamp(share) * 512, i = Math.min(511, Math.floor(u)); return levels[i] + (levels[i + 1] - levels[i]) * (u - i); };
    const rand = seeded(11);
    // Where the water wells up: springs spread from the south to the north, each opening once the water reaches it.
    const floor = geometry.nodes.map(([x, y]) => ({ x, y: y + WATER }));
    const byHeight = [...floor].sort((a, b) => b.y - a.y);
    const springs = [0.04, 0.17, 0.3, 0.44, 0.58, 0.72, 0.86].map(q => ({ ...byHeight[clamp(Math.floor(q * (byHeight.length - 1)), 0, byHeight.length - 1)], next: 0 }));
    const caustic = w.createPattern(causticTile(), "repeat");

    // The State's mandals arrive after the page; the water fills without their lines and glints until then.
    let mandals: Mandal[] = [], seenFloor: Array<{ x: number; y: number }> = floor.filter(p => open(p.x, p.y));
    let reached = new Float64Array(0);
    let lines: Path2D | null = null, districts: Path2D | null = null;

    // ---- Sizes, and the layers drawn once per size (on the device's pixels, at the layer's landed place).
    let W = 1, H = 1, dpr = 1, k = 1;
    let glow: HTMLCanvasElement | null = null, inner: HTMLCanvasElement | null = null, base: HTMLCanvasElement | null = null;
    let mesh: HTMLCanvasElement | null = null, rim: HTMLCanvasElement | null = null;
    const offscreen = (draw: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas"); c.width = wc.width; c.height = wc.height;
      const g = c.getContext("2d"); if (!g) return null;
      g.setTransform(k, 0, 0, k, 0, 0); draw(g);
      return c;
    };
    // The floor: every mandal line, and the district lines a little brighter.
    const drawMesh = () => {
      const l = lines, d = districts;
      mesh = l && d ? offscreen(g => {
        g.clip(shape);
        g.strokeStyle = "rgba(170, 240, 255, 0.17)"; g.lineWidth = 0.55; g.stroke(l);
        g.strokeStyle = "rgba(190, 248, 255, 0.45)"; g.lineWidth = 1; g.stroke(d);
      }) : null;
    };
    const layout = () => {
      W = Math.max(1, box.clientWidth); H = Math.max(1, box.clientHeight); dpr = Math.min(2, window.devicePixelRatio || 1); k = (dpr * W) / 820;
      for (const c of [wc, fc]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      // The glow outside its edge: the layer's fill with a soft light, then the fill taken out.
      glow = offscreen(g => {
        g.shadowColor = "rgba(94, 231, 255, 0.8)"; g.shadowBlur = 14 * dpr; g.fillStyle = "#5ee7ff"; g.fill(shape);
        g.shadowBlur = 0; g.globalCompositeOperation = "destination-out"; g.fill(shape);
      });
      // The glass: light from outside bleeding just inside the edge, so the layer reads as a vessel.
      const outside = offscreen(g => {
        g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = "#000"; g.fillRect(0, 0, wc.width, wc.height);
        g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = "destination-out"; g.fill(shape);
      });
      inner = outside ? offscreen(g => {
        g.clip(shape); g.setTransform(1, 0, 0, 1, 0, 0);
        g.shadowColor = "rgba(160, 242, 255, 0.8)"; g.shadowBlur = 10 * dpr; g.shadowOffsetX = outside.width + 400;
        g.drawImage(outside, -(outside.width + 400), 0);
      }) : null;
      // The full layer as still water, under the living surface.
      base = offscreen(g => {
        const deep = g.createLinearGradient(0, top - 18, 0, bottom);
        deep.addColorStop(0, "#2aa9c6"); deep.addColorStop(0.18, "#137aa0"); deep.addColorStop(1, "#072b49");
        g.fillStyle = deep; g.fill(shape);
      });
      // Its edge, for the moment the layer lands.
      rim = offscreen(g => {
        g.shadowColor = "rgba(94, 231, 255, 0.6)"; g.shadowBlur = 7 * dpr;
        g.strokeStyle = "rgba(113, 229, 243, 0.9)"; g.lineWidth = 1.5; g.stroke(shape);
      });
      drawMesh();
    };
    layout();

    // ---- The landing: where everything is at a moment of it.
    /** The land, and everything under it, shows only where the first ring has passed. */
    const revealAt = (time: number) => (time <= DROP ? 0 : easeOut(clamp((time - DROP) / RING_MS)) * REACH);
    const depthAt = (i: number, time: number) => STACK[i] * settle(clamp((time - UNFOLD - i * UNFOLD_GAP) / UNFOLD_MS));

    // ---- The water and everything in it (picture units).
    const h = new Float32Array(COLUMNS), v = new Float32Array(COLUMNS), lD = new Float32Array(COLUMNS), rD = new Float32Array(COLUMNS);
    const px = new Float32Array(COLUMNS), py = new Float32Array(COLUMNS);
    const spray: Bit[] = [], bubbles: Bit[] = [], foam: Foam[] = [], ripples: Ripple[] = [];
    let t = 0, fill = 0, started = -1, full = -1, nextRain = Infinity;
    /** The whole surface rocking from side to side, as water does in a tank once something lands in it. */
    let slosh = 0;
    /** How wide the water is at its surface now, as a share of a wide stretch: waves stay small in the narrow tip. */
    let breadth = 0;
    const colX0 = left - 14, colDX = (right - left + 28) / (COLUMNS - 1);
    const colAt = (x: number) => clamp(Math.round((x - colX0) / colDX), 0, COLUMNS - 1);
    const level = () => (started < 0 ? bottom + 20 : levelAt(fill));
    const swell = (x: number) => {
      const u = (x - left) / Math.max(1, right - left), kk = 0.45 + 0.55 * breadth;
      return kk * (Math.sin(x * 0.0167 - t * 0.0021) * 5 + Math.sin(x * 0.0387 + t * 0.0033 + 1.3) * 2.6 + Math.sin(x * 0.0948 - t * 0.0062 + 0.4) * 1.1)
        + slosh * (Math.cos(Math.PI * u) * Math.cos(t * 0.0024) + 0.45 * Math.cos(2 * Math.PI * u) * Math.sin(t * 0.0037));
    };
    const surfaceAt = (x: number) => {
      const fx = (x - colX0) / colDX, i = clamp(Math.floor(fx), 0, COLUMNS - 2), u = clamp(fx - i);
      return level() - (h[i] * (1 - u) + h[i + 1] * u) + swell(x);
    };
    const somewhere = () => {
      const pool = mandals.length ? mandals : floor;
      return pool[Math.floor(rand() * pool.length)];
    };

    const stepWater = () => {
      t += STEP;
      // The water starts to well up in the southern tip.
      if (started < 0 && t >= WELL) { started = t; slosh = 4; }
      if (started >= 0) {
        const row = Math.floor(level());
        breadth = clamp((row >= 0 && row < widths.length ? widths[row] : 0) / 315);
      }
      if (started >= 0 && full < 0) {
        const p = clamp((t - started) / FILL_MS);
        const q = p + 0.025 * Math.sin(2 * Math.PI * 3.5 * p) * Math.sin(Math.PI * p); // pulses in the inflow
        fill = q * 1.25 - 0.25 * q ** 5; // a rise that eases off at the brim
        if (p >= 1) { fill = 1; full = t; nextRain = t + 900; }
      }
      // Springs open as the water reaches them: bubbles stream up from the floor, and now and
      // then the surface above them boils, throwing a little spray and sending out waves.
      if (started >= 0 && full < 0) {
        const lv = level();
        for (const spring of springs) {
          if (spring.y < lv + 14) continue;
          if (bubbles.length < 140 && rand() < 0.4) bubbles.push({ x: spring.x + (rand() - 0.5) * 16, y: spring.y + (rand() - 0.5) * 8, vx: (rand() - 0.5) * 0.8, vy: -(0.2 + rand() * 0.5), r: 0.35 + rand() * 1.4, seed: rand() });
          if (t >= spring.next) {
            spring.next = t + 900 + rand() * 900;
            const c = colAt(spring.x), sy = surfaceAt(spring.x);
            for (let j = -4; j <= 4; j++) { const i = c + j; if (i >= 0 && i < COLUMNS) v[i] += 1.6 * (1 - Math.abs(j) / 5); }
            slosh = Math.min(10, slosh + 1.3);
            for (let n = 0; n < 6; n++) if (spray.length < 100) spray.push({ x: spring.x + (rand() - 0.5) * 6, y: sy - 1, vx: (rand() - 0.5) * 1.3, vy: -(0.6 + rand() * 1.4), r: 0.35 + rand() * 0.7, seed: rand() });
            for (let n = 0; n < 4; n++) if (foam.length < 120) foam.push({ x: spring.x + (rand() - 0.5) * 12, life: 0.9, r: 0.7 + rand() * 1.3, drift: (rand() - 0.5) * 0.5 });
          }
        }
        // Everywhere under water, a few bubbles rise from the floor.
        if (bubbles.length < 140 && rand() < 0.9) {
          const m = somewhere();
          if (m && m.y > lv + 18) bubbles.push({ x: m.x + (rand() - 0.5) * 7, y: m.y, vx: 0, vy: -(0.2 + rand() * 0.35), r: 0.35 + rand() * 1, seed: rand() });
        }
      }
      if (started >= 0) {
        if (rand() < 0.15) v[Math.floor(rand() * COLUMNS)] += (rand() - 0.5) * 0.4; // a little wind everywhere
        const damping = full >= 0 ? DAMPING * 2.5 : DAMPING;
        // The rocking keeps going while the water comes in, and settles once it is full.
        if (full >= 0) slosh *= 0.985; else slosh += (6 * (0.4 + 0.6 * breadth) - slosh) * 0.012;
        for (let i = 0; i < COLUMNS; i++) { v[i] += -SPRING * h[i] - damping * v[i]; h[i] += v[i]; }
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < COLUMNS; i++) {
            if (i > 0) { lD[i] = SPREAD * (h[i] - h[i - 1]); v[i - 1] += lD[i]; }
            if (i < COLUMNS - 1) { rD[i] = SPREAD * (h[i] - h[i + 1]); v[i + 1] += rD[i]; }
          }
          for (let i = 0; i < COLUMNS; i++) { if (i > 0) h[i - 1] += lD[i]; if (i < COLUMNS - 1) h[i + 1] += rD[i]; }
        }
      }
      // Spray falls back in and rings out; bubbles rise and burst into foam, lifting the surface where they break.
      for (let i = spray.length - 1; i >= 0; i--) {
        const s = spray[i]; s.vy += G_SPRAY; s.x += s.vx; s.y += s.vy;
        if (s.vy > 0 && started >= 0 && s.y > surfaceAt(s.x)) {
          v[colAt(s.x)] -= 0.3 * s.r;
          if (foam.length < 120 && rand() < 0.4) foam.push({ x: s.x, life: 0.8, r: 0.5 + s.r, drift: (rand() - 0.5) * 0.3 });
          spray.splice(i, 1);
        } else if (s.y > bottom + 40) spray.splice(i, 1);
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.vy = Math.max(-1.4, b.vy - 0.055); b.vx *= 0.96; b.x += b.vx + Math.sin(t * (0.006 + b.seed * 0.01) + b.seed * 20) * (0.18 + b.seed * 0.3); b.y += b.vy;
        if (b.y < surfaceAt(b.x) + 1) { v[colAt(b.x)] += 0.12 * b.r; if (foam.length < 120) foam.push({ x: b.x, life: 1, r: 0.6 + b.r * 0.9, drift: (rand() - 0.5) * 0.3 }); bubbles.splice(i, 1); }
      }
      for (let i = foam.length - 1; i >= 0; i--) { const fm = foam[i]; fm.life -= 0.011; fm.x += fm.drift; if (fm.life <= 0) foam.splice(i, 1); }
      // A mandal is reached when the water rises past its middle.
      if (started >= 0 && full < 0 && mandals.length) {
        const lv = level();
        for (let i = 0; i < mandals.length; i++) if (reached[i] < 0 && mandals[i].y > lv) reached[i] = t;
      }
      // On the full layer, now and then a drop lands where it can be seen.
      if (full >= 0 && t >= nextRain && seenFloor.length) {
        const m = seenFloor[Math.floor(rand() * seenFloor.length)];
        ripples.push({ x: m.x, y: m.y, at: t }); nextRain = t + RAIN_EVERY * (0.6 + 0.8 * rand());
      }
    };

    // ---- Drawing the water layer (the canvas between the layers).
    /** dy: how far the layer still has to fall into place, in the device's pixels. */
    const raw = (dy: number) => w.setTransform(1, 0, 0, 1, 0, dy);
    const css = (dy: number) => w.setTransform(k, 0, 0, k, 0, dy);
    const mapped = (dy: number) => w.setTransform(k * FIT[0], k * FIT[1], k * FIT[2], k * FIT[3], k * FIT[4], k * (FIT[5] + WATER) + dy);
    /** The pool light over whatever is clipped, laid flat on the layer and sliding with time. */
    const shimmer = (strength: number) => {
      if (!caustic) return;
      w.save(); w.globalCompositeOperation = "lighter";
      const sheets: Array<[number, number, number, number]> = [[0.025, 0.016, 0.94, 0.2], [-0.02, 0.022, 1.27, 0.14]];
      for (const [vx, vy, size, alpha] of sheets) {
        caustic.setTransform(new DOMMatrix().translate(t * vx, WATER + t * vy * TILT).scaleSelf(size, size * TILT));
        w.globalAlpha *= alpha * strength; w.fillStyle = caustic; w.fillRect(left - 20, top - 20, right - left + 40, bottom - top + 40); w.globalAlpha /= alpha * strength;
      }
      w.restore();
    };
    const curve = (path: Path2D) => {
      path.lineTo(px[0], py[0]);
      for (let i = 1; i < COLUMNS - 1; i++) path.quadraticCurveTo(px[i], py[i], (px[i] + px[i + 1]) / 2, (py[i] + py[i + 1]) / 2);
      path.lineTo(px[COLUMNS - 1], py[COLUMNS - 1]);
    };

    const drawWater = () => {
      raw(0); w.clearRect(0, 0, wc.width, wc.height);
      const dy = (depthAt(WATER_AT, t) - WATER) * k;
      w.save();
      // While the rings are still uncovering the State, the water layer shows only inside them.
      const reveal = revealAt(t);
      if (reveal < REACH) { css(0); w.beginPath(); w.ellipse(IMPACT.x, IMPACT.y, Math.max(0.1, reveal), Math.max(0.1, reveal * TILT), 0, 0, Math.PI * 2); w.clip(); }

      // 1. The glow round its edge, breathing once it is full.
      if (glow) { raw(dy); w.globalAlpha = 0.85 * (full >= 0 ? 0.8 + 0.2 * Math.sin(t / 1300) : 1); w.drawImage(glow, 0, 0); w.globalAlpha = 1; }
      // 2. Before the water: an empty glass of the State's shape, its lines faint on the floor.
      if (full < 0) {
        css(dy); w.fillStyle = "rgba(120, 210, 235, 0.045)"; w.fill(shape);
        raw(dy);
        if (inner) { w.globalAlpha = 0.6; w.drawImage(inner, 0, 0); }
        if (mesh) { w.globalAlpha = 0.4; w.drawImage(mesh, 0, 0); }
        w.globalAlpha = 1;
      }

      // 3. The water, seen from the side as it fills.
      const living = full >= 0 ? clamp((t - full - 250) / 700) : 0;
      if (started >= 0 && living < 1) {
        const lv = level(), fade = 1 - living;
        for (let i = 0; i < COLUMNS; i++) { px[i] = colX0 + i * colDX; py[i] = lv - h[i] + swell(px[i]); }
        w.save(); w.globalAlpha = fade;
        css(dy); w.clip(shape);
        // The far side of the surface, lighter, just behind.
        w.beginPath(); w.moveTo(px[0], bottom + 30);
        for (let i = 0; i < COLUMNS; i++) w.lineTo(px[i], py[i] - 2.5 - Math.sin(px[i] * 0.04 + t * 0.003) * 1.5);
        w.lineTo(px[COLUMNS - 1], bottom + 30); w.closePath();
        w.fillStyle = "rgba(90, 215, 238, 0.22)"; w.fill();
        // The body of water, lighter just under the surface and darker with depth.
        const body = new Path2D(); body.moveTo(px[0], bottom + 30); curve(body); body.lineTo(px[COLUMNS - 1], bottom + 30); body.closePath();
        const deep = w.createLinearGradient(0, lv - 7, 0, bottom);
        deep.addColorStop(0, "rgba(70, 208, 230, 0.96)"); deep.addColorStop(clamp(30 / Math.max(30, bottom - lv), 0.02, 0.35), "#0f6489"); deep.addColorStop(1, "#06243f");
        w.fillStyle = deep; w.fill(body);
        w.save(); w.clip(body);
        // The mandal lines on the floor, bent by the moving surface near the top.
        if (mesh) {
          raw(dy); w.globalAlpha = 0.8 * fade;
          const band = 80, strip = 3, y0 = Math.max(top, lv - 10), y1 = Math.min(bottom + 3, lv + band);
          for (let y = y0; y < y1; y += strip) {
            const shift = (Math.sin(y * 0.11 + t * 0.006) * 1.5 + Math.sin(y * 0.037 - t * 0.004) * 0.9) * (1 - clamp((y - lv) / band));
            w.drawImage(mesh, 0, y * k, mesh.width, strip * k, shift * k, y * k, mesh.width, strip * k);
          }
          w.save(); w.beginPath(); w.rect(0, y1 * k, mesh.width, mesh.height); w.clip(); w.drawImage(mesh, 0, 0); w.restore();
          w.globalAlpha = fade; css(dy);
        }
        shimmer(0.6);
        // Light coming through just under the surface.
        const lit = w.createLinearGradient(0, lv - 5, 0, lv + 34);
        lit.addColorStop(0, "rgba(170, 245, 255, 0.34)"); lit.addColorStop(1, "rgba(170, 245, 255, 0)");
        w.fillStyle = lit; w.fillRect(left - 12, lv - 12, right - left + 24, 50);
        // Bubbles: a thin ring and a point of light.
        w.lineWidth = 0.5;
        for (const b of bubbles) {
          w.strokeStyle = "rgba(205, 250, 255, 0.6)"; w.beginPath(); w.arc(b.x, b.y, b.r, 0, Math.PI * 2); w.stroke();
          w.fillStyle = "rgba(240, 254, 255, 0.85)"; w.beginPath(); w.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.25, b.r * 0.28), 0, Math.PI * 2); w.fill();
        }
        w.restore();
        // The glass's edges catch the light through the water.
        if (inner) { raw(dy); w.globalAlpha = 0.7 * fade; w.drawImage(inner, 0, 0); w.globalAlpha = fade; css(dy); }
        // The surface: a dark edge under a bright line, glints running along it.
        const line = new Path2D(); line.moveTo(px[0], py[0]); curve(line);
        w.strokeStyle = "rgba(2, 22, 38, 0.5)"; w.lineWidth = 2.5; w.stroke(line);
        const shine = w.createLinearGradient(left, 0, right, 0), stops: Array<[number, string]> = [[0, "rgba(190, 246, 255, 0.78)"], [1, "rgba(190, 246, 255, 0.78)"]];
        for (let j = 0; j < 6; j++) {
          const c = (j / 6 + t * 0.00006 * (j % 2 ? 1.3 : -1) + 10) % 1;
          stops.push([Math.max(0, c - 0.035), "rgba(190, 246, 255, 0.78)"], [c, "rgba(255, 255, 255, 1)"], [Math.min(1, c + 0.035), "rgba(190, 246, 255, 0.78)"]);
        }
        stops.sort((a, b) => a[0] - b[0]).forEach(([o, c]) => shine.addColorStop(o, c));
        w.shadowColor = "rgba(110, 236, 255, 0.95)"; w.shadowBlur = 8 * dpr; w.strokeStyle = shine; w.lineWidth = 1.3; w.stroke(line); w.shadowBlur = 0;
        // Foam riding the surface.
        for (const fm of foam) {
          w.fillStyle = `rgba(236, 253, 255, ${0.6 * fm.life})`;
          w.beginPath(); w.arc(fm.x, surfaceAt(fm.x) - 0.4, fm.r * (0.6 + 0.4 * fm.life), 0, Math.PI * 2); w.fill();
        }
        // Each mandal glints as the water reaches it.
        if (mandals.length) {
          mapped(dy);
          const width = 0.9 / ((k / dpr) * 0.5);
          for (let i = 0; i < mandals.length; i++) {
            if (reached[i] < 0) continue;
            const age = (t - reached[i]) / GLINT_MS;
            if (age >= 1) continue;
            const a = (1 - age) * (1 - age) * fade;
            w.fillStyle = `rgba(190, 250, 255, ${0.12 * a})`; w.fill(mandals[i].path);
            w.strokeStyle = `rgba(225, 253, 255, ${0.7 * a})`; w.lineWidth = width; w.stroke(mandals[i].path);
          }
        }
        w.restore();
      }

      // 4. Full: the layer is water, alive.
      if (living > 0) {
        w.save(); w.globalAlpha = living;
        raw(dy);
        if (base) w.drawImage(base, 0, 0);
        if (mesh) w.drawImage(mesh, 0, 0);
        css(dy); w.clip(shape);
        shimmer(1);
        w.globalCompositeOperation = "lighter";
        for (let i = 0; i < 2; i++) {
          const span = right - left + 400, shift = ((t * (0.026 + i * 0.009) + i * 240) % span) - 200;
          const band = w.createLinearGradient(left + shift - 90, top, left + shift + 90, bottom);
          band.addColorStop(0, "rgba(120, 235, 255, 0)"); band.addColorStop(0.5, `rgba(120, 235, 255, ${0.05 + i * 0.012})`); band.addColorStop(1, "rgba(120, 235, 255, 0)");
          w.fillStyle = band; w.fillRect(left - 20, top - 20, right - left + 40, bottom - top + 40);
        }
        w.globalCompositeOperation = "source-over";
        // Drops landing: a splash, the floor bent under the ring, and the rings lit from one side, all lying on the water.
        for (const rp of ripples) {
          const p = (t - rp.at) / RIPPLE_MS;
          if (p < 0 || p >= 1) continue;
          const fade = Math.pow(1 - p, 1.5), radius = 3 + easeOut(p) * Math.max(50, (right - left) * 0.16);
          if (p < 0.16) {
            const q = p / 0.16;
            w.save(); w.translate(rp.x, rp.y); w.scale(1, TILT);
            const splash = w.createRadialGradient(0, 0, 0, 0, 0, 4 + 14 * q);
            splash.addColorStop(0, `rgba(235, 254, 255, ${0.9 * (1 - q)})`); splash.addColorStop(1, "rgba(160, 245, 255, 0)");
            w.fillStyle = splash; w.beginPath(); w.arc(0, 0, 4 + 14 * q, 0, Math.PI * 2); w.fill(); w.restore();
          }
          if (mesh && base) {
            w.save();
            w.beginPath(); w.ellipse(rp.x, rp.y, radius + 5, (radius + 5) * TILT, 0, 0, Math.PI * 2);
            w.ellipse(rp.x, rp.y, Math.max(0, radius - 5), Math.max(0, radius - 5) * TILT, 0, 0, Math.PI * 2, true); w.clip();
            raw(dy);
            const X = rp.x * k, Y = rp.y * k; w.translate(X, Y); w.scale(1.045, 1.045); w.translate(-X, -Y);
            w.globalAlpha = living * fade; w.drawImage(base, 0, 0); w.drawImage(mesh, 0, 0);
            w.restore();
          }
          w.save(); w.translate(rp.x, rp.y); w.scale(1, TILT);
          for (let j = 0; j < 3; j++) { const r = radius - j * 8; if (r > 2) litRing(w, r, (0.85 - j * 0.24) * fade * living, 1.8 - j * 0.45); }
          w.restore();
        }
        if (inner) { raw(dy); w.globalAlpha = 0.5 * living; w.drawImage(inner, 0, 0); }
        w.restore();
      }

      // 5. Spray in the air, inside the glass.
      if (spray.length) {
        w.save(); css(dy); w.clip(shape); w.fillStyle = "rgba(214, 250, 255, 0.92)";
        for (const s of spray) {
          const speed = Math.hypot(s.vx, s.vy);
          w.save(); w.translate(s.x, s.y); w.rotate(Math.atan2(s.vy, s.vx));
          w.beginPath(); w.ellipse(0, 0, s.r * (1 + Math.min(2, speed * 0.4)), s.r * 0.85, 0, 0, Math.PI * 2); w.fill(); w.restore();
        }
        w.restore();
      }

      // The layer's edge flashes as it lands.
      if (rim && full < 0) {
        const lands = UNFOLD + WATER_AT * UNFOLD_GAP + UNFOLD_MS * 0.42, flash = Math.exp(-(((t - lands) / 260) ** 2));
        if (flash > 0.02) { raw(dy); w.globalCompositeOperation = "lighter"; w.globalAlpha = flash; w.drawImage(rim, 0, 0); }
      }
      w.restore();
    };

    // ---- The SVG: everything starts where the landing begins, and is placed frame by frame until it ends.
    let seen = false, landed = false, uncovered = false;
    const settled = STACK.map(() => false);
    const arm = () => {
      layers.forEach(el => el?.setAttribute("transform", "translate(0 0)"));
      groups.forEach(g => g.setAttribute("clip-path", `url(#${g.dataset.revealGroup})`));
      reveals.forEach(e => { e.setAttribute("rx", "0"); e.setAttribute("ry", "0"); });
      fades.forEach(el => { el.style.opacity = "0"; });
      rivers.forEach(({ p, length }) => { p.style.strokeDasharray = `${length} ${length}`; p.style.strokeDashoffset = `${length}`; });
      box.dataset.landing = "armed";
    };
    const pose = (time: number) => {
      if (!uncovered) {
        const r = revealAt(time);
        if (r >= REACH) { uncovered = true; groups.forEach(g => g.removeAttribute("clip-path")); }
        else reveals.forEach(e => { e.setAttribute("rx", r.toFixed(1)); e.setAttribute("ry", (r * TILT).toFixed(1)); });
      }
      layers.forEach((el, i) => {
        if (!el || settled[i]) return;
        const p = clamp((time - UNFOLD - i * UNFOLD_GAP) / UNFOLD_MS);
        el.setAttribute("transform", `translate(0 ${(STACK[i] * settle(p)).toFixed(2)})`);
        if (p >= 1) settled[i] = true;
      });
      for (const el of fades) {
        const spec = FADES[el.dataset.fade ?? ""];
        if (spec) el.style.opacity = easeOut(clamp((time - spec[0]) / spec[1])).toFixed(3);
      }
      const e = easeInOut(clamp((time - RIVER_AT) / RIVER_MS));
      for (const { p, length } of rivers) p.style.strokeDashoffset = (length * (1 - e)).toFixed(1);
    };
    const finish = () => {
      layers.forEach((el, i) => el?.setAttribute("transform", `translate(0 ${STACK[i]})`));
      groups.forEach(g => g.removeAttribute("clip-path"));
      fades.forEach(el => { el.style.opacity = ""; });
      rivers.forEach(({ p }) => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; });
      f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, fc.width, fc.height);
      landed = true; uncovered = true;
      box.dataset.landing = "done";
    };

    // ---- The drop and its rings across the land (the top canvas).
    const glinted = new Float64Array(geometry.nodes.length).fill(-1);
    const drawLight = (time: number) => {
      f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, fc.width, fc.height);
      f.setTransform(k, 0, 0, k, 0, 0);
      if (time < DROP) {
        const p = easeIn(time / DROP), x = IMPACT.x, y = 24 + (IMPACT.y - 24) * p;
        const trail = f.createLinearGradient(x, y - 90 * p - 8, x, y);
        trail.addColorStop(0, "rgba(140, 240, 255, 0)"); trail.addColorStop(1, "rgba(160, 245, 255, 0.55)");
        f.strokeStyle = trail; f.lineWidth = 1.3; f.beginPath(); f.moveTo(x, y - 90 * p - 8); f.lineTo(x, y); f.stroke();
        const halo = f.createRadialGradient(x, y, 0, x, y, 18);
        halo.addColorStop(0, "rgba(150, 245, 255, 0.5)"); halo.addColorStop(1, "rgba(150, 245, 255, 0)");
        f.fillStyle = halo; f.beginPath(); f.arc(x, y, 18, 0, Math.PI * 2); f.fill();
        f.save(); f.translate(x, y); f.scale(1, 1 + 0.9 * p); f.fillStyle = "#e6fdff";
        f.beginPath(); f.moveTo(0, -6); f.bezierCurveTo(4, -1, 4, 4, 0, 4); f.bezierCurveTo(-4, 4, -4, -1, 0, -6); f.fill(); f.restore();
      }
      const since = time - DROP;
      if (since < 0 || since >= RING_MS + 2 * RING_GAP + NODE_GLINT_MS) return;
      // The splash, flat on the ground.
      if (since < 520) {
        const p = since / 520;
        f.save(); f.translate(IMPACT.x, IMPACT.y); f.scale(1, TILT);
        const flash = f.createRadialGradient(0, 0, 0, 0, 0, 8 + 40 * p);
        flash.addColorStop(0, `rgba(230, 253, 255, ${0.9 * (1 - p)})`); flash.addColorStop(1, "rgba(150, 245, 255, 0)");
        f.fillStyle = flash; f.beginPath(); f.arc(0, 0, 8 + 40 * p, 0, Math.PI * 2); f.fill(); f.restore();
      }
      // Light washing over the land just behind the first ring.
      const r1 = revealAt(time);
      if (since < RING_MS) {
        f.save(); f.clip(ground); f.translate(IMPACT.x, IMPACT.y); f.scale(1, TILT);
        const band = f.createRadialGradient(0, 0, Math.max(0, r1 - 70), 0, 0, r1 + 2);
        band.addColorStop(0, "rgba(214, 245, 200, 0)"); band.addColorStop(0.85, `rgba(214, 245, 200, ${0.2 * (1 - since / RING_MS)})`); band.addColorStop(1, "rgba(214, 245, 200, 0)");
        f.globalCompositeOperation = "lighter"; f.fillStyle = band; f.fillRect(-r1 - 10, -r1 - 10, 2 * r1 + 20, 2 * r1 + 20);
        f.restore();
      }
      // The rings themselves, lying on the ground.
      for (let j = 0; j < 3; j++) {
        const rt = since - j * RING_GAP;
        if (rt < 0 || rt > RING_MS) continue;
        const p = rt / RING_MS, r = easeOut(p) * REACH;
        f.save(); f.translate(IMPACT.x, IMPACT.y); f.scale(1, TILT);
        f.strokeStyle = `rgba(160, 245, 255, ${0.6 * (1 - p) * (j ? 0.6 : 1)})`; f.lineWidth = j ? 1.1 : 1.8;
        f.beginPath(); f.arc(0, 0, r, 0, Math.PI * 2); f.stroke(); f.restore();
      }
      // Each sensor point on the land glints as the first ring reaches it.
      geometry.nodes.forEach(([x, y], i) => {
        if (glinted[i] < 0 && planar(x, y, IMPACT.x, IMPACT.y) <= r1) glinted[i] = time;
        if (glinted[i] < 0) return;
        const age = (time - glinted[i]) / NODE_GLINT_MS;
        if (age >= 1) return;
        const a = (1 - age) * (1 - age);
        const halo = f.createRadialGradient(x, y, 0, x, y, 7);
        halo.addColorStop(0, `rgba(220, 255, 210, ${0.55 * a})`); halo.addColorStop(1, "rgba(220, 255, 210, 0)");
        f.fillStyle = halo; f.beginPath(); f.arc(x, y, 7, 0, Math.PI * 2); f.fill();
        f.save(); f.translate(x, y); f.scale(1, TILT); f.strokeStyle = `rgba(225, 255, 215, ${0.6 * a})`; f.lineWidth = 0.8;
        f.beginPath(); f.arc(0, 0, 2 + 10 * age, 0, Math.PI * 2); f.stroke(); f.restore();
      });
    };

    // ---- Time.
    let raf = 0, last = 0, carry = 0, before = -1;
    let still = media.matches;
    /** Where the land's own cycle is, read from its recharge pulse so the water answers in step with it. */
    const cycle = () => {
      const time = pulse?.getAnimations?.()[0]?.currentTime;
      return typeof time === "number" ? (time % CYCLE) / CYCLE : ((((t - DONE) % CYCLE) + CYCLE) % CYCLE) / CYCLE;
    };
    const tick = (now: number) => {
      if (still) { raf = 0; return; }
      raf = requestAnimationFrame(tick);
      if (hold.current || !seen) { last = 0; return; }
      if (!last) last = now;
      carry += Math.min(120, now - last); last = now;
      while (carry >= STEP) { stepWater(); carry -= STEP; }
      if (!landed) {
        if (box.dataset.landing === "armed") box.dataset.landing = "running";
        pose(t);
        drawLight(t);
        if (t >= DONE) finish();
      } else {
        // Each of the land's recharge pulses rings out where it reaches the water.
        const phase = cycle();
        if (before >= 0 && before < ARRIVES && phase >= ARRIVES) RECHARGE.forEach(p => ripples.push({ x: p.x, y: p.y + WATER, at: t }));
        before = phase;
      }
      while (ripples.length && t - ripples[0].at > RIPPLE_MS) ripples.shift();
      drawWater();
    };
    /** Reduced motion: the picture landed, the layer full, and nothing moving. */
    const drawStill = () => {
      if (!landed) finish();
      t = Math.max(t, DONE);
      if (started < 0) started = t - FILL_MS;
      fill = 1; full = t - 2400;
      reached.fill(t - GLINT_MS);
      h.fill(0); v.fill(0); slosh = 0; spray.length = 0; bubbles.length = 0; foam.length = 0; ripples.length = 0;
      drawWater();
    };

    let live = true;
    fetch(`${BASE}/geo/mandal-outlines.json`).then(r => (r.ok ? r.json() as Promise<Outlines> : null)).then(o => {
      if (!live || !o) return;
      const fit = new DOMMatrix([FIT[0], FIT[1], FIT[2], FIT[3], FIT[4], FIT[5] + WATER]);
      const l = new Path2D(), d = new Path2D();
      mandals = o.mandals.map(outline => {
        const m = middle(outline), path = new Path2D(outline);
        l.addPath(path, fit);
        return { path, x: FIT[0] * m.x + FIT[2] * m.y + FIT[4], y: FIT[1] * m.x + FIT[3] * m.y + FIT[5] + WATER };
      });
      d.addPath(new Path2D(o.districts), fit);
      lines = l; districts = d; drawMesh();
      const visible = mandals.filter(m => open(m.x, m.y));
      if (visible.length) seenFloor = visible;
      // Mandals the water already passed while the lines were loading are counted as reached, without a glint.
      const lv = level();
      reached = new Float64Array(mandals.length).fill(-1);
      if (started >= 0) mandals.forEach((m, i) => { if (full >= 0 || m.y > lv) reached[i] = t - GLINT_MS; });
      if (still || landed) drawWater();
    }).catch(() => { /* The water is drawn without the lines. */ });

    // The landing waits until the picture is on screen, so a phone that scrolls down to it sees the drop fall.
    const watch = new IntersectionObserver(entries => { if (entries.some(e => e.intersectionRatio >= 0.35)) { seen = true; watch.disconnect(); } }, { threshold: [0, 0.35, 0.6] });
    watch.observe(box);
    const resize = new ResizeObserver(() => { layout(); if (still || landed) drawWater(); });
    resize.observe(box);
    const motion = () => {
      still = media.matches;
      if (still) { cancelAnimationFrame(raf); raf = 0; drawStill(); }
      else if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    };
    media.addEventListener("change", motion);
    if (still) drawStill();
    else { arm(); raf = requestAnimationFrame(tick); }
    return () => { live = false; cancelAnimationFrame(raf); watch.disconnect(); resize.disconnect(); media.removeEventListener("change", motion); };
  }, []);

  const phase = (i: number): CSSProperties => ({ "--delay": `${-(i * 0.73)}s` } as CSSProperties);
  return (
    <div ref={stage} className={styles.stage} data-landing="ssr" data-testid="welcome-landscape">
      {/* Beneath the water: the deep layers, and the ground's glow. */}
      <svg viewBox="0 0 820 700" fill="none" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="wl-rock-low" x1="300" y1="300" x2="360" y2="650" gradientUnits="userSpaceOnUse"><stop stopColor="#426c66" stopOpacity=".48"/><stop offset="1" stopColor="#173f49" stopOpacity=".12"/></linearGradient>
          <radialGradient id="wl-glow"><stop stopColor="#39a99d" stopOpacity=".17"/><stop offset="1" stopColor="#39a99d" stopOpacity="0"/></radialGradient>
          <clipPath id="wl-reveal-low"><ellipse data-reveal cx={IMPACT.x} cy={IMPACT.y} rx="0" ry="0"/></clipPath>
        </defs>
        <g data-fade="ground">
          <ellipse cx="420" cy="405" rx="390" ry="270" fill="url(#wl-glow)"/>
          <g stroke="#73b7b4" strokeOpacity=".14" strokeWidth=".65">
            {[0,1,2,3].map(i => <ellipse key={i} cx="430" cy="555" rx={175+i*57} ry={44+i*17} transform="rotate(-15 430 555)" className={styles.ripple} style={phase(i)}/>)}
            <path d="M90 550 760 370M150 650 745 480" strokeDasharray="3 9"/>
          </g>
        </g>
        <g data-reveal-group="wl-reveal-low">
          <path data-layer="170" d={geometry.path} transform="translate(0 170)" fill="#0b262f" stroke="#41626b" strokeOpacity=".55" strokeWidth=".8"/>
          {[145,133,121].map(y => <path key={y} data-layer={y} d={geometry.path} transform={`translate(0 ${y})`} fill="url(#wl-rock-low)" stroke="#5f8e8e" strokeOpacity=".23" strokeWidth=".7"/>)}
        </g>
      </svg>

      {/* The water layer. */}
      <canvas ref={waterCanvas} aria-hidden="true" />

      {/* The land, the layers between it and the water, and the words. */}
      <svg className={styles.scene} viewBox="0 0 820 700" fill="none" role="img" aria-labelledby="water-landscape-title water-landscape-description">
        <title id="water-landscape-title">Beneath the monsoon</title>
        <desc id="water-landscape-description">An illustrative Andhra Pradesh landscape connects monsoon rain and crop rows with groundwater in rock and sediment. A drop lands on the land, the layers beneath it settle into place, and water wells up and rises through a cyan water-bearing layer drawn with the State&apos;s mandal lines, which then stays alive as drops and recharge pulses ring out across it. An illustrative assessment trace responds. This is not measured data, an actual well map, or a geological cross-section.</desc>
        <defs>
          <linearGradient id="wl-land" x1="160" y1="160" x2="570" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#164e4c"/><stop offset=".5" stopColor="#22695a"/><stop offset="1" stopColor="#083b41"/></linearGradient>
          <linearGradient id="wl-edge" x1="130" y1="130" x2="540" y2="460" gradientUnits="userSpaceOnUse"><stop stopColor="#b2e9bc"/><stop offset=".55" stopColor="#79dbbf"/><stop offset="1" stopColor="#459d93"/></linearGradient>
          <linearGradient id="wl-rock" x1="300" y1="300" x2="360" y2="650" gradientUnits="userSpaceOnUse"><stop stopColor="#426c66" stopOpacity=".48"/><stop offset="1" stopColor="#173f49" stopOpacity=".12"/></linearGradient>
          <linearGradient id="wl-rain" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#8ce7f2" stopOpacity="0"/><stop offset="1" stopColor="#b4f5fa" stopOpacity=".95"/></linearGradient>
          <radialGradient id="wl-cloud"><stop stopColor="#86b8b2" stopOpacity=".13"/><stop offset="1" stopColor="#86b8b2" stopOpacity="0"/></radialGradient>
          <pattern id="wl-grid" width="35" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-17)"><path d="M35 0H0V22" stroke="#abdcb2" strokeOpacity=".12" strokeWidth=".6"/></pattern>
          <clipPath id="wl-clip"><path d={geometry.path}/></clipPath>
          <clipPath id="wl-reveal"><ellipse data-reveal cx={IMPACT.x} cy={IMPACT.y} rx="0" ry="0"/></clipPath>
          <filter id="wl-soft"><feGaussianBlur stdDeviation="2.5"/></filter>
        </defs>

        <g data-reveal-group="wl-reveal">
          <path data-layer="57" d={geometry.path} transform="translate(0 57)" fill="url(#wl-rock)" stroke="#90ada0" strokeOpacity=".45" strokeWidth=".8"/>
          {[38,30,22,14].map(y => <path key={y} data-layer={y} d={geometry.path} transform={`translate(0 ${y})`} fill="#0e3638" stroke="#67a397" strokeOpacity=".3" strokeWidth=".65"/>)}
          <path d={geometry.path} fill="url(#wl-land)" stroke="url(#wl-edge)" strokeWidth="1.4"/>
          <g clipPath="url(#wl-clip)">
            <path d={geometry.path} fill="url(#wl-grid)"/>
            {Array.from({length:14},(_,i)=><path key={i} d={`M40 ${150+i*21}Q180 ${80+i*21} 320 ${180+i*21}T700 ${120+i*21}`} stroke="#a3d4ab" strokeOpacity=".15" strokeWidth=".7"/>)}
            {/* Small cultivated parcels keep agriculture visibly tied to the land. */}
            {[{x:270,y:342},{x:437,y:251},{x:596,y:186}].map(({x,y},i)=><g key={i} transform={`translate(${x} ${y}) rotate(-18) skewX(25)`}>
              <rect x="-24" y="-16" width="56" height="34" fill="#6b8956" fillOpacity=".35" stroke="#c4d694" strokeWidth=".8"/>
              {[-10,-2,6,14].map(row=><g key={row} stroke="#c6df98" strokeWidth="1" strokeOpacity=".85">
                <path d={`M-20 ${row}h48`}/>
                {[-14,-2,10,22].map(col=><path key={col} d={`M${col} ${row}v-5m0 3-3-2m3 1 3-3`} strokeWidth=".8"/>)}
              </g>)}
              <path d="M0-16v34" stroke="#254c3e" strokeWidth="2"/>
            </g>)}
            {RIVERS.map(d => <path key={d} data-river d={d} stroke="#99e9d8" strokeWidth="2" strokeOpacity=".65"/>)}
            {RIVERS.map(d => <path key={`${d} glow`} data-river d={d} stroke="#9bffdb" strokeWidth="7" strokeOpacity=".16" filter="url(#wl-soft)"/>)}
            {/* The rivers run toward the coast. */}
            <path data-fade="flow" className={styles.riverFlow} d={RIVERS.join("")} stroke="#e6fff5" strokeWidth="1.1" strokeOpacity=".6" strokeLinecap="round"/>
            {geometry.nodes.map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="2" fill="#d5f4ba" opacity=".8"/>{i%3===0&&<circle className={styles.signal} style={phase(i)} cx={x} cy={y} r="7" stroke="#c4efaf" strokeWidth=".8"/>}</g>)}
          </g>
        </g>

        {/* Light and small points suggest recharge without adding physical structures. */}
        <g data-fade="recharge">
          {RECHARGE.map(({x,y},i)=><g key={i} transform={`translate(${x} ${y})`}>
            <circle r="2.5" fill="#d5f4ba" opacity=".85"/>
            <ellipse cy="103" rx="5" ry="2" fill="#c0f6fc" opacity=".8"/>
            <ellipse className={styles.measurementResponse} cy="103" rx="13" ry="5" stroke="#8beefd" strokeWidth="1"/>
            <path className={styles.rechargePulse} data-cycle={i === 0 ? "" : undefined} d="M0 8c-8 29 8 58 0 90" pathLength="100" stroke="#8fefff" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="7 100"/>
          </g>)}
          <path d="M520 339h45l18 32h114" stroke="#76deef" strokeOpacity=".6" strokeWidth=".7"/>
          <text x="590" y="362" className={styles.waterTableLabel}>WATER TABLE</text>
          <text x="590" y="388" className={styles.waterTableSub}>Recharge beneath the surface</text>
        </g>

        <g className={styles.rain} data-fade="rain">
          {geometry.nodes.filter((_,i)=>i%2===0).map(([x,y],i)=><g key={i} className={styles.rainDrop}><path d={`M${x} ${y-110-(i%3)*12}v42`} stroke="url(#wl-rain)" strokeWidth="1.6"/><circle cx={x} cy={y-67-(i%3)*12} r="1.6" fill="#cbf8ff" opacity=".85"/></g>)}
        </g>
        <g className={styles.clouds} data-fade="clouds">
          <ellipse cx="450" cy="132" rx="220" ry="64" fill="url(#wl-cloud)"/>
          <ellipse cx="320" cy="205" rx="190" ry="62" fill="url(#wl-cloud)"/>
          <ellipse cx="555" cy="96" rx="165" ry="52" fill="url(#wl-cloud)"/>
        </g>

        <g className={styles.sceneLabels}>
          <g data-fade="monsoon">
            <path d="M526 103h90l22-22h64"/><circle cx="526" cy="103" r="2"/>
            <text x="605" y="67">MONSOON &amp; RECHARGE</text><text x="605" y="101" className={styles.labelSub}>Rain above. Recharge below.</text>
          </g>
          <g data-fade="fields">
            <path d="M180 317h-61l-23-23H32"/><circle cx="180" cy="317" r="2"/>
            <text x="18" y="270">FIELDS &amp; SOIL MOISTURE</text><text x="18" y="286" className={styles.labelSub}>The water that supports a season</text>
          </g>
          <g data-fade="groundwater">
            <path d="M440 403h100l28 37h192"/><circle cx="440" cy="403" r="2"/>
            <text x="560" y="427" className={styles.groundwaterLabel}>GROUNDWATER &amp; ASSESSMENT</text><text x="560" y="456" className={styles.labelSub}>Water held in rock and sediment</text>
          </g>
          <g data-fade="names">
            <text x="500" y="333" transform="rotate(-24 500 333)" className={styles.stateLabel}>ANDHRA PRADESH</text>
            <text x="644" y="293" transform="rotate(-24 644 293)" className={styles.seaLabel}>BAY OF BENGAL</text>
          </g>
        </g>
        <g transform="translate(448 508)" data-fade="assessment">
          <path d="M0 0h266M0 107h266" stroke="#6bafb9" strokeOpacity=".4" strokeWidth=".7"/>
          <text y="19" className={styles.assessmentTitle}>READ THE WATER BELOW</text>
          <text y="36" className={styles.assessmentNote}>Observation → assessment → outlook</text>
          <path d="M0 87h260M0 51v36" stroke="#648c9d" strokeWidth=".6"/>
          <path d="m7 72 25 3 25-15 25 6 25-12 25 8 25-11 25 8" stroke="#7ce4f4" strokeOpacity=".24" strokeWidth="1.5"/>
          <path className={styles.assessmentTrace} pathLength="100" d="m7 72 25 3 25-15 25 6 25-12 25 8 25-11 25 8" stroke="#9af1fc" strokeWidth="1.8"/>
          <path d="m182 59 25-5 25 4 25-13v28l-25-7-25 4-25-11Z" fill="#56bdcf" fillOpacity=".12"/>
          <path d="m182 59 25 3 25 0 25-4" stroke="#b8d4bd" strokeWidth="1.2" strokeDasharray="3 4"/>
          <text y="100" className={styles.assessmentNote}>ILLUSTRATIVE TRACE · NO LIVE READINGS</text>
        </g>
        <g transform="translate(744 566)" stroke="#83aaa8" strokeWidth=".8" data-fade="north"><path d="M0 20V-20l-4 9m4-9 4 9M-10 0h20"/><text y="-30" textAnchor="middle" fill="#83aaa8" stroke="none" fontSize="9">N</text></g>
      </svg>

      {/* The drop and its rings. */}
      <canvas ref={lightCanvas} aria-hidden="true" />
    </div>
  );
}
