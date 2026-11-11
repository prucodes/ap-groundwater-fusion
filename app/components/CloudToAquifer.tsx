"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { basePath } from "../lib/data";
import { countEvent } from "../lib/visit-counter";
import type { ArnabDay } from "../lib/arnab";
import styles from "./CloudToAquifer.module.css";

/* From cloud to aquifer: Himawari-9's hourly infrared film of both cyclones
   (phase3_levels/build_cyclone_clouds.py), with the State's own readings filling
   in beside it as the film reaches each day they were taken. The readings are
   steps, not a smooth line: a figure shows only once the gauges had counted it. */

export type CloudFilm = {
  source: string; width: number; height: number; fps: number; start: string; stepMinutes: number; frames: number;
  missing: string[]; poster: string; video: string; posterImage: string; outline: string;
  landfalls: Array<{ name: string; date: string; near?: string; x?: number; y?: number }>;
};

const HOUR = 36e5;
const DAY = 864e5;
// A gauge day ends at 8:30 am IST (3:00 UTC); the page's daily update lands that morning too.
const morning = (iso: string) => Date.parse(`${iso}T03:00:00Z`);
const shortDay = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const ist = (ms: number) => {
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}, ${d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }).replace(" ", " ")} IST`;
};

function phase(ms: number, film: CloudFilm) {
  const [arnab, murasu] = film.landfalls;
  const a = Date.parse(`${arnab.date}T00:00:00+05:30`), m = Date.parse(`${murasu.date}T00:00:00+05:30`);
  if (ms < a) return `${arnab.name}, over the Bay`;
  if (ms < a + DAY) return `${arnab.name} comes ashore`;
  if (ms < a + 3 * DAY) return `${arnab.name}'s rain`;
  if (ms < m) return `${murasu.name}, over the Bay`;
  if (ms < m + DAY) return `${murasu.name} comes ashore${murasu.near ? ` near ${murasu.near}` : ""}`;
  return `${murasu.name}'s rain`;
}

/** The last reading taken by this moment, or null before the first. */
function readingAt<T>(rows: T[], when: (row: T) => number, ms: number) {
  let found: T | null = null;
  for (const row of rows) if (when(row) <= ms) found = row;
  return found;
}

function Spark({ values, at, label }: { values: number[]; at: number; label: string }) {
  const W = 120, H = 28, lo = Math.min(...values), hi = Math.max(...values);
  const x = (i: number) => 2 + (i * (W - 4)) / Math.max(values.length - 1, 1);
  const y = (v: number) => H - 3 - ((v - lo) * (H - 6)) / (hi - lo || 1);
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg className={styles.spark} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" data-label={label}>
      <path d={path} />
      {at >= 0 ? <circle cx={x(at)} cy={y(values[at])} r="3" /> : null}
    </svg>
  );
}

export function CloudToAquifer({ film, days, until, deepMissed, deepTotal, stillDryMm, precedent, novemberIn }: {
  film: CloudFilm;
  days: ArnabDay[];
  /** The last gauge day the storms are counted to. */
  until: string;
  deepMissed: number; deepTotal: number; stillDryMm: number;
  /** Last year's rise beyond usual in the deepest band after Cyclone Montha. */
  precedent: { band: string; extraRiseM: number } | null;
  novemberIn: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(() => Math.round((Date.parse(film.poster) - Date.parse(film.start)) / (film.stepMinutes * 6e4)));
  const [playing, setPlaying] = useState(false);
  const counted = useRef(false);
  const start = Date.parse(film.start);
  const step = film.stepMinutes * 6e4;
  const now = start + frame * step;

  const shown = days.filter(d => d.rainTo <= until);
  const rain = readingAt(shown, d => morning(d.rainTo), now);
  const reading = readingAt(shown, d => morning(d.date), now);
  const rainAt = rain ? shown.indexOf(rain) : -1, readAt = reading ? shown.indexOf(reading) : -1;
  const first = shown[0], peak = shown.reduce((a, b) => (b.reservoirTmc > a.reservoirTmc ? b : a), shown[0]);
  const total = shown[shown.length - 1];

  const sync = useCallback(() => {
    const v = video.current;
    if (v) setFrame(Math.min(film.frames - 1, Math.floor(v.currentTime * film.fps)));
  }, [film.frames, film.fps]);

  // The slider's hour is the truth; the film only drives it while it plays.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let handle = 0;
    const tick = () => { sync(); handle = requestAnimationFrame(tick); };
    const onPlay = () => { setPlaying(true); handle = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(handle); };
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => { cancelAnimationFrame(handle); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
  }, [sync]);

  // Plays itself once it is on screen, unless the reader has asked for less motion.
  useEffect(() => {
    const v = video.current, el = box.current;
    if (!v || !el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let started = false;
    const seen = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started) {
        started = true;
        v.currentTime = 0;
        v.play().catch(() => undefined);
      } else if (!entry.isIntersecting && !v.paused) v.pause();
    }, { threshold: 0.45 });
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      v.currentTime = frame >= film.frames - 1 ? 0 : (frame + 0.5) / film.fps;
      v.play().catch(() => undefined);
      if (!counted.current) { counted.current = true; countEvent("arnab/cloud-film", "Cyclones: played the cloud film"); }
    } else v.pause();
  };
  const seek = (i: number) => {
    const v = video.current;
    setFrame(i);
    if (v) { v.pause(); v.currentTime = (i + 0.5) / film.fps; }
  };

  const murasu = film.landfalls.find(l => l.x !== undefined);
  const murasuAshore = murasu ? now >= Date.parse(`${murasu.date}T00:00:00+05:30`) : false;
  const dayTicks = Array.from({ length: Math.floor((film.frames * step) / DAY) + 1 }, (_, i) => i).filter(i => i % 3 === 0);
  const pctOf = (ms: number) => (100 * (ms - start)) / ((film.frames - 1) * step);

  return (
    <div className={styles.wrap} ref={box} data-testid="cloud-film">
      <div className={styles.stage}>
        <figure className={styles.film} style={{ aspectRatio: `${film.width} / ${film.height}` }}>
          <video ref={video} src={`${basePath}/${film.video}`} poster={`${basePath}/${film.posterImage}`} muted playsInline loop
            preload="metadata" aria-label={`Infrared satellite film of Cyclones ${film.landfalls.map(l => l.name).join(" and ")} over Andhra Pradesh, hourly from ${ist(start)} to ${ist(start + (film.frames - 1) * step)}.`} />
          <svg viewBox={`0 0 ${film.width} ${film.height}`} className={styles.overlay} aria-hidden="true">
            <path d={film.outline} className={styles.outline} />
            {murasu && murasu.x !== undefined && murasu.y !== undefined ? (
              <g className={styles.mark} data-on={murasuAshore || undefined} transform={`translate(${murasu.x},${murasu.y})`}>
                <circle r="5" /><circle r="11" className={styles.ring} />
                <text x="-16" y="4" textAnchor="end">{murasu.near}</text>
              </g>
            ) : null}
          </svg>
          <figcaption className={styles.clock}>
            <b>{ist(now)}</b>
            <span>{phase(now, film)}</span>
          </figcaption>
          <span className={styles.badge}>Himawari-9 · infrared</span>
        </figure>
        <div className={styles.controls}>
          <button type="button" onClick={toggle} aria-label={playing ? "Pause the film" : "Play the film"} data-testid="cloud-film-play">
            {playing
              ? <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1" /><rect x="9.5" y="2.5" width="3" height="11" rx="1" /></svg>
              : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L5.4 2.1a.6.6 0 0 0-.9.5z" /></svg>}
          </button>
          <div className={styles.track}>
            <input type="range" min={0} max={film.frames - 1} value={frame} onChange={e => seek(Number(e.target.value))}
              aria-label="Hour of the film" aria-valuetext={`${ist(now)}: ${phase(now, film)}`} />
            <div className={styles.ticks} aria-hidden="true">
              {dayTicks.map(i => <span key={i} style={{ left: `${pctOf(start + i * DAY)}%` }}>{shortDay(start + i * DAY)}</span>)}
              {film.landfalls.map(l => <i key={l.name} style={{ left: `${pctOf(Date.parse(`${l.date}T12:00:00+05:30`))}%` }} title={`${l.name} ashore`} />)}
            </div>
          </div>
        </div>
      </div>

      <ol className={styles.chain} aria-label="What reached the ground, as the film reaches each reading">
        <li>
          <span>Rain on the ground</span>
          <b data-testid="cloud-rain">{rain ? Math.round(rain.rainSinceTmc) : 0}<small> TMC</small></b>
          <Spark values={shown.map(d => d.rainSinceTmc)} at={rainAt} label="rain" />
          <em>{rain ? `State gauges, counted to ${shortDay(morning(rain.rainTo))}` : `State gauges, counted to ${shortDay(morning(first.rainTo))}`}</em>
        </li>
        <li>
          <span>Soil, top 30 cm</span>
          <b>{Math.round((reading ?? first).soilMedian30)}<small>% wet</small></b>
          <Spark values={shown.map(d => d.soilMedian30)} at={readAt} label="soil" />
          <em>Median mandal, NRSC model, {shortDay(morning((reading ?? first).date))} update</em>
        </li>
        <li>
          <span>Reservoirs</span>
          <b>{Math.round((reading ?? first).reservoirTmc)}<small> TMC</small></b>
          <Spark values={shown.map(d => d.reservoirTmc)} at={readAt} label="reservoirs" />
          <em>All State reservoirs, {shortDay(morning((reading ?? first).date))} update</em>
        </li>
        <li className={styles.pending}>
          <span>Water table</span>
          <b>{novemberIn ? "In" : "December"}</b>
          <em>{novemberIn
            ? <>The November reading is in. <a href="#arnab-follow">See how the deep tables moved →</a></>
            : <>The first reading after both storms is November&apos;s, published early December.{precedent ? <> After Cyclone Montha last year, tables {precedent.band} down rose {precedent.extraRiseM.toFixed(1)} m beyond their usual change.</> : null}</>}</em>
        </li>
      </ol>

      <p className={styles.takeaway}>
        <b>{Math.round(total.rainSinceTmc)} TMC</b> fell. The State&apos;s reservoirs, net of what they released, never held more than <b>{(peak.reservoirTmc - first.reservoirTmc).toFixed(0)} TMC</b> above
        their {shortDay(morning(first.date))} level, and by {shortDay(morning(days[days.length - 1].date))} were back near it. The rest went into the soil, village tanks and the ground, or ran to the sea; the water table will show how much reached it.
        {" "}<b>{deepMissed} of {deepTotal}</b> deep-table mandals got under {stillDryMm} mm. <a href={`${basePath}/summer/#summer-priority`}>Where to plan summer drinking water first →</a>
      </p>
    </div>
  );
}
