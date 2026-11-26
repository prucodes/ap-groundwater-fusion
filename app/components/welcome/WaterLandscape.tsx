"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import geometry from "./landscape.json";
import styles from "./Welcome.module.css";

/* Beneath the monsoon: the State's land, and the water held under it, as two maps in one stack.

   The first time it is on screen, the picture lands. A drop falls on the land and its rings uncover
   it; the layers beneath fall into place one after another, down to the water layer; the drop's
   recharge goes down to it, and the water spreads out through its layer from where it arrives.
   From then on the water layer is alive (pool light moving over the State's mandal lines, its
   currents, and a ring wherever a recharge pulse reaches it) while the land keeps its own cycle of
   rain, recharge and assessment, and its rivers run.

   SVG for the land, the layers and the words; one canvas for the water layer, slid between the
   layers above and below it so the land still covers it; one canvas on top for the drop and its
   rings. No video, no images. Starts only once the picture is on screen, holds still while the
   welcome's motion is paused, and with reduced motion is drawn once, landed and still.
   Illustration, not data. */

type Outlines = { mandals: string[]; districts: string };
type Ring = { x: number; y: number; at: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** The site's mandal outlines (a 1000 × 855 view) laid onto this picture's State, which is the same map
    tilted back: a circle on the ground looks about half as tall as it is wide. Fitted to the silhouette
    (97% overlap). In canvas order a, b, c, d, e, f. */
const FIT = [0.645195, -0.000142, 0.000408, 0.341924, 84.320589, 149.609334] as const;
const TILT = FIT[3] / FIT[0];
/** The drop lands on the north-east recharge point, and its water arrives in the layer straight below. */
const IMPACT = { x: 515, y: 236 };
const WATER = 103;
/** Every layer under the land, top to bottom, by how far below the land it lies once landed. */
const STACK = [14, 22, 30, 38, 57, WATER, 121, 133, 145, 170];
const WATER_AT = STACK.indexOf(WATER);
const RECHARGE = [{ x: 235, y: 350 }, { x: 340, y: 300 }, { x: 515, y: 236 }];
const RIVERS = ["M280 190C290 245 425 260 457 308S490 339 524 351", "M480 155C465 205 520 228 557 244S589 275 610 272"];
/** The water layer's bounds, with room for its glow. */
const BOX = { x: 85, y: 245, w: 650, h: 305 };
/** The cycle the land runs (rain, recharge, response, assessment), and when in it a pulse reaches the water. */
const CYCLE = 10_000, ARRIVES = 0.59;

/** The landing, in ms from when the picture is first on screen. */
const DROP = 700, RING_MS = 1600, RING_GAP = 230;
const UNFOLD = 1750, UNFOLD_MS = 950, UNFOLD_GAP = 45;
const RIVER_AT = 1300, RIVER_MS = 1400;
const BEAM = 2950, BEAM_MS = 650;
const FILL = 3600, FILL_MS = 3600, DONE = 7500;
const RING_LIFE = 3200, GLINT_MS = 700;
/** When each part of the picture fades in, [start, length]; anything not listed (the rain) waits for the end. */
const FADES: Record<string, [number, number]> = {
  ground: [0, 1400], clouds: [2200, 1200], names: [2900, 700], north: [3000, 700], monsoon: [3200, 700], flow: [2900, 700],
  fields: [3500, 700], recharge: [4200, 700], groundwater: [4700, 700], assessment: [5200, 700],
};

const POINTS = (geometry.path.match(/-?[\d.]+,-?[\d.]+/g) ?? []).map(pair => pair.split(",").map(Number));
/** Distance on the ground, not on the screen. */
const planar = (x: number, y: number, cx: number, cy: number) => Math.hypot(x - cx, (y - cy) / TILT);
/** How far the rings, and later the water, must travel to cover the whole State from the drop. */
const REACH = Math.max(...POINTS.map(([x, y]) => planar(x, y, IMPACT.x, IMPACT.y))) + 12;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeIn = (p: number) => p * p * p;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** Falls into place and settles: a little past, and back. */
const settle = (p: number) => { const c1 = 1.25, c3 = c1 + 1, q = p - 1; return 1 + c3 * q * q * q + c1 * q * q; };
/** The water layer's answer to each recharge pulse, as the land's own cycle has always drawn it. */
const response = (ph: number) => (ph < 0.48 ? 0.04 : ph < 0.65 ? 0.04 + 0.22 * easeInOut((ph - 0.48) / 0.17) : ph < 0.77 ? 0.26 : 0.26 - 0.22 * easeInOut((ph - 0.77) / 0.23));

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

/** The water layer's pores, as the picture has always drawn them, four times over for sharpness. */
function poreTile() {
  const c = document.createElement("canvas"); c.width = 76; c.height = 60;
  const g = c.getContext("2d"); if (!g) return c;
  g.scale(4, 4);
  g.fillStyle = "rgba(165, 242, 255, 0.3)"; g.beginPath(); g.arc(4, 5, 1.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "rgba(165, 242, 255, 0.25)"; g.lineWidth = 0.7; g.beginPath(); g.moveTo(11, 2); g.lineTo(14, 6); g.lineTo(12, 11); g.stroke();
  return c;
}

/** A ring on the water, lit from the upper left: bright on that side, in shadow on the other. */
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

    // ---- The water layer's own shapes, and the layers drawn once per size.
    const shape = new Path2D(); shape.addPath(new Path2D(geometry.path), new DOMMatrix([1, 0, 0, 1, 0, WATER]));
    const ground = new Path2D(geometry.path);
    const currents = Array.from({ length: 12 }, (_, i) => new Path2D(`M60 ${180 + i * 24 + WATER}Q230 ${130 + i * 24 + WATER} 400 ${190 + i * 24 + WATER}T790 ${170 + i * 24 + WATER}`));
    const beam = new Path2D(`M${IMPACT.x} ${IMPACT.y + 8}c-8 29 8 58 0 90`);
    const caustic = w.createPattern(causticTile(), "repeat");
    let lines: Path2D | null = null, districts: Path2D | null = null;
    let W = 1, H = 1, dpr = 1, k = 1;
    let base: HTMLCanvasElement | null = null, glass: HTMLCanvasElement | null = null, rim: HTMLCanvasElement | null = null, mesh: HTMLCanvasElement | null = null;
    const offscreen = (draw: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas"); c.width = wc.width; c.height = wc.height;
      const g = c.getContext("2d"); if (!g) return null;
      g.setTransform(k, 0, 0, k, 0, 0); draw(g);
      return c;
    };
    // The State's mandal lines on the floor of the water, the district lines a little brighter.
    const drawMesh = () => {
      const l = lines, d = districts;
      mesh = l && d ? offscreen(g => {
        g.clip(shape);
        g.strokeStyle = "rgba(170, 240, 255, 0.16)"; g.lineWidth = 0.5; g.stroke(l);
        g.strokeStyle = "rgba(190, 248, 255, 0.4)"; g.lineWidth = 0.85; g.stroke(d);
      }) : null;
    };
    const layout = () => {
      W = Math.max(1, box.clientWidth); H = Math.max(1, box.clientHeight); dpr = Math.min(2, window.devicePixelRatio || 1); k = (dpr * W) / 820;
      for (const c of [wc, fc]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      // The water as the picture has always coloured it, with its pores.
      base = offscreen(g => {
        const deep = g.createLinearGradient(200, 330 + WATER, 610, 500 + WATER);
        deep.addColorStop(0, "rgba(18, 181, 203, 0.62)"); deep.addColorStop(0.5, "rgba(20, 141, 186, 0.72)"); deep.addColorStop(1, "rgba(18, 77, 118, 0.48)");
        g.fillStyle = deep; g.fill(shape);
        const pores = g.createPattern(poreTile(), "repeat");
        if (pores) { pores.setTransform(new DOMMatrix().translate(0, WATER).scale(0.25)); g.fillStyle = pores; g.fill(shape); }
      });
      // Before the water comes: an empty glass of the State's shape.
      glass = offscreen(g => { g.fillStyle = "rgba(120, 210, 235, 0.06)"; g.fill(shape); });
      // Its edge, glowing.
      rim = offscreen(g => {
        g.shadowColor = "rgba(94, 231, 255, 0.6)"; g.shadowBlur = 7 * dpr;
        g.strokeStyle = "rgba(113, 229, 243, 0.9)"; g.lineWidth = 1.5; g.stroke(shape);
      });
      drawMesh();
    };
    layout();

    // ---- Where everything is at a moment of the landing.
    /** The land, and everything under it, shows only where the first ring has passed. */
    const revealAt = (t: number) => (t <= DROP ? 0 : easeOut(clamp((t - DROP) / RING_MS)) * REACH);
    const depthAt = (i: number, t: number) => STACK[i] * settle(clamp((t - UNFOLD - i * UNFOLD_GAP) / UNFOLD_MS));
    /** How far the water has spread from where it arrived: quickly at first, in pulses, easing off at the far tips. */
    const frontAt = (t: number) => {
      if (t < FILL) return 0;
      const p = clamp((t - FILL) / FILL_MS);
      if (p >= 1) return Infinity;
      const q = p + 0.025 * Math.sin(2 * Math.PI * 3.5 * p) * Math.sin(Math.PI * p);
      return (REACH + 18) * Math.pow(clamp(q * 1.25 - 0.25 * q ** 5), 0.6);
    };
    /** The water's edge on the ground: a circle that never quite is, its lobes moving as it goes. */
    const frontPath = (R: number, t: number) => {
      const path = new Path2D(), n = 120, cx = IMPACT.x, cy = IMPACT.y + WATER, amp = Math.min(14, 0.08 * R), s = t / 1000;
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rho = Math.max(0, R + amp * (0.55 * Math.sin(5 * a + 1.7 * s) + 0.3 * Math.sin(9 * a - 2.3 * s + 1) + 0.15 * Math.sin(14 * a + 3.1 * s + 2)));
        const x = cx + rho * Math.cos(a), y = cy + rho * Math.sin(a) * TILT;
        if (i) path.lineTo(x, y); else path.moveTo(x, y);
      }
      path.closePath();
      return path;
    };

    let t = 0, last = 0, raf = 0, seen = false, landed = false, arrived = false, uncovered = false, before = -1, phase = 0;
    let still = media.matches;
    const settled = STACK.map(() => false);
    const rings: Ring[] = [];
    const reached = new Float64Array(geometry.nodes.length).fill(-1);

    // ---- The SVG: everything starts where the landing begins, and is placed frame by frame until it ends.
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

    // ---- The drop, its rings across the land, and the recharge going down (the top canvas).
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
      if (since >= 0 && since < RING_MS + 2 * RING_GAP + GLINT_MS) {
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
          if (reached[i] < 0 && planar(x, y, IMPACT.x, IMPACT.y) <= r1) reached[i] = time;
          if (reached[i] < 0) return;
          const age = (time - reached[i]) / GLINT_MS;
          if (age >= 1) return;
          const a = (1 - age) * (1 - age);
          const halo = f.createRadialGradient(x, y, 0, x, y, 7);
          halo.addColorStop(0, `rgba(220, 255, 210, ${0.55 * a})`); halo.addColorStop(1, "rgba(220, 255, 210, 0)");
          f.fillStyle = halo; f.beginPath(); f.arc(x, y, 7, 0, Math.PI * 2); f.fill();
          f.save(); f.translate(x, y); f.scale(1, TILT); f.strokeStyle = `rgba(225, 255, 215, ${0.6 * a})`; f.lineWidth = 0.8;
          f.beginPath(); f.arc(0, 0, 2 + 10 * age, 0, Math.PI * 2); f.stroke(); f.restore();
        });
      }
      // The recharge, going down through the layers to the water.
      if (time >= BEAM && time < BEAM + BEAM_MS + 300) {
        const p = clamp((time - BEAM) / BEAM_MS), len = 92;
        f.save(); f.lineCap = "round"; f.setLineDash([16, 400]); f.lineDashOffset = 16 - (len + 16) * easeInOut(p);
        f.shadowColor = "rgba(140, 240, 255, 0.95)"; f.shadowBlur = 10 * dpr;
        f.strokeStyle = `rgba(205, 250, 255, ${p < 1 ? 1 : 1 - (time - BEAM - BEAM_MS) / 300})`; f.lineWidth = 2; f.stroke(beam);
        f.restore();
      }
    };

    // ---- The water layer (the canvas between the layers).
    const drawRing = ({ x, y, at }: Ring, time: number, dy: number) => {
      const p = (time - at) / RING_LIFE;
      if (p < 0 || p >= 1) return;
      const fade = Math.pow(1 - p, 1.5), radius = 3 + easeOut(p) * 64;
      // The floor bends under the ring, as it would through moving water.
      if (base && mesh) {
        w.save();
        w.beginPath(); w.ellipse(x, y, radius + 6, (radius + 6) * TILT, 0, 0, Math.PI * 2);
        w.ellipse(x, y, Math.max(0, radius - 6), Math.max(0, radius - 6) * TILT, 0, 0, Math.PI * 2, true); w.clip();
        w.setTransform(1, 0, 0, 1, 0, dy);
        const X = x * k, Y = y * k; w.translate(X, Y); w.scale(1.05, 1.05); w.translate(-X, -Y);
        w.globalAlpha = fade; w.drawImage(base, 0, 0); w.drawImage(mesh, 0, 0);
        w.restore();
      }
      w.save(); w.translate(x, y); w.scale(1, TILT);
      for (let j = 0; j < 3; j++) { const r = radius - j * 9; if (r > 2) litRing(w, r, (0.8 - j * 0.24) * fade, 1.6 - j * 0.4); }
      w.restore();
    };
    /** The water itself, wherever it has reached: drawn with the canvas set to the picture's units, shifted by dy. */
    const living = (time: number, dy: number) => {
      w.save(); w.setTransform(1, 0, 0, 1, 0, dy);
      if (base) w.drawImage(base, 0, 0);
      if (mesh) w.drawImage(mesh, 0, 0);
      w.restore();
      // Pool light, laid flat on the layer.
      if (caustic) {
        w.save(); w.globalCompositeOperation = "lighter";
        const sheets: Array<[number, number, number, number]> = [[0.012, 0.007, 0.5, 0.14], [-0.009, 0.01, 0.7, 0.09]];
        for (const [vx, vy, size, alpha] of sheets) {
          caustic.setTransform(new DOMMatrix().translate(time * vx, WATER + time * vy * TILT).scale(size, size * TILT));
          w.globalAlpha = alpha; w.fillStyle = caustic; w.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
        }
        w.restore();
      }
      // Light sliding across it.
      w.save(); w.globalCompositeOperation = "lighter";
      for (let i = 0; i < 2; i++) {
        const shift = ((time * (0.03 + i * 0.01) + i * 380) % (BOX.w + 500)) - 250, x0 = BOX.x + shift;
        const band = w.createLinearGradient(x0 - 110, BOX.y, x0 + 110, BOX.y + BOX.h);
        band.addColorStop(0, "rgba(120, 235, 255, 0)"); band.addColorStop(0.5, `rgba(120, 235, 255, ${0.05 + i * 0.012})`); band.addColorStop(1, "rgba(120, 235, 255, 0)");
        w.fillStyle = band; w.fillRect(BOX.x, BOX.y, BOX.w, BOX.h);
      }
      w.restore();
      // The currents it has always had, still running.
      w.save(); w.strokeStyle = "rgba(180, 247, 255, 0.48)"; w.lineWidth = 1.2; w.setLineDash([100, 25, 4, 25]);
      currents.forEach((c, i) => { w.lineDashOffset = -154 * (((time + i * 730) / 8000) % 1); w.stroke(c); });
      w.restore();
      // Its glow as each recharge pulse arrives.
      w.save(); w.globalAlpha = still ? 0.08 : landed ? response(phase) : 0.04;
      w.fillStyle = "#56d9f0"; w.fill(shape); w.strokeStyle = "#9bf2ff"; w.lineWidth = 2; w.stroke(shape);
      w.restore();
      for (const ring of rings) drawRing(ring, time, dy);
    };
    /** The edge of the spreading water: a bright line with glints running round it, over a little shadow. */
    const drawFront = (edge: Path2D, time: number, dy: number) => {
      const cx = IMPACT.x, cy = IMPACT.y + WATER;
      w.save(); w.setTransform(k, 0, 0, k, 0, dy); w.clip(shape); w.lineJoin = "round";
      w.strokeStyle = "rgba(160, 240, 255, 0.14)"; w.lineWidth = 9; w.stroke(edge);
      w.strokeStyle = "rgba(2, 22, 38, 0.45)"; w.lineWidth = 3; w.stroke(edge);
      let style: string | CanvasGradient = "rgba(200, 248, 255, 0.85)";
      if (typeof w.createConicGradient === "function") {
        const g = w.createConicGradient(0, cx, cy), stops: Array<[number, string]> = [[0, "rgba(190, 246, 255, 0.75)"], [1, "rgba(190, 246, 255, 0.75)"]];
        for (let j = 0; j < 7; j++) {
          const c = (((j / 7 + (j % 2 ? 1 : -1) * time * 0.00005) % 1) + 1) % 1;
          stops.push([Math.max(0, c - 0.03), "rgba(190, 246, 255, 0.75)"], [c, "rgba(255, 255, 255, 1)"], [Math.min(1, c + 0.03), "rgba(190, 246, 255, 0.75)"]);
        }
        stops.sort((a, b) => a[0] - b[0]).forEach(([o, c]) => g.addColorStop(o, c));
        style = g;
      }
      w.shadowColor = "rgba(110, 236, 255, 0.9)"; w.shadowBlur = 8 * dpr; w.strokeStyle = style; w.lineWidth = 1.5; w.stroke(edge);
      w.restore();
    };
    const drawWater = (time: number) => {
      w.setTransform(1, 0, 0, 1, 0, 0); w.clearRect(0, 0, wc.width, wc.height);
      const dy = ((landed ? WATER : depthAt(WATER_AT, time)) - WATER) * k;
      w.save();
      // While the rings are still uncovering the State, the water layer shows only inside them.
      const r = landed ? REACH : revealAt(time);
      if (r < REACH) { w.setTransform(k, 0, 0, k, 0, 0); w.beginPath(); w.ellipse(IMPACT.x, IMPACT.y, Math.max(0.1, r), Math.max(0.1, r * TILT), 0, 0, Math.PI * 2); w.clip(); }
      w.setTransform(1, 0, 0, 1, 0, dy);
      if (glass) w.drawImage(glass, 0, 0);
      if (mesh) { w.globalAlpha = 0.3; w.drawImage(mesh, 0, 0); w.globalAlpha = 1; }
      const front = landed ? Infinity : frontAt(time);
      if (front > 0) {
        const edge = front === Infinity ? null : frontPath(front, time);
        w.save(); w.setTransform(k, 0, 0, k, 0, dy); w.clip(shape); if (edge) w.clip(edge);
        living(time, dy);
        w.restore();
        if (edge) drawFront(edge, time, dy);
      }
      // The layer's glowing edge, brighter for a moment as it lands.
      if (rim) {
        w.setTransform(1, 0, 0, 1, 0, dy); w.drawImage(rim, 0, 0);
        const lands = UNFOLD + WATER_AT * UNFOLD_GAP + UNFOLD_MS * 0.42, flash = landed ? 0 : Math.exp(-(((time - lands) / 260) ** 2));
        if (flash > 0.02) { w.globalCompositeOperation = "lighter"; w.globalAlpha = flash; w.drawImage(rim, 0, 0); w.globalAlpha = 1; w.globalCompositeOperation = "source-over"; }
      }
      w.restore();
    };

    /** Where the land's own cycle is, read from its recharge pulse so the water answers in step with it. */
    const cycle = () => {
      const time = pulse?.getAnimations?.()[0]?.currentTime;
      return typeof time === "number" ? (time % CYCLE) / CYCLE : (((t - DONE) % CYCLE) + CYCLE) % CYCLE / CYCLE;
    };
    const tick = (now: number) => {
      if (still) { raf = 0; return; }
      raf = requestAnimationFrame(tick);
      if (hold.current || !seen) { last = 0; return; }
      if (!last) last = now;
      t += Math.min(50, now - last); last = now;
      if (!landed) {
        if (box.dataset.landing === "armed") box.dataset.landing = "running";
        pose(t);
        drawLight(t);
        if (!arrived && t >= FILL) { arrived = true; rings.push({ x: IMPACT.x, y: IMPACT.y + WATER, at: t }); }
        if (t >= DONE) finish();
      } else {
        phase = cycle();
        if (before >= 0 && before < ARRIVES && phase >= ARRIVES) RECHARGE.forEach(p => rings.push({ x: p.x, y: p.y + WATER, at: t }));
        before = phase;
      }
      while (rings.length && t - rings[0].at > RING_LIFE) rings.shift();
      drawWater(t);
    };
    const drawStill = () => { if (!landed) finish(); rings.length = 0; drawWater(DONE + 4000); };

    // The State's mandal lines arrive after the page; the water draws without them until then.
    let live = true;
    fetch(`${BASE}/geo/mandal-outlines.json`).then(r => (r.ok ? r.json() as Promise<Outlines> : null)).then(o => {
      if (!live || !o) return;
      const fit = new DOMMatrix([FIT[0], FIT[1], FIT[2], FIT[3], FIT[4], FIT[5] + WATER]);
      const l = new Path2D(); for (const d of o.mandals) l.addPath(new Path2D(d), fit);
      const d = new Path2D(); d.addPath(new Path2D(o.districts), fit);
      lines = l; districts = d; drawMesh();
      if (still || landed) drawWater(t);
    }).catch(() => { /* The water is drawn without the lines. */ });

    // Inside the page the landing waits until the picture is on screen, so a phone that scrolls down to it sees the drop fall.
    const watch = new IntersectionObserver(entries => { if (entries.some(e => e.intersectionRatio >= 0.35)) { seen = true; watch.disconnect(); } }, { threshold: [0, 0.35, 0.6] });
    watch.observe(box);
    const resize = new ResizeObserver(() => { layout(); if (still || landed) drawWater(t); });
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
        <desc id="water-landscape-description">An illustrative Andhra Pradesh landscape connects monsoon rain and crop rows with groundwater in rock and sediment. A drop lands on the land, the layers beneath it settle into place, and water spreads through a cyan water-bearing layer drawn with the State&apos;s mandal lines. Recharge pulses move down to that layer and ring out across it, and an illustrative assessment trace responds. This is not measured data, an actual well map, or a geological cross-section.</desc>
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
