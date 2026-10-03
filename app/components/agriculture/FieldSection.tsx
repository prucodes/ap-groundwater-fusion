"use client";

/* A measured cross-section of a field, drawn from the scenario's own numbers:
   soil depth to scale, roots to the FAO-56 rooting depths for the crop and
   stage, rain, the root-zone reserve and crop water use in proportion, and the
   water table below, from the State's latest well readings. No artwork: every
   line stands for a quantity or a published reference. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { CropKey } from "../../lib/agriculture";
import styles from "./FieldSection.module.css";

export type FieldFocus = "rain" | "roots" | "crop";

/** FAO-56 Table 22, maximum effective rooting depth (m); about 0.15–0.20 m at sowing. */
export const ROOT_DEPTH: Record<CropKey, { min: number; max: number }> = {
  maize: { min: 1.0, max: 1.7 },
  groundnut: { min: 0.5, max: 1.0 },
};
const SOWING_ROOTS = { min: 0.15, max: 0.2 };
/** FAO-56 Table 12, maximum crop height (m). */
const CROP_HEIGHT: Record<CropKey, number> = { maize: 2.0, groundnut: 0.4 };
const STAGE_HEIGHT = [0.16, 1, 0.97];

const H = 640;
const GROUND = 214;
const SOIL_M = 1.8;
const PX_PER_M = 330 / SOIL_M;      // soil to scale
const AIR_PX_PER_M = PX_PER_M / 2;  // plants at half scale
const RESERVE_SCALE = 60;           // the reserve slider's range, mm

export function rootRange(crop: CropKey, stage: number) {
  return stage === 0 ? SOWING_ROOTS : ROOT_DEPTH[crop];
}

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

function maize(x: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const h = CROP_HEIGHT.maize * STAGE_HEIGHT[stage] * AIR_PX_PER_M;
  const leaves = stage === 0 ? 4 : 9;
  const blades = Array.from({ length: leaves }, (_, i) => {
    const t = (i + 0.6) / leaves;
    const ay = GROUND - h * (0.08 + 0.74 * t) - (i % 2) * h * 0.03;
    const side = (i % 2 === 0 ? 1 : -1) * (rand() < 0.12 ? -1 : 1);
    const length = h * (stage === 0 ? 0.6 : (0.5 - 0.22 * t) * (0.88 + 0.24 * rand()));
    const sag = stage === 2 ? 0.55 : 0.18 + 0.2 * (1 - t);
    // Rise at about 50 degrees, arch over, and droop at the tip.
    const c1x = x + side * length * 0.3, c1y = ay - length * (0.55 - 0.2 * t);
    const tipX = x + side * length * 0.92, tipY = ay - length * 0.05 + length * sag;
    const w = Math.max(1.4, h * 0.016) * (1.1 - 0.4 * t);
    return <path key={i} className={styles.leaf}
      d={`M${x},${ay} C${c1x},${c1y - w} ${tipX - side * length * 0.18},${tipY - length * 0.42} ${tipX},${tipY} C${tipX - side * length * 0.2},${tipY - length * 0.36 + w * 2} ${c1x},${c1y + w * 1.6} ${x},${ay + w * 2.2} Z`} />;
  });
  return (
    <g className={stage === 2 ? styles.senescent : undefined}>
      <path className={styles.stalk} d={`M${x - 2.6},${GROUND} L${x - 1},${GROUND - h} L${x + 1},${GROUND - h} L${x + 2.6},${GROUND} Z`} />
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

function groundnut(x: number, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const h = CROP_HEIGHT.groundnut * STAGE_HEIGHT[stage] * AIR_PX_PER_M * 1.6;
  const stems = stage === 0 ? 3 : 9;
  const parts: ReactNode[] = [];
  for (let i = 0; i < stems; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, stems - 1) - 0.5) * 2.75;
    const len = h * (0.55 + 0.45 * Math.abs(Math.cos(a))) * (0.85 + 0.3 * rand());
    const ex = x + Math.cos(a) * len * 1.3;
    const ey = GROUND + Math.sin(a) * len;
    parts.push(<path key={`s${i}`} className={styles.stem} d={`M${x},${GROUND} Q${(x + ex) / 2},${ey - 4} ${ex},${ey}`} />);
    for (let k = 1; k <= 3; k++) {
      const px = x + (ex - x) * (k / 3.2), py = GROUND + (ey - GROUND) * (k / 3.2) - 3;
      parts.push(<ellipse key={`l${i}${k}`} className={styles.leaflet} cx={px} cy={py} rx={4.4} ry={2.6} transform={`rotate(${(a * 180) / Math.PI + 90} ${px} ${py})`} />);
    }
  }
  if (stage > 0) {
    for (let i = 0; i < 5; i++) {
      const px = x - 22 + i * 11 + rand() * 4, py = GROUND + 9 + rand() * 12;
      parts.push(<path key={`p${i}`} className={styles.peg} d={`M${px},${GROUND - 2} L${px},${py - 4}`} />);
      parts.push(<path key={`n${i}`} className={styles.pod} d={`M${px - 3.5},${py} a3.5,4 0 1,0 7,0 a3.5,4 0 1,0 -7,0`} />);
    }
  }
  return <g className={stage === 2 ? styles.senescent : undefined}>{parts}</g>;
}

function roots(x: number, crop: CropKey, stage: number, seed: number): ReactNode {
  const rand = random(seed);
  const { min, max } = rootRange(crop, stage);
  const lines: ReactNode[] = [];
  const count = crop === "maize" ? (stage === 0 ? 7 : 15) : stage === 0 ? 5 : 11;
  if (crop === "groundnut") {
    const deep = depthY(min + (max - min) * (0.55 + 0.4 * rand()));
    lines.push(<path key="tap" className={styles.root} strokeWidth={1.6} d={`M${x},${GROUND} C${x + 3},${GROUND + (deep - GROUND) * 0.4} ${x - 4},${GROUND + (deep - GROUND) * 0.7} ${x + 1},${deep}`} />);
  }
  for (let i = 0; i < count; i++) {
    const spread = (i / Math.max(1, count - 1) - 0.5) * (crop === "maize" ? 2.2 : 1.6);
    const reach = min + (max - min) * rand();
    const bottom = depthY(reach * (crop === "maize" ? 0.82 + 0.18 * rand() : 0.6 + 0.35 * rand()));
    const dx = spread * (crop === "maize" ? 60 : 34) * (0.7 + 0.5 * rand());
    const start = GROUND + (crop === "groundnut" ? 10 + (bottom - GROUND) * 0.15 * rand() : 0);
    lines.push(<path key={i} className={styles.root} strokeWidth={0.7 + 0.6 * rand()}
      d={`M${x + (crop === "groundnut" ? 0 : spread * 3)},${start} C${x + dx * 0.7},${start + 14} ${x + dx},${start + (bottom - start) * 0.45} ${x + dx * 0.85},${bottom}`} />);
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
  const scale = crop === "maize" ? 0.42 : 0.9;
  return (
    <svg viewBox="-117 120 234 130" className={styles.glyph} aria-hidden="true">
      <rect x={-117} y={GROUND} width={234} height={40} className={styles.glyphSoil} />
      <g transform={`translate(0 ${GROUND * (1 - scale)}) scale(${scale})`}>{crop === "maize" ? maize(0, stage, 7) : groundnut(0, stage, 7)}</g>
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
  const left = compact ? 150 : 210, right = W - (compact ? 150 : 210);
  const plants = Math.max(2, Math.floor((right - left) / (crop === "maize" ? 190 : 150)));
  const xs = Array.from({ length: plants }, (_, i) => left + ((i + 0.5) * (right - left)) / plants);
  const range = rootRange(crop, stage);
  const rainStreaks = Math.round(Math.min(70, rain) * 0.9);
  const wisps = Math.round(Math.min(70, demand) / 3);
  const infiltration = Math.round(Math.min(rain, demand + 30) / 2.5);
  const reserveShare = Math.min(1, reserve / RESERVE_SCALE);
  const perWeek = compact ? "" : " / 7 days";
  const rootLabelY = Math.max(depthY((range.min + range.max) / 2), GROUND + 112);
  const ticks = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75];
  const rand = random(11 + Math.round(rain));

  return (
    <div ref={frame} className={styles.frame} data-focus={focus} data-moving={moving} data-detail={detail}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" data-testid="field-section"
        aria-label={`Cross-section: ${crop} at stage ${stage + 1}, roots to ${range.min}–${range.max} m; effective rain ${rain} mm, usable reserve ${reserve} mm, crop ET ${demand.toFixed(1)} mm over 7 days${waterTable ? `; water table about ${waterTable.depthM.toFixed(1)} m below ground` : ""}.`}>
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
          <text x={W - 18} y={rootLabelY + 30} textAnchor="end" className={styles.note}>{stage === 0 ? "at sowing" : "FAO-56 Table 22"}</text>
        </g>

        {/* Ground surface and the crop */}
        <line x1={0} x2={W} y1={GROUND} y2={GROUND} className={styles.surface} />
        <g className={styles.layerCrop}>
          {xs.map((x, i) => <g key={i}>{crop === "maize" ? maize(x, stage, 13 + i * 29) : groundnut(x, stage, 13 + i * 29)}</g>)}
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
            const top = GROUND - CROP_HEIGHT[crop] * STAGE_HEIGHT[stage] * AIR_PX_PER_M * (crop === "maize" ? 1 : 1.6) - 8;
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
          <line x1={44} x2={44} y1={GROUND} y2={depthY(SOIL_M)} />
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
          <text x={54} y={depthY(1.5) + 4}>Weathered zone</text>
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
