"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { FilmScene, WeeklyFilm } from "../../lib/weeklyFilm";
import { EXIT, FilmPlayer, at, easeInOut, fade, r3, rise } from "./FilmPlayer";
import styles from "./WeeklyFilm.module.css";

/* The week as a one-minute film: the scenes. The clock, the stage, the controls and the
   recorder's handles are the shell every film shares (FilmPlayer.tsx); here, each scene
   draws its frame for a moment in time and nothing else. */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** The frame a reader sees before pressing play: the title, fully arrived. */
const POSTER_AT = 3.6;

type Outlines = { view: { width: number; height: number }; mandals: string[]; districts: string };

/** The figure counting up to itself; the last frame is the figure exactly as the site prints it. */
function counted(scene: FilmScene, t: number) {
  const p = at(t, 0.35, 1.25);
  if (!scene.count || p >= 1) return scene.big;
  return `${scene.count.prefix}${(scene.count.to * p).toFixed(scene.count.digits)}${scene.count.suffix}`;
}

/* ---------------- The State map ---------------- */

/** Every mandal in a quiet tone, with the ones a scene is about washed in from the west,
    the way the monsoon crosses the State. The paint is a handful of paths (one per colour)
    behind a soft-edged mask, so a frame moves two numbers, not seven hundred shapes. */
function FilmMap({ outlines, keys, colors, wash, id, children }: {
  outlines: Outlines; keys?: string; colors?: Record<string, string>; wash?: number; id: string; children?: ReactNode;
}) {
  const { width, height } = outlines.view;
  const all = useMemo(() => outlines.mandals.join(""), [outlines]);
  const paint = useMemo(() => {
    const byColor = new Map<string, string>();
    if (keys && colors) outlines.mandals.forEach((d, i) => { const color = colors[keys[i]]; if (color) byColor.set(color, (byColor.get(color) ?? "") + d); });
    return [...byColor];
  }, [outlines, keys, colors]);
  const band = 150, edge = r3((wash ?? 0) * (width + band));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={styles.map} aria-hidden="true">
      <path d={all} className={styles.mapBase} />
      {paint.length ? (
        <>
          <defs>
            <linearGradient id={`${id}-wash`} gradientUnits="userSpaceOnUse" x1={edge - band} x2={edge} y1={0} y2={0}>
              <stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#000" />
            </linearGradient>
            <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
              <rect width={width} height={height} fill={`url(#${id}-wash)`} />
            </mask>
          </defs>
          <g mask={`url(#${id}-mask)`}>{paint.map(([color, d]) => <path key={color} d={d} fill={color} className={styles.mapPaint} />)}</g>
        </>
      ) : null}
      <path d={outlines.districts} className={styles.mapLines} />
      {children}
    </svg>
  );
}

const Legend = ({ items, style }: { items: Array<{ label: string; colors: string[] }>; style: CSSProperties }) => (
  <span className={styles.legend} style={style}>
    {items.map(item => <span key={item.label}>{item.colors.map(color => <i key={color} style={{ background: color }} />)}{item.label}</span>)}
  </span>
);

/* ---------------- Scene pictures ---------------- */

/** Two wells from the ground down: last year's water level settles, then today's keeps falling. */
function DepthVisual({ scene, t }: { scene: Extract<FilmScene, { kind: "depth" }>; t: number }) {
  const W = 600, H = 540, ground = 96, floor = 452;
  const max = Math.max(2, Math.ceil(Math.max(scene.todayM, scene.yearAgoM) * 1.2));
  const y = (m: number) => r3(ground + (m / max) * (floor - ground));
  const first = at(t, 0.9, 1.2, easeInOut), second = at(t, 2.3, 1.4, easeInOut);
  const thenM = scene.yearAgoM * first, nowM = scene.yearAgoM * first + (scene.todayM - scene.yearAgoM) * second;
  const step = max <= 6 ? 1 : max <= 12 ? 2 : max <= 30 ? 5 : 10;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const well = (x: number, levelM: number, label: string, tone: "then" | "now") => (
    <g>
      <text x={x + 60} y={ground - 26} textAnchor="middle" className={styles.svgLabel}>{label}</text>
      <rect x={x} y={ground} width={120} height={floor - ground} className={styles.shaft} />
      <rect x={x} y={y(levelM)} width={120} height={r3(floor - y(levelM))} className={styles.water} />
      <line x1={x - 8} x2={x + 128} y1={y(levelM)} y2={y(levelM)} className={styles.level} data-tone={tone} />
      <text x={x + 140} y={y(levelM) + 11} className={styles.svgValue} data-tone={tone} style={fade(t, 0.9, 0.4)}>{levelM.toFixed(1)} m</text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} aria-hidden="true">
      <g style={fade(t, 0.5)}>
        {ticks.map(m => <g key={m}><line x1={96} x2={104} y1={y(m)} y2={y(m)} className={styles.tick} /><text x={86} y={y(m) + 8} textAnchor="end" className={styles.svgTick}>{m} m</text></g>)}
        <line x1={104} x2={W - 20} y1={ground} y2={ground} className={styles.ground} />
        {well(126, thenM, "A year ago", "then")}
        {well(380, nowM, "Today", "now")}
        <line x1={372} x2={508} y1={y(scene.yearAgoM)} y2={y(scene.yearAgoM)} className={styles.ghost} style={fade(t, 2.3, 0.5)} />
      </g>
      <text x={313} y={floor + 62} textAnchor="middle" className={styles.svgNote} style={fade(t, 3.7)}>{scene.gap}</text>
    </svg>
  );
}

const BUCKETS = 28;
/** Rust deeper than a year ago, cyan shallower, stronger with the metres, as This Week colours them. */
function dotTone(change: number) {
  const strength = Math.min(1, Math.abs(change) / 8);
  if (Math.abs(change) < 0.1) return "#93a7b8";
  return change > 0 ? `rgba(232,130,92,${r3(0.5 + 0.5 * strength)})` : `rgba(92,200,232,${r3(0.5 + 0.5 * strength)})`;
}

/** Every reporting sensor where it stands; the deepest fallen arrive first, so the rust spreads before the rest. */
function SensorsVisual({ scene, t, outlines }: { scene: Extract<FilmScene, { kind: "sensors" }>; t: number; outlines: Outlines }) {
  const groups = useMemo(() => {
    const count = scene.dots.length / 3, out: ReactNode[][] = Array.from({ length: BUCKETS }, () => []);
    for (let i = 0; i < count; i++) {
      out[Math.min(BUCKETS - 1, Math.floor((i / count) * BUCKETS))].push(<circle key={i} cx={scene.dots[i * 3]} cy={scene.dots[i * 3 + 1]} r={4.4} fill={dotTone(scene.dots[i * 3 + 2])} />);
    }
    return out;
  }, [scene.dots]);
  return (
    <FilmMap outlines={outlines} id="sensors">
      {groups.map((dots, i) => <g key={i} opacity={at(t, 0.9 + (2.8 * i) / BUCKETS, 0.55)}>{dots}</g>)}
      {scene.top.map((place, i) => {
        const start = 4.3 + 0.4 * i, pulse = at(t, start, 1.1);
        return (
          <g key={place.place + i}>
            <circle cx={place.x} cy={place.y} r={r3(10 + 26 * pulse)} className={styles.ring} opacity={r3(at(t, start, 0.2) * (1 - pulse))} />
            <circle cx={place.x} cy={place.y} r={11} className={styles.ring} opacity={at(t, start, 0.4)} />
          </g>
        );
      })}
    </FilmMap>
  );
}

function ChangesVisual({ scene, t }: { scene: Extract<FilmScene, { kind: "changes" }>; t: number }) {
  return (
    <ul className={styles.rows}>
      {scene.rows.map((row, i) => (
        <li key={row.label} data-direction={row.direction} style={rise(t, 0.9 + 0.26 * i, 22)}>
          <span className={styles.rowLabel}>{row.label}</span>
          <span className={styles.rowValues}><s>{row.before}</s><i aria-hidden="true">→</i><b>{row.after}</b></span>
          {row.delta ? <em style={fade(t, 1.25 + 0.26 * i, 0.45)}>{row.delta}</em> : null}
        </li>
      ))}
    </ul>
  );
}

function BarsVisual({ scene, t }: { scene: Extract<FilmScene, { kind: "bars" }>; t: number }) {
  return (
    <div className={styles.pairs}>
      {scene.pairs.map((pair, k) => {
        const most = Math.max(100, ...pair.items.map(item => item.value));
        return (
          <div key={pair.title} className={styles.pair} style={rise(t, 0.8 + 0.5 * k, 22)}>
            <span className={styles.pairTitle}>{pair.title}<small>{pair.unit}</small></span>
            {pair.items.map((item, i) => {
              const grow = at(t, 1.1 + 0.5 * k + 0.35 * i, 1.0, easeInOut);
              return (
                <span key={item.label} className={styles.bar} data-tone={item.tone}>
                  <span>{item.label}</span>
                  <span className={styles.track}><i style={{ width: `${r3((item.value / most) * 100 * grow)}%` }} /></span>
                  <b style={{ opacity: at(t, 1.5 + 0.5 * k + 0.35 * i, 0.4) }}>{item.text}</b>
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

const MONTH = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The water table since May, one line a season: the past seasons draw in and rise, then this one. */
function SeasonVisual({ scene, t }: { scene: Extract<FilmScene, { kind: "season" }>; t: number }) {
  const W = 700, H = 500, left = 96, right = 44, top = 70, bottom = 70;
  const past = scene.trajectory.filter(season => !season.current && season.points.length > 2), current = scene.trajectory.find(season => season.current);
  const rises = scene.trajectory.flatMap(season => season.points.map(p => -p.changeM));
  const high = Math.max(0.5, ...rises), low = Math.min(0, ...rises);
  const x = (month: number) => r3(left + ((month - 5) / 7) * (W - left - right));
  const y = (riseM: number) => r3(top + ((high - riseM) / (high - low)) * (H - top - bottom));
  const line = (season: (typeof scene.trajectory)[number]) => season.points.map((p, i) => `${i ? "L" : "M"}${x(p.month)},${y(-p.changeM)}`).join("");
  const draw = (p: number): CSSProperties => ({ strokeDasharray: 1, strokeDashoffset: r3(1 - p) });
  const pastDone = 0.8 + past.length * 0.11 + 0.9, end = current?.points[current.points.length - 1];
  const marks = Array.from({ length: Math.floor(high) + 1 }, (_, i) => i).filter(m => m >= Math.ceil(low));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} aria-hidden="true">
      <g style={fade(t, 0.5)}>
        {marks.map(m => <g key={m}><line x1={left} x2={W - right} y1={y(m)} y2={y(m)} className={m === 0 ? styles.ground : styles.grid} /><text x={left - 14} y={y(m) + 8} textAnchor="end" className={styles.svgTick}>{m === 0 ? "May" : `+${m} m`}</text></g>)}
        {[5, 7, 9, 11].map(month => <text key={month} x={x(month)} y={H - bottom + 40} textAnchor="middle" className={styles.svgTick}>{MONTH[month]}</text>)}
        <g className={styles.seasonKey}>
          <line x1={left + 8} x2={left + 52} y1={top - 34} y2={top - 34} className={styles.pastLine} /><text x={left + 64} y={top - 26} className={styles.svgTick}>past seasons</text>
          <line x1={left + 268} x2={left + 312} y1={top - 34} y2={top - 34} className={styles.nowLine} /><text x={left + 324} y={top - 26} className={styles.svgTick} data-tone="now">{scene.year}</text>
        </g>
      </g>
      {past.map((season, i) => <path key={season.year} d={line(season)} pathLength={1} className={styles.pastLine} style={draw(at(t, 0.8 + i * 0.11, 1.1, easeInOut))} />)}
      {current ? <path d={line(current)} pathLength={1} className={styles.nowLine} style={draw(at(t, pastDone, 1.5, easeInOut))} /> : null}
      {end ? <circle cx={x(end.month)} cy={y(-end.changeM)} r={r3(9 * at(t, pastDone + 1.4, 0.45))} className={styles.nowDot} /> : null}
    </svg>
  );
}

function Picture({ scene, t, outlines }: { scene: FilmScene; t: number; outlines: Outlines | null }) {
  if (scene.kind === "depth") return <DepthVisual scene={scene} t={t} />;
  if (scene.kind === "changes") return <ChangesVisual scene={scene} t={t} />;
  if (scene.kind === "bars") return <BarsVisual scene={scene} t={t} />;
  if (scene.kind === "season") return <SeasonVisual scene={scene} t={t} />;
  if (!outlines) return null;
  if (scene.kind === "sensors") return <SensorsVisual scene={scene} t={t} outlines={outlines} />;
  return <FilmMap outlines={outlines} keys={scene.keys} colors={scene.colors} wash={at(t, 0.8, 2.0, easeInOut)} id={scene.kind} />;
}

/* ---------------- Scenes ---------------- */

function SceneView({ scene, t, outlines }: { scene: FilmScene; t: number; outlines: Outlines | null }) {
  const leaving = 1 - at(t, scene.seconds - EXIT, EXIT, p => p * p);
  const listed = scene.kind === "sensors" ? scene.top : null;
  const legend = scene.kind === "drought" || scene.kind === "summer" ? scene.legend : null;
  const note = scene.kind === "drought" || scene.kind === "summer" ? scene.note : null;
  return (
    <div className={styles.scene} data-kind={scene.kind} style={{ opacity: leaving }}>
      <div className={styles.words} data-film-box="">
        <span className={styles.eyebrow} style={rise(t, 0.1)}>{scene.eyebrow}</span>
        <b className={styles.big} data-tone={scene.tone} style={rise(t, 0.25)}>{counted(scene, t)}</b>
        <p className={styles.headline} style={rise(t, 0.45)}>{scene.headline}</p>
        {note ? <p className={styles.note} style={rise(t, 3.2)}>{note}</p> : null}
        {listed?.length ? (
          <ol className={styles.listed}>
            <li className={styles.listedHead} style={rise(t, 4.1, 18)}>Fallen furthest since a year ago</li>
            {listed.map((place, i) => <li key={place.place + i} style={rise(t, 4.3 + 0.4 * i, 18)}><span>{place.place}<small>{place.district}</small></span><b>{place.fell}</b></li>)}
          </ol>
        ) : null}
      </div>
      <div className={styles.visual} data-film-box="">
        <Picture scene={scene} t={t} outlines={outlines} />
        {legend ? <Legend items={legend} style={fade(t, 2.4)} /> : null}
        {scene.kind === "sensors" ? <Legend items={[{ label: "deeper than a year ago", colors: ["#e8825c"] }, { label: "shallower", colors: ["#5cc8e8"] }]} style={fade(t, 3.4)} /> : null}
      </div>
      <span className={styles.foot} style={fade(t, 0.9)}>{scene.foot}</span>
    </div>
  );
}

function OpenView({ film, t, outlines }: { film: WeeklyFilm; t: number; outlines: Outlines | null }) {
  const leaving = 1 - at(t, film.openSeconds - EXIT, EXIT, p => p * p);
  return (
    <div className={styles.scene} data-kind="open" style={{ opacity: leaving }}>
      <div className={styles.words} data-film-box="">
        <span className={styles.eyebrow} style={rise(t, 0.3)}>{film.kicker}</span>
        <h2 className={styles.title} style={rise(t, 0.55)}>{film.title}</h2>
        <p className={styles.caveat} style={rise(t, 1.5)}>{film.caveat}</p>
      </div>
      <div className={styles.visual} data-film-box="">
        {outlines ? (
          <svg viewBox={`0 0 ${outlines.view.width} ${outlines.view.height}`} className={styles.map} aria-hidden="true">
            <path d={outlines.districts} pathLength={1} className={styles.outlineDraw} style={{ strokeDasharray: 1, strokeDashoffset: r3(1 - at(t, 0.2, 3.0, easeInOut)) }} />
            <path d={outlines.districts} className={styles.outlineFill} style={fade(t, 2.2, 1.2)} />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

function CloseView({ film, t }: { film: WeeklyFilm; t: number }) {
  return (
    <div className={styles.scene} data-kind="close">
      <div className={styles.words} data-film-box="">
        <p className={styles.closeLine} style={rise(t, 0.3)}>{film.close.line}</p>
        <span className={styles.site} style={rise(t, 0.9)}>{film.close.site}</span>
        <span className={styles.credit} style={rise(t, 1.5)}>{film.close.credit}</span>
        <span className={styles.caveat} style={rise(t, 1.9)}>{film.caveat}</span>
        <span className={styles.sources} style={rise(t, 2.3)}>Sources: {film.close.sources}. Week of {film.weekLabel}.</span>
      </div>
    </div>
  );
}

/* ---------------- The film ---------------- */

export function WeeklyFilmPlayer({ film }: { film: WeeklyFilm }) {
  const segments = useMemo(() => [{ id: "open", seconds: film.openSeconds }, ...film.scenes.map(scene => ({ id: scene.kind as string, seconds: scene.seconds })), { id: "close", seconds: film.closeSeconds }], [film]);
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${BASE}/geo/mandal-outlines.json`).then(r => (r.ok ? r.json() : null)).then(json => { if (live && json) setOutlines(json as Outlines); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  return (
    <FilmPlayer name="weekly" edition={film.week} segments={segments} posterAt={POSTER_AT} ready={!!outlines} stageClass={styles.stage} testId="weekly-film"
      playLabel="this week's film" downloadName={(shape, week) => `AP-water-week-${week}-${shape}.mp4`}
      events={{ play: ["app/weekly-film-play", "Weekly film: played on the page"], download: ["app/weekly-film-download", "Weekly film: downloaded a video"] }}>
      {({ index, local, segments: placed }) => {
        const last = placed.length - 1, scene = index > 0 && index < last ? film.scenes[index - 1] : null;
        const chrome = index === 0 ? 0 : index === 1 ? at(local, 0.1) : index === last ? 1 - at(local, 0, 0.4) : 1;
        return (
          <>
            <div className={styles.chrome} style={{ opacity: chrome }}>
              <span>AP Water Intelligence</span><span>{film.title}</span>
            </div>
            {index === 0 ? <OpenView film={film} t={local} outlines={outlines} />
              : scene ? <SceneView key={index} scene={scene} t={local} outlines={outlines} />
              : <CloseView film={film} t={local} />}
            <div className={styles.progress} style={{ opacity: chrome }}>
              {film.scenes.map((_, i) => <i key={i} data-state={i + 1 < index ? "done" : i + 1 === index ? "now" : undefined} />)}
            </div>
          </>
        );
      }}
    </FilmPlayer>
  );
}
