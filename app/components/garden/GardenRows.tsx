import { memo, useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { PAD_LEFT, seedOf, type Garden, type GardenRow as RowLayout } from "../../lib/gardenShared";

/* The water garden, drawn: every mandal a sorghum plant, the dryland staple, drawn as the
   Methodology film draws it. Below the ground its roots reach down to the water table, to
   scale (how deep a borewell must go), and the water stands beneath them, its surface a
   glowing line. Above the ground the plant stands taller where the water is near; its grain
   head stands full and golden where the water is above its usual for the month, stays green
   within 0.1 m of it, and bows over, browned, where the water stands below it, its leaves
   curling. This draws one moment and nothing else: the page (WaterGarden.tsx) and the film
   (GardenFilm.tsx) say what the moment is, so a frame of the film and the page show one
   picture.

   A row is a canvas. The soil, scale and grass are drawn once per size; every moment after
   that redraws the water and the plants, with everything of one colour drawn in one go, so
   670 plants move at the screen's own rate on a phone. The counts each moment was drawn
   with are written on the canvas (data-deeper and the rest) for tests and the film's
   recorder to read. */

export type PlantLook = {
  /** Depth to water in metres at this moment, or null where there is no reading. */
  depth: number | null;
  /** -1 shallower than usual (a full head) through 0 (green) to +1 deeper (bowed), continuous while it changes. */
  side: number;
  /** How far the water stands from its usual, 0 to 1, for how full a head is or how far it bows. */
  mag: number;
  /** Faint where the year has no reading. */
  present: number;
  /** 0 to 1: the stalk and head growing in, and the roots reaching down. */
  grow: number;
  roots: number;
  /** The year's side as counted; null where the plant is not compared. */
  counted: -1 | 0 | 1 | null;
};

export type RowGeometry = {
  /** Tallest stalk, and the height of the soil the roots are drawn to scale in. */
  stemMax: number;
  soil: number;
  /** Heads and leaves at this multiple of their usual size. */
  headScale: number;
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, p: number): RGB => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
const rgb = ([r, g, b]: RGB, lift = 0) => `rgb(${Math.round(Math.max(0, Math.min(255, r + lift)))},${Math.round(Math.max(0, Math.min(255, g + lift)))},${Math.round(Math.max(0, Math.min(255, b + lift)))})`;

/** The grain head: unripe green, full gold (the Methodology film's grain), bowed rust-brown. */
const UNRIPE: RGB = [142, 182, 104], GRAIN: RGB = [236, 198, 112], BOWED: RGB = [226, 112, 66], PARCHED: RGB = [184, 78, 46];
/** The leaves: the film's green, drying to straw as the plant bows. */
const LEAF: RGB = [98, 176, 102], STRAW: RGB = [196, 164, 98];

export const skyOf = (g: RowGeometry) => g.stemMax + 30 * g.headScale;
export const heightOf = (g: RowGeometry) => skyOf(g) + g.soil;

const seeds: number[][] = [];
const seedsOf = (i: number) => (seeds[i] ??= [0, 1, 2, 3, 4, 5, 6].map(k => seedOf(i, k)));

/** A plant's shape at a moment, in numbers, around its foot at (0, 0); y grows downward. */
export function plantGeometry(i: number, look: PlantLook, garden: Garden, g: RowGeometry) {
  const s = seedsOf(i);
  const near = 1 - Math.min(look.depth ?? 15, 30) / 30;
  const h = look.grow * g.stemMax * (0.3 + 0.7 * near) * (0.92 + 0.16 * s[0]);
  const droop = Math.max(0, look.side) * (0.45 + 0.55 * look.mag);
  const full = Math.max(0, -look.side) * (0.62 + 0.38 * look.mag);
  const dir = s[2] > 0.5 ? 1 : -1;
  const dx = (s[1] - 0.5) * 0.22 * h;
  const tx = dx + dir * droop * h * 0.12, ty = -h + droop * h * 0.06;
  // Full and bowed heads are the same length, so the field's colour weighs what its count says.
  const headGrow = clamp((look.grow - 0.55) / 0.45), L = (7.6 + 2.8 * s[3]) * g.headScale * headGrow;
  // Upright along the stalk; a bowed head hangs over to one side.
  const tilt = Math.atan2(dx, Math.max(h, 1)) + dir * droop * 2.35;
  const leafGrow = clamp((look.grow - 0.3) / 0.35), leafLen = (8 + 4 * s[5]) * g.headScale * leafGrow * (1 - 0.22 * droop);
  const R = look.depth === null ? 0 : look.roots * look.depth * ((g.soil - 12) / garden.scaleM);
  return { s, h, dx, tx, ty, droop, full, dir, L, tilt, leafLen, R, tall: h > 0.62 * g.stemMax, head: { x: tx, y: ty, L } };
}

/** The colour buckets heads are drawn in: one fill per bucket a frame. */
const SIDE_STEPS = 16, MAG_STEPS = 3, LIFT_STEPS = 3;
const toneCache = new Map<number, string>();
function toneOf(side: number, mag: number, lift: number) {
  const a = Math.round(((side + 1) / 2) * SIDE_STEPS), b = Math.round(mag * (MAG_STEPS - 1));
  const key = (a * MAG_STEPS + b) * LIFT_STEPS + lift;
  let tone = toneCache.get(key);
  if (!tone) {
    const sv = (a / SIDE_STEPS) * 2 - 1, mv = b / (MAG_STEPS - 1);
    tone = rgb(sv < 0 ? mix(UNRIPE, GRAIN, -sv) : mix(UNRIPE, mix(BOWED, PARCHED, mv), sv), (lift - 1) * 10);
    toneCache.set(key, tone);
  }
  return { key, tone };
}
const leafTones = Array.from({ length: 9 }, (_, j) => rgb(mix(LEAF, STRAW, j / 8)));
const STALK: RGB = [95, 158, 92], DRY_STALK: RGB = [176, 150, 96];
const stalkTones = Array.from({ length: 5 }, (_, j) => rgb(mix(STALK, DRY_STALK, j / 4)));
/** How dry a plant reads, 0 to 1: it goes to straw well before it bows all the way. */
const dryness = (droop: number) => Math.min(1, droop * 1.7);

let haloCanvas: HTMLCanvasElement | null = null;
function haloSprite() {
  if (haloCanvas) return haloCanvas;
  haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 64;
  const c = haloCanvas.getContext("2d")!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(143,224,255,.5)"); g.addColorStop(1, "rgba(143,224,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return haloCanvas;
}

const monoFont = () => getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";

type Batch = {
  roots: Path2D; stalks: Path2D[]; leaves: Path2D[]; ribs: Path2D;
  heads: Map<number, { tone: string; path: Path2D }>; grain: Path2D; halos: Array<[number, number, number, number]>;
};
const batch = (): Batch => ({ roots: new Path2D(), stalks: stalkTones.map(() => new Path2D()), leaves: leafTones.map(() => new Path2D()), ribs: new Path2D(), heads: new Map(), grain: new Path2D(), halos: [] });

/** Adds one plant, standing at x on the ground line y0, to a frame's batches. */
function trace(x: number, y0: number, g: ReturnType<typeof plantGeometry>, lk: PlantLook, b: Batch) {
  const { s, h, dx, tx, ty, droop, full, dir, L, tilt, leafLen, R, tall } = g;
  // Roots: a fibrous fan near the surface and one deep root down to the water.
  if (R > 0.4) {
    const wob = (s[1] - 0.5) * 3.2, fan = Math.min(R, 7);
    b.roots.moveTo(x, y0);
    b.roots.bezierCurveTo(x + wob, y0 + R * 0.33, x - wob, y0 + R * 0.66, x + wob * 0.4, y0 + R);
    for (const side of [-1, 1]) { b.roots.moveTo(x, y0); b.roots.quadraticCurveTo(x + side * fan * 0.5, y0 + fan * 0.4, x + side * fan * 0.7, y0 + fan); }
    if (R > 9) for (const [f, side, len] of [[0.3, -1, 4], [0.55, 1, 5], [0.78, -1, 3.5]] as const) {
      const ry = y0 + R * f, rx = x + wob * 0.3 * (f < 0.5 ? 1 : -1), l = len * (0.7 + 0.6 * s[f < 0.5 ? 3 : 4]);
      b.roots.moveTo(rx, ry); b.roots.lineTo(rx + side * l * 0.8, ry + l * 0.6);
    }
  }
  if (h < 0.3) return;
  // The stalk, bending over at the top as the head bows.
  const stalk = b.stalks[Math.round(dryness(droop) * 4)];
  stalk.moveTo(x, y0);
  stalk.bezierCurveTo(x + dx * 0.1, y0 - h * 0.45, x + dx * 0.7 + dir * droop * h * 0.1, y0 - h * 0.97, x + tx, y0 + ty);

  // Two or three alternate arching blades, as the film's; they curl and hang as the plant dries.
  if (leafLen > 0.6) {
    const count = tall ? 3 : 2;
    for (let j = 0; j < count; j++) {
      const f = 0.2 + j * 0.22 + 0.06 * s[5], side = (j + (s[6] > 0.5 ? 1 : 0)) % 2 ? 1 : -1;
      const px = x + dx * f * f, py = y0 - h * f, len = leafLen * (1 - j * 0.12);
      const hang = 0.12 + 0.18 * s[(j + 3) % 7] + 1.15 * droop;
      const tipX = px + side * len * (1 - 0.25 * droop), tipY = py - len * 0.3 + len * hang * 1.2;
      const path = b.leaves[Math.round(dryness(droop) * 8)];
      path.moveTo(px, py);
      path.bezierCurveTo(px + side * len * 0.3, py - len * 0.55, px + side * len * 0.78, py - len * 0.45 + len * hang * 0.5, tipX, tipY);
      path.bezierCurveTo(px + side * len * 0.68, py - len * 0.22 + len * hang * 0.4, px + side * len * 0.3, py - len * 0.24, px, py + 1.4);
      b.ribs.moveTo(px, py + 0.3);
      b.ribs.bezierCurveTo(px + side * len * 0.3, py - len * 0.42, px + side * len * 0.74, py - len * 0.36 + len * hang * 0.45, tipX, tipY);
    }
  }
  if (L < 0.3) return;
  // The grain head: a tight panicle, widest in the middle, plump when full, thin when parched.
  const hx = x + tx, hy = y0 + ty, cs = Math.cos(tilt), sn = Math.sin(tilt);
  const px = (u: number, v: number) => hx + u * cs - v * sn, py = (u: number, v: number) => hy + u * sn + v * cs;
  const W = L * (0.32 + 0.08 * Math.max(full, droop));
  if (full > 0.08 && L > 1) b.halos.push([px(0, -L * 0.5), py(0, -L * 0.5), L * 0.95, full * 0.26]);
  const { key, tone } = toneOf(lk.side, lk.mag, Math.round(s[4] * (LIFT_STEPS - 1)));
  let bucket = b.heads.get(key);
  if (!bucket) { bucket = { tone, path: new Path2D() }; b.heads.set(key, bucket); }
  bucket.path.moveTo(px(0, 0.6), py(0, 0.6));
  bucket.path.bezierCurveTo(px(-W, -L * 0.18), py(-W, -L * 0.18), px(-W * 0.9, -L * 0.78), py(-W * 0.9, -L * 0.78), px(0, -L), py(0, -L));
  bucket.path.bezierCurveTo(px(W * 0.9, -L * 0.78), py(W * 0.9, -L * 0.78), px(W, -L * 0.18), py(W, -L * 0.18), px(0, 0.6), py(0, 0.6));
  // The grains catching the light: a few plump beads along a head that is not bowed (a parched head shows none).
  const r = W * 0.26;
  if (droop < 0.3) for (const [u, side] of [[0.22, -1], [0.38, 1], [0.54, -1], [0.7, 1], [0.84, -0.4]] as const) {
    const gx = px(side * W * 0.38, -L * u), gy = py(side * W * 0.38, -L * u);
    b.grain.moveTo(gx + r, gy); b.grain.arc(gx, gy, r, 0, Math.PI * 2);
  }
}

function drawBatch(c: CanvasRenderingContext2D, b: Batch, alpha: number) {
  c.globalAlpha = alpha;
  c.lineCap = "round";
  c.strokeStyle = "rgba(222,198,160,.5)"; c.lineWidth = 0.55; c.stroke(b.roots);
  c.lineWidth = 0.85;
  b.stalks.forEach((path, j) => { c.strokeStyle = stalkTones[j]; c.stroke(path); });
  b.leaves.forEach((path, j) => { c.fillStyle = leafTones[j]; c.fill(path); });
  c.strokeStyle = "rgba(255,255,255,.22)"; c.lineWidth = 0.25; c.stroke(b.ribs);
  if (b.halos.length) {
    const sprite = haloSprite();
    for (const [x, y, size, a] of b.halos) { c.globalAlpha = alpha * a; c.drawImage(sprite, x - size, y - size, size * 2, size * 2); }
    c.globalAlpha = alpha;
  }
  b.heads.forEach(({ tone, path }) => { c.fillStyle = tone; c.fill(path); });
  c.fillStyle = "rgba(255,244,214,.38)"; c.fill(b.grain);
}

/** A monsoon falling between two Octobers: how far through it is (0 to 1), and its rain against normal (1 is a normal season). */
export type RainMoment = { p: number; amount: number };

/** Paints a moment onto a row: each plant and the water, and the rain while a monsoon falls. */
export type Painter = (look: (i: number) => PlantLook, waterIn: number, rain?: RainMoment | null) => void;

/** Rain streaks per 1,000 units of row in a normal season; a season's count is in proportion to its rain. */
const STREAKS_PER_K = 520;

type RowProps = {
  garden: Garden;
  row: RowLayout;
  rowIndex: number;
  geometry: RowGeometry;
  /** The moment to draw; a parent animating the row paints its own moments through `register`. */
  look: (i: number) => PlantLook;
  /** 0 to 1: the water fading in. */
  waterIn?: number;
  ticks: boolean;
  tickFont?: number;
  /** Device pixels per CSS pixel: the screen's own by default; a film drawn at its video's size passes 1. */
  pixelRatio?: number;
  className?: string;
  label: string;
  register?: (rowIndex: number, paint: Painter | null) => void;
  onPointerMove?: (event: ReactPointerEvent<HTMLCanvasElement>, rowIndex: number) => void;
  onClick?: (event: ReactMouseEvent<HTMLCanvasElement>, rowIndex: number) => void;
};

export const GardenRow = memo(function GardenRow({ garden, row, rowIndex, geometry, look, waterIn = 1, ticks, tickFont = 11, pixelRatio, className, label, register, onPointerMove, onClick }: RowProps) {
  const sky = skyOf(geometry), height = heightOf(geometry), k = (geometry.soil - 12) / garden.scaleM;
  const spacing = row.plants.length > 1 ? row.plants[1].x - row.plants[0].x : 2;
  const from = (row.spans[0]?.from ?? PAD_LEFT) - 4, to = (row.spans[row.spans.length - 1]?.to ?? row.width) + 4;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ground = useRef<{ size: string; layer: HTMLCanvasElement } | null>(null);
  const latest = useRef<{ look: (i: number) => PlantLook; waterIn: number; rain?: RainMoment | null }>({ look, waterIn });

  /** The soil, the depth scale, the ground line and the grass: the same on every frame. */
  const groundLayer = useCallback((w: number, hgt: number, scale: number) => {
    const size = `${w}x${hgt}`;
    if (ground.current?.size === size) return ground.current.layer;
    const layer = document.createElement("canvas");
    layer.width = w; layer.height = hgt;
    const c = layer.getContext("2d")!;
    c.setTransform(scale, 0, 0, scale, 0, 0);
    const soil = c.createLinearGradient(0, sky, 0, height);
    soil.addColorStop(0, "#2f2418"); soil.addColorStop(0.35, "#1b1510"); soil.addColorStop(1, "#0c0a08");
    c.fillStyle = soil;
    c.fillRect(from, sky, to - from, geometry.soil);
    if (ticks) {
      const step = garden.scaleM > 40 ? 20 : 10;
      c.font = `${tickFont}px ${monoFont()}`; c.textAlign = "right"; c.fillStyle = "#8197a8";
      c.strokeStyle = "rgba(255,255,255,.07)"; c.lineWidth = 0.6; c.setLineDash([2, 3]);
      for (let m = 0; m <= garden.scaleM; m += step) {
        const y = sky + m * k;
        c.beginPath(); c.moveTo(from, y); c.lineTo(to, y); c.stroke();
        c.fillText(`${m} m`, from - 4, y + tickFont * 0.35);
      }
      c.setLineDash([]);
    }
    c.strokeStyle = "rgba(150,190,140,.35)"; c.lineWidth = 0.6;
    c.beginPath(); c.moveTo(from, sky); c.lineTo(to, sky); c.stroke();
    c.strokeStyle = "rgba(47,110,73,.85)"; c.lineWidth = 0.55; c.lineCap = "round";
    c.beginPath();
    for (let x = from + 2, n = 0; x < to - 2; x += 1.15, n++) {
      const blade = 2 + 7 * seedOf(n, 11), lean = (seedOf(n, 12) - 0.5) * 3;
      c.moveTo(x, sky); c.lineTo(x + lean, sky - blade);
    }
    c.stroke();
    ground.current = { size, layer };
    return layer;
  }, [garden.scaleM, sky, height, k, from, to, geometry.soil, ticks, tickFont]);

  const paint = useCallback<Painter>((lookAtMoment, water, rain) => {
    latest.current = { look: lookAtMoment, waterIn: water, rain };
    const canvas = canvasRef.current;
    if (!canvas || !canvas.offsetWidth) return;
    const ratio = pixelRatio ?? Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(canvas.offsetWidth * ratio), hgt = Math.round(((canvas.offsetWidth * height) / row.width) * ratio);
    if (canvas.width !== w || canvas.height !== hgt) { canvas.width = w; canvas.height = hgt; }
    const scale = w / row.width, c = canvas.getContext("2d")!;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.clearRect(0, 0, w, hgt);
    c.drawImage(groundLayer(w, hgt, scale), 0, 0);
    c.setTransform(scale, 0, 0, scale, 0, 0);

    const looks = row.plants.map(p => lookAtMoment(p.i));
    let deeper = 0, shallower = 0, steady = 0, none = 0, signature = water;

    // The water: a translucent body whose top is each mandal's water table (a mandal not read
    // carries its neighbour's, so the body has no holes), and the water table as a glowing
    // line stepping from mandal to mandal, broken where one was not read and between regions.
    c.save();
    c.globalAlpha = water;
    c.beginPath();
    for (const span of row.spans) c.rect(span.from, 0, span.to - span.from, height);
    c.clip();
    const body = c.createLinearGradient(0, sky, 0, height);
    body.addColorStop(0, "rgba(42,159,214,.5)"); body.addColorStop(0.3, "rgba(26,111,158,.34)"); body.addColorStop(1, "rgba(13,58,88,.26)");
    c.fillStyle = body;
    const line = new Path2D(), pool = new Path2D();
    let carried: number | null = null, open = false, lastX = -Infinity;
    row.plants.forEach((p, n) => {
      const lk = looks[n];
      const measured = lk.depth !== null && lk.present >= 0.5 ? lk.depth : null;
      if (p.x - lastX > spacing * 1.5) { open = false; carried = null; }
      lastX = p.x;
      const depth = measured ?? carried;
      if (measured !== null) carried = measured;
      if (depth === null) { open = false; return; }
      const left = p.x - spacing / 2, right = p.x + spacing / 2 + 0.05, y = sky + depth * k;
      pool.rect(left, y, right - left, height - y);
      if (measured === null) { open = false; return; }
      if (open) line.lineTo(left, y); else line.moveTo(left, y);
      line.lineTo(right, y);
      open = true;
    });
    c.fill(pool);
    c.restore();
    c.save();
    c.lineJoin = "round";
    // The glow: wide faint strokes under a fine bright one (a blur would cost a phone a frame).
    c.strokeStyle = "#5fd0f6";
    for (const [width, alpha] of [[4.2, 0.12], [2.6, 0.22], [1.5, 0.55]] as const) {
      c.globalAlpha = water * alpha; c.lineWidth = width; c.stroke(line);
    }
    c.globalAlpha = water;
    c.strokeStyle = "#b5efff"; c.lineWidth = 0.6;
    c.stroke(line);
    c.restore();

    // The plants: everything of one colour in one go; the faint plants of a year with no
    // reading drawn after, each at its own strength.
    const full = batch(), faint: number[] = [];
    row.plants.forEach((p, n) => {
      const lk = looks[n];
      signature += lk.grow * 3 + lk.roots * 5 + lk.side * 7 + (lk.depth ?? 0) * 0.01 + lk.present * 11;
      if (lk.counted === 1) deeper++; else if (lk.counted === -1) shallower++; else if (lk.counted === 0) steady++; else none++;
      if (lk.present < 0.99) { faint.push(n); return; }
      trace(p.x, sky, plantGeometry(p.i, lk, garden, geometry), lk, full);
    });
    drawBatch(c, full, 1);
    for (const n of faint) {
      const one = batch(), p = row.plants[n];
      trace(p.x, sky, plantGeometry(p.i, looks[n], garden, geometry), looks[n], one);
      drawBatch(c, one, looks[n].present);
    }
    c.globalAlpha = 1;

    // The monsoon: streaks across the sky, as many as the season's rain against normal,
    // gathering and easing over the beat it falls in.
    if (rain && rain.p > 0 && rain.p < 1) {
      const span = to - from, count = Math.round((STREAKS_PER_K * span / 1000) * rain.amount);
      const envelope = Math.sin(Math.PI * rain.p) ** 0.6;
      // The cloud's veil over the sky: deeper in a wet season.
      const veil = c.createLinearGradient(0, 0, 0, sky), depth = (0.2 * Math.min(1.5, rain.amount) * envelope).toFixed(3);
      veil.addColorStop(0, "rgba(150,180,200,0)");
      veil.addColorStop(0.22, `rgba(150,180,200,${depth})`);
      veil.addColorStop(1, "rgba(150,180,200,0)");
      c.fillStyle = veil; c.fillRect(0, 0, row.width, sky);
      const near = new Path2D(), far = new Path2D();
      for (let j = 0; j < count; j++) {
        const len = 12 + 10 * seedOf(j, 24), fall = (sky + len) * (0.9 + 0.5 * seedOf(j, 22));
        const y = ((rain.p * fall * 2.4 + seedOf(j, 23) * (sky + len)) % (sky + len)) - len;
        const x = from + seedOf(j, 21) * span + y * 0.14, path = seedOf(j, 25) > 0.35 ? near : far;
        path.moveTo(x, y); path.lineTo(x + len * 0.14, y + len);
      }
      c.lineCap = "round"; c.strokeStyle = "rgb(190,228,248)";
      c.lineWidth = 0.55; c.globalAlpha = 0.45 * envelope; c.stroke(far);
      c.lineWidth = 0.9; c.globalAlpha = 0.8 * envelope; c.stroke(near);
      c.globalAlpha = 1;
      signature += rain.p * 13 + rain.amount;
    }

    const marks: Array<[string, string]> = [["data-deeper", String(deeper)], ["data-shallower", String(shallower)], ["data-steady", String(steady)], ["data-none", String(none)], ["data-moment", signature.toFixed(3)]];
    for (const [name, value] of marks) if (canvas.getAttribute(name) !== value) canvas.setAttribute(name, value);
  }, [garden, row, geometry, sky, height, k, spacing, pixelRatio, groundLayer]);

  useLayoutEffect(() => { paint(look, waterIn); }, [paint, look, waterIn]);
  useLayoutEffect(() => {
    register?.(rowIndex, paint);
    return () => register?.(rowIndex, null);
  }, [register, rowIndex, paint]);
  // A new size: the last moment again, at the new resolution.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const watcher = new ResizeObserver(() => paint(latest.current.look, latest.current.waterIn, latest.current.rain));
    watcher.observe(canvas);
    return () => watcher.disconnect();
  }, [paint]);

  return (
    <canvas ref={canvasRef} className={className} style={{ display: "block", width: "100%", aspectRatio: `${row.width} / ${height}` }}
      role="img" aria-label={label} data-garden-row={row.region ?? "all"}
      onPointerMove={onPointerMove ? event => onPointerMove(event, rowIndex) : undefined} onClick={onClick ? event => onClick(event, rowIndex) : undefined} />
  );
});

/** The ring round a plant a reader points at, drawn over its row (the row itself is not redrawn for it). */
export function GardenMark({ garden, row, geometry, look, i }: { garden: Garden; row: RowLayout; geometry: RowGeometry; look: (i: number) => PlantLook; i: number | null }) {
  const at = i === null ? undefined : row.plants.find(p => p.i === i);
  const sky = skyOf(geometry), height = heightOf(geometry);
  if (!at || i === null) return null;
  const g = plantGeometry(i, look(i), garden, geometry);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return (
    <svg viewBox={`0 0 ${r1(row.width)} ${r1(height)}`} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <g transform={`translate(${r1(at.x)} ${sky})`}>
        <line x1={0} x2={0} y1={r1(-sky + 4)} y2={r1(geometry.soil - 2)} stroke="rgba(255,255,255,.28)" strokeWidth={0.6} strokeDasharray="2 2" />
        <circle cx={r1(g.head.x)} cy={r1(g.head.y - g.head.L * 0.5)} r={r1(Math.max(5, g.head.L * 1.3))} fill="none" stroke="#fff" strokeWidth={0.9} />
      </g>
    </svg>
  );
}
