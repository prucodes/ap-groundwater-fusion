import { memo, useCallback, useEffect, useLayoutEffect, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { PAD_LEFT, seedOf, type Garden, type GardenRow as RowLayout } from "../../lib/gardenShared";

/* The water garden, drawn: every mandal a plant. Below the ground its roots reach down to
   the water table, to scale, and the water stands beneath them, its surface a glowing line;
   above the ground the plant stands taller where the water is near, opens blue where the
   water stands shallower than its usual for the month, stays a bud within 0.1 m of it, and
   nods over in rust where it stands deeper. This draws one moment and nothing else: the
   page (WaterGarden.tsx) and the film (GardenFilm.tsx) say what the moment is, so a frame
   of the film and the page show one picture.

   A row is a canvas. The soil, scale and grass are drawn once per size; every moment after
   that redraws the water and the plants, with everything of one colour drawn in one go, so
   670 plants move at the screen's own rate on a phone. The counts each moment was drawn
   with are written on the canvas (data-deeper and the rest) for tests and the film's
   recorder to read. */

export type PlantLook = {
  /** Depth to water in metres at this moment, or null where there is no reading. */
  depth: number | null;
  /** -1 shallower than usual (open) through 0 (bud) to +1 deeper (drooping), continuous while it changes. */
  side: number;
  /** How far the water stands from its usual, 0 to 1, for how wide a flower opens or how far it nods. */
  mag: number;
  /** Faint where the year has no reading. */
  present: number;
  /** 0 to 1: the stem and head growing in, and the roots reaching down. */
  grow: number;
  roots: number;
  /** The year's side as counted; null where the plant is not compared. */
  counted: -1 | 0 | 1 | null;
};

export type RowGeometry = {
  /** Tallest stem, and the height of the soil the roots are drawn to scale in. */
  stemMax: number;
  soil: number;
  /** Heads and leaves at this multiple of their usual size. */
  headScale: number;
};

const clamp = (x: number) => Math.max(0, Math.min(1, x));
type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, p: number): RGB => [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
const rgb = ([r, g, b]: RGB, lift = 0) => `rgb(${Math.round(Math.min(255, r + lift))},${Math.round(Math.min(255, g + lift))},${Math.round(Math.min(255, b + lift))})`;

const BLOOM: RGB = [86, 198, 236], BUD: RGB = [148, 166, 180], DROOP: RGB = [236, 124, 82], WILT: RGB = [196, 86, 52];
const LEAF: RGB = [66, 146, 96], LEAF_DRY: RGB = [146, 124, 66], GOLD: RGB = [244, 200, 112], SEED: RGB = [92, 62, 42];

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
  const bloom = Math.max(0, -look.side) * (0.62 + 0.38 * look.mag);
  const dir = s[2] > 0.5 ? 1 : -1;
  const dx = (s[1] - 0.5) * 0.22 * h;
  const tx = dx + dir * droop * h * 0.17, ty = -h + droop * h * 0.11;
  // Open and drooping heads are the same size and nearly as wide, so the garden's colour weighs what its count says.
  const headGrow = clamp((look.grow - 0.55) / 0.45), L = (6.8 + 2.6 * s[3]) * g.headScale * headGrow;
  const fan = (9 + 50 * bloom + 40 * droop) * (Math.PI / 180);
  const tilt = Math.atan2(dx, Math.max(h, 1)) + dir * droop * 2.2;
  const leafGrow = clamp((look.grow - 0.3) / 0.35), leafLen = (5 + 3 * s[5]) * g.headScale * leafGrow;
  const R = look.depth === null ? 0 : look.roots * look.depth * ((g.soil - 12) / garden.scaleM);
  return { s, h, dx, tx, ty, droop, bloom, dir, L, fan, tilt, leafLen, R, head: { x: tx, y: ty, L } };
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
    tone = rgb(sv < 0 ? mix(BUD, BLOOM, -sv) : mix(BUD, mix(DROOP, WILT, mv), sv), (lift - 1) * 11);
    toneCache.set(key, tone);
  }
  return { key, tone };
}
const leafTones = Array.from({ length: 9 }, (_, j) => rgb(mix(LEAF, LEAF_DRY, j / 8)));
const centreTones = Array.from({ length: 7 }, (_, j) => rgb(mix(SEED, GOLD, j / 6)));

let haloCanvas: HTMLCanvasElement | null = null;
function haloSprite() {
  if (haloCanvas) return haloCanvas;
  haloCanvas = document.createElement("canvas");
  haloCanvas.width = haloCanvas.height = 64;
  const c = haloCanvas.getContext("2d")!, g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(143,224,255,.55)"); g.addColorStop(1, "rgba(143,224,255,0)");
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  return haloCanvas;
}

const monoFont = () => getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() || "monospace";

type Batch = {
  roots: Path2D; stems: Path2D; leaves: Path2D[]; centres: Path2D[];
  heads: Map<number, { tone: string; path: Path2D }>; sheen: Path2D; halos: Array<[number, number, number, number]>;
};
const batch = (): Batch => ({ roots: new Path2D(), stems: new Path2D(), leaves: leafTones.map(() => new Path2D()), centres: centreTones.map(() => new Path2D()), heads: new Map(), sheen: new Path2D(), halos: [] });

/** Adds one plant, standing at x on the ground line y0, to a frame's batches. */
function trace(x: number, y0: number, g: ReturnType<typeof plantGeometry>, lk: PlantLook, b: Batch) {
  const { s, h, dx, tx, ty, droop, bloom, dir, L, fan, tilt, leafLen, R } = g;
  if (R > 0.4) {
    const wob = (s[1] - 0.5) * 3.2;
    b.roots.moveTo(x, y0);
    b.roots.bezierCurveTo(x + wob, y0 + R * 0.33, x - wob, y0 + R * 0.66, x + wob * 0.4, y0 + R);
    if (R > 9) for (const [f, side, len] of [[0.28, -1, 4], [0.52, 1, 5], [0.76, -1, 3.5]] as const) {
      const ry = y0 + R * f, rx = x + wob * 0.3 * (f < 0.5 ? 1 : -1), l = len * (0.7 + 0.6 * s[f < 0.5 ? 3 : 4]);
      b.roots.moveTo(rx, ry); b.roots.lineTo(rx + side * l * 0.8, ry + l * 0.6);
    }
  }
  if (h < 0.3) return;
  b.stems.moveTo(x, y0);
  b.stems.bezierCurveTo(x + dx * 0.1, y0 - h * 0.45, x + dx * 0.7 + dir * droop * h * 0.13, y0 - h * 0.96, x + tx, y0 + ty);

  if (leafLen > 0.3) {
    const side2 = s[6] > 0.5 ? 1 : -1, at = 0.24 + 0.3 * s[5], lx = x + dx * at * at, ly = y0 - h * at;
    const la = 0.62 - droop * 0.9, tipX = lx + side2 * leafLen * Math.cos(la), tipY = ly - leafLen * Math.sin(la);
    const nx = -(tipY - ly) / leafLen, ny = (tipX - lx) / leafLen, lw = leafLen * 0.3 * side2;
    const path = b.leaves[Math.round(droop * 8)];
    path.moveTo(lx, ly);
    path.quadraticCurveTo((lx + tipX) / 2 + nx * lw, (ly + tipY) / 2 + ny * lw, tipX, tipY);
    path.quadraticCurveTo((lx + tipX) / 2 - nx * lw, (ly + tipY) / 2 - ny * lw, lx, ly);
  }
  if (L < 0.3) return;
  const hx = x + tx, hy = y0 + ty;
  if (bloom > 0.08 && L > 1) b.halos.push([hx + Math.sin(tilt) * L * 0.5, hy - Math.cos(tilt) * L * 0.5, L * 1.15, bloom * 0.32]);
  const { key, tone } = toneOf(lk.side, lk.mag, Math.round(s[4] * (LIFT_STEPS - 1)));
  let bucket = b.heads.get(key);
  if (!bucket) { bucket = { tone, path: new Path2D() }; b.heads.set(key, bucket); }
  const w = L * 0.42, iw = w * 0.42, il = L * 0.78;
  for (const kk of [-1, -0.5, 0, 0.5, 1]) {
    const a = kk * fan + tilt, cs = Math.cos(a), sn = Math.sin(a);
    const px = (u: number, v: number) => hx + u * cs - v * sn, py = (u: number, v: number) => hy + u * sn + v * cs;
    bucket.path.moveTo(hx, hy);
    bucket.path.bezierCurveTo(px(-w, -L * 0.36), py(-w, -L * 0.36), px(-w * 0.86, -L * 0.92), py(-w * 0.86, -L * 0.92), px(0, -L), py(0, -L));
    bucket.path.bezierCurveTo(px(w * 0.86, -L * 0.92), py(w * 0.86, -L * 0.92), px(w, -L * 0.36), py(w, -L * 0.36), hx, hy);
    // A lighter, narrower petal inside each: the light catching it.
    b.sheen.moveTo(px(0, -L * 0.12), py(0, -L * 0.12));
    b.sheen.bezierCurveTo(px(-iw, -il * 0.4), py(-iw, -il * 0.4), px(-iw * 0.6, -il * 0.92), py(-iw * 0.6, -il * 0.92), px(0, -il), py(0, -il));
    b.sheen.bezierCurveTo(px(iw * 0.6, -il * 0.92), py(iw * 0.6, -il * 0.92), px(iw, -il * 0.4), py(iw, -il * 0.4), px(0, -L * 0.12), py(0, -L * 0.12));
  }
  const cr = L * 0.16 * (0.5 + bloom), cx = hx + Math.sin(tilt) * L * 0.3, cy = hy - Math.cos(tilt) * L * 0.3;
  const centre = b.centres[Math.round(bloom * 6)];
  centre.moveTo(cx + cr, cy);
  centre.arc(cx, cy, cr, 0, Math.PI * 2);
}

function drawBatch(c: CanvasRenderingContext2D, b: Batch, alpha: number) {
  c.globalAlpha = alpha;
  c.lineCap = "round";
  c.strokeStyle = "rgba(222,198,160,.5)"; c.lineWidth = 0.55; c.stroke(b.roots);
  c.strokeStyle = "#4f9a68"; c.lineWidth = 0.7; c.stroke(b.stems);
  b.leaves.forEach((path, j) => { c.fillStyle = leafTones[j]; c.fill(path); });
  if (b.halos.length) {
    const sprite = haloSprite();
    for (const [x, y, size, a] of b.halos) { c.globalAlpha = alpha * a; c.drawImage(sprite, x - size, y - size, size * 2, size * 2); }
    c.globalAlpha = alpha;
  }
  b.heads.forEach(({ tone, path }) => { c.fillStyle = tone; c.fill(path); });
  c.fillStyle = "rgba(255,255,255,.2)"; c.fill(b.sheen);
  b.centres.forEach((path, j) => { c.fillStyle = centreTones[j]; c.fill(path); });
}

/** Paints a moment onto a row: each plant and the water. */
export type Painter = (look: (i: number) => PlantLook, waterIn: number) => void;

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
  const latest = useRef<{ look: (i: number) => PlantLook; waterIn: number }>({ look, waterIn });

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

  const paint = useCallback<Painter>((lookAtMoment, water) => {
    latest.current = { look: lookAtMoment, waterIn: water };
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
    const watcher = new ResizeObserver(() => paint(latest.current.look, latest.current.waterIn));
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
