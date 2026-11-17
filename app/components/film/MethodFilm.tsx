"use client";

import { useMemo, type CSSProperties } from "react";
import type { MethodFilm, MethodKind } from "../../lib/methodFilm";
import { FILM_SIZE, FilmPlayer, at, clamp, easeInOut, easeOut, r3, rise, type FilmFormat } from "./FilmPlayer";
import theme from "./WeeklyFilm.module.css";
import styles from "./MethodFilm.module.css";

/* How the site works, as one continuous picture: a cross-section of the land from a cloud on
   the left to the page's own output on the right, and a camera that follows one drop of rain
   through it. Before play, and at the end, the whole picture is in view and reads as the
   method's flow chart; in between, each stop is seen close with one sentence beside it.

   The picture is drawn once in its own units (the "world", 3200 wide); a frame only moves
   the camera, the drop and each stop's own small change, all as functions of the clock.
   The two films share one look, so the stage and its type come from the weekly film's theme. */

const SURFACE = 760, SOIL = 900, TABLE = 1120, ROCK = 1360;
const FAR = 4200; // the land and the sky run well past the frame, so no camera position shows an edge

type Cam = { x: number; y: number; w: number };
/** Where each stop is looked at from, in landscape: the point the camera holds and how much of the world is across the frame. */
const STOPS: Record<string, Cam> = {
  rain: { x: 500, y: 480, w: 1400 }, soil: { x: 890, y: 770, w: 960 }, recharge: { x: 1230, y: 1010, w: 950 }, well: { x: 1690, y: 930, w: 1150 },
  orbit: { x: 1860, y: 430, w: 1550 }, model: { x: 2350, y: 610, w: 1050 }, output: { x: 2880, y: 610, w: 1000 },
};
/** The whole picture, as far as each shape of frame can hold it. */
const WHOLE: Record<FilmFormat, Cam> = { landscape: { x: 1690, y: 760, w: 3050 }, square: { x: 1500, y: 760, w: 2500 }, portrait: { x: 1080, y: 720, w: 1800 } };
/** A narrower frame looks closer, and puts what it looks at lower, under the words. */
const CLOSER: Record<FilmFormat, number> = { landscape: 1, square: 0.7, portrait: 0.62 };
const ANCHOR: Record<FilmFormat, { stop: [number, number]; whole: [number, number] }> = {
  landscape: { stop: [0.67, 0.54], whole: [0.5, 0.7] }, square: { stop: [0.5, 0.67], whole: [0.5, 0.66] }, portrait: { stop: [0.5, 0.65], whole: [0.5, 0.64] },
};
const TRAVEL = 1.9; // seconds the camera and the drop take to reach a stop
const WORDS = 1.25; // the words wait until the camera has all but arrived, so they never cross the picture moving behind them

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** A point a share of the way along a line of points, by distance. */
function along(points: Array<[number, number]>, share: number): [number, number] {
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
  let left = clamp(share) * lengths.reduce((sum, length) => sum + length, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) { const p = lengths[i] ? Math.min(1, left / lengths[i]) : 0; return [lerp(points[i][0], points[i + 1][0], p), lerp(points[i][1], points[i + 1][1], p)]; }
    left -= lengths[i];
  }
  return points[points.length - 1];
}
const curve = (from: [number, number], c1: [number, number], c2: [number, number], to: [number, number], steps = 14): Array<[number, number]> =>
  Array.from({ length: steps + 1 }, (_, i) => { const u = i / steps, v = 1 - u; return [v ** 3 * from[0] + 3 * v * v * u * c1[0] + 3 * v * u * u * c2[0] + u ** 3 * to[0], v ** 3 * from[1] + 3 * v * v * u * c1[1] + 3 * v * u * u * c2[1] + u ** 3 * to[1]] as [number, number]; });

/* The picture's fixed points. */
const GAUGE = 560, WELL = 1650, HEAD: [number, number] = [WELL, 676], CARD = { x: 2070, y: 420, w: 560, h: 380 };
const SAT_PATH = { from: [1300, 280] as [number, number], via: [1900, 40] as [number, number], to: [2500, 280] as [number, number] };
const satAt = (u: number): [number, number] => [(1 - u) ** 2 * SAT_PATH.from[0] + 2 * (1 - u) * u * SAT_PATH.via[0] + u * u * SAT_PATH.to[0], (1 - u) ** 2 * SAT_PATH.from[1] + 2 * (1 - u) * u * SAT_PATH.via[1] + u * u * SAT_PATH.to[1]];
const WIRE_WELL = { c1: [1760, 560] as [number, number], c2: [1940, 610] as [number, number], to: [CARD.x, 610] as [number, number] };
const NEWEST: [number, number] = [2412, 632]; // where the latest reading sits on the model's chart
/** The drop's road, a stretch for each stop; it waits at the wellhead while the camera looks up at the satellite. */
const ROAD: Array<Array<[number, number]>> = [
  [[430, 318], [GAUGE, 700]],
  [[GAUGE, 700], [GAUGE, 756], [640, 792], [900, 850]],
  [[900, 850], [1040, 930], [1240, TABLE - 4]],
  [[1240, TABLE - 4], [1440, 1200], [WELL, 1250], [WELL, TABLE], HEAD],
  [HEAD, HEAD],
  [...curve(HEAD, WIRE_WELL.c1, WIRE_WELL.c2, WIRE_WELL.to), NEWEST],
  [NEWEST, [CARD.x + CARD.w, 610], [2760, 610]],
];

/** A small, repeatable scatter: the same "random" value for the same input, every frame. */
const scatter = (i: number, salt: number) => { const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453; return v - Math.floor(v); };

const surfaceY = (x: number) => SURFACE + 7 * Math.sin(x / 240) + 3 * Math.sin(x / 71);
const SURFACE_LINE = Array.from({ length: 2 * FAR / 60 + 1 }, (_, i) => { const x = -FAR / 2 + i * 60; return `${i ? "L" : "M"}${x},${r3(surfaceY(x))}`; }).join("");
/** The water table: level, with a low mound under the place the recharge arrives. */
const tableY = (x: number, mound: number) => TABLE - 20 * mound * Math.exp(-(((x - 1230) / 210) ** 2));
const tableLine = (mound: number) => Array.from({ length: 2 * FAR / 60 + 1 }, (_, i) => { const x = -FAR / 2 + i * 60; return `${i ? "L" : "M"}${x},${r3(tableY(x, mound))}`; }).join("");

/* The model's small chart: a mandal's readings month by month, two months missing, and the estimate carried through them and on. */
const CHART = { x: CARD.x + 44, y: CARD.y + 96, w: CARD.w - 88, h: 200 };
const MONTHS = 13, KNOWN = 10; // ten months with a place for a reading, then three ahead
const depthAt = (m: number) => 0.46 + 0.2 * Math.sin(m / 1.9) + 0.03 * m;
const chartPoint = (m: number): [number, number] => [CHART.x + (m / (MONTHS - 1)) * CHART.w, CHART.y + depthAt(m) * CHART.h];
const MISSING = new Set([4, 7]);
const ESTIMATE = Array.from({ length: MONTHS }, (_, m) => chartPoint(m)).map(([x, y], i) => `${i ? "L" : "M"}${r3(x)},${r3(y)}`).join("");
const BAND = (() => {
  const spread = (m: number) => 10 + (m >= KNOWN - 1 ? (m - KNOWN + 1) * 8 : MISSING.has(m) ? 7 : 0);
  const top = Array.from({ length: MONTHS }, (_, m) => { const [x, y] = chartPoint(m); return `${r3(x)},${r3(y - spread(m))}`; });
  const bottom = Array.from({ length: MONTHS }, (_, m) => { const [x, y] = chartPoint(MONTHS - 1 - m); return `${r3(x)},${r3(y + spread(MONTHS - 1 - m))}`; });
  return `M${top.join("L")}L${bottom.join("L")}Z`;
})();

/* ---------------- The cloud, the rain and the crop, drawn with some care ---------------- */

/** The rain cloud's lobes: one outline used three ways (body, clip for its shading, soft shadow). */
const CLOUD_LOBES: Array<[number, number, number, number]> = [[430, 268, 168, 50], [322, 250, 62, 56], [392, 204, 82, 80], [476, 190, 74, 72], [548, 232, 66, 60], [600, 262, 48, 40], [272, 270, 44, 36]];
const lobes = (className?: string, dx = 0, dy = 0) => CLOUD_LOBES.map(([cx, cy, rx, ry], i) => <ellipse key={i} cx={cx + dx} cy={cy + dy} rx={rx} ry={ry} className={className} />);

/** One rain streak: a tapered drop, brightest at its head, in the layer nearest or furthest from the eye. */
type Streak = { x: number; speed: number; start: number; near: boolean; length: number };
const STREAKS: Streak[] = Array.from({ length: 46 }, (_, i) => ({
  x: 268 + scatter(i, 21) * 340, speed: 0, start: scatter(i, 23), near: i % 3 !== 0, length: 0,
})).map((streak, i) => ({ ...streak, speed: streak.near ? 1.25 + scatter(i, 22) * 0.5 : 0.8 + scatter(i, 22) * 0.3, length: streak.near ? 34 + scatter(i, 24) * 16 : 20 + scatter(i, 24) * 8 }));
const RAIN_TOP = 296, WIND = 0.16; // the streaks lean a little with the wind

/** A cereal plant (sorghum, the dryland staple): stalk, alternate arching leaves, a grain head on the grown ones, and a fibrous root system. */
type Plant = { x: number; height: number; lean: number; grown: boolean; leaves: Array<{ blade: string; rib: string }>; stalk: string; head: Array<[number, number, number]>; roots: string[]; drinks: Array<Array<[number, number]>> };
const PLANTS: Plant[] = Array.from({ length: 7 }, (_, i) => {
  const x = 726 + i * 55 + scatter(i, 31) * 10, height = 112 + scatter(i, 32) * 72, lean = (scatter(i, 33) - 0.5) * 22, grown = height > 140;
  const spine = (f: number): [number, number] => [lean * f ** 1.7, -height * f];
  const count = grown ? 7 : 5;
  const leaves = Array.from({ length: count }, (_, j) => {
    const f = 0.16 + (j / count) * 0.72, [px, py] = spine(f), side = (j + i) % 2 ? 1 : -1, len = (66 - j * 4) * (0.82 + scatter(i * 10 + j, 34) * 0.36), droop = 0.1 + scatter(i * 10 + j, 35) * 0.2;
    const tip: [number, number] = [px + side * len, py - len * 0.28 + len * droop * 1.9];
    return {
      blade: `M${r3(px)},${r3(py)}C${r3(px + side * len * 0.3)},${r3(py - len * 0.62)} ${r3(px + side * len * 0.78)},${r3(py - len * 0.5)} ${r3(tip[0])},${r3(tip[1])}C${r3(px + side * len * 0.7)},${r3(py - len * 0.22)} ${r3(px + side * len * 0.3)},${r3(py - len * 0.26)} ${r3(px)},${r3(py + 7)}Z`,
      rib: `M${r3(px)},${r3(py + 2)}C${r3(px + side * len * 0.3)},${r3(py - len * 0.46)} ${r3(px + side * len * 0.76)},${r3(py - len * 0.38)} ${r3(tip[0])},${r3(tip[1])}`,
    };
  });
  const [tx, ty] = spine(1);
  // A plant not yet in head ends in its youngest leaves, still rolled upright.
  if (!grown) for (const side of [-1, 1]) {
    const len = 44 + scatter(i, 39 + side) * 12, tip: [number, number] = [tx + side * len * 0.42, ty - len * 0.9];
    leaves.push({
      blade: `M${r3(tx)},${r3(ty + 10)}C${r3(tx + side * len * 0.05)},${r3(ty - len * 0.5)} ${r3(tx + side * len * 0.24)},${r3(ty - len * 0.8)} ${r3(tip[0])},${r3(tip[1])}C${r3(tx + side * len * 0.4)},${r3(ty - len * 0.5)} ${r3(tx + side * len * 0.24)},${r3(ty - len * 0.14)} ${r3(tx + side * 5)},${r3(ty + 12)}Z`,
      rib: `M${r3(tx + side * 2)},${r3(ty + 8)}C${r3(tx + side * len * 0.12)},${r3(ty - len * 0.46)} ${r3(tx + side * len * 0.28)},${r3(ty - len * 0.74)} ${r3(tip[0])},${r3(tip[1])}`,
    });
  }
  const stalk = `M-4,0Q${r3(lean * 0.25 - 3.4)},${r3(-height * 0.5)} ${r3(tx - 1.6)},${r3(ty)}L${r3(tx + 1.6)},${r3(ty)}Q${r3(lean * 0.25 + 3.4)},${r3(-height * 0.5)} 4,0Z`;
  // The grain head: a tight cluster, wider in the middle.
  const head: Array<[number, number, number]> = grown ? Array.from({ length: 34 }, (_, k) => {
    const u = k / 33, across = Math.sin(Math.PI * Math.min(1, u * 1.15)) * 11;
    return [r3(tx + lean * 0.06 * u + (scatter(i * 40 + k, 36) - 0.5) * 2 * across), r3(ty - 4 - u * 44), r3(3.1 + scatter(i * 40 + k, 37) * 1.5)];
  }) : [];
  const rootLines: Array<Array<[number, number]>> = Array.from({ length: 8 }, (_, k) => {
    const spread = (k - 3.5) / 3.5, len = 64 + scatter(i * 9 + k, 38) * 58, dx = spread * len * 0.72;
    return curve([0, 0], [dx * 0.2, len * 0.28], [dx * 0.75, len * 0.55], [dx + spread * 8, len], 8);
  });
  const roots = rootLines.flatMap((line, k) => {
    const main = line.map(([px, py], n) => `${n ? "L" : "M"}${r3(px)},${r3(py)}`).join("");
    const [bx, by] = line[5], side = k % 2 ? 1 : -1;
    return [main, `M${r3(bx)},${r3(by)}q${r3(side * 10)},10 ${r3(side * 16)},26`, `M${r3(line[3][0])},${r3(line[3][1])}q${r3(-side * 8)},8 ${r3(-side * 12)},20`];
  });
  return { x, height, lean, grown, leaves, stalk, head, roots, drinks: [rootLines[1], rootLines[4], rootLines[6]] };
});

const KIND_TONE: Record<MethodKind, string> = { Measured: "water", Modelled: "warn", "Worked out from wells": "warn", "Context only": "soft", "What comes out": "ink" };
const draw = (p: number): CSSProperties => ({ strokeDasharray: 1, strokeDashoffset: r3(1 - p) });

/** The land, the sky's furniture and everything that changes at each stop. `done[k]` runs 0 to 1 as stop k plays and stays at 1 after. */
function World({ t, sway, swing, done, scale, live, pins, outputs }: { t: number; sway: number; swing: number; done: (k: number, delay?: number, seconds?: number) => number; scale: number; live: number; pins: boolean; outputs: string[] }) {
  // The parts that never change are built once; a frame re-uses them untouched.
  const still = useMemo(() => ({
    pebbles: Array.from({ length: 150 }, (_, i) => <ellipse key={i} cx={r3(-300 + scatter(i, 1) * 3900)} cy={r3(SOIL + 26 + scatter(i, 2) * (ROCK - SOIL - 40))} rx={r3(5 + scatter(i, 3) * 9)} ry={r3(3 + scatter(i, 4) * 5)} className={styles.pebble} />),
    cracks: Array.from({ length: 16 }, (_, i) => { const x = -200 + i * 230 + scatter(i, 5) * 90; return <path key={i} d={`M${r3(x)},${ROCK + 12}l${r3(18 + scatter(i, 6) * 30)},${r3(40 + scatter(i, 7) * 40)}l${r3(-22 + scatter(i, 8) * 20)},${r3(30 + scatter(i, 9) * 30)}`} className={styles.crack} />; }),
    tufts: Array.from({ length: 90 }, (_, i) => { const x = -400 + i * 46 + scatter(i, 10) * 20; return (x > 690 && x < 1090) || Math.abs(x - GAUGE) < 40 || Math.abs(x - WELL) < 50 ? null : <path key={i} d={`M${r3(x)},${r3(surfaceY(x))}l-3,-9m3,9l1,-12m-1,12l5,-8`} className={styles.tuft} />; }),
    roots: PLANTS.map((plant, i) => <g key={i} transform={`translate(${r3(plant.x)},${r3(surfaceY(plant.x))})`}>{plant.roots.map((d, k) => <path key={k} d={d} className={k % 3 ? styles.rootlet : styles.root} />)}</g>),
    plants: PLANTS.map((plant, i) => (
      <g key={i}>
        <path d={plant.stalk} fill="url(#stalk)" />
        {plant.leaves.map((leaf, k) => <g key={k}><path d={leaf.blade} fill="url(#leaf)" /><path d={leaf.rib} className={styles.rib} /></g>)}
        {plant.head.map(([cx, cy, radius], k) => <circle key={k} cx={cx} cy={cy} r={radius} fill="url(#grain)" />)}
      </g>
    )),
    crumbs: Array.from({ length: 220 }, (_, i) => <rect key={i} x={r3(-200 + scatter(i, 41) * 3700)} y={r3(SURFACE + 16 + scatter(i, 42) * (SOIL - SURFACE - 26))} width={r3(5 + scatter(i, 43) * 9)} height={r3(3 + scatter(i, 44) * 4)} rx={2} className={scatter(i, 45) > 0.5 ? styles.crumbLight : styles.crumbDark} />),
  }), []);
  const drift = r3(t * 2.2);
  const rain = clamp(1 - done(1, 0.4, 1.2)), mound = done(2, 1.2, 2.4), sat = satAt(lerp(0.4, 0.5, done(4, 0, 2.6))), wires = done(5, 0.2, 1.6), chart = done(5, 1.4, 2.6);
  const label = (k: number, delay: number) => r3(live * done(k, delay, 0.6) * (1 - done(k + 1, 0, 0.5)));
  const pin = (x: number, y: number, k: number) => (
    <g key={k} transform={`translate(${x},${y}) scale(${r3(1 / scale)})`} opacity={r3(1 - live)}>
      <circle r={21} className={styles.pin} /><text y={9} textAnchor="middle" className={styles.pinText}>{k}</text>
    </g>
  );
  return (
    <>
      {/* The ground, in layers */}
      <path d={`${SURFACE_LINE}L${FAR},${SOIL}L${-FAR},${SOIL}Z`} fill="url(#soil)" />
      {still.crumbs}
      <rect x={-FAR} y={SOIL} width={2 * FAR} height={ROCK - SOIL} className={styles.subsoil} />
      <rect x={-FAR} y={ROCK} width={2 * FAR} height={FAR} className={styles.bedrock} />
      {still.pebbles}{still.cracks}
      <path d={`${tableLine(mound)}L${FAR},${ROCK + FAR}L${-FAR},${ROCK + FAR}Z`} className={styles.saturated} />
      <path d={tableLine(mound)} className={styles.table} />
      <path d={SURFACE_LINE} className={styles.surface} />
      {still.tufts}

      {/* 1. Rain and the gauge: a cloud with weight to it, rain in two depths leaning with the wind, and each near drop's splash */}
      <g transform={`translate(${r3(drift * 0.6)},0)`} className={styles.cloudFar}>{lobes(undefined, 250, -74)}</g>
      <g transform={`translate(${r3(drift)},0)`}>
        <path d={`M300,300L560,300L${r3(560 - WIND * 440 + 30)},${SURFACE - 6}L${r3(300 - WIND * 440 - 30)},${SURFACE - 6}Z`} fill="url(#mist)" opacity={r3(rain)} />
      </g>
      <g opacity={r3(rain)}>
        {STREAKS.map((streak, i) => {
          const fallen = (t * streak.speed * 0.72 + streak.start) % 1, reach = SURFACE - RAIN_TOP - 8;
          const y = RAIN_TOP + fallen * reach, x = streak.x + drift - (y - RAIN_TOP) * WIND;
          const landing = streak.x + drift - reach * WIND, splash = fallen < 0.2 ? fallen / 0.2 : 1;
          return (
            <g key={i} opacity={streak.near ? 1 : 0.5}>
              <path d={`M${r3(x)},${r3(y)}l${r3(streak.length * WIND + (streak.near ? 2 : 1.4))},${r3(-streak.length)}l${streak.near ? -4 : -2.8},0Z`} fill="url(#drop)" />
              {streak.near && splash < 1 ? <ellipse cx={r3(landing)} cy={r3(surfaceY(landing) - 1)} rx={r3(3 + splash * 13)} ry={r3(1 + splash * 3.5)} className={styles.splash} opacity={r3(1 - splash)} /> : null}
            </g>
          );
        })}
      </g>
      <g transform={`translate(${r3(drift)},0)`}>
        {lobes(styles.cloudShadow, 6, 12)}
        <g fill="url(#cloud)">{lobes()}</g>
        <g clipPath="url(#cloudClip)"><rect x={200} y={236} width={480} height={90} fill="url(#cloudShade)" /><ellipse cx={372} cy={176} rx={70} ry={40} className={styles.cloudLight} /><ellipse cx={486} cy={160} rx={52} ry={28} className={styles.cloudLight} /></g>
      </g>
      <g>
        <rect x={GAUGE - 2} y={742} width={4} height={r3(surfaceY(GAUGE) - 742)} className={styles.post} />
        <rect x={GAUGE - 15} y={r3(742 - 46 * done(0, 0.8, 2.6))} width={30} height={r3(46 * done(0, 0.8, 2.6))} className={styles.caught} />
        <path d={`M${GAUGE - 24},676h48l-9,14v52h-30v-52z`} className={styles.gauge} />
        {[0, 1, 2, 3].map(i => <line key={i} x1={GAUGE + 6} x2={GAUGE + 15} y1={700 + i * 11} y2={700 + i * 11} className={styles.gaugeTick} />)}
      </g>

      {/* 2. The crop, its roots and the soil's moisture at four depths. The plants sway a little; the roots draw water up. */}
      <rect x={600} y={SURFACE - 6} width={600} height={SOIL - SURFACE + 30} fill="url(#wet)" opacity={r3(done(1, 0.9, 2.2))} />
      {still.roots}
      {PLANTS.map((plant, i) => plant.drinks.map((line, k) => {
        const going = done(1, 1.4, 1), phase = (sway * 0.33 + scatter(i * 3 + k, 51)) % 1, [px, py] = along(line, 1 - phase);
        return <circle key={`${i}-${k}`} cx={r3(plant.x + px)} cy={r3(surfaceY(plant.x) + py)} r={3.4} className={styles.sip} opacity={r3(going * Math.sin(Math.PI * phase) * swing)} />;
      }))}
      {PLANTS.map((plant, i) => <g key={i} transform={`translate(${r3(plant.x)},${r3(surfaceY(plant.x))}) rotate(${r3(swing * (1.5 * Math.sin(sway * 1.15 + i * 0.9) + 0.7 * Math.sin(sway * 2.3 + i * 1.7)))})`}>{still.plants[i]}</g>)}
      {Array.from({ length: 60 }, (_, i) => {
        const x = 704 + (i % 12) * 34 + scatter(i, 14) * 14, y = 786 + Math.floor(i / 12) * 24 + scatter(i, 15) * 8;
        return <circle key={i} cx={r3(x)} cy={r3(y)} r={r3(2 + scatter(i, 16) * 2)} className={styles.moist} opacity={r3(0.1 + (0.6 - (y - 786) / 200) * done(1, 1 + ((y - 786) / 110), 1.4))} />;
      })}
      <g opacity={done(1, 1.6, 0.8)}>
        <line x1={1100} x2={1100} y1={r3(surfaceY(1100))} y2={894} className={styles.probe} />
        {[784, 812, 848, 890].map(y => <line key={y} x1={1090} x2={1110} y1={y} y2={y} className={styles.probe} />)}
      </g>

      {/* 3. Recharge: what gets past the roots reaches the water table */}
      {[1140, 1190, 1240, 1290, 1340].map((x, i) => (
        <line key={x} x1={x} x2={x} y1={SOIL - 6} y2={r3(tableY(x, 1) - 8)} pathLength={1} className={styles.drip} style={draw(done(2, 0.5 + i * 0.16, 1.5))} />
      ))}
      <text x={1300} y={TABLE + 46} className={styles.worldText} opacity={label(2, 2.4)}>water table</text>

      {/* 4. The well, its water level, the sensor on top and the one thing it measures */}
      <rect x={WELL - 17} y={742} width={34} height={560} className={styles.shaft} />
      <rect x={WELL - 15} y={TABLE} width={30} height={180} className={styles.wellWater} />
      {[1150, 1178, 1206, 1234, 1262].map(y => <line key={y} x1={WELL - 17} x2={WELL + 17} y1={y} y2={y} className={styles.screen} />)}
      <rect x={WELL - 26} y={706} width={52} height={38} rx={7} className={styles.wellhead} />
      <line x1={WELL} x2={WELL} y1={706} y2={HEAD[1]} className={styles.mast} /><circle cx={HEAD[0]} cy={HEAD[1]} r={5} className={styles.mastTip} />
      {[24, 40, 56].map((radius, i) => <path key={radius} d={`M${WELL - radius * 0.82},${r3(HEAD[1] - radius * 0.57)}A${radius},${radius} 0 0 1 ${WELL + radius * 0.82},${r3(HEAD[1] - radius * 0.57)}`} className={styles.wave} opacity={r3(done(3, 2.4 + i * 0.22, 0.5))} />)}
      <g opacity={done(3, 1.8, 0.7)}>
        <line x1={1738} x2={1738} y1={r3(surfaceY(1738))} y2={TABLE} pathLength={1} className={styles.measure} style={draw(done(3, 1.8, 1.2))} />
        <line x1={1726} x2={1750} y1={r3(surfaceY(1738))} y2={r3(surfaceY(1738))} className={styles.measure} /><line x1={1726} x2={1750} y1={TABLE} y2={TABLE} className={styles.measure} />
      </g>
      <text x={1758} y={948} className={styles.worldText} opacity={label(3, 2.8)}>depth below ground</text>

      {/* 5. The satellite, and how much ground it sees at once */}
      <path d={`M${SAT_PATH.from[0]},${SAT_PATH.from[1]}Q${SAT_PATH.via[0]},${SAT_PATH.via[1]} ${SAT_PATH.to[0]},${SAT_PATH.to[1]}`} className={styles.orbit} />
      <path d={`M${r3(sat[0])},${r3(sat[1] + 16)}L1240,${SURFACE - 14}L2560,${SURFACE - 14}Z`} className={styles.beam} opacity={r3(done(4, 1, 1.4) * (1 - 0.55 * done(5, 0, 1)))} />
      <g transform={`translate(${r3(sat[0])},${r3(sat[1])})`}>
        <rect x={-74} y={-11} width={48} height={22} rx={3} className={styles.panel} /><rect x={26} y={-11} width={48} height={22} rx={3} className={styles.panel} />
        <rect x={-22} y={-16} width={44} height={32} rx={6} className={styles.satBody} /><path d="M-9,16l9,12l9,-12" className={styles.satDish} />
      </g>

      {/* 6. The model: its three inputs arrive, then the estimate is drawn through the readings and on */}
      <path d={`M${GAUGE},676C900,210 1840,400 ${CARD.x},560`} pathLength={1} className={styles.wire} data-kind="measured" style={draw(wires)} />
      <path d={`M${HEAD[0]},${HEAD[1]}C${WIRE_WELL.c1.join(",")} ${WIRE_WELL.c2.join(",")} ${WIRE_WELL.to.join(",")}`} pathLength={1} className={styles.wire} data-kind="measured" style={draw(wires)} />
      <path d={`M${r3(sat[0] + 20)},${r3(sat[1] + 18)}C2010,330 2030,470 ${CARD.x},520`} pathLength={1} className={styles.wire} data-kind="context" style={draw(wires)} />
      <rect x={CARD.x} y={CARD.y} width={CARD.w} height={CARD.h} rx={28} className={styles.card} />
      {[0, 1, 2, 3].map(i => <line key={i} x1={CHART.x} x2={CHART.x + CHART.w} y1={CHART.y + 20 + i * 56} y2={CHART.y + 20 + i * 56} className={styles.rule} />)}
      <text x={CARD.x + 44} y={CARD.y + 62} className={styles.worldText} opacity={label(5, 1.6)}>one mandal, month by month</text>
      <path d={BAND} className={styles.band} opacity={r3(chart * 0.9)} />
      <path d={ESTIMATE} pathLength={1} className={styles.estimate} style={draw(chart)} />
      {Array.from({ length: KNOWN }, (_, m) => {
        const [x, y] = chartPoint(m), shown = done(5, 0.9 + m * 0.07, 0.4);
        return MISSING.has(m) ? <circle key={m} cx={r3(x)} cy={r3(y)} r={7} className={styles.gap} opacity={r3(shown * chart)} /> : <circle key={m} cx={r3(x)} cy={r3(y)} r={r3(8 * shown)} className={styles.reading} />;
      })}
      <g opacity={label(5, 3.4)}>
        <circle cx={CARD.x + 52} cy={CARD.y + CARD.h - 40} r={8} className={styles.reading} /><text x={CARD.x + 70} y={CARD.y + CARD.h - 31} className={styles.worldText}>readings</text>
        <line x1={CARD.x + 220} x2={CARD.x + 262} y1={CARD.y + CARD.h - 40} y2={CARD.y + CARD.h - 40} className={styles.estimate} /><text x={CARD.x + 274} y={CARD.y + CARD.h - 31} className={styles.worldText}>estimate, with its band</text>
      </g>

      {/* 7. What comes out */}
      <path d={`M${CARD.x + CARD.w},610H2742`} pathLength={1} className={styles.wire} data-kind="out" style={draw(done(6, 0.3, 1.2))} />
      {outputs.map((name, i) => {
        const y = 524 + i * 86, shown = done(6, 1.3 + i * 0.3, 0.6);
        return (
          <g key={name} opacity={r3(0.28 + 0.72 * shown)}>
            <rect x={2760} y={y - 32} width={380} height={64} rx={32} className={styles.chip} />
            <circle cx={2798} cy={y} r={10} className={styles.chipDot} data-i={i} />
            <text x={2824} y={y + 10} className={styles.chipText} opacity={r3(live * shown)}>{name}</text>
          </g>
        );
      })}

      {/* Numbered pins for the overview, where the frame is wide enough to hold the whole picture: the same size on screen however far the camera stands */}
      {!pins ? null : [[640, 240], [900, 492], [1230, 1040], [WELL, 610], [1900, 40], [CARD.x + CARD.w / 2, CARD.y - 40], [2950, 440]].map(([x, y], i) => pin(x, y, i + 1))}
    </>
  );
}

export function MethodFilmPlayer({ film }: { film: MethodFilm }) {
  const segments = useMemo(() => [{ id: "open", seconds: film.openSeconds }, ...film.steps.map(step => ({ id: step.id as string, seconds: step.seconds })), { id: "close", seconds: film.closeSeconds }], [film]);
  return (
    <FilmPlayer name="methodology" edition={film.edition} segments={segments} posterAt={3.4} stageClass={`${theme.stage} ${styles.stage}`} testId="methodology-film"
      playLabel="the film of how this works" downloadName={(shape, edition) => `AP-water-how-it-works-${edition}-${shape}.mp4`}
      events={{ play: ["app/method-film-play", "Methodology film: played on the page"], download: ["app/method-film-download", "Methodology film: downloaded a video"] }}>
      {({ t, index, local, format, segments: placed }) => {
        const last = placed.length - 1, step = index > 0 && index < last ? film.steps[index - 1] : null;
        const [width, height] = FILM_SIZE[format];
        // The camera: holds each stop, and travels to it over the first seconds of its scene.
        const camOf = (i: number): Cam & { whole: number } => (i <= 0 || i >= last ? { ...WHOLE[format], whole: 1 } : { ...STOPS[film.steps[i - 1].id], w: STOPS[film.steps[i - 1].id].w * CLOSER[format], whole: 0 });
        const from = camOf(index - 1), to = camOf(index), move = index === 0 ? 1 : easeInOut(clamp(local / TRAVEL));
        // A slow drift toward the picture while the title stands, so the opening is not a still.
        const drift = index === 0 ? 1.03 - 0.03 * clamp(local / film.openSeconds) : 1;
        const cam = { x: lerp(from.x, to.x, move), y: lerp(from.y, to.y, move), w: Math.exp(lerp(Math.log(from.w), Math.log(to.w), move)) * drift, whole: lerp(from.whole, to.whole, move) };
        const scale = width / cam.w, anchor = ANCHOR[format];
        const ax = lerp(anchor.stop[0], anchor.whole[0], cam.whole), ay = lerp(anchor.stop[1], anchor.whole[1], cam.whole);
        // Each stop's own change: 0 before its scene, running during it, 1 ever after.
        const done = (k: number, delay = 0, seconds = 1) => (k + 1 > last - 1 ? 0 : r3(easeOut(clamp((t - placed[k + 1].start - delay) / seconds))));
        // The drop: on the road of the stop being shown.
        const road = step ? ROAD[index - 1] : null;
        const drop = road ? along(road, easeInOut(clamp(local / (TRAVEL + 0.5)))) : index === 0 ? ROAD[0][0] : ROAD[ROAD.length - 1][ROAD[ROAD.length - 1].length - 1];
        const dropShown = index === 0 ? at(local, 2.4, 0.8) : index === last ? 0 : index === last - 1 ? 1 - at(local, TRAVEL + 0.6, 0.6) : 1;
        const words = step ? r3(at(local, WORDS) * (1 - at(local, step.seconds - 0.45, 0.45, p => p * p))) : 0;
        const chrome = index === 0 ? 0 : index === 1 ? at(local, 0.1) : index === last ? 1 - at(local, 0, 0.4) : 1;
        const titleOut = index === 0 ? 1 - at(local, film.openSeconds - 0.45, 0.45, p => p * p) : 0;
        return (
          <>
            <svg className={styles.world} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                <linearGradient id="cloud" gradientUnits="userSpaceOnUse" x1={0} y1={120} x2={0} y2={320}><stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#e3ebf2" /><stop offset="1" stopColor="#a9bac9" /></linearGradient>
                <linearGradient id="cloudShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5f7388" stopOpacity="0" /><stop offset="1" stopColor="#4b5f75" stopOpacity=".7" /></linearGradient>
                <clipPath id="cloudClip">{lobes()}</clipPath>
                <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8fdcf2" stopOpacity=".16" /><stop offset="1" stopColor="#8fdcf2" stopOpacity="0" /></linearGradient>
                <linearGradient id="drop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#bfeaf7" stopOpacity="0" /><stop offset="1" stopColor="#d9f4fb" stopOpacity=".95" /></linearGradient>
                <linearGradient id="leaf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b5e6a2" /><stop offset=".55" stopColor="#6fbd72" /><stop offset="1" stopColor="#3d8a52" /></linearGradient>
                <linearGradient id="stalk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9bd68f" /><stop offset="1" stopColor="#4f9a5c" /></linearGradient>
                <radialGradient id="grain" cx=".35" cy=".3" r=".8"><stop offset="0" stopColor="#f6dc9c" /><stop offset=".6" stopColor="#d9a352" /><stop offset="1" stopColor="#a8702e" /></radialGradient>
                <linearGradient id="soil" gradientUnits="userSpaceOnUse" x1={0} y1={SURFACE - 10} x2={0} y2={SOIL}><stop offset="0" stopColor="#3b2c22" /><stop offset=".16" stopColor="#5a4636" /><stop offset="1" stopColor="#43342a" /></linearGradient>
                <radialGradient id="wet" cx=".5" cy="0" r=".62"><stop offset="0" stopColor="#2a86a1" stopOpacity=".5" /><stop offset=".6" stopColor="#1f6e86" stopOpacity=".28" /><stop offset="1" stopColor="#1f6e86" stopOpacity="0" /></radialGradient>
              </defs>
              <g transform={`translate(${r3(ax * width - cam.x * scale)},${r3(ay * height - cam.y * scale)}) scale(${r3(scale)})`}>
                <World t={r3(Math.min(t, placed[Math.min(3, last)].start))} sway={step?.id === "soil" ? r3(local) : 0}
                  swing={step?.id === "soil" ? r3(Math.min(1, local / 1.4) * Math.min(1, (step.seconds - local) / 1.2)) : 0} done={done} scale={scale} live={r3(1 - cam.whole)} pins={format === "landscape"} outputs={film.outputs} />
                <g opacity={r3(dropShown)}>
                  <circle cx={r3(drop[0])} cy={r3(drop[1])} r={r3(26 / Math.max(scale, 0.9))} className={styles.dropGlow} />
                  <circle cx={r3(drop[0])} cy={r3(drop[1])} r={r3(11 / Math.max(scale, 0.9))} className={styles.drop} />
                </g>
              </g>
            </svg>
            <div className={styles.scrim} style={{ opacity: r3(1 - cam.whole) }} />
            <div className={theme.chrome} style={{ opacity: chrome }}><span>AP Water Intelligence</span><span>How it works</span></div>

            {index === 0 ? (
              <div className={styles.title} data-film-box="" style={{ opacity: titleOut }}>
                <span className={theme.eyebrow} style={rise(local, 0.3)}>{film.kicker}</span>
                <h2 style={rise(local, 0.55)}>{film.title}</h2>
                <p style={rise(local, 1.3)}>{film.sub}</p>
              </div>
            ) : null}
            {step ? (
              <>
                <div className={styles.caption} data-film-box="" style={{ opacity: words }}>
                  <span className={styles.kind} data-tone={KIND_TONE[step.kind]} style={rise(local, WORDS, 18)}><b>{index}</b>{step.kind}</span>
                  <h3 style={rise(local, WORDS + 0.15, 22)}>{step.headline}</h3>
                  <p style={rise(local, WORDS + 0.4, 22)}>{step.line}</p>
                </div>
                <span className={theme.foot} style={{ opacity: r3(words * at(local, WORDS + 0.7)) }}>{step.foot}</span>
              </>
            ) : null}
            {index === last ? (
              <div className={styles.title} data-film-box="" data-close="">
                <h2 style={rise(local, 0.5)}>{film.close.line}</h2>
                <span className={styles.site} style={rise(local, 1.2)}>{film.close.site}</span>
                <span className={styles.credit} style={rise(local, 1.7)}>{film.close.credit}</span>
              </div>
            ) : null}
            {index === last ? <span className={theme.foot} style={{ opacity: at(local, 2.2) }}>{film.close.caveat}</span> : null}

            <div className={theme.progress} style={{ opacity: chrome }}>
              {film.steps.map((s, i) => <i key={s.id} data-state={i + 1 < index ? "done" : i + 1 === index ? "now" : undefined} />)}
            </div>
          </>
        );
      }}
    </FilmPlayer>
  );
}
