import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { AQUIFER_NAMES, seedOf, type GardenAquifer } from "../../lib/gardenShared";
import styles from "./Borewells.module.css";

/* A district's mandals as borewells: the close-up under the State's field (WaterGarden.tsx)
   and the strip on each Collector's sheet (districts/[slug]/sheet). Each bore is drilled
   through the district's own ground (hard rock, alluvium or coastal sand) down past the
   deepest October on record, with its pump set 2 m below the mandal's usual October level,
   as if installed for a normal year. The water stands in it at the measured depth, to scale.

   What the pump does is the Water Garden's rule, read as a farmer would see it:
     water above its usual: full flow, green lamp;     within 0.1 m: steady flow;
     below usual, still over the pump: a trickle, amber lamp;  below the pump: dry, red lamp.
   So the drooping plants of the field are the amber and red lamps here.

   Pure SVG, drawn on the server for the sheet. On the page (`animated`) the bores drill in,
   the water rises, the pumps start and the water runs; levels glide when the year changes.
   All of that is CSS (Borewells.module.css), and stops for a reader who asks for less motion. */

export type Bore = {
  id?: string; name: string; nowM: number | null; usualM: number | null; side: -1 | 0 | 1 | null; deepestM: number | null;
  /** Where the pump sits, if not 2 m below the usual (the summer countdown sets it at the deepest May on record). */
  pumpM?: number | null;
  /** The pump's state, if not the Water Garden's rule (the countdown's own). */
  state?: PumpState;
};
export type PumpState = "full" | "steady" | "trickle" | "dry" | "none";

/** The pump sits this far below the mandal's usual October level. */
export const PUMP_BELOW_USUAL_M = 2;

export function pumpState(b: Bore): PumpState {
  if (b.nowM === null || b.usualM === null || b.side === null) return "none";
  if (b.side === -1) return "full";
  if (b.side === 0) return "steady";
  return b.nowM > b.usualM + PUMP_BELOW_USUAL_M ? "dry" : "trickle";
}

const LAMP: Record<PumpState, string> = { full: "#5be38a", steady: "#5be38a", trickle: "#f2b442", dry: "#ff5a3c", none: "#5a646e" };
const STREAM: Record<PumpState, number> = { full: 3.2, steady: 2.2, trickle: 0.9, dry: 0, none: 0 };

/** The district's ground, in bands from the surface down: [top m, colour, texture]. */
function strata(aquifer: GardenAquifer, scaleM: number): Array<[number, string, "dots" | "cracks" | "lines" | null]> {
  if (aquifer === 0) return [[0, "#5b3b24", null], [2, "#6a5232", "dots"], [14, "#3b3f45", "cracks"], [scaleM, "#2a2d31", "cracks"]];
  if (aquifer === 2) return [[0, "#6d5a3c", "dots"], [5, "#7d6a48", "dots"], [16, "#5b4a33", "lines"], [30, "#6d5a3c", "dots"], [scaleM, "#4a3c2a", "lines"]];
  return [[0, "#4d3a28", null], [4, "#6b5a3a", "dots"], [11, "#3e3127", "lines"], [19, "#665537", "dots"], [30, "#3b2f25", "lines"], [42, "#5e4e34", "dots"]];
}

export function Borewells({ bores, scaleM, aquifer, animated = false, play = true, label, width = 1000, soil = 300, nameSize = 11, nameMax = 24, light = false, selected = null, uid, hrefOf, onOpen }: {
  bores: Bore[];
  scaleM: number;
  aquifer: GardenAquifer;
  animated?: boolean;
  /** Animated bores wait, undrilled, until this turns true (when they come into view). */
  play?: boolean;
  label: string;
  width?: number;
  /** Height of the ground, in drawing units: the depth scale fits in it. */
  soil?: number;
  nameSize?: number;
  /** Longer names are shortened to this many characters (the printed sheet has little room under its bores). */
  nameMax?: number;
  /** On a light page (the printed sheet): names in the page's ink. */
  light?: boolean;
  selected?: number | null;
  uid: string;
  /** Each bore a link (to its mandal's page), opened by `onOpen` when that is given. */
  hrefOf?: (bore: Bore) => string | null;
  onOpen?: (bore: Bore, name: Element | null) => void;
}) {
  const PAD_L = 52, PAD_R = 14, SKY = 62;
  const shortName = (name: string) => (name.length > nameMax ? `${name.slice(0, nameMax - 1).trimEnd()}…` : name);
  const n = Math.max(bores.length, 1), sp = (width - PAD_L - PAD_R) / n, scale = Math.min(1.7, sp / 30);
  // Names lie flat under their bores when they fit, and tilt when they would touch.
  const longest = Math.min(nameMax, Math.max(...bores.map(b => b.name.length), 4)), flat = sp > nameSize * 0.56 * longest + 6;
  const NAMES = flat ? nameSize * 2.2 : nameSize * (0.5 * longest + 1.4);
  const height = SKY + soil + NAMES, k = (soil - 14) / scaleM;
  const y = (m: number) => SKY + m * k;
  const bands = strata(aquifer, scaleM);
  const r1 = (v: number) => Math.round(v * 10) / 10;

  return (
    <svg viewBox={`0 0 ${width} ${r1(height)}`} className={`${styles.svg} ${animated ? styles.animated : ""} ${animated && !play ? styles.paused : ""}`} role="img" aria-label={label} data-borewells={bores.length}>
      <defs>
        <linearGradient id={`${uid}-steel`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#56616b" /><stop offset=".45" stopColor="#c6d0d8" /><stop offset="1" stopColor="#47505a" /></linearGradient>
        <linearGradient id={`${uid}-pump`} x1="0" x2="1" y1="0" y2="0"><stop offset="0" stopColor="#6f7c88" /><stop offset=".5" stopColor="#dbe2e8" /><stop offset="1" stopColor="#5c6873" /></linearGradient>
        <linearGradient id={`${uid}-water`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#8fdcf6" /><stop offset=".08" stopColor="#4fb2de" /><stop offset="1" stopColor="#1d6d9c" /></linearGradient>
        <linearGradient id={`${uid}-stream`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c4eefc" /><stop offset="1" stopColor="#5fc4ec" /></linearGradient>
        <linearGradient id={`${uid}-zone`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="rgba(70,170,220,.34)" /><stop offset="1" stopColor="rgba(30,90,130,.18)" /></linearGradient>
        <linearGradient id={`${uid}-pad`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b3aca0" /><stop offset="1" stopColor="#7d766b" /></linearGradient>
        <filter id={`${uid}-glow`} x="-5%" y="-300%" width="110%" height="700%"><feGaussianBlur stdDeviation="2" /></filter>
        <clipPath id={`${uid}-ground`}><rect x={PAD_L - 6} y={SKY} width={width - PAD_L - PAD_R + 6} height={soil} /></clipPath>
      </defs>

      {/* The ground, in its layers, and the depth scale */}
      <g clipPath={`url(#${uid}-ground)`}>
        {bands.slice(0, -1).map(([top, colour, texture], j) => {
          const bottom = bands[j + 1][0], y0 = y(top), y1 = j === bands.length - 2 ? SKY + soil : y(bottom);
          return (
            <g key={j}>
              <rect x={PAD_L - 6} y={r1(y0)} width={width} height={r1(Math.max(0, y1 - y0))} fill={colour} />
              {texture === "dots" ? Array.from({ length: Math.round((y1 - y0) * width / 900) }, (_, q) => (
                <circle key={q} cx={r1(PAD_L + seedOf(q, j * 7 + 1) * (width - PAD_L))} cy={r1(y0 + seedOf(q, j * 7 + 2) * (y1 - y0))} r={r1(0.6 + seedOf(q, j * 7 + 3))} fill="rgba(255,240,210,.12)" />
              )) : texture === "cracks" ? Array.from({ length: Math.round((y1 - y0) * width / 9000) + 4 }, (_, q) => {
                const cx = PAD_L + seedOf(q, j * 7 + 4) * (width - PAD_L), cy = y0 + seedOf(q, j * 7 + 5) * (y1 - y0);
                return <path key={q} d={`M${r1(cx)} ${r1(cy)}l${r1(6 + seedOf(q, 8) * 10)} ${r1(4 + seedOf(q, 9) * 6)}l${r1(-3 + seedOf(q, 10) * 8)} ${r1(5 + seedOf(q, 11) * 8)}`} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={0.8} />;
              }) : texture === "lines" ? <path d={`M${PAD_L - 6} ${r1(y0 + 2)}H${width}`} stroke="rgba(0,0,0,.25)" strokeWidth={1} /> : null}
            </g>
          );
        })}
        {/* The saturated ground under the water table, mandal by mandal */}
        {bores.map((b, i) => b.nowM === null ? null : (
          <g key={`z${i}`} className={styles.level} style={{ transform: `translateY(${r1(y(b.nowM))}px)` } as CSSProperties}>
            <rect x={r1(PAD_L + i * sp)} y={0} width={r1(sp + 0.3)} height={soil} fill={`url(#${uid}-zone)`} />
          </g>
        ))}
      </g>
      {Array.from({ length: Math.floor(scaleM / 10) + 1 }, (_, j) => j * 10).map(m => (
        <g key={m}>
          <line x1={PAD_L - 6} x2={width - PAD_R} y1={r1(y(m))} y2={r1(y(m))} stroke="rgba(255,255,255,.07)" strokeDasharray="3 4" />
          <text x={PAD_L - 12} y={r1(y(m) + 4)} textAnchor="end" className={styles.tick} fontSize={nameSize}>{m} m</text>
        </g>
      ))}
      <text x={width - PAD_R} y={r1(SKY + soil - 6)} textAnchor="end" className={styles.ground} fontSize={nameSize * 0.9}>{AQUIFER_NAMES[aquifer]}</text>

      {/* The water table across the district: a glowing line that steps from mandal to mandal */}
      <g className={styles.table}>
        {[true, false].map(glow => (
          <g key={String(glow)} filter={glow ? `url(#${uid}-glow)` : undefined} opacity={glow ? 0.9 : 1}>
            {bores.map((b, i) => b.nowM === null ? null : (
              <g key={i}>
                <g className={styles.level} style={{ transform: `translateY(${r1(y(b.nowM))}px)` } as CSSProperties}>
                  <rect x={r1(PAD_L + i * sp)} y={-0.9} width={r1(sp + 0.3)} height={1.8} fill={glow ? "#5fd0f6" : "#c4f1ff"} />
                </g>
                {i + 1 < bores.length && bores[i + 1].nowM !== null ? (() => {
                  const a = y(b.nowM!), c = y(bores[i + 1].nowM!), top = Math.min(a, c), span = Math.max(0.01, Math.abs(c - a));
                  return <g className={styles.level} style={{ transform: `translate(${r1(PAD_L + (i + 1) * sp - 0.6)}px, ${r1(top)}px) scaleY(${r1(span)})` } as CSSProperties}><rect x={0} y={0} width={1.4} height={1} fill={glow ? "#5fd0f6" : "#c4f1ff"} /></g>;
                })() : null}
              </g>
            ))}
          </g>
        ))}
      </g>

      {bores.map((b, i) => {
        const x = PAD_L + (i + 0.5) * sp, state = b.state ?? pumpState(b), reading = b.nowM !== null;
        const setAt = b.pumpM !== undefined ? b.pumpM : b.usualM !== null ? b.usualM + PUMP_BELOW_USUAL_M : null;
        const deepest = Math.min(scaleM, Math.max(b.deepestM ?? b.nowM ?? 0, b.nowM ?? 0, setAt ?? 0) + 6), boreY = y(deepest), casingY = y(Math.min(deepest, aquifer === 0 ? 14 : deepest));
        const pumpM = setAt !== null ? Math.min(deepest - 1.5, setAt) : null, pumpY = pumpM !== null ? y(pumpM) : null;
        const bw = Math.min(7.5, sp * 0.3), stream = STREAM[state];
        return (
          <g key={b.id ?? `${b.name}${i}`} className={styles.bore} data-state={state} data-selected={selected === i ? "" : undefined} style={{ "--i": i } as CSSProperties} opacity={reading ? 1 : 0.35}>
            <Link href={hrefOf?.(b) ?? null} label={`${b.name}: open the mandal`} onOpen={event => { if (!onOpen) return; event.preventDefault(); onOpen(b, event.currentTarget.querySelector("text")); }}>
            {/* Below ground: the hole, its casing, the water in it, the rising main and the pump */}
            <g className={styles.drill} style={{ transformOrigin: `${r1(x)}px ${SKY}px` } as CSSProperties}>
              <rect x={r1(x - bw / 2)} y={SKY} width={r1(bw)} height={r1(boreY - SKY)} fill="#0b0d10" rx={1} />
              <rect x={r1(x - bw / 2)} y={SKY} width={r1(bw)} height={r1(casingY - SKY)} fill={`url(#${uid}-steel)`} opacity={0.55} />
              <clipPath id={`${uid}-bore${i}`}><rect x={r1(x - bw / 2 + 1)} y={SKY} width={r1(bw - 2)} height={r1(boreY - SKY - 1)} /></clipPath>
              {reading ? (
                <g clipPath={`url(#${uid}-bore${i})`}>
                  <g className={styles.level} style={{ transform: `translateY(${r1(y(b.nowM!))}px)` } as CSSProperties}>
                    <rect className={styles.fill} x={r1(x - bw / 2)} y={0} width={r1(bw)} height={soil} fill={`url(#${uid}-water)`} />
                    <rect x={r1(x - bw / 2)} y={-0.4} width={r1(bw)} height={1.2} fill="#d8f6ff" />
                  </g>
                </g>
              ) : null}
              {pumpY !== null ? <>
                {/* The rising main and cable stretch from the surface to the pump, and the pump moves to its
                    depth: all three glide together when the pump is reset. */}
                <g className={styles.level} style={{ transform: `translateY(${SKY}px) scaleY(${r1(Math.max(1, pumpY - SKY - 6))})` } as CSSProperties}>
                  <line x1={r1(x - 0.8)} x2={r1(x - 0.8)} y1={0} y2={1} stroke="#c9d2da" strokeWidth={1.1} vectorEffect="non-scaling-stroke" />
                  <line x1={r1(x + 1.4)} x2={r1(x + 1.4)} y1={0} y2={1} stroke="#1a1d20" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
                </g>
                <g className={styles.level} style={{ transform: `translateY(${r1(pumpY)}px)` } as CSSProperties}>
                  <rect x={r1(x - 2.6)} y={-7} width={5.2} height={14} rx={2.2} fill={`url(#${uid}-pump)`} />
                  <path d={`M${r1(x - 2.6)} -2h5.2M${r1(x - 2.6)} 1h5.2M${r1(x - 2.6)} 4h5.2`} stroke="rgba(0,0,0,.35)" strokeWidth={0.5} />
                </g>
              </> : null}
            </g>

            {/* Above ground: the pad, the casing head, the delivery pipe and valve, the starter and its lamp, and the water */}
            <g className={styles.head} transform={`translate(${r1(x)} ${SKY}) scale(${r1(scale)})`}>
              <rect x={-11} y={-4} width={22} height={4.4} rx={1.4} fill={`url(#${uid}-pad)`} />
              <rect x={-3.4} y={-24} width={6.8} height={20} fill={`url(#${uid}-steel)`} />
              <rect x={-4.6} y={-26} width={9.2} height={2.6} rx={0.6} fill="#d3dae0" />
              <path d="M0 -26V-31Q0 -35 4 -35H14" fill="none" stroke="#a8b3bc" strokeWidth={3} strokeLinecap="round" />
              <circle cx={8} cy={-35} r={2.3} fill="#6c7a86" stroke="#2f3840" strokeWidth={0.5} />
              <line x1={8} x2={8} y1={-38.5} y2={-37.3} stroke="#2f3840" strokeWidth={0.8} />
              <line x1={-11} x2={-11} y1={-30} y2={-4} stroke="#4a525a" strokeWidth={1} />
              <rect x={-15} y={-34} width={8} height={9} rx={1} fill="#2f3a44" stroke="#59646e" strokeWidth={0.5} />
              <circle className={styles.halo} cx={-11} cy={-29.5} r={4.2} fill={LAMP[state]} opacity={state === "none" ? 0 : 0.3} />
              <circle className={styles.lamp} cx={-11} cy={-29.5} r={1.7} fill={LAMP[state]} />
              <path d="M-11 -25Q-7 -14 -3.4 -12" fill="none" stroke="#1c1f22" strokeWidth={0.6} />
              {/* the field channel: wet where water runs into it, cracked where none does */}
              <rect x={10} y={-1.6} width={16} height={2.2} rx={0.8} fill="#3a2d20" />
              <rect className={styles.channel} x={10} y={-1.6} width={16} height={2.2} rx={0.8} fill="#5fb7dd" opacity={stream ? Math.min(1, stream / 3) : 0} />
              {stream ? <g className={styles.stream} key={state}>
                <path d="M14 -34.4C17.2 -30 18.2 -19 17.2 -1.4" fill="none" stroke={`url(#${uid}-stream)`} strokeWidth={stream} strokeLinecap="round" opacity={0.55} />
                <path className={styles.flow} d="M14 -34.4C17.2 -30 18.2 -19 17.2 -1.4" fill="none" stroke="#e4f8ff" strokeWidth={Math.max(0.6, stream * 0.45)} strokeLinecap="round" strokeDasharray="5 4" />
                <ellipse cx={17.4} cy={-0.8} rx={2 + stream * 1.4} ry={0.6 + stream * 0.3} fill="rgba(140,215,245,.55)" />
                {stream > 1.5 ? [0, 1, 2].map(q => <circle key={q} className={styles.drop} cx={15 + q * 2.6} cy={-3} r={0.6} fill="#cdf2ff" style={{ "--q": q } as CSSProperties} />) : null}
              </g> : state === "dry" ? (
                <path d="M11 0.2l3 1.3l3 -1.1l3 1.5l3 -1.2" fill="none" stroke="#c0744a" strokeWidth={0.7} />
              ) : null}
            </g>

            <text className={styles.name} x={r1(x)} y={r1(SKY + soil + nameSize * (flat ? 1.4 : 0.9))} fontSize={nameSize} textAnchor={flat ? "middle" : "end"}
              transform={flat ? undefined : `rotate(-52 ${r1(x)} ${r1(SKY + soil + nameSize * 0.9)})`} fill={light ? "#33455c" : "#a9bccb"}>{shortName(b.name)}</text>
            </Link>
          </g>
        );
      })}
    </svg>
  );
}

/** A bore as a link when it has somewhere to go; otherwise just its drawing. */
function Link({ href, label, onOpen, children }: { href: string | null; label: string; onOpen: (event: ReactMouseEvent<Element>) => void; children: ReactNode }) {
  if (!href) return <>{children}</>;
  return <a href={href} className={styles.link} aria-label={label} onClick={onOpen}>{children}</a>;
}
