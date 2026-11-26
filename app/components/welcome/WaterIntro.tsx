"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./WaterIntro.module.css";

/* Water fills the State, the way water fills a jug. A drop lands and its rings find the State,
   an empty glass of its own shape. Then a stream pours in from above: it lands in the southern
   tip, throws spray that falls back in, drives bubbles down that rise and burst into foam, and
   the water climbs at the speed a steady pour gives a vessel this shape (quick through the
   narrow south, slower through the wide middle, quick again up the north coast), the stream
   following the water so it always lands in it. The surface is a row of springs, so every
   splash runs along it and back. Each mandal glints as the water reaches it, counted as it
   goes. Once full, the State stays water: pool light moves over its floor, and now and then a
   drop lands and rings out, bending the mandal lines beneath it.

   One canvas, drawn from the site's own mandal outlines (/geo/mandal-outlines.json); no video
   and no images. The simulation steps 60 times a second whatever the screen, rests while the tab
   is hidden, and with reduced motion the full State is drawn once, still. Illustration, not data. */

type Outlines = { view: { width: number; height: number }; mandals: string[]; districts: string };
type Mandal = { path: Path2D; cx: number; cy: number };
type Bit = { x: number; y: number; vx: number; vy: number; r: number; seed: number };
type Foam = { x: number; life: number; r: number; drift: number };
type Ripple = { x: number; y: number; at: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The first drop lands, its rings find the State, then the stream starts. The fill is timed from when it lands. */
const DROP_MS = 700, REVEAL_MS = 1500, STREAM_AT = 1150, FILL_MS = 4600, TAP_CLOSES = 0.94;
/** The simulation's step: 60 a second, whatever the screen's refresh. */
const STEP = 1000 / 60;
/** The stream falls under this gravity (px per ms²), the spray under this one (px per step²). */
const G_STREAM = 0.0045, G_SPRAY = 0.2;
/** The surface as a row of springs: how many, how stiff, how quickly they calm, how far a push spreads. */
const COLUMNS = 180, SPRING = 0.02, DAMPING = 0.012, SPREAD = 0.25;
const GLINT_MS = 800, RAIN_EVERY = 1700, RING_MS = 3200;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeIn = (p: number) => p * p * p;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

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

/** Light on the bottom of a pool: a net of bright lines that repeats seamlessly, drawn once.
    Two copies slide across the water in different directions, and where they cross it shimmers. */
function causticTile(size = 256) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d")!, img = g.createImageData(size, size);
  const k = (n: number) => (Math.PI * 2 * n) / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.sin(x * k(3) + 2.2 * Math.sin(y * k(2))) + Math.sin(y * k(3) + 2.2 * Math.sin(x * k(4)))
      + Math.sin((x + y) * k(2) + 1.6 * Math.sin((x - y) * k(1)));
    const line = Math.pow(1 - Math.min(1, Math.abs(v) / 1.15), 5), i = (y * size + x) * 4;
    img.data[i] = 175; img.data[i + 1] = 243; img.data[i + 2] = 255; img.data[i + 3] = Math.round(255 * line);
  }
  g.putImageData(img, 0, 0);
  return c;
}

let pending: Promise<Outlines> | null = null;
const load = () => (pending ??= fetch(`${BASE}/geo/mandal-outlines.json`).then(r => {
  if (!r.ok) throw new Error(`outlines ${r.status}`);
  return r.json() as Promise<Outlines>;
}));

/** A seeded sequence, so the water falls the same way every time. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function WaterIntro({ onDone, caption }: { onDone?: () => void; caption?: React.ReactNode }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLElement>(null);
  const skipRequest = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [phase, setPhase] = useState<"drop" | "fill" | "full">("drop");
  const [run, setRun] = useState(0);
  const [still, setStill] = useState(false);

  useEffect(() => {
    let live = true;
    load().then(o => { if (live) setOutlines(o); }).catch(() => { if (live) setPhase("full"); });
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    return () => { live = false; };
  }, []);

  const skip = useCallback(() => { if (phase !== "full") skipRequest.current = true; }, [phase]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" || e.key === " " || e.key === "Enter") skip(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [skip]);

  useEffect(() => {
    if (!outlines || !canvas.current || !frame.current) return;
    const el = canvas.current, box = frame.current, ctx = el.getContext("2d");
    if (!ctx) return;
    const total = outlines.mandals.length;
    const mandals: Mandal[] = outlines.mandals.map(d => { const m = middle(d); return { path: new Path2D(d), cx: m.x, cy: m.y }; });
    const state = new Path2D(outlines.mandals.join(" "));
    const districts = new Path2D(outlines.districts);
    const xs = mandals.map(m => m.cx), ys = mandals.map(m => m.cy), pad = 18;
    const ext = { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad * 1.6, y1: Math.max(...ys) + pad * 1.6 };
    const centre = { x: xs.reduce((a, b) => a + b, 0) / total, y: ys.reduce((a, b) => a + b, 0) / total };
    const rand = seeded(11);
    const rainAt = Array.from({ length: 64 }, () => mandals[Math.floor(rand() * total)]);
    const caustic = ctx.createPattern(causticTile(), "repeat");

    // ---- Layout: where the State sits, its true rows, and the layers drawn once per size.
    let W = 1, H = 1, dpr = 1, scale = 1, ox = 0, oy = 0, top = 0, bottom = 0, left = 0, right = 0;
    let glow: HTMLCanvasElement | null = null, inner: HTMLCanvasElement | null = null;
    let mesh: HTMLCanvasElement | null = null, base: HTMLCanvasElement | null = null;
    const ROW = 0.5; // the State's rows are read at half resolution
    let mids = new Float32Array(0);
    const levelLUT = new Float32Array(513);
    const offscreen = (mapped = true) => {
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr));
      const g = c.getContext("2d")!;
      if (mapped) g.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
      return [c, g] as const;
    };
    const layout = () => {
      W = Math.max(1, box.clientWidth); H = Math.max(1, box.clientHeight); dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
      const wide = W / H >= 1.15;
      const area = wide ? { x: W * 0.36, y: H * 0.06, w: W * 0.6, h: H * 0.88 } : { x: W * 0.04, y: H * 0.07, w: W * 0.92, h: H * 0.58 };
      const ew = ext.x1 - ext.x0, eh = ext.y1 - ext.y0;
      scale = Math.min(area.w / ew, area.h / eh);
      ox = area.x + (area.w - ew * scale) / 2 - ext.x0 * scale;
      oy = area.y + (area.h - eh * scale) / 2 - ext.y0 * scale;

      // The State's own rows: how wide it is at each height, and the middle of its widest stretch.
      const mc = document.createElement("canvas"); mc.width = Math.ceil(W * ROW); mc.height = Math.ceil(H * ROW);
      const mg = mc.getContext("2d", { willReadFrequently: true })!;
      mg.setTransform(scale * ROW, 0, 0, scale * ROW, ox * ROW, oy * ROW); mg.fillStyle = "#fff"; mg.fill(state);
      const img = mg.getImageData(0, 0, mc.width, mc.height).data;
      const widths = new Float32Array(mc.height);
      mids = new Float32Array(mc.height).fill(NaN);
      let first = -1, last = -1, minX = Infinity, maxX = -Infinity;
      for (let r = 0; r < mc.height; r++) {
        let n = 0, best = 0, bestMid = NaN, run = 0, start = 0;
        for (let x = 0; x <= mc.width; x++) {
          const on = x < mc.width && img[(r * mc.width + x) * 4 + 3] > 127;
          if (on) { if (!run) start = x; run += 1; n += 1; if (x < minX) minX = x; if (x > maxX) maxX = x; }
          else if (run) { if (run > best) { best = run; bestMid = (start + x - 1) / 2; } run = 0; }
        }
        widths[r] = n / ROW; mids[r] = bestMid / ROW;
        if (n) { if (first < 0) first = r; last = r; }
      }
      top = first / ROW; bottom = (last + 1) / ROW; left = minX / ROW; right = (maxX + 1) / ROW;
      // How high the water stands once a share of the State's area is poured in from the bottom.
      const rowH = 1 / ROW;
      let totalArea = 0;
      for (let r = first; r <= last; r++) totalArea += widths[r] * rowH;
      let acc = 0, r = last;
      for (let i = 0; i <= 512; i++) {
        const want = (i / 512) * totalArea;
        while (r >= first && acc + widths[r] * rowH < want) { acc += widths[r] * rowH; r -= 1; }
        const share = r >= first && widths[r] > 0 ? clamp((want - acc) / (widths[r] * rowH)) : 1;
        levelLUT[i] = (r + 1 - share) / ROW;
      }

      // The glow outside the coast: the State's fill with a soft light, then the fill taken out.
      const [gc, g] = offscreen();
      g.shadowColor = "rgba(94, 231, 255, 0.8)"; g.shadowBlur = 24 * dpr; g.fillStyle = "#5ee7ff"; g.fill(state);
      g.shadowBlur = 0; g.globalCompositeOperation = "destination-out"; g.fill(state);
      glow = gc;
      // The glass: light from outside bleeding just inside the edge, so the State reads as a vessel.
      const [oc, o] = offscreen(false);
      o.fillStyle = "#000"; o.fillRect(0, 0, oc.width, oc.height);
      o.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy); o.globalCompositeOperation = "destination-out"; o.fill(state);
      const [ic, ig] = offscreen();
      ig.clip(state); ig.setTransform(1, 0, 0, 1, 0, 0);
      ig.shadowColor = "rgba(160, 242, 255, 0.8)"; ig.shadowBlur = 16 * dpr; ig.shadowOffsetX = oc.width + 400;
      ig.drawImage(oc, -(oc.width + 400), 0);
      inner = ic;
      // The floor: every mandal line, and the district lines a little brighter.
      const [mc2, m] = offscreen();
      m.strokeStyle = "rgba(170, 240, 255, 0.17)"; m.lineWidth = 0.8 / scale; mandals.forEach(md => m.stroke(md.path));
      m.strokeStyle = "rgba(190, 248, 255, 0.45)"; m.lineWidth = 1.5 / scale; m.stroke(districts);
      mesh = mc2;
      // The full State as still water, under the living surface.
      const [bc, b] = offscreen();
      const ty = (top - oy) / scale, by = (bottom - oy) / scale;
      const deep = b.createLinearGradient(0, ty - 30, 0, by);
      deep.addColorStop(0, "#2aa9c6"); deep.addColorStop(0.18, "#137aa0"); deep.addColorStop(1, "#072b49");
      b.fillStyle = deep; b.fill(state);
      base = bc;
    };
    layout();
    const rowMid = (y: number) => {
      for (let r = Math.floor(y * ROW); r < mids.length && r >= 0; r++) if (!Number.isNaN(mids[r])) return mids[r];
      return NaN;
    };
    const levelAt = (f: number) => { const u = clamp(f) * 512, i = Math.min(511, Math.floor(u)); return levelLUT[i] + (levelLUT[i + 1] - levelLUT[i]) * (u - i); };

    // ---- The water and everything in it.
    const h = new Float32Array(COLUMNS), v = new Float32Array(COLUMNS), lD = new Float32Array(COLUMNS), rD = new Float32Array(COLUMNS);
    const px = new Float32Array(COLUMNS), py = new Float32Array(COLUMNS);
    const spray: Bit[] = [], bubbles: Bit[] = [], foam: Foam[] = [], ripples: Ripple[] = [];
    const history: number[] = []; // time, x, time, x … where the stream has been aimed
    const reached = new Float64Array(total).fill(-1);
    let t = 0, fill = 0, landed = -1, closed = -1, full = -1, pourX = NaN, nextRain = Infinity, rainIndex = 0, n = 0;
    /** The whole surface rocking from side to side, as water does in a tank once something lands in it. */
    let slosh = 0;
    let lastCount = -1, lastPhase = "";
    if (count.current) count.current.textContent = "0";

    const colX0 = () => left - 14, colDX = () => (right - left + 28) / (COLUMNS - 1);
    const colAt = (x: number) => clamp(Math.round((x - colX0()) / colDX()), 0, COLUMNS - 1);
    const level = () => (landed < 0 ? bottom + 30 : levelAt(fill));
    const swell = (x: number) => Math.sin(x * 0.009 + t * 0.0016) * 4.6 + Math.sin(x * 0.024 - t * 0.0024) * 2.2
      + slosh * Math.cos((Math.PI * (x - left)) / Math.max(1, right - left)) * Math.cos(t * 0.0043);
    const surfaceAt = (x: number) => {
      const f = (x - colX0()) / colDX(), i = clamp(Math.floor(f), 0, COLUMNS - 2), u = clamp(f - i);
      return level() - (h[i] * (1 - u) + h[i + 1] * u) + swell(x);
    };
    const historyX = (when: number) => {
      for (let i = history.length - 2; i >= 0; i -= 2) if (history[i] <= when) return history[i + 1];
      return history.length ? history[1] : pourX;
    };
    const reach = (cx: number, cy: number) => Math.hypot(Math.max(cx - left, right - cx), Math.max(cy - top, bottom - cy)) * 1.05;

    const step = () => {
      t += STEP;
      // Where the stream is aimed: the middle of the State's widest stretch just under the water.
      const aim = rowMid(landed < 0 ? bottom - 2 : Math.max(top + 2, level() + 3));
      if (Number.isNaN(pourX)) pourX = aim; else if (!Number.isNaN(aim)) pourX += (aim - pourX) * 0.04;
      history.push(t, pourX);
      while (history.length > 4 && history[0] < t - 900) history.splice(0, 2);
      // The stream lands in the southern tip.
      if (landed < 0 && t >= STREAM_AT && 0.5 * G_STREAM * (t - STREAM_AT) ** 2 >= bottom - 4) {
        landed = t;
        const c = colAt(pourX);
        for (let j = -4; j <= 4; j++) { const i = c + j; if (i >= 0 && i < COLUMNS) v[i] -= 5 * (1 - Math.abs(j) / 5); }
        slosh = 11;
        for (let k = 0; k < 60; k++) spray.push({ x: pourX + (rand() - 0.5) * 10, y: bottom - 6, vx: (rand() - 0.5) * 6, vy: -(3 + rand() * 6.5), r: 0.7 + rand() * 1.9, seed: rand() });
      }
      if (landed >= 0 && full < 0) {
        const p = clamp((t - landed) / FILL_MS);
        fill = p * 1.25 - 0.25 * p ** 5; // a steady pour that eases off as the tap closes
        if (closed < 0 && fill >= TAP_CLOSES) closed = t;
        if (p >= 1) { fill = 1; full = t; nextRain = t + 900; }
      }
      // While water is still arriving it stirs the surface, throws spray and drives bubbles down.
      const arriving = landed >= 0 && (closed < 0 || 0.5 * G_STREAM * (t - closed) ** 2 < surfaceAt(pourX));
      if (arriving) {
        const c = colAt(pourX), sy = surfaceAt(pourX);
        v[c] -= 2 + rand() * 2.4;
        for (const [j, k] of [[1, 1.2], [2, 0.6]] as const) { if (c - j >= 0) v[c - j] -= rand() * k; if (c + j < COLUMNS) v[c + j] -= rand() * k; }
        // Now and then a heavier gush, and the water around it heaves.
        if (rand() < 0.06) { slosh = Math.min(12, slosh + 1.6); for (let j = -3; j <= 3; j++) { const i = c + j; if (i >= 0 && i < COLUMNS) v[i] -= 2.5 * (1 - Math.abs(j) / 4); } }
        if (rand() < 0.3) { const i = clamp(c + Math.round((rand() - 0.5) * 12), 0, COLUMNS - 1); v[i] += (rand() - 0.5) * 1.8; }
        for (let k = 0; k < 3; k++) if (spray.length < 220 && rand() < 0.85) spray.push({ x: pourX + (rand() - 0.5) * 8, y: sy - 2, vx: (rand() - 0.5) * 4.8, vy: -(1.5 + rand() * 4.6), r: 0.6 + rand() * 1.7, seed: rand() });
        for (let k = 0; k < 2; k++) if (bubbles.length < 160 && rand() < 0.75) bubbles.push({ x: pourX + (rand() - 0.5) * 14, y: sy + 6 + rand() * 40, vx: (rand() - 0.5) * 2.4, vy: 1.5 + rand() * 3, r: 0.7 + rand() * 2.8, seed: rand() });
        // The water churns white where the stream lands.
        if (foam.length < 140 && rand() < 0.7) foam.push({ x: pourX + (rand() - 0.5) * 26, life: 0.9, r: 1.5 + rand() * 2.5, drift: (rand() - 0.5) * 0.9 });
      }
      if (landed >= 0) {
        if (rand() < 0.15) v[Math.floor(rand() * COLUMNS)] += (rand() - 0.5) * 0.6; // a little wind everywhere
        const damping = full >= 0 ? DAMPING * 2.5 : DAMPING;
        slosh *= full >= 0 ? 0.985 : 0.9975;
        for (let i = 0; i < COLUMNS; i++) { v[i] += -SPRING * h[i] - damping * v[i]; h[i] += v[i]; }
        for (let pass = 0; pass < 4; pass++) {
          for (let i = 0; i < COLUMNS; i++) {
            if (i > 0) { lD[i] = SPREAD * (h[i] - h[i - 1]); v[i - 1] += lD[i]; }
            if (i < COLUMNS - 1) { rD[i] = SPREAD * (h[i] - h[i + 1]); v[i + 1] += rD[i]; }
          }
          for (let i = 0; i < COLUMNS; i++) { if (i > 0) h[i - 1] += lD[i]; if (i < COLUMNS - 1) h[i + 1] += rD[i]; }
        }
      }
      // Spray falls back in and rings out; bubbles rise and burst into foam.
      for (let i = spray.length - 1; i >= 0; i--) {
        const s = spray[i]; s.vy += G_SPRAY; s.x += s.vx; s.y += s.vy;
        if (s.vy > 0 && landed >= 0 && s.y > surfaceAt(s.x)) {
          v[colAt(s.x)] -= 0.3 * s.r;
          if (foam.length < 140 && rand() < 0.4) foam.push({ x: s.x, life: 0.8, r: 0.8 + s.r, drift: (rand() - 0.5) * 0.4 });
          spray.splice(i, 1);
        } else if (s.y > H + 20) spray.splice(i, 1);
      }
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i]; b.vy = Math.max(-2.3, b.vy - 0.09); b.vx *= 0.96; b.x += b.vx + Math.sin(t * 0.011 + b.seed * 20) * 0.35; b.y += b.vy;
        if (b.y < surfaceAt(b.x) + 1.5) { if (foam.length < 140) foam.push({ x: b.x, life: 1, r: 1 + b.r * 0.9, drift: (rand() - 0.5) * 0.5 }); bubbles.splice(i, 1); }
      }
      for (let i = foam.length - 1; i >= 0; i--) { const f = foam[i]; f.life -= 0.011; f.x += f.drift; if (f.life <= 0) foam.splice(i, 1); }
      // A mandal is reached when the water rises past its middle.
      if (landed >= 0) {
        const lv = level();
        for (let i = 0; i < total; i++) if (reached[i] < 0 && oy + mandals[i].cy * scale > lv) { reached[i] = t; n += 1; }
      }
      // On the full State, now and then a drop lands.
      if (full >= 0 && !still && t >= nextRain) { const m = rainAt[rainIndex++ % rainAt.length]; ripples.push({ x: m.cx, y: m.cy, at: t }); nextRain = t + RAIN_EVERY * (0.6 + 0.8 * rand()); }
      while (ripples.length && t - ripples[0].at > RING_MS) ripples.shift();
    };

    const skipNow = () => {
      if (t < DROP_MS + REVEAL_MS + 600) t = DROP_MS + REVEAL_MS + 600;
      if (landed < 0) landed = t - FILL_MS;
      if (closed < 0) closed = t - 3000;
      fill = 1;
      if (full < 0) { full = t - 1000; nextRain = t + 600; }
      for (let i = 0; i < total; i++) if (reached[i] < 0) { reached[i] = t - GLINT_MS; n += 1; }
      h.fill(0); v.fill(0); slosh = 0; spray.length = 0; bubbles.length = 0; foam.length = 0;
    };

    // ---- Drawing.
    const mapped = () => ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    const css = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const raw = () => ctx.setTransform(1, 0, 0, 1, 0, 0);
    /** The pool light over whatever is clipped, sliding with time. */
    const shimmer = (strength: number) => {
      if (!caustic) return;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const layers: Array<[number, number, number, number]> = [[0.034, 0.021, 1.25, 0.2], [-0.026, 0.03, 1.7, 0.14]];
      for (const [vx, vy, size, alpha] of layers) {
        caustic.setTransform(new DOMMatrix().translateSelf(t * vx, t * vy).scaleSelf(size, size));
        ctx.globalAlpha *= alpha * strength; ctx.fillStyle = caustic; ctx.fillRect(0, 0, W, H); ctx.globalAlpha /= alpha * strength;
      }
      ctx.restore();
    };
    /** A ring on the water, lit from the upper left: bright on that side, in shadow on the other. */
    const ring = (x: number, y: number, r: number, a: number, w: number) => {
      let style: string | CanvasGradient = `rgba(225, 253, 255, ${a})`;
      if (typeof ctx.createConicGradient === "function") {
        const g = ctx.createConicGradient(-Math.PI * 0.75, x, y);
        g.addColorStop(0, `rgba(242, 254, 255, ${a})`); g.addColorStop(0.25, `rgba(150, 232, 250, ${a * 0.45})`);
        g.addColorStop(0.5, `rgba(3, 28, 50, ${a * 0.75})`); g.addColorStop(0.75, `rgba(150, 232, 250, ${a * 0.45})`); g.addColorStop(1, `rgba(242, 254, 255, ${a})`);
        style = g;
      }
      ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    };
    const curve = (path: Path2D | CanvasRenderingContext2D, lift = 0) => {
      path.lineTo(px[0], py[0] - lift);
      for (let i = 1; i < COLUMNS - 1; i++) path.quadraticCurveTo(px[i], py[i] - lift, (px[i] + px[i + 1]) / 2, (py[i] + py[i + 1]) / 2 - lift);
      path.lineTo(px[COLUMNS - 1], py[COLUMNS - 1] - lift);
    };

    const render = () => {
      css();
      const cx = ox + centre.x * scale, cy = oy + centre.y * scale;
      const bg = ctx.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.9);
      bg.addColorStop(0, "#0b2a40"); bg.addColorStop(0.55, "#061827"); bg.addColorStop(1, "#030b13");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // 1. The first drop.
      if (t < DROP_MS) {
        const p = easeIn(t / DROP_MS), y = -40 + (cy + 40) * p;
        const trail = ctx.createLinearGradient(cx, y - 120 * p - 10, cx, y);
        trail.addColorStop(0, "rgba(140, 240, 255, 0)"); trail.addColorStop(1, "rgba(160, 245, 255, 0.55)");
        ctx.strokeStyle = trail; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, y - 120 * p - 10); ctx.lineTo(cx, y); ctx.stroke();
        const halo = ctx.createRadialGradient(cx, y, 0, cx, y, 22);
        halo.addColorStop(0, "rgba(150, 245, 255, 0.5)"); halo.addColorStop(1, "rgba(150, 245, 255, 0)");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, y, 22, 0, Math.PI * 2); ctx.fill();
        ctx.save(); ctx.translate(cx, y); ctx.scale(1, 1 + 0.9 * p); ctx.fillStyle = "#e6fdff";
        ctx.beginPath(); ctx.moveTo(0, -7); ctx.bezierCurveTo(4.5, -1, 4.5, 4.5, 0, 4.5); ctx.bezierCurveTo(-4.5, 4.5, -4.5, -1, 0, -7); ctx.fill(); ctx.restore();
      }

      // 2. Its splash and rings, which find the State: its glow, its glass, its lines.
      const since = t - DROP_MS;
      if (since >= 0) {
        const R = reach(cx, cy);
        if (since < 520) {
          const p = since / 520, flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, 10 + 60 * p);
          flash.addColorStop(0, `rgba(230, 253, 255, ${0.9 * (1 - p)})`); flash.addColorStop(1, "rgba(150, 245, 255, 0)");
          ctx.fillStyle = flash; ctx.beginPath(); ctx.arc(cx, cy, 10 + 60 * p, 0, Math.PI * 2); ctx.fill();
        }
        for (let k = 0; k < 3; k++) {
          const rt = since - k * 230;
          if (rt < 0 || rt > 1900) continue;
          const p = rt / 1900, r = easeOut(p) * R;
          ctx.strokeStyle = `rgba(160, 245, 255, ${0.55 * (1 - p) * (k === 0 ? 1 : 0.6)})`; ctx.lineWidth = k === 0 ? 1.8 : 1.1;
          ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.92, 0, 0, Math.PI * 2); ctx.stroke();
        }
        const shown = easeOut(clamp(since / REVEAL_MS)) * R;
        ctx.save();
        if (shown < R) { ctx.beginPath(); ctx.ellipse(cx, cy, shown, shown * 0.92, 0, 0, Math.PI * 2); ctx.clip(); }
        raw();
        if (glow) { ctx.globalAlpha = 0.85 * (full >= 0 ? 0.8 + 0.2 * Math.sin(t / 1300) : 1); ctx.drawImage(glow, 0, 0); }
        if (full < 0) {
          ctx.globalAlpha = 1; mapped(); ctx.fillStyle = "rgba(120, 210, 235, 0.045)"; ctx.fill(state); raw();
          if (inner) { ctx.globalAlpha = 0.6; ctx.drawImage(inner, 0, 0); }
          if (mesh) { ctx.globalAlpha = 0.4; ctx.drawImage(mesh, 0, 0); }
        }
        ctx.restore(); css();
      }

      // 3. The water, seen from the side as it fills.
      const living = full >= 0 ? clamp((t - full - 250) / 700) : 0;
      if (landed >= 0 && living < 1) {
        const lv = level(), x0 = colX0(), dx = colDX(), fade = 1 - living;
        for (let i = 0; i < COLUMNS; i++) { px[i] = x0 + i * dx; py[i] = lv - h[i] + swell(px[i]); }
        ctx.save(); ctx.globalAlpha = fade;
        mapped(); ctx.clip(state); css();
        // The far side of the surface, lighter, just behind.
        ctx.beginPath(); ctx.moveTo(px[0], bottom + 40);
        for (let i = 0; i < COLUMNS; i++) ctx.lineTo(px[i], py[i] - 4 - Math.sin(px[i] * 0.03 + t * 0.003) * 2.5);
        ctx.lineTo(px[COLUMNS - 1], bottom + 40); ctx.closePath();
        ctx.fillStyle = "rgba(90, 215, 238, 0.22)"; ctx.fill();
        // The body of water, lighter just under the surface and darker with depth.
        const body = new Path2D(); body.moveTo(px[0], bottom + 40); curve(body); body.lineTo(px[COLUMNS - 1], bottom + 40); body.closePath();
        const deep = ctx.createLinearGradient(0, lv - 12, 0, bottom);
        deep.addColorStop(0, "rgba(70, 208, 230, 0.96)"); deep.addColorStop(clamp(50 / Math.max(50, bottom - lv), 0.02, 0.35), "#0f6489"); deep.addColorStop(1, "#06243f");
        ctx.fillStyle = deep; ctx.fill(body);
        ctx.save(); ctx.clip(body);
        // The mandal lines on the floor, bent by the moving surface near the top.
        if (mesh) {
          raw(); ctx.globalAlpha = 0.8 * fade;
          const band = 130, y0 = Math.max(top, lv - 16), y1 = Math.min(bottom + 4, lv + band);
          for (let y = y0; y < y1; y += 4) {
            const shift = (Math.sin(y * 0.07 + t * 0.006) * 2.4 + Math.sin(y * 0.023 - t * 0.004) * 1.4) * (1 - clamp((y - lv) / band));
            ctx.drawImage(mesh, 0, y * dpr, mesh.width, 4 * dpr, shift * dpr, y * dpr, mesh.width, 4 * dpr);
          }
          ctx.save(); ctx.beginPath(); ctx.rect(0, y1 * dpr, mesh.width, mesh.height); ctx.clip(); ctx.drawImage(mesh, 0, 0); ctx.restore();
          ctx.globalAlpha = fade; css();
        }
        shimmer(0.6);
        // Light coming through just under the surface.
        const lit = ctx.createLinearGradient(0, lv - 8, 0, lv + 56);
        lit.addColorStop(0, "rgba(170, 245, 255, 0.34)"); lit.addColorStop(1, "rgba(170, 245, 255, 0)");
        ctx.fillStyle = lit; ctx.fillRect(left - 20, lv - 20, right - left + 40, 80);
        // Bubbles: a thin ring and a point of light.
        ctx.lineWidth = 0.8;
        for (const b of bubbles) {
          ctx.strokeStyle = "rgba(205, 250, 255, 0.6)"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = "rgba(240, 254, 255, 0.85)"; ctx.beginPath(); ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, Math.max(0.4, b.r * 0.28), 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        // The glass's edges catch the light through the water.
        if (inner) { raw(); ctx.globalAlpha = 0.7 * fade; ctx.drawImage(inner, 0, 0); ctx.globalAlpha = fade; css(); }
        // The surface: a dark edge under a bright line.
        const line = new Path2D(); line.moveTo(px[0], py[0]); curve(line);
        ctx.strokeStyle = "rgba(2, 22, 38, 0.5)"; ctx.lineWidth = 4; ctx.stroke(line);
        ctx.shadowColor = "rgba(110, 236, 255, 0.95)"; ctx.shadowBlur = 14; ctx.strokeStyle = "#d4fcff"; ctx.lineWidth = 1.9; ctx.stroke(line); ctx.shadowBlur = 0;
        // Foam riding the surface.
        for (const f of foam) {
          ctx.fillStyle = `rgba(236, 253, 255, ${0.6 * f.life})`;
          ctx.beginPath(); ctx.arc(f.x, surfaceAt(f.x) - 0.5, f.r * (0.6 + 0.4 * f.life), 0, Math.PI * 2); ctx.fill();
        }
        // Each mandal glints as the water reaches it.
        mapped();
        for (let i = 0; i < total; i++) {
          if (reached[i] < 0) continue;
          const age = (t - reached[i]) / GLINT_MS;
          if (age >= 1) continue;
          const a = (1 - age) * (1 - age) * fade;
          ctx.fillStyle = `rgba(190, 250, 255, ${0.12 * a})`; ctx.fill(mandals[i].path);
          ctx.strokeStyle = `rgba(225, 253, 255, ${0.7 * a})`; ctx.lineWidth = 1.2 / scale; ctx.stroke(mandals[i].path);
        }
        css();
        ctx.restore();
      }

      // 4. Full: the State is water, alive, seen from above.
      if (living > 0) {
        ctx.save(); ctx.globalAlpha = living;
        raw();
        if (base) ctx.drawImage(base, 0, 0);
        if (mesh) ctx.drawImage(mesh, 0, 0);
        mapped(); ctx.clip(state); css();
        shimmer(1);
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 2; i++) {
          const span = right - left + 600, shift = ((t * (0.035 + i * 0.012) + i * 320) % span) - 300;
          const band = ctx.createLinearGradient(left + shift - 140, top, left + shift + 140, bottom);
          band.addColorStop(0, "rgba(120, 235, 255, 0)"); band.addColorStop(0.5, `rgba(120, 235, 255, ${0.05 + i * 0.012})`); band.addColorStop(1, "rgba(120, 235, 255, 0)");
          ctx.fillStyle = band; ctx.fillRect(left - 20, top - 20, right - left + 40, bottom - top + 40);
        }
        ctx.globalCompositeOperation = "source-over";
        // Drops landing: a splash, the floor bent under the ring, and the rings lit from one side.
        for (const r of ripples) {
          const p = (t - r.at) / RING_MS, fade = Math.pow(1 - p, 1.5), rx = ox + r.x * scale, ry = oy + r.y * scale;
          const radius = 4 + easeOut(p) * Math.max(80, (right - left) * 0.2);
          if (p < 0.16) {
            const q = p / 0.16, splash = ctx.createRadialGradient(rx, ry, 0, rx, ry, 6 + 22 * q);
            splash.addColorStop(0, `rgba(235, 254, 255, ${0.9 * (1 - q)})`); splash.addColorStop(1, "rgba(160, 245, 255, 0)");
            ctx.fillStyle = splash; ctx.beginPath(); ctx.arc(rx, ry, 6 + 22 * q, 0, Math.PI * 2); ctx.fill();
          }
          if (mesh && base) {
            ctx.save(); raw();
            ctx.beginPath(); ctx.arc(rx * dpr, ry * dpr, (radius + 8) * dpr, 0, Math.PI * 2); ctx.arc(rx * dpr, ry * dpr, Math.max(0, radius - 8) * dpr, 0, Math.PI * 2, true); ctx.clip();
            ctx.globalAlpha = living * fade; ctx.drawImage(base, 0, 0);
            ctx.translate(rx * dpr, ry * dpr); ctx.scale(1.045, 1.045); ctx.translate(-rx * dpr, -ry * dpr); ctx.drawImage(mesh, 0, 0);
            ctx.restore(); css();
          }
          for (let j = 0; j < 3; j++) { const rr = radius - j * 13; if (rr > 2) ring(rx, ry, rr, (0.85 - j * 0.24) * fade * living, 2.2 - j * 0.5); }
        }
        if (inner) { raw(); ctx.globalAlpha = 0.5 * living; ctx.drawImage(inner, 0, 0); css(); }
        ctx.restore();
      }

      // 5. Spray in the air.
      ctx.fillStyle = "rgba(214, 250, 255, 0.92)";
      for (const s of spray) {
        const speed = Math.hypot(s.vx, s.vy);
        ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(Math.atan2(s.vy, s.vx));
        ctx.beginPath(); ctx.ellipse(0, 0, s.r * (1 + Math.min(2, speed * 0.25)), s.r * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }

      // 6. The stream, in front of everything: narrowing as it falls, bending when it moves.
      if (t >= STREAM_AT) {
        const front = 0.5 * G_STREAM * (t - STREAM_AT) ** 2, tail = closed < 0 ? 0 : 0.5 * G_STREAM * (t - closed) ** 2;
        const xAt = (y: number) => historyX(t - Math.sqrt(2 * Math.max(0, y) / G_STREAM)) + Math.sin(y * 0.045 - t * 0.025) * 0.7;
        const end = Math.min(front, landed < 0 ? bottom - 4 : surfaceAt(xAt(level())));
        if (tail < end - 2) {
          const steps = 26, ys: number[] = [], ls: number[] = [], rs: number[] = [];
          for (let s = 0; s <= steps; s++) {
            const y = tail + (end - tail) * (s / steps), x = xAt(y), w = 11 - 4 * clamp(y / Math.max(1, bottom));
            ys.push(y); ls.push(x - w / 2); rs.push(x + w / 2);
          }
          ctx.save();
          const pour = (spread: number) => {
            ctx.beginPath();
            for (let s = 0; s <= steps; s++) { const m = (ls[s] + rs[s]) / 2, x = m - (m - ls[s]) * spread; if (s) ctx.lineTo(x, ys[s]); else ctx.moveTo(x, ys[s]); }
            for (let s = steps; s >= 0; s--) { const m = (ls[s] + rs[s]) / 2; ctx.lineTo(m + (rs[s] - m) * spread, ys[s]); }
            ctx.closePath();
          };
          pour(1.45); ctx.shadowColor = "rgba(110, 236, 255, 0.7)"; ctx.shadowBlur = 16; ctx.fillStyle = "rgba(120, 220, 242, 0.28)"; ctx.fill(); ctx.shadowBlur = 0;
          pour(1);
          const core = ctx.createLinearGradient(0, ys[0], 0, ys[steps]);
          core.addColorStop(0, "rgba(170, 238, 250, 0.7)"); core.addColorStop(1, "rgba(200, 248, 255, 0.92)");
          ctx.fillStyle = core; ctx.fill();
          ctx.beginPath();
          for (let s = 0; s <= steps; s++) { const x = ls[s] + (rs[s] - ls[s]) * 0.28; if (s) ctx.lineTo(x, ys[s]); else ctx.moveTo(x, ys[s]); }
          ctx.strokeStyle = "rgba(245, 254, 255, 0.75)"; ctx.lineWidth = 1.1; ctx.stroke();
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)"; ctx.lineWidth = 1.6;
          const length = Math.max(1, end - tail);
          for (let k = 0; k < 7; k++) {
            const y = tail + ((t * 0.9 + k * 113) % length), x = xAt(y) + 0.6;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, Math.min(end, y + 12)); ctx.stroke();
          }
          ctx.restore();
        }
      }

      if (count.current && n !== lastCount) { count.current.textContent = String(n); lastCount = n; }
      const now = full >= 0 ? "full" : landed >= 0 ? "fill" : "drop";
      if (now !== lastPhase) { lastPhase = now; setPhase(now); if (now === "full") done.current?.(); }
    };

    let raf = 0, lastNow = 0, carry = 0;
    const tick = (now: number) => {
      if (skipRequest.current) { skipRequest.current = false; skipNow(); }
      if (!lastNow) lastNow = now;
      carry += Math.min(120, now - lastNow); lastNow = now;
      while (carry >= STEP) { step(); carry -= STEP; }
      render();
      raf = requestAnimationFrame(tick);
    };
    const visibility = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!still) { lastNow = 0; raf = requestAnimationFrame(tick); }
    };
    document.addEventListener("visibilitychange", visibility);
    const resize = new ResizeObserver(() => { layout(); if (still) render(); });
    resize.observe(box);
    if (still) { skipNow(); t += 2400; render(); }
    else raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); resize.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, [outlines, run, still]);

  const total = outlines?.mandals.length ?? 670;
  return (
    <div ref={frame} className={styles.intro} data-testid="water-intro" data-phase={phase} data-still={still ? "" : undefined} onClick={skip}>
      <canvas ref={canvas} className={styles.canvas} aria-hidden="true" />
      <div className={styles.copy}>
        <p className={styles.eyebrow}><span />Andhra Pradesh · {total} mandals</p>
        <h1 className={styles.title}>AP Water <em>Intelligence</em></h1>
        <p className={styles.sub}>Every drop has a deeper story. From the monsoon above to the water beneath, mandal by mandal.</p>
      </div>
      <p className={styles.count} aria-live="off"><b ref={count}>0</b> of {total} mandals reached</p>
      <div className={styles.tools}>
        {phase === "full"
          ? <button type="button" onClick={e => { e.stopPropagation(); setPhase("drop"); setRun(r => r + 1); }}>Play again</button>
          : <button type="button" onClick={e => { e.stopPropagation(); skip(); }}>Skip</button>}
        {caption ? <span className={styles.caption}>{caption}</span> : null}
      </div>
    </div>
  );
}
