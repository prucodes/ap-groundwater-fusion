"use client";

import { useEffect, useRef, useState } from "react";
import { basePath } from "../lib/data";
import { countEvent } from "../lib/visit-counter";
import { IconPause, IconPlay } from "./icons";
import styles from "./GraceFilm.module.css";

/* Andhra Pradesh's water from space (phase3_levels/build_grace_film.py): a month a
   frame of GRACE and GRACE-FO, which weigh the water a region holds by its pull on
   the satellites, beside the State's own wells. The chart under the film draws the
   two lines on one scale, so a reader can see an instrument in orbit and a tape in
   a well tell the same story. */

export type GraceFilmData = {
  width: number; height: number; fps: number; spanCm: number;
  months: string[]; missing: string[]; stateCm: Array<number | null>; wellsM: Array<number | null>;
  agreement: { months: number; r: number | null; rSwings: number | null; cmPerMetre: number | null };
  low: { month: string; cm: number }; high: { month: string; cm: number };
  latest: { month: string; cm: number; rankOfSameMonth: number; ofYears: number };
  outline: string; video: string; posterImage: string;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const name = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const short = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(0, 4)}`;
const ordinal = (k: number) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][k % 10] ?? "th"}`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)} cm`;

function Chart({ d, at, onPick }: { d: GraceFilmData; at: number; onPick: (i: number) => void }) {
  const W = 620, H = 190, L = 54, R = 10, T = 14, B = 24, n = d.months.length;
  const lim = Math.ceil(Math.max(d.spanCm, ...d.stateCm.map(v => Math.abs(v ?? 0))) / 10) * 10;
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const y = (cm: number) => T + ((lim - cm) * (H - T - B)) / (2 * lim);
  const path = (values: Array<number | null>) => {
    let out = "", open = false;
    values.forEach((v, i) => {
      if (v === null) { open = false; return; }
      out += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      open = true;
    });
    return out;
  };
  // The wells in metres, drawn in centimetres of water by the fitted ratio, upside down: a deeper table is less water.
  const k = d.agreement.cmPerMetre ?? 0;
  const wells = d.wellsM.map(v => (v === null || !k ? null : -v * k));
  const years = d.months.map((m, i) => [m, i] as const).filter(([m]) => m.endsWith("-01") && Number(m.slice(0, 4)) % 4 === 0);
  return (
    <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Water held in Andhra Pradesh by month from ${name(d.months[0])}, from GRACE, beside the State's wells from 2014. Lowest ${name(d.low.month)}, highest ${name(d.high.month)}.`}
      onClick={e => {
        const box = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const i = Math.round((((e.clientX - box.left) / box.width) * W - L) / ((W - L - R) / (n - 1)));
        onPick(Math.max(0, Math.min(n - 1, i)));
      }}>
      <rect x={L} y={y(lim)} width={W - L - R} height={y(0) - y(lim)} className={styles.wetBand} />
      <rect x={L} y={y(0)} width={W - L - R} height={y(-lim) - y(0)} className={styles.dryBand} />
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className={styles.zero} />
      {[lim, -lim].map(v => <text key={v} x={L - 6} y={y(v) + 4} textAnchor="end" className={styles.tick}>{signed(v)}</text>)}
      {years.map(([m, i]) => <text key={m} x={x(i)} y={H - 6} textAnchor="middle" className={styles.tick}>{m.slice(0, 4)}</text>)}
      <path d={path(wells)} className={styles.wells} />
      <path d={path(d.stateCm)} className={styles.grace} />
      <line x1={x(at)} x2={x(at)} y1={T} y2={H - B} className={styles.cursor} />
      {d.stateCm[at] !== null ? <circle cx={x(at)} cy={y(d.stateCm[at]!)} r="4.5" className={styles.dot} /> : null}
    </svg>
  );
}

export function GraceFilm({ d }: { d: GraceFilmData }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(d.months.length - 1);
  const [playing, setPlaying] = useState(false);
  const counted = useRef(false);
  const n = d.months.length;

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
      if (!counted.current) { counted.current = true; countEvent("monsoon/grace-film", "Monsoon: played the water-from-space film"); }
    } else v.pause();
  };

  const month = d.months[at], cm = d.stateCm[at], gap = cm === null;
  const between = gap && month >= "2017-07" && month <= "2018-05";
  return (
    <div className={styles.wrap} ref={box} data-testid="grace-film">
      <div className={styles.stage}>
        <figure className={styles.film} style={{ aspectRatio: `${d.width} / ${d.height}` }}>
          <video ref={video} src={`${basePath}/${d.video}`} poster={`${basePath}/${d.posterImage}`} muted playsInline loop preload="metadata"
            aria-label={`Film of the water held across South India by month, ${name(d.months[0])} to ${name(d.months[n - 1])}, from the GRACE satellites.`} />
          <svg viewBox={`0 0 ${d.width} ${d.height}`} className={styles.overlay} aria-hidden="true"><path d={d.outline} /></svg>
          <figcaption className={styles.clock} aria-live="polite">
            <b>{name(month)}</b>
            <span data-tone={gap ? undefined : cm! < 0 ? "dry" : "wet"}>
              {gap ? (between ? "between the two missions: no measurement" : "no solution this month") : `Andhra Pradesh ${signed(cm!)} of water against 2004–09`}
            </span>
          </figcaption>
          <span className={styles.key} aria-hidden="true"><i data-tone="dry" />less water<i data-tone="wet" />more</span>
        </figure>
        <div className={styles.controls}>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause the film" : "Play the film"} data-testid="grace-play">{playing ? <IconPause /> : <IconPlay />}</button>
          <input type="range" min={0} max={n - 1} value={at} onChange={e => pick(Number(e.target.value))} aria-label="Month of the film"
            aria-valuetext={`${name(month)}${cm === null ? "" : `, ${signed(cm)}`}`} />
        </div>
      </div>

      <div className={styles.side}>
        {d.agreement.r !== null ? (
          <div className={styles.agree} data-testid="grace-agreement">
            <b>{d.agreement.r.toFixed(2)}</b>
            <span>how closely the satellite and the State&rsquo;s wells move together, over {d.agreement.months} months since 2014 (1 is in step){d.agreement.rSwings !== null ? `; ${d.agreement.rSwings.toFixed(2)} with the seasons taken out` : ""}</span>
          </div>
        ) : null}
        <Chart d={d} at={at} onPick={pick} />
        <div className={styles.legend} aria-hidden="true"><span><i className={styles.keyGrace} />GRACE, from orbit</span><span><i className={styles.keyWells} />The State&rsquo;s wells, median mandal</span></div>
        <ul className={styles.tiles}>
          <li><span>Driest</span><b>{signed(d.low.cm)}</b><em>{short(d.low.month)}</em></li>
          <li><span>Wettest</span><b>{signed(d.high.cm)}</b><em>{short(d.high.month)}</em></li>
          <li><span>Latest</span><b>{signed(d.latest.cm)}</b><em>{short(d.latest.month)}, {ordinal(d.latest.rankOfSameMonth)} wettest of {d.latest.ofYears} {MONTHS[Number(d.latest.month.slice(5, 7)) - 1]}s</em></li>
        </ul>
      </div>
    </div>
  );
}
