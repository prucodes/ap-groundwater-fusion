"use client";

import { useEffect, useRef, useState } from "react";
import { basePath } from "../lib/data";
import { countEvent } from "../lib/visit-counter";
import { IconPause, IconPlay } from "./icons";
import styles from "./GraceFilm.module.css";
import own from "./RainFilm.module.css";

/* The season's rain from space (phase3_levels/build_rain_film.py): a day a frame of
   NASA's IMERG from the start of the monsoon to after the cyclones, with the State's
   average for each day under it and the season's total set against the gauges. */

export type RainFilmData = {
  width: number; height: number; fps: number; days: string[]; stateMm: number[];
  satelliteSeasonMm: number; wettestDay: { date: string; mm: number };
  gauges: { window: string[]; mm: number; normalMm: number; gauges: number };
  landfalls: Array<{ name: string; date: string; x?: number; y?: number }>;
  outline: string; video: string; posterImage: string;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

function Bars({ d, at, onPick }: { d: RainFilmData; at: number; onPick: (i: number) => void }) {
  const W = 620, H = 150, L = 8, R = 8, T = 18, B = 22, n = d.days.length;
  const most = Math.max(...d.stateMm, 1);
  const bw = (W - L - R) / n;
  const x = (i: number) => L + i * bw;
  const y = (mm: number) => H - B - (mm / most) * (H - T - B);
  const firsts = d.days.map((iso, i) => [iso, i] as const).filter(([iso]) => iso.endsWith("-01"));
  return (
    <svg className={own.bars} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Andhra Pradesh's average rain by day from ${day(d.days[0])} to ${day(d.days[n - 1])}; wettest ${day(d.wettestDay.date)} at ${d.wettestDay.mm} mm.`}
      onClick={e => {
        const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        onPick(Math.max(0, Math.min(n - 1, Math.floor((((e.clientX - box.left) / box.width) * W - L) / bw))));
      }}>
      {d.stateMm.map((mm, i) => <rect key={i} x={x(i)} y={y(mm)} width={Math.max(1, bw - 0.6)} height={H - B - y(mm)} data-on={i <= at || undefined} />)}
      {firsts.map(([iso, i]) => <text key={iso} x={x(i)} y={H - 6} className={own.tick}>{MONTHS[Number(iso.slice(5, 7)) - 1]}</text>)}
      {d.landfalls.map((l, k) => {
        const i = d.days.indexOf(l.date);
        // Two landfalls a week apart at the right edge: both labelled to their left, one line apart.
        return i < 0 ? null : <g key={l.name} className={own.storm}><line x1={x(i) + bw / 2} x2={x(i) + bw / 2} y1={T - 4} y2={H - B} />
          <text x={x(i) + bw / 2 - 3} y={k ? T - 7 : T + 5} textAnchor="end">{l.name}</text></g>;
      })}
      <line x1={x(at) + bw / 2} x2={x(at) + bw / 2} y1={T} y2={H - B} className={own.cursor} />
    </svg>
  );
}

export function RainFilm({ d }: { d: RainFilmData }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const n = d.days.length;
  const [at, setAt] = useState(d.days.indexOf(d.wettestDay.date));
  const [playing, setPlaying] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let handle = 0;
    const tick = () => { setAt(Math.min(n - 1, Math.floor(v.currentTime * d.fps))); handle = requestAnimationFrame(tick); };
    const onPlay = () => { setPlaying(true); handle = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(handle); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => { cancelAnimationFrame(handle); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
  }, [d.fps, n]);

  useEffect(() => {
    const v = video.current, el = box.current;
    if (!v || !el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let started = false;
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) { started = true; v.currentTime = 0; v.play().catch(() => undefined); }
      else if (!entry.isIntersecting && !v.paused) v.pause();
    }, { threshold: 0.45 });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const pick = (i: number) => {
    const v = video.current;
    setAt(i);
    if (v) { v.pause(); v.currentTime = (i + 0.5) / d.fps; }
  };
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      v.currentTime = at >= n - 1 ? 0 : (at + 0.5) / d.fps;
      v.play().catch(() => undefined);
      if (!counted.current) { counted.current = true; countEvent("monsoon/rain-film", "Monsoon: played the season's rain film"); }
    } else v.pause();
  };

  const sofar = Math.round(d.stateMm.slice(0, at + 1).reduce((a, b) => a + b, 0));
  const murasu = d.landfalls.find(l => l.x !== undefined);
  const most = Math.max(d.satelliteSeasonMm, d.gauges.mm, d.gauges.normalMm);
  return (
    <div className={styles.wrap} ref={box} data-testid="rain-film">
      <div className={styles.stage}>
        <figure className={styles.film} style={{ aspectRatio: `${d.width} / ${d.height}` }}>
          <video ref={video} src={`${basePath}/${d.video}`} poster={`${basePath}/${d.posterImage}`} muted playsInline loop preload="metadata"
            aria-label={`Film of the rain over South India by day, ${day(d.days[0])} to ${day(d.days[n - 1])} 2026, from NASA's IMERG.`} />
          <svg viewBox={`0 0 ${d.width} ${d.height}`} className={styles.overlay} aria-hidden="true">
            <path d={d.outline} />
            {murasu?.x !== undefined && d.days[at] >= murasu.date ? <circle cx={murasu.x} cy={murasu.y} r="5" fill="#f2c46d" stroke="none" /> : null}
          </svg>
          <figcaption className={styles.clock} aria-live="polite">
            <b>{day(d.days[at])} 2026</b>
            <span data-tone="wet">Andhra Pradesh {d.stateMm[at].toFixed(1)} mm that day · {sofar} mm since {day(d.days[0])}</span>
          </figcaption>
        </figure>
        <div className={styles.controls}>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause the film" : "Play the film"} data-testid="rain-play">{playing ? <IconPause /> : <IconPlay />}</button>
          <input type="range" min={0} max={n - 1} value={at} onChange={e => pick(Number(e.target.value))} aria-label="Day of the film" aria-valuetext={day(d.days[at])} />
        </div>
      </div>

      <div className={styles.side}>
        <div className={own.compare} data-testid="rain-compare">
          {[["From space (IMERG)", d.satelliteSeasonMm, "sat"], [`The State's ${d.gauges.gauges.toLocaleString("en-IN")} gauges`, d.gauges.mm, "gauge"], ["Normal for the season", d.gauges.normalMm, "normal"]].map(([label, mm, tone]) => (
            <div key={label as string} data-tone={tone}>
              <span>{label}</span>
              <i style={{ width: `${(100 * (mm as number)) / most}%` }} />
              <b>{(mm as number).toLocaleString("en-IN")} mm</b>
            </div>
          ))}
          <small>Rain over the State, {day(d.days[0])} to {day(d.days[n - 1])}; the gauges from {day(d.gauges.window[0])} to {day(d.gauges.window[1])}.</small>
        </div>
        <Bars d={d} at={at} onPick={pick} />
        <ul className={styles.tiles}>
          <li><span>Wettest day</span><b>{d.wettestDay.mm} mm</b><em>{day(d.wettestDay.date)}, State average</em></li>
          <li><span>Season</span><b>{Math.round(100 * d.gauges.mm / d.gauges.normalMm)}%</b><em>of normal, by the gauges</em></li>
          <li><span>Satellite vs gauges</span><b>{d.satelliteSeasonMm > d.gauges.mm ? "+" : "−"}{Math.abs(Math.round(100 * (d.satelliteSeasonMm / d.gauges.mm - 1)))}%</b><em>over the same season</em></li>
        </ul>
      </div>
    </div>
  );
}
