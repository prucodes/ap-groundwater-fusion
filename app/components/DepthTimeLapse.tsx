"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./DepthTimeLapse.module.css";

/* Twelve years of the water table, one month at a time.
 *
 * Every mandal is drawn against its own median for that calendar month and
 * scaled by its own range, because hard rock moves ten to thirty metres where
 * the delta moves one: a single scale in metres would paint half the State
 * saturated in every frame and show nothing moving. Colour therefore means
 * "unusual for here", which is the rule the rest of the platform already uses.
 *
 * Canvas rather than SVG: 670 fills a frame, 141 frames.
 */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MS_PER_FRAME = 110;
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

type Lapse = {
  months: string[]; mandals: number; stepM: number; zero: number;
  scaleM: Array<number | null>; deeperThanUsualPct: Array<number | null>;
  oniC: Array<number | null>; cells: string; rule: string;
};
type Outlines = { view: { width: number; height: number }; mandals: string[]; districts: string };

/** Blue where the table sits higher than this mandal's usual, red where it sits lower. */
function shade(t: number) {
  const stops: Array<[number, number, number]> = [
    [43, 127, 163], [157, 196, 212], [238, 241, 244], [221, 163, 106], [168, 64, 44],
  ];
  const at = (Math.max(-1, Math.min(1, t)) + 1) / 2 * (stops.length - 1);
  const low = Math.floor(at), high = Math.min(stops.length - 1, low + 1), mix = at - low;
  const channel = (index: number) => Math.round(stops[low][index] + (stops[high][index] - stops[low][index]) * mix);
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

const label = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

export function DepthTimeLapse() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [lapse, setLapse] = useState<Lapse | null>(null);
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const paths = useRef<Path2D[] | null>(null);
  const cells = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch(`${BASE}/geo/depth-timelapse.json`).then(r => r.json() as Promise<Lapse>),
      fetch(`${BASE}/geo/mandal-outlines.json`).then(r => r.json() as Promise<Outlines>),
    ]).then(([lapseJson, outlineJson]) => {
      if (!live) return;
      const binary = atob(lapseJson.cells);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      cells.current = bytes;
      paths.current = outlineJson.mandals.map(d => new Path2D(d));
      setLapse(lapseJson);
      setOutlines(outlineJson);
      setFrame(lapseJson.months.length - 1);
    }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const draw = useCallback((position: number) => {
    const node = canvas.current, data = lapse, shapes = paths.current, bytes = cells.current;
    if (!node || !data || !shapes || !bytes || !outlines) return;
    const context = node.getContext("2d");
    if (!context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = node.clientWidth, height = width * outlines.view.height / outlines.view.width;
    if (node.width !== Math.round(width * ratio)) {
      node.width = Math.round(width * ratio);
      node.height = Math.round(height * ratio);
      node.style.height = `${height}px`;
    }
    context.setTransform(ratio * width / outlines.view.width, 0, 0, ratio * width / outlines.view.width, 0, 0);
    context.clearRect(0, 0, outlines.view.width, outlines.view.height);
    const start = position * data.mandals;
    context.lineWidth = 0.5;
    context.strokeStyle = "rgba(255,255,255,.55)";
    for (let index = 0; index < shapes.length; index += 1) {
      const byte = bytes[start + index];
      const scale = data.scaleM[index];
      context.fillStyle = byte === 0 || !scale
        ? "rgba(255,255,255,.14)"
        : shade(((byte - data.zero) * data.stepM) / scale);
      context.fill(shapes[index]);
      context.stroke(shapes[index]);
    }
  }, [lapse, outlines]);

  useEffect(() => { draw(frame); }, [draw, frame]);
  useEffect(() => {
    const onResize = () => draw(frame);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw, frame]);

  useEffect(() => {
    if (!playing || !lapse) return;
    const timer = window.setInterval(() => {
      setFrame(current => (current + 1 >= lapse.months.length ? 0 : current + 1));
    }, MS_PER_FRAME);
    return () => window.clearInterval(timer);
  }, [playing, lapse]);

  const strip = useMemo(() => {
    if (!lapse) return null;
    const W = 720, H = 56, n = lapse.months.length;
    const x = (index: number) => (index / Math.max(1, n - 1)) * W;
    const share = lapse.deeperThanUsualPct;
    const points = share.map((value, index) => `${x(index).toFixed(1)},${(H - (value ?? 0) / 100 * (H - 12)).toFixed(1)}`);
    const warm: Array<[number, number]> = [];
    lapse.oniC.forEach((value, index) => {
      if (value === null || value < 0.5) return;
      const last = warm[warm.length - 1];
      if (last && index === last[1] + 1) last[1] = index; else warm.push([index, index]);
    });
    const oni = lapse.oniC.map((value, index) =>
      value === null ? null : `${x(index).toFixed(1)},${(H - 10 - ((value + 1.5) / 4.5) * (H - 22)).toFixed(1)}`);
    const zeroY = H - 10 - ((0 + 1.5) / 4.5) * (H - 22);
    return { W, H, x, points, warm, zeroY, oni: oni.filter(Boolean).join(" ") };
  }, [lapse]);

  if (!lapse || !outlines || !strip) {
    return <div className={styles.wrap}><div className={styles.stage} style={{ aspectRatio: "1.6" }} /></div>;
  }

  const month = lapse.months[frame];
  const share = lapse.deeperThanUsualPct[frame];
  const oni = lapse.oniC[frame];

  return (
    <div className={styles.wrap}>
      <div className={styles.stage}>
        <canvas ref={canvas} role="img" aria-label={`Water table against each mandal's own usual, ${label(month)}`} />
        <div className={styles.readout}>
          <span className={styles.month}>{label(month)}</span>
          <span className={styles.sub}>
            <b>{share === null ? "—" : `${share}%`}</b> of mandals deeper than their own usual
            {oni === null ? "" : ` · Niño 3.4 ${oni > 0 ? "+" : ""}${oni.toFixed(2)} °C`}
          </span>
        </div>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.play} onClick={() => setPlaying(!playing)}
          aria-label={playing ? "Pause" : "Play twelve years"}>
          {playing
            ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="4" height="12" fill="currentColor" rx="1" /><rect x="9" y="2" width="4" height="12" fill="currentColor" rx="1" /></svg>
            : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z" fill="currentColor" /></svg>}
        </button>
        <input className={styles.scrub} type="range" min={0} max={lapse.months.length - 1} value={frame}
          aria-label="Month" aria-valuetext={label(month)}
          onChange={event => { setPlaying(false); setFrame(Number(event.target.value)); }} />
      </div>

      <svg className={styles.strip} viewBox={`0 0 ${strip.W} ${strip.H}`} role="img"
        aria-label="Share of mandals deeper than usual each month, with El Niño months marked">
        {strip.warm.map(([from, to], index) => (
          <rect key={index} className={styles.warm} x={strip.x(from)} y={0}
            width={Math.max(2, strip.x(to) - strip.x(from))} height={strip.H} />
        ))}
        <polyline className={styles.area} points={`0,${strip.H} ${strip.points.join(" ")} ${strip.W},${strip.H}`} />
        <line className={styles.zero} x1={0} x2={strip.W} y1={strip.zeroY} y2={strip.zeroY} />
        <polyline className={styles.oni} points={strip.oni} />
        <line className={styles.now} x1={strip.x(frame)} x2={strip.x(frame)} y1={0} y2={strip.H} />
        <text x={0} y={strip.H - 1}>{lapse.months[0].slice(0, 4)}</text>
        <text x={strip.W} y={strip.H - 1} textAnchor="end">{lapse.months[lapse.months.length - 1].slice(0, 4)}</text>
      </svg>

      <div className={styles.legend}>
        <span>Higher than its usual</span><span className={styles.ramp} /><span>Deeper than its usual</span>
        <span>· shaded months are El Niño · the line is Niño 3.4</span>
      </div>
      <p className={styles.note}>{lapse.rule} Each mandal is scaled by its own range, so the colour reads as unusual for that mandal rather than as depth: hard rock moves tens of metres where the delta moves one.</p>
    </div>
  );
}
