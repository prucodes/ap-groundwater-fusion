"use client";

/* A measured cross-section of a field, drawn from the scenario's own numbers:
   soil depth to scale, roots to the FAO-56 rooting depths for the crop and
   stage, rain, the root-zone reserve and crop water use in proportion, and the
   water table below, from the State's latest well readings. No artwork: every
   line stands for a quantity or a published reference. Each crop is drawn by
   its own habit (a cereal's fibrous roots, a pulse's taproot, cotton's lobed
   leaves and open bolls) so it reads at a glance. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { CROP_REFERENCE, type CropKey } from "../../lib/agriculture";
import styles from "./FieldSection.module.css";

export type FieldFocus = "rain" | "roots" | "crop";

/** About 0.15–0.20 m at sowing, whatever the crop (FAO-56, Chapter 8). */
const SOWING_ROOTS = { min: 0.15, max: 0.2 };
const STAGE_HEIGHT = [0.16, 1, 0.97];

const H = 640;
const GROUND = 214;
const SOIL_M = 2.3;
const PX_PER_M = 150;               // soil to scale
const AIR_PX_PER_M = PX_PER_M / 2;  // plants at half scale
const RESERVE_SCALE = 60;           // the reserve slider's range, mm

export function rootRange(crop: CropKey, stage: number) {
  return stage === 0 ? SOWING_ROOTS : CROP_REFERENCE[crop].rootM;
}
/** The plant's height on screen, from the reference height at half scale. */
const canopy = (crop: CropKey, stage: number) => CROP_REFERENCE[crop].heightM * STAGE_HEIGHT[stage] * AIR_PX_PER_M;

function random(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const depthY = (m: number) => GROUND + m * PX_PER_M;
const rad = (deg: number) => (deg * Math.PI) / 180;
const n = (v: number) => Math.round(v * 10) / 10;
const pt = (x: number, y: number) => `${n(x)},${n(y)}`;
/** The point `length` from (x, y) along `deg` (0 = right, −90 = up). */
const along = (x: number, y: number, deg: number, length: number): [number, number] =>
  [x + Math.cos(rad(deg)) * length, y + Math.sin(rad(deg)) * length];
/** A filled stem from the ground to height h, tapering to a third of its base. */
const taper = (x: number, h: number, base: number) =>
  `M${pt(x - base, GROUND)}L${pt(x - base * 0.35, GROUND - h)}L${pt(x + base * 0.35, GROUND - h)}L${pt(x + base, GROUND)}Z`;

/** A pointed leaf blade: base at (x, y), along `deg`. */
function leafD(x: number, y: number, deg: number, length: number, width: number) {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  const p = (u: number, v: number) => pt(x + u * c - v * s, y + u * s + v * c);
  return `M${p(0, 0)}C${p(length * 0.22, -width)} ${p(length * 0.68, -width * 0.75)} ${p(length, 0)}C${p(length * 0.68, width * 0.75)} ${p(length * 0.22, width)} ${p(0, 0)}Z`;
}

type Parts = { stems: string[]; twigs: string[]; leaves: string[] };
const parts = (): Parts => ({ stems: [], twigs: [], leaves: [] });

/** Cotton's leaf: five lobes from the end of a petiole, filled as one palmate blade. */
const LOBES: Array<[number, number]> = [[-62, 0.5], [-31, 0.82], [0, 1], [31, 0.82], [62, 0.5]];
function palmate(into: Parts, x: number, y: number, deg: number, size: number) {
  const [px, py] = along(x, y, deg, size * 0.35);
  into.twigs.push(`M${pt(x, y)}L${pt(px, py)}`);
  for (const [offset, k] of LOBES) into.leaves.push(leafD(px, py, deg + offset, size * 0.65 * k, size * 0.65 * k * 0.34));
}

/** Three narrow leaflets on a short petiole, as in red gram. */
function trifoliate(into: Parts, x: number, y: number, deg: number, size: number) {
  const [px, py] = along(x, y, deg, size * 0.3);
  into.twigs.push(`M${pt(x, y)}L${pt(px, py)}`);
  into.leaves.push(leafD(px, py, deg, size * 0.7, size * 0.16), leafD(px, py, deg - 50, size * 0.55, size * 0.14), leafD(px, py, deg + 50, size * 0.55, size * 0.14));
}

/** Bengal gram's feathery leaf: a rachis with paired leaflets, each a short rounded stroke. */
function pinnate(rachis: string[], leaflets: string[], x: number, y: number, deg: number, size: number) {
  const [ex, ey] = along(x, y, deg, size);
  rachis.push(`M${pt(x, y)}L${pt(ex, ey)}`);
  for (let k = 1; k <= 3; k++) {
    const [qx, qy] = along(x, y, deg, size * (0.12 + k * 0.24));
    for (const side of [-1, 1]) {
      const [ax, ay] = along(qx, qy, deg + side * 64, 0.9);
      const [bx, by] = along(qx, qy, deg + side * 64, 0.9 + size * 0.2);
      leaflets.push(`M${pt(ax, ay)}L${pt(bx, by)}`);
    }
  }
  const [tx, ty] = along(ex, ey, deg, size * 0.18);
  leaflets.push(`M${pt(ex, ey)}L${pt(tx, ty)}`);
}

/** A slender pod hanging from (x, y), its tip curling sideways by `curl`. */
function podD(x: number, y: number, length: number, curl: number) {
  const w = Math.max(0.9, length * 0.11);
  return `M${pt(x - w, y)}C${pt(x - w * 1.3, y + length * 0.5)} ${pt(x + curl * 0.4, y + length * 0.85)} ${pt(x + curl, y + length)}C${pt(x + curl * 0.2 + w * 0.4, y + length * 0.7)} ${pt(x + w * 1.2, y + length * 0.45)} ${pt(x + w, y)}Z`;
}

/** A flat pod from (x, y) along `deg`, its edges pinched between the seeds, as in red gram. */
function flatPodD(x: number, y: number, deg: number, length: number, width: number) {
  const c = Math.cos(rad(deg)), s = Math.sin(rad(deg));
  const p = (u: number, v: number) => pt(x + u * c - v * s, y + u * s + v * c);
  const L = length, w = width;
  return `M${p(0, 0)}Q${p(L / 8, -w * 1.25)} ${p(L / 4, -w * 0.8)}Q${p(L * 3 / 8, -w * 1.25)} ${p(L / 2, -w * 0.8)}Q${p(L * 5 / 8, -w * 1.25)} ${p(L * 3 / 4, -w * 0.8)}Q${p(L * 7 / 8, -w * 1.2)} ${p(L, 0)}`
    + `Q${p(L * 7 / 8, w * 1.2)} ${p(L * 3 / 4, w * 0.8)}Q${p(L * 5 / 8, w * 1.25)} ${p(L / 2, w * 0.8)}Q${p(L * 3 / 8, w * 1.25)} ${p(L / 4, w * 0.8)}Q${p(L / 8, w * 1.25)} ${p(0, 0)}Z`;
}

/** Maize and jowar: a stalk with arching blades. Maize carries a tassel and a side
 * ear; jowar ends in a compact grain head and keeps its upper leaves green longer. */
function cereal(x: number, h: number, stage: number, seed: number, jowar: boolean): ReactNode {
  const rand = random(seed);
  const stalkTop = jowar && stage > 0 ? h * 0.8 : h;
  const leaves = stage === 0 ? 4 : jowar ? 8 : 9;
  const blades = Array.from({ length: leaves }, (_, i) => {
    const t = (i + 0.6) / leaves;
    const ay = GROUND - stalkTop * (0.08 + 0.74 * t) - (i % 2) * stalkTop * 0.03;
    const side = (i % 2 === 0 ? 1 : -1) * (rand() < 0.12 ? -1 : 1);
    const length = stalkTop * (stage === 0 ? 0.6 : (jowar ? 0.56 - 0.22 * t : 0.5 - 0.22 * t) * (0.88 + 0.24 * rand()));
    const sag = stage === 2 ? (jowar ? 0.4 : 0.55) : jowar ? 0.16 + 0.2 * (1 - t) : 0.18 + 0.2 * (1 - t);
    // Rise at about 50 degrees, arch over, and droop at the tip.
    const c1x = x + side * length * 0.3, c1y = ay - length * (0.55 - 0.2 * t);
    const tipX = x + side * length * 0.92, tipY = ay - length * 0.05 + length * sag;
    const w = Math.max(1.4, stalkTop * 0.016) * (1.1 - 0.4 * t) * (jowar ? 0.9 : 1);
    return <path key={i} className={jowar && stage === 2 && t < 0.5 ? styles.leafDry : styles.leaf}
      d={`M${x},${ay} C${c1x},${c1y - w} ${tipX - side * length * 0.18},${tipY - length * 0.42} ${tipX},${tipY} C${tipX - side * length * 0.2},${tipY - length * 0.36 + w * 2} ${c1x},${c1y + w * 1.6} ${x},${ay + w * 2.2} Z`} />;
  });
  const base = jowar ? 2.2 : 2.6;
  if (jowar) {
    const ry = ((h - stalkTop) / 2) * 0.94, rx = Math.max(3.2, ry * 0.5), cy = GROUND - h + ry;
    // The flag leaf, last and shortest, just below the head.
    const flag = stage > 0 ? leafD(x, GROUND - stalkTop * 0.97, -38, stalkTop * 0.26, Math.max(1.2, stalkTop * 0.012)) : "";
    const ripe = stage === 2;
    const kernels: string[] = [];
    for (let dy = -ry * 0.78; stage > 0 && dy <= ry * 0.78; dy += 2.4) {
      const half = rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)) * 0.7;
      for (let dx = -half; dx <= half + 0.01; dx += 2.3) kernels.push(`M${pt(x + dx - 0.9, cy + dy)}a0.9,0.9 0 1,0 1.8,0a0.9,0.9 0 1,0 -1.8,0`);
    }
    return (
      <g>
        <path className={styles.stalk} d={`M${x - base},${GROUND} L${x - 0.7},${cy} L${x + 0.7},${cy} L${x + base},${GROUND} Z`} />
        {blades}
        {flag ? <path className={styles.leaf} d={flag} /> : null}
        {stage > 0 ? (
          <>
            <ellipse className={ripe ? styles.headRipe : styles.head} cx={x} cy={n(cy)} rx={n(rx)} ry={n(ry)} />
            <path className={ripe ? styles.kernelRipe : styles.kernel} d={kernels.join("")} />
          </>
        ) : null}
      </g>
    );
  }
  return (
    <g className={stage === 2 ? styles.senescent : undefined}>
      <path className={styles.stalk} d={`M${x - base},${GROUND} L${x - 1},${GROUND - h} L${x + 1},${GROUND - h} L${x + base},${GROUND} Z`} />
      {blades}
      {stage > 0 ? (
        <>
          <path className={styles.tassel} d={Array.from({ length: 5 }, (_, i) => `M${x},${GROUND - h} q${(i - 2) * 5},${-10 - (i % 2) * 5} ${(i - 2) * 9},${-4}`).join(" ")} />
          <ellipse className={styles.ear} cx={x + 7} cy={GROUND - h * 0.45} rx={4.2} ry={12} transform={`rotate(18 ${x + 7} ${GROUND - h * 0.45})`} />
        </>
      ) : null}
    </g>
  );
}

function groundnut(x: number, h: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const reach = h * 1.6;  // the stems spread low, so they run longer than the plant is tall
  const stems = stage === 0 ? 3 : 9;
  const out: ReactNode[] = [];
  for (let i = 0; i < stems; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, stems - 1) - 0.5) * 2.75;
    const len = reach * (0.55 + 0.45 * Math.abs(Math.cos(a))) * (0.85 + 0.3 * rand());
    const ex = x + Math.cos(a) * len * 1.3;
    const ey = GROUND + Math.sin(a) * len;
    out.push(<path key={`s${i}`} className={styles.stem} d={`M${x},${GROUND} Q${(x + ex) / 2},${ey - 4} ${ex},${ey}`} />);
    for (let k = 1; k <= 3; k++) {
      const px = x + (ex - x) * (k / 3.2), py = GROUND + (ey - GROUND) * (k / 3.2) - 3;
      out.push(<ellipse key={`l${i}${k}`} className={styles.leaflet} cx={px} cy={py} rx={4.4} ry={2.6} transform={`rotate(${(a * 180) / Math.PI + 90} ${px} ${py})`} />);
    }
  }
  if (stage > 0) {
    for (let i = 0; i < 5; i++) {
      const px = x - 22 + i * 11 + rand() * 4, py = GROUND + 9 + rand() * 12;
      out.push(<path key={`p${i}`} className={styles.peg} d={`M${px},${GROUND - 2} L${px},${py - 4}`} />);
      out.push(<path key={`n${i}`} className={styles.pod} d={`M${px - 3.5},${py} a3.5,4 0 1,0 7,0 a3.5,4 0 1,0 -7,0`} />);
    }
  }
  return <g className={stage === 2 ? styles.senescent : undefined}>{out}</g>;
}

/** Cotton: an upright main stem with fruiting branches that zig-zag outwards, longest at
 * the base. Mid-season carries flowers and green bolls; by the end the leaves have
 * turned and the lower bolls have opened. */
function cotton(x: number, h: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const p = parts();
  const fruit: ReactNode[] = [];
  const u = h * (stage === 2 ? 0.037 : 0.03);
  if (stage === 0) {
    // Two kidney-shaped seed leaves and the first true leaf.
    p.leaves.push(leafD(x, GROUND - h, -164, h * 0.6, h * 0.3), leafD(x, GROUND - h, -16, h * 0.6, h * 0.3));
    palmate(p, x, GROUND - h * 0.98, -90, h * 0.5);
  } else {
    const nodes = 8;
    for (let i = 0; i < nodes; i++) {
      const t = (i + 0.5) / nodes;
      const y = GROUND - h * (0.14 + 0.7 * t);
      const side = i % 2 ? 1 : -1;
      const reach = h * (0.1 + 0.34 * (1 - t)) * (0.9 + 0.2 * rand());
      const joints: Array<[number, number]> = [[x + side * reach * 0.5, y - reach * 0.24], [x + side * reach, y - reach * 0.1]];
      p.stems.push(`M${pt(x, y)}L${pt(...joints[0])}L${pt(...joints[1])}`);
      if (stage === 1 || rand() < 0.4) palmate(p, x, y - 2, side > 0 ? -136 : -44, h * (0.13 + 0.04 * (1 - t)));
      joints.forEach(([jx, jy], k) => {
        if (stage === 1 || rand() < 0.4) palmate(p, jx, jy, side > 0 ? -58 : -122, h * (0.15 + 0.05 * (1 - t)));
        const age = t + k * 0.1, fx = jx + side * u * 0.6, fy = jy + u * 1.4, key = `${i}-${k}`;
        if (stage === 2 && age < 0.8) {
          fruit.push(<g key={key}>
            <path className={styles.bur} d={`M${pt(fx - u * 1.3, fy)}L${pt(fx, fy - u * 0.3)}L${pt(fx + u * 1.3, fy)}L${pt(fx, fy + u * 0.3)}ZM${pt(fx, fy - u * 1.3)}L${pt(fx + u * 0.3, fy)}L${pt(fx, fy + u * 1.3)}L${pt(fx - u * 0.3, fy)}Z`} />
            {[[-0.55, 0, 0.72], [0.55, 0, 0.72], [0, -0.5, 0.72], [0, 0.45, 0.66]].map(([dx, dy, r], j) =>
              <circle key={j} className={styles.lint} cx={n(fx + dx * u)} cy={n(fy + dy * u)} r={n(r * u)} />)}
          </g>);
        } else if (stage === 1 && age > 0.6) {
          fruit.push(<circle key={key} className={styles.flowerCream} cx={n(fx)} cy={n(fy - u * 0.3)} r={n(u * 0.85)} />);
        } else {
          fruit.push(<ellipse key={key} className={styles.boll} cx={n(fx)} cy={n(fy)} rx={n(u * 0.8)} ry={n(u * 1.05)} />);
        }
      });
    }
    palmate(p, x, GROUND - h * 0.88, -104, h * 0.1);
    palmate(p, x, GROUND - h * 0.93, -76, h * 0.08);
  }
  return (
    <g>
      <path className={styles.stalk} d={taper(x, h, stage === 0 ? 0.9 : 2.2)} />
      <path className={styles.stem} d={p.stems.join("")} />
      <path className={styles.twig} d={p.twigs.join("")} />
      <path className={stage === 2 ? styles.bladeDry : styles.blade} d={p.leaves.join("")} />
      {fruit}
    </g>
  );
}

/** Chilli: a short stem that forks and forks again into a rounded bush, with
 * slender pods hanging from the joints, green at mid-season and red at the end. */
function chilli(x: number, h: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const p = parts();
  const green: string[] = [], red: string[] = [];
  const flowers: ReactNode[] = [];
  if (stage === 0) {
    p.leaves.push(leafD(x, GROUND - h, -160, h * 0.55, h * 0.12), leafD(x, GROUND - h, -20, h * 0.55, h * 0.12));
    p.leaves.push(leafD(x, GROUND - h, -112, h * 0.42, h * 0.16), leafD(x, GROUND - h, -68, h * 0.42, h * 0.16));
  } else {
    const grow = (x0: number, y0: number, deg: number, len: number, depth: number) => {
      const [x1, y1] = along(x0, y0, deg, len);
      (depth === 1 ? p.stems : p.twigs).push(`M${pt(x0, y0)}L${pt(x1, y1)}`);
      const [mx, my] = along(x0, y0, deg, len * 0.5);
      p.leaves.push(leafD(mx, my, deg - 70 + 10 * rand(), h * 0.15, h * 0.05), leafD(mx, my, deg + 70 - 10 * rand(), h * 0.14, h * 0.048));
      p.leaves.push(leafD(x1, y1, deg - 62 + 10 * rand(), h * 0.17, h * 0.055), leafD(x1, y1, deg + 62 - 10 * rand(), h * 0.15, h * 0.05));
      if (depth >= 2 && rand() < 0.8) {
        const curl = (rand() < 0.5 ? -1 : 1) * h * 0.03;
        (stage === 2 && rand() < 0.8 ? red : green).push(podD(x1, y1 + 0.5, h * 0.22, curl));
      }
      if (depth === 3) {
        p.leaves.push(leafD(x1, y1, deg, h * 0.12, h * 0.045));
        if (stage === 1 && rand() < 0.5) flowers.push(<circle key={flowers.length} className={styles.flowerWhite} cx={n(x1)} cy={n(y1 + 1)} r={1.3} />);
        return;
      }
      const spread = depth === 1 ? 22 : 14;
      grow(x1, y1, deg - spread - 6 * rand(), len * (0.68 + 0.08 * rand()), depth + 1);
      grow(x1, y1, deg + spread + 6 * rand(), len * (0.68 + 0.08 * rand()), depth + 1);
    };
    const fork = GROUND - h * 0.22;
    grow(x, fork, -116 - 4 * rand(), h * 0.34, 1);
    grow(x, fork, -64 + 4 * rand(), h * 0.34, 1);
  }
  return (
    <g>
      <path className={styles.stalk} d={taper(x, stage === 0 ? h : h * 0.22, stage === 0 ? 0.8 : 1.5)} />
      <path className={styles.stem} d={p.stems.join("")} />
      <path className={styles.twig} d={p.twigs.join("")} />
      <path className={styles.leaf} d={p.leaves.join("")} />
      {green.length ? <path className={styles.podGreen} d={green.join("")} /> : null}
      {red.length ? <path className={styles.podRed} d={red.join("")} /> : null}
      {flowers}
    </g>
  );
}

/** Red gram: an erect, woody shrub with branches rising at a steep angle and
 * three-leaflet leaves; yellow flowers at the branch tips, then flat pods. */
function redgram(x: number, h: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const p = parts();
  const young: string[] = [], pods: string[] = [];
  const flowers: ReactNode[] = [];
  const size = h * 0.09;
  if (stage === 0) {
    // Red gram keeps its seed leaves underground: the first leaves are a simple pair.
    p.leaves.push(leafD(x, GROUND - h * 0.7, -150, h * 0.42, h * 0.12), leafD(x, GROUND - h * 0.7, -30, h * 0.42, h * 0.12));
    trifoliate(p, x, GROUND - h, -90, h * 0.5);
  } else {
    const nodes = 7;
    for (let i = 0; i < nodes; i++) {
      const t = 0.2 + (0.62 * i) / (nodes - 1);
      const y = GROUND - h * t;
      const side = i % 2 ? 1 : -1;
      const tilt = 24 + 14 * rand();
      const deg = -90 + side * tilt;
      const len = Math.min(h * (0.46 - 0.2 * t), (h * 0.97 - h * t) / Math.cos(rad(tilt)));
      const [ex, ey] = along(x, y, deg, len);
      const [cx, cy] = along(x, y, deg + side * 8, len * 0.5);
      p.stems.push(`M${pt(x, y)}Q${pt(cx, cy)} ${pt(ex, ey)}`);
      for (const f of [0.38, 0.7]) {
        const [lx, ly] = along(x, y, deg, len * f);
        if (stage === 1 || rand() < 0.5) trifoliate(p, lx, ly, deg + side * (40 + 10 * rand()), size);
        if (stage === 1 || rand() < 0.5) trifoliate(p, lx, ly, deg - side * (28 + 10 * rand()), size * 0.85);
      }
      trifoliate(p, ex, ey, deg, size * 0.9);
      // Lower branches flower first, so mid-season shows young pods below and flowers above.
      for (let k = 0; k < 4; k++) {
        if (stage === 1 && i >= 3) {
          const [fx, fy] = along(ex, ey, deg + side * (k * 32 - 20), 2.6 + k * 1.3);
          flowers.push(<circle key={`${i}-${k}`} className={k === 2 ? styles.flowerOrange : styles.flowerYellow} cx={n(fx)} cy={n(fy)} r={1.6} />);
        } else {
          if (k === 3) continue;
          const podDeg = side > 0 ? 14 + 32 * k : 166 - 32 * k;
          const [ax, ay] = along(ex, ey, podDeg, 1.5);
          (stage === 1 ? young : pods).push(flatPodD(ax, ay, podDeg, h * 0.075, 1.35));
        }
      }
    }
    for (const t of [0.12, 0.3, 0.5]) if (stage === 1 || rand() < 0.5) trifoliate(p, x, GROUND - h * t, t === 0.3 ? -40 : -140, size * 0.9);
    trifoliate(p, x, GROUND - h * 0.97, -90, size);
  }
  return (
    <g className={`${styles.woody} ${stage === 2 ? styles.senescent : ""}`}>
      <path className={styles.stalk} d={taper(x, stage === 0 ? h : h * 0.97, stage === 0 ? 0.8 : 2.4)} />
      <path className={styles.stem} d={p.stems.join("")} />
      <path className={styles.twig} d={p.twigs.join("")} />
      <path className={styles.leaf} d={p.leaves.join("")} />
      {young.length ? <path className={styles.pigeonPodYoung} d={young.join("")} /> : null}
      {pods.length ? <path className={styles.pigeonPod} d={pods.join("")} /> : null}
      {flowers}
    </g>
  );
}

/** Bengal gram: a low, spreading bush of thin branches and feathery leaves; small
 * flowers at mid-season and short inflated pods at the end. */
function bengalgram(x: number, h: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const stems: string[] = [], rachis: string[] = [], leaflets: string[] = [];
  const extras: ReactNode[] = [];
  const size = h * 0.24;
  if (stage === 0) {
    stems.push(`M${pt(x, GROUND)}L${pt(x, GROUND - h)}`);
    pinnate(rachis, leaflets, x, GROUND - h * 0.55, -150, h * 0.55);
    pinnate(rachis, leaflets, x, GROUND - h, -60, h * 0.55);
  } else {
    const branches = 7;
    for (let i = 0; i < branches; i++) {
      const tilt = -66 + (132 * i) / (branches - 1) + (rand() - 0.5) * 10;
      const len = h * (0.86 - (0.12 * Math.abs(tilt)) / 66) * (0.92 + 0.12 * rand());
      const deg = -90 + tilt;
      const [mx, my] = along(x, GROUND - 1, deg - 6, len * 0.5);
      const [ex, ey] = along(mx, my, deg + 6, len * 0.5);
      stems.push(`M${pt(x, GROUND - 1)}L${pt(mx, my)}L${pt(ex, ey)}`);
      [0.3, 0.55, 0.8].forEach((f, k) => {
        const [lx, ly] = f <= 0.5 ? along(x, GROUND - 1, deg - 6, len * f) : along(mx, my, deg + 6, len * (f - 0.5));
        if (stage === 1 || rand() < 0.6) pinnate(rachis, leaflets, lx, ly, deg + (k % 2 ? 44 : -44), size);
        if (k === 1 && i % 2 === 0) {
          const [ox, oy] = along(lx, ly, deg + 90, 2.2);
          extras.push(stage === 1
            ? <circle key={i} className={styles.flowerRose} cx={n(ox)} cy={n(oy)} r={1.3} />
            : <ellipse key={i} className={styles.chickPod} cx={n(ox)} cy={n(oy + 0.6)} rx={2.3} ry={1.5} transform={`rotate(${n(deg + 90)} ${n(ox)} ${n(oy + 0.6)})`} />);
        }
      });
      pinnate(rachis, leaflets, ex, ey, deg, size * 0.9);
    }
  }
  return (
    <g className={stage === 2 ? styles.senescent : undefined}>
      <path className={styles.twig} d={stems.join("")} />
      <path className={styles.rachis} d={rachis.join("")} />
      <path className={styles.leafletFine} d={leaflets.join("")} />
      {extras}
    </g>
  );
}

type Plant = (x: number, h: number, stage: number, seed: number) => ReactNode;
/** How each crop is drawn: its plant, how far apart the plants stand on screen,
 * and its roots (cereals fibrous, the rest a taproot with laterals). */
const DRAWING: Record<CropKey, { plant: Plant; spacing: number; roots: number; spread: number; glyphMax?: number }> = {
  maize: { plant: (x, h, stage, seed) => cereal(x, h, stage, seed, false), spacing: 190, roots: 15, spread: 66 },
  // Groundnut's leaflets are drawn at a fixed size, so its stage drawing is not enlarged.
  groundnut: { plant: groundnut, spacing: 150, roots: 11, spread: 27, glyphMax: 1 },
  cotton: { plant: cotton, spacing: 180, roots: 12, spread: 46 },
  chilli: { plant: chilli, spacing: 140, roots: 10, spread: 32 },
  redgram: { plant: redgram, spacing: 180, roots: 12, spread: 54 },
  bengalgram: { plant: bengalgram, spacing: 116, roots: 9, spread: 26 },
  jowar: { plant: (x, h, stage, seed) => cereal(x, h, stage, seed, true), spacing: 160, roots: 17, spread: 58 },
};

function roots(x: number, crop: CropKey, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const { min, max } = rootRange(crop, stage);
  const fibrous = CROP_REFERENCE[crop].form === "cereal";
  const { roots: many, spread } = DRAWING[crop];
  const count = stage === 0 ? Math.ceil(many / 2) : many;
  const lines: ReactNode[] = [];
  if (!fibrous) {
    const deep = depthY(min + (max - min) * (0.55 + 0.4 * rand()));
    lines.push(<path key="tap" className={styles.root} strokeWidth={1.6} d={`M${x},${GROUND} C${x + 3},${GROUND + (deep - GROUND) * 0.4} ${x - 4},${GROUND + (deep - GROUND) * 0.7} ${x + 1},${deep}`} />);
  }
  for (let i = 0; i < count; i++) {
    const s = (i / Math.max(1, count - 1) - 0.5) * 2;
    const reach = min + (max - min) * rand();
    const bottom = depthY(reach * (fibrous ? 0.82 + 0.18 * rand() : 0.6 + 0.35 * rand()));
    const dx = s * spread * (0.7 + 0.5 * rand());
    const start = GROUND + (fibrous ? 0 : 10 + (bottom - GROUND) * 0.15 * rand());
    lines.push(<path key={i} className={styles.root} strokeWidth={0.7 + 0.6 * rand()}
      d={`M${x + (fibrous ? s * 3.3 : 0)},${start} C${x + dx * 0.7},${start + 14} ${x + dx},${start + (bottom - start) * 0.45} ${x + dx * 0.85},${bottom}`} />);
    if (stage > 0 && i % 3 === 0) {
      const ly = start + (bottom - start) * (0.35 + 0.3 * rand());
      const lx = x + dx * 0.95;
      lines.push(<path key={`b${i}`} className={styles.root} strokeWidth={0.5} d={`M${lx},${ly} q${dx > 0 ? 14 : -14},6 ${dx > 0 ? 22 : -22},20`} />);
    }
  }
  return <g>{lines}</g>;
}

/** A small drawing of the crop at a stage, for the stage buttons. */
export function StageGlyph({ crop, stage }: { crop: CropKey; stage: number }) {
  const scale = Math.min(DRAWING[crop].glyphMax ?? 1.8, 76 / canopy(crop, 1));
  return (
    <svg viewBox="-117 120 234 130" className={styles.glyph} aria-hidden="true">
      <rect x={-117} y={GROUND} width={234} height={40} className={styles.glyphSoil} />
      <g transform={`translate(0 ${n(GROUND * (1 - scale))}) scale(${n(scale * 100) / 100})`}>{DRAWING[crop].plant(0, canopy(crop, stage), stage, 7)}</g>
    </svg>
  );
}

export function FieldSection({ crop, stage, rain, reserve, demand, eto, kc, gap, focus, moving, detail, waterTable }: {
  crop: CropKey; stage: number; rain: number; reserve: number; demand: number; eto: number; kc: number; gap: number;
  focus: FieldFocus; moving: boolean; detail: boolean;
  waterTable: { depthM: number; label: string } | null;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1160);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const update = () => {
      const { clientWidth, clientHeight } = element;
      if (clientWidth && clientHeight) setWidth(Math.round(Math.max(560, Math.min(1500, (H * clientWidth) / clientHeight))));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const W = width;
  const compact = W < 900;
  const profile = CROP_REFERENCE[crop];
  const drawing = DRAWING[crop];
  const left = compact ? 150 : 210, right = W - (compact ? 150 : 210);
  const plants = Math.max(2, Math.floor((right - left) / drawing.spacing));
  const xs = Array.from({ length: plants }, (_, i) => left + ((i + 0.5) * (right - left)) / plants);
  const range = rootRange(crop, stage);
  const height = canopy(crop, stage);
  const rainStreaks = Math.round(Math.min(70, rain) * 0.9);
  const wisps = Math.round(Math.min(70, demand) / 3);
  const infiltration = Math.round(Math.min(rain, demand + 30) / 2.5);
  const reserveShare = Math.min(1, reserve / RESERVE_SCALE);
  const perWeek = compact ? "" : " / 7 days";
  const rootLabelY = Math.max(depthY((range.min + range.max) / 2), GROUND + 112);
  const ticks = Array.from({ length: 10 }, (_, i) => i * 0.25);
  const rand = random(11 + Math.round(rain));

  return (
    <div ref={frame} className={styles.frame} data-focus={focus} data-moving={moving} data-detail={detail}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" data-testid="field-section"
        aria-label={`Cross-section: ${profile.name} at stage ${stage + 1}, roots to ${range.min}–${range.max} m; effective rain ${rain} mm, usable reserve ${reserve} mm, crop ET ${demand.toFixed(1)} mm over 7 days${waterTable ? `; water table about ${waterTable.depthM.toFixed(1)} m below ground` : ""}.`}>
        <defs>
          <linearGradient id="fs-air" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className={styles.airTop} /><stop offset="1" className={styles.airBottom} /></linearGradient>
          <pattern id="fs-grain" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r="0.8" className={styles.grain} /><circle cx="6.5" cy="7" r="0.6" className={styles.grain} /></pattern>
          <pattern id="fs-gravel" width="16" height="14" patternUnits="userSpaceOnUse"><ellipse cx="4" cy="5" rx="2.2" ry="1.4" className={styles.gravel} /><ellipse cx="12" cy="11" rx="1.6" ry="1.1" className={styles.gravel} /></pattern>
          <linearGradient id="fs-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" className={styles.waterTop} /><stop offset="1" className={styles.waterBottom} /></linearGradient>
        </defs>

        <rect x={0} y={0} width={W} height={GROUND} fill="url(#fs-air)" />

        {/* Soil horizons, to scale */}
        <rect x={0} y={GROUND} width={W} height={0.3 * PX_PER_M} className={styles.horizonA} />
        <rect x={0} y={depthY(0.3)} width={W} height={0.9 * PX_PER_M} className={styles.horizonB} />
        <rect x={0} y={depthY(1.2)} width={W} height={H - 60 - depthY(1.2)} className={styles.horizonC} />
        <rect x={0} y={GROUND} width={W} height={H - 60 - GROUND} fill="url(#fs-grain)" />
        <rect x={0} y={depthY(1.2)} width={W} height={H - 60 - depthY(1.2)} fill="url(#fs-gravel)" />

        {/* Root zone: the reserve is held here */}
        <g className={styles.layerRoots}>
          <rect x={0} y={GROUND} width={W} height={range.min * PX_PER_M} className={styles.moisture} style={{ opacity: 0.06 + 0.34 * reserveShare } as CSSProperties} />
          <rect x={0} y={depthY(range.min)} width={W} height={(range.max - range.min) * PX_PER_M} className={styles.rootBand} />
          <line x1={0} x2={W} y1={depthY(range.min)} y2={depthY(range.min)} className={styles.rootLine} />
          <line x1={0} x2={W} y1={depthY(range.max)} y2={depthY(range.max)} className={styles.rootLine} />
          <g className={styles.marks}>{xs.map((x, i) => <g key={i}>{roots(x, crop, stage, 101 + i * 37)}</g>)}</g>
          <text x={W - 18} y={rootLabelY - 4} textAnchor="end" className={styles.label}>Root zone</text>
          <text x={W - 18} y={rootLabelY + 14} textAnchor="end" className={styles.value}>{`${range.min.toFixed(range.min < 1 ? 2 : 1)}–${range.max.toFixed(range.max < 1 ? 2 : 1)} m`}</text>
          <text x={W - 18} y={rootLabelY + 30} textAnchor="end" className={styles.note}>{stage === 0 ? "at sowing" : profile.rootBasis}</text>
        </g>

        {/* Ground surface and the crop */}
        <line x1={0} x2={W} y1={GROUND} y2={GROUND} className={styles.surface} />
        <g className={styles.layerCrop}>
          {xs.map((x, i) => <g key={i}>{drawing.plant(x, height, stage, 13 + i * 29)}</g>)}
        </g>

        {/* Rain: one streak for about every millimetre that counts */}
        <g className={styles.layerRain}>
          <g className={styles.marks}>
          {Array.from({ length: rainStreaks }, (_, i) => {
            const x = left - 30 + rand() * (right - left + 60), y = 24 + rand() * (GROUND - 70);
            return <line key={i} x1={x} y1={y} x2={x - 5} y2={y + 22} className={styles.drop} style={{ animationDelay: `${-rand() * 1.4}s` } as CSSProperties} />;
          })}
          {Array.from({ length: infiltration }, (_, i) => {
            const x = left + rand() * (right - left), y = GROUND + 10 + rand() * Math.max(20, range.min * PX_PER_M * 0.6);
            return <path key={i} d={`M${x - 4},${y} l4,5 l4,-5`} className={styles.seep} style={{ animationDelay: `${-rand() * 2.4}s` } as CSSProperties} />;
          })}
          </g>
          <text x={18} y={compact ? 128 : 104} className={styles.label}>Effective rain</text>
          <text x={18} y={compact ? 152 : 128} className={styles.big}>{rain.toFixed(1)}<tspan className={styles.unit}>{` mm${perWeek}`}</tspan></text>
        </g>

        {/* Crop water use, rising from the canopy */}
        <g className={styles.layerEt}>
          <g className={styles.marks}>
          {Array.from({ length: wisps }, (_, i) => {
            const x = xs[i % xs.length] + (rand() - 0.5) * 70;
            const top = GROUND - height - 8;
            return <path key={i} d={`M${x},${top} q-6,-14 0,-28 q6,-14 0,-28`} className={styles.wisp} style={{ animationDelay: `${-rand() * 3}s` } as CSSProperties} />;
          })}
          </g>
          <text x={W - 18} y={48} textAnchor="end" className={styles.label}>Crop water use</text>
          <text x={W - 18} y={72} textAnchor="end" className={styles.big}>{demand.toFixed(1)}<tspan className={styles.unit}>{` mm${perWeek}`}</tspan></text>
          <text x={W - 18} y={90} textAnchor="end" className={styles.note}>{`ETo ${eto.toFixed(1)} × Kc ${kc.toFixed(2)} × 7`}</text>
          {gap > 0 ? <text x={W - 18} y={110} textAnchor="end" className={styles.gap}>{`${gap.toFixed(1)} mm not covered`}</text> : null}
        </g>

        {/* The reserve the root zone holds; its blue wash deepens with it */}
        <g className={styles.layerRoots}>
          <text x={W - 18} y={GROUND + 26} textAnchor="end" className={styles.labelOnSoil}>Usable reserve</text>
          <text x={W - 18} y={GROUND + 50} textAnchor="end" className={styles.bigOnSoil}>{reserve.toFixed(0)}<tspan className={styles.unitOnSoil}> mm</tspan></text>
          <rect x={W - 98} y={GROUND + 60} width={80} height={5} rx={2.5} className={styles.gaugeFrame} />
          <rect x={W - 98} y={GROUND + 60} width={80 * reserveShare} height={5} rx={2.5} className={styles.gaugeFill} />
        </g>

        {/* Depth scale */}
        <g className={styles.axis}>
          <line x1={44} x2={44} y1={GROUND} y2={depthY(SOIL_M - 0.05)} />
          {ticks.map(m => (
            <g key={m}>
              <line x1={38} x2={44} y1={depthY(m)} y2={depthY(m)} />
              {m % 0.5 === 0 ? <text x={34} y={depthY(m) + 4} textAnchor="end">{m === 0 ? "0" : `${m} m`}</text> : null}
            </g>
          ))}
        </g>
        <g className={styles.horizonNames}>
          <text x={54} y={depthY(0.15) + 4}>Topsoil</text>
          <text x={54} y={depthY(0.75) + 4}>Subsoil</text>
          <text x={54} y={depthY(1.6) + 4}>Weathered zone</text>
        </g>

        {/* Broken axis, then the water table */}
        <path d={`M0,${H - 66} ${Array.from({ length: Math.ceil(W / 24) + 1 }, (_, i) => `L${i * 24},${H - 66 + (i % 2 ? -6 : 6)}`).join(" ")} L${W},${H - 40} L0,${H - 40} Z`} className={styles.break} />
        <rect x={0} y={H - 46} width={W} height={46} fill="url(#fs-water)" />
        <text x={18} y={H - 18} className={styles.waterText}>
          {waterTable ? `Water table ≈ ${waterTable.depthM.toFixed(1)} m below ground` : "Water table: depth not available"}
          <tspan className={styles.waterNote}>{waterTable ? (compact ? "  ·  State wells, average" : `  ·  ${waterTable.label} · far below any root zone; crops reach it only through wells`) : ""}</tspan>
        </text>
        <text x={W - 18} y={H - 52} textAnchor="end" className={styles.scaleNote}>Soil depth to scale · plants at half scale · not field imagery</text>
      </svg>
    </div>
  );
}
