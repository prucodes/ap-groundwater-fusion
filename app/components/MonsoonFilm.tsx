"use client";

import { useEffect, useRef, useState } from "react";
import { countEvent } from "../lib/visit-counter";
import film from "../data/monsoon_film.json";
import { basePath } from "../lib/data";
import { monthSpan } from "./agriculture/waterContextFormat";
import styles from "./MonsoonFilm.module.css";

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/** The live figures the film narrates, passed in by the server page so the
 * client bundle does not carry the whole Monsoon Watch file. */
export type FilmLiveFigures = {
  rainProduct: string; rainMonths: string; rainAnomalyPct: number; year: number;
  elNinoBelowNormal: number; elNinoYears: number; fallingPct: number;
} | null;

const pct = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;

/** Where the live record has moved away from what this fixed edition says aloud. */
export function sinceThisEdition(live: FilmLiveFigures, said: typeof film.narrated) {
  if (!live || !said) return [];
  const changes: string[] = [];
  if (live.rainAnomalyPct !== said.rainAnomalyPct || live.rainProduct !== said.rainProduct) {
    changes.push(`rainfall for ${monthSpan(live.rainMonths)} ${live.year} now reads ${pct(live.rainAnomalyPct)} against its normal on ${live.rainProduct} (the film says ${pct(said.rainAnomalyPct)}, from ${said.rainProduct})`);
  }
  if (live.elNinoBelowNormal !== said.elNinoBelowNormal || live.elNinoYears !== said.elNinoYears) {
    changes.push(`${live.elNinoBelowNormal} of ${live.elNinoYears} El Niño monsoons were below normal (the film says ${said.elNinoBelowNormal} of ${said.elNinoYears})`);
  }
  if (live.fallingPct !== said.fallingPct) {
    changes.push(`${live.fallingPct}% of compared mandals are deeper than in May (the film says ${said.fallingPct}%)`);
  }
  return changes;
}

export function MonsoonFilm({ live = null }: { live?: FilmLiveFigures }) {
  const since = sinceThisEdition(live, film.narrated);
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const [vertical, setVertical] = useState(false);
  const resume = useRef({ time: 0, playing: false });
  const assets = `${basePath}/films/monsoon`;
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      resume.current = { time: ref.current?.currentTime ?? 0, playing: ref.current ? !ref.current.paused : false };
      setVertical(media.matches);
      setFailed(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function seek(index: number) {
    if (!ref.current) return;
    countEvent("monsoon/film-chapter", "Monsoon film: jumped to a chapter");
    ref.current.currentTime = film.chapters[index].start;
    setActive(index);
    void ref.current.play().catch(() => { /* Native controls remain available. */ });
  }

  return (
    <section className={styles.film} aria-labelledby="monsoon-film-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>The ocean-to-aquifer story</span>
          <h2 id="monsoon-film-title">{film.title}</h2>
        </div>
        <span className={styles.duration}>{clock(film.duration)} · English narration</span>
      </div>
      <video
        ref={ref}
        className={`${styles.video} ${vertical ? styles.vertical : ""}`}
        controls
        playsInline
        preload="metadata"
        poster={`${assets}/${vertical ? "poster-portrait" : "poster"}.jpg`}
        src={`${assets}/pacific-to-ap-${vertical ? "portrait" : "landscape"}.mp4`}
        aria-label="El Nino explained: history, India's monsoon, and Andhra Pradesh groundwater"
        onError={() => setFailed(true)}
        // onPlay rather than a click handler: the film uses the browser's own controls.
        onPlay={() => countEvent("monsoon/film-play", "Monsoon film: started")}
        onEnded={() => countEvent("monsoon/film-finished", "Monsoon film: watched to the end")}
        onLoadedMetadata={() => {
          if (!ref.current) return;
          ref.current.currentTime = resume.current.time;
          if (resume.current.playing) void ref.current.play().catch(() => {});
        }}
        onTimeUpdate={() => {
          const time = ref.current?.currentTime ?? 0;
          setActive(Math.max(0, film.chapters.findLastIndex((chapter) => chapter.start <= time)));
        }}
      >
        <track kind="captions" src={`${assets}/captions.vtt`} srcLang="en" label="English" />
        Your browser does not support video. The download and transcript are available below.
      </video>
      {failed ? <p role="alert">The video could not load. Use the download link or read the transcript below.</p> : null}
      <nav className={styles.chapters} aria-label="Film chapters">
        {film.chapters.map((chapter, index) => (
          <button
            key={chapter.id}
            type="button"
            aria-current={index === active ? "step" : undefined}
            onClick={() => seek(index)}
          >
            <span>{clock(chapter.start)}</span>{chapter.title}
          </button>
        ))}
      </nav>
      <select className={styles.chapterSelect} aria-label="Film chapter" value={active} onChange={event => seek(Number(event.target.value))}>
        {film.chapters.map((chapter, index) => <option key={chapter.id} value={index}>{clock(chapter.start)} · {chapter.title}</option>)}
      </select>
      <div className={styles.meta}>
        <p>Snapshot: {film.snapshot}. NOAA ocean reconstruction, CHIRPS rainfall and project APWRIMS well series.
          Circulation is schematic; the aquifer, village and city scenes are AI-generated illustrations, not site imagery.
          Prototype boundaries. Synthetic narration. Local outcomes are conditional, not forecasts.
          The film is a fixed research edition, not a live update; its seasonal baseline is under review.
          {since.length ? <span className={styles.since} data-testid="film-since"><strong>Since this edition:</strong> {since.join("; ")}. The figures elsewhere on this page are current.</span> : null}</p>
        <div className={styles.downloads}>
          <a href={`${assets}/pacific-to-ap-landscape.mp4`} download onClick={() => countEvent("monsoon/film-download", "Monsoon film: downloaded")}>Download film</a>
          <a href={`${assets}/pacific-to-ap-portrait.mp4`} download onClick={() => countEvent("monsoon/film-share", "Monsoon film: took the vertical cut to share")}>Vertical / WhatsApp</a>
        </div>
      </div>
      <details className={styles.transcript} onToggle={event => { if (event.currentTarget.open) countEvent("monsoon/film-transcript", "Monsoon film: opened the transcript"); }}>
        <summary>Transcript and sources</summary>
        {film.chapters.map((chapter) => <p key={chapter.id}><strong>{clock(chapter.start)} · {chapter.title}</strong><br />{chapter.text}</p>)}
        <ul>{film.sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a></li>)}</ul>
      </details>
    </section>
  );
}
