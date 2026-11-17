"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal, flushSync } from "react-dom";
import { countEvent } from "../../lib/visit-counter";
import { IconDownload, IconExpand, IconPause, IconPlay } from "../icons";
import styles from "./FilmPlayer.module.css";

/* A film drawn by the page itself. Every frame is a pure function of the time: nothing
   in a film runs on a CSS animation or a timer, so the frame at 12.4 s is the same picture
   whether a reader is watching it play or the recorder is stepping through it
   (scripts/render-film.mjs calls window.renderFilm(t) once per frame and encodes the
   result to MP4 in three shapes). The page plays it live, sharp at any size.

   This is the shell every film shares: the clock, the stage at the video's own size
   scaled to fit, play and scrub, full screen, the recorder's handles and the download row.
   A film supplies its segments and draws the frame for a moment (the children function). */

export type FilmFormat = "landscape" | "square" | "portrait";
export const FILM_SIZE: Record<FilmFormat, [number, number]> = { landscape: [1920, 1080], square: [1080, 1080], portrait: [1080, 1920] };
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export type FilmSegment = { id: string; seconds: number };
export type FilmFrame = {
  /** Seconds into the film, the segment being shown, and seconds into that segment. */
  t: number; index: number; local: number;
  format: FilmFormat; segments: Array<FilmSegment & { start: number }>; total: number;
};

type Rendition = { format: FilmFormat; file: string; bytes: number; width: number; height: number };
type Manifest = { week: string; seconds: number; files: Rendition[] };

declare global {
  interface Window {
    filmReady?: boolean;
    filmMeta?: { week: string; seconds: number; scenes: Array<{ id: string; start: number; seconds: number }> };
    renderFilm?: (seconds: number) => { same: boolean; scene: string };
  }
}

/* One timing language for every film: things arrive over 0.7 s easing out, a little apart
   from each other; bars, levels and the camera move in and out gently; a scene leaves in 0.45 s. */
export const clamp = (x: number) => Math.max(0, Math.min(1, x));
export const easeOut = (p: number) => 1 - (1 - p) ** 3;
export const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);
export const r3 = (x: number) => Math.round(x * 1000) / 1000;
export const at = (t: number, start: number, seconds = 0.7, ease = easeOut) => r3(ease(clamp((t - start) / seconds)));
export const rise = (t: number, start: number, by = 28): CSSProperties => { const p = at(t, start); return { opacity: p, transform: `translateY(${r3((1 - p) * by)}px)` }; };
export const fade = (t: number, start: number, seconds = 0.6): CSSProperties => ({ opacity: at(t, start, seconds) });
export const EXIT = 0.45;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const megabytes = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;
const SHAPE: Record<FilmFormat, { name: string; use: string }> = {
  portrait: { name: "Vertical", use: "WhatsApp Status, phones" },
  square: { name: "Square", use: "messages and groups" },
  landscape: { name: "Widescreen", use: "meeting screens, slides" },
};

export function FilmPlayer({ name, edition, segments: parts, posterAt, ready = true, stageClass, testId, playLabel, downloadName, events, children }: {
  /** The film's folder under /films/, where each deploy puts its MP4s and manifest. */
  name: string;
  /** Which edition this is: the week, or the date the model was built. */
  edition: string;
  segments: FilmSegment[];
  /** The frame a reader sees before pressing play. */
  posterAt: number;
  /** Everything the film draws has arrived; the recorder waits for it. */
  ready?: boolean;
  stageClass: string;
  testId: string;
  /** For the play button: "Play this week's film". */
  playLabel: string;
  downloadName: (shape: FilmFormat, edition: string) => string;
  events: { play: [string, string]; download: [string, string] };
  children: (frame: FilmFrame) => ReactNode;
}) {
  const segments = useMemo(() => {
    let start = 0;
    return parts.map(segment => { const placed = { ...segment, start }; start += segment.seconds; return placed; });
  }, [parts]);
  const total = segments[segments.length - 1].start + segments[segments.length - 1].seconds;

  const [t, setT] = useState(posterAt);
  const [started, setStarted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [format, setFormat] = useState<FilmFormat>("landscape");
  const [scale, setScale] = useState(0);
  const [capture, setCapture] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const frame = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);

  // The recorder asks for one shape at its own size: ?capture=portrait.
  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("capture") as FilmFormat | null;
    if (asked && asked in FILM_SIZE) { setCapture(true); setFormat(asked); setScale(1); setStarted(true); setT(0); }
  }, []);

  useEffect(() => {
    let live = true;
    fetch(`${BASE}/films/${name}/manifest.json`).then(r => (r.ok ? r.json() : null)).then(json => { if (live && json?.files?.length) setManifest(json as Manifest); }).catch(() => undefined);
    return () => { live = false; };
  }, [name]);

  // The stage is drawn at the video's own size and scaled to the frame, so the page and the MP4 are one layout.
  useEffect(() => {
    const node = frame.current;
    // On the recorder's first pass `capture` is not set yet; the address already says so.
    if (!node || capture || new URLSearchParams(window.location.search).has("capture")) return;
    const fit = () => {
      const { width, height } = node.getBoundingClientRect();
      const full = document.fullscreenElement === node;
      const next: FilmFormat = full ? (width / height > 1.25 ? "landscape" : width / height < 0.8 ? "portrait" : "square") : width >= 620 ? "landscape" : "square";
      setFormat(next);
      const [w, h] = FILM_SIZE[next];
      setScale(full ? Math.min(width / w, height / h) : width / w);
    };
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(node);
    document.addEventListener("fullscreenchange", fit);
    return () => { watcher.disconnect(); document.removeEventListener("fullscreenchange", fit); };
  }, [capture]);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now(), request = 0;
    const tick = (now: number) => {
      // Real time, however rarely the browser calls back; a gap of seconds (a tab left and returned to) is not played through.
      const gap = (now - last) / 1000, step = gap > 1.5 ? 0 : gap;
      last = now;
      setT(time => { const next = Math.min(total, time + step); if (next >= total) setPlaying(false); return next; });
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [playing, total]);

  // The recorder's handles: the frame for any moment, and whether it differs from the one before.
  useEffect(() => {
    if (!capture) return;
    let previous = "";
    window.filmMeta = { week: edition, seconds: total, scenes: segments.map(({ id, start, seconds }) => ({ id, start, seconds })) };
    window.renderFilm = seconds => {
      flushSync(() => setT(seconds));
      const html = stage.current?.innerHTML ?? "", same = html === previous;
      previous = html;
      return { same, scene: (segments.find(segment => seconds < segment.start + segment.seconds) ?? segments[segments.length - 1]).id };
    };
    return () => { delete window.renderFilm; delete window.filmMeta; };
  }, [capture, edition, segments, total]);
  useEffect(() => {
    if (!capture || !ready) return;
    let live = true;
    document.fonts.ready.then(() => { if (live) window.filmReady = true; });
    return () => { live = false; window.filmReady = false; };
  }, [capture, ready]);

  const counted = useRef(false);
  const play = () => {
    if (!started || t >= total) { setT(0); setStarted(true); }
    setPlaying(true);
    if (!counted.current) { counted.current = true; countEvent(events.play[0], events.play[1]); }
  };
  const toggle = () => (playing ? setPlaying(false) : play());
  const fullscreen = () => {
    const node = frame.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen(); else void node.requestFullscreen?.();
  };

  const found = segments.findIndex(segment => t < segment.start + segment.seconds), index = found < 0 ? segments.length - 1 : found;
  const [width, height] = FILM_SIZE[format];
  const ended = started && !playing && t >= total;

  const picture = (
    <div ref={frame} className={styles.frame} data-format={format} style={{ aspectRatio: `${width} / ${height}` }} data-testid={testId}>
      {/* data-no-reveal: the site's scroll reveals (ChartReveal) keep out; a film's frames answer only to its clock. */}
      <div ref={stage} className={`${styles.stage} ${stageClass}`} data-format={format} data-film-stage="" data-no-reveal="" aria-hidden="true"
        style={{ width, height, transform: capture ? undefined : `translate(-50%, -50%) scale(${scale})`, visibility: scale ? "visible" : "hidden" }}>
        {children({ t, index, local: t - segments[index].start, format, segments, total })}
      </div>
      {!capture && !playing ? (
        <button type="button" className={styles.playOver} onClick={play} aria-label={ended ? "Play the film again" : started ? "Resume the film" : `Play ${playLabel}, ${Math.round(total)} seconds`}>
          <span><IconPlay /></span>
        </button>
      ) : null}
      {!capture && playing ? <button type="button" className={styles.pauseOver} onClick={toggle} aria-label="Pause the film" /> : null}
    </div>
  );
  // Recording: the frame alone, straight under <body>, so no page furniture or page transform can reach it.
  if (capture) return createPortal(<div className={styles.player} data-capture="">{picture}</div>, document.body);

  return (
    <div className={styles.player}>
      {picture}
      <div className={styles.controls}>
        <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <IconPause /> : <IconPlay />}</button>
        <input type="range" min={0} max={total} step={0.05} value={started ? t : 0} aria-label="Film position"
          onChange={event => { setStarted(true); setT(Number(event.target.value)); }} />
        <span className={styles.time}>{clock(started ? t : 0)} / {clock(total)}</span>
        <button type="button" onClick={fullscreen} aria-label="Full screen"><IconExpand /></button>
      </div>
      {manifest ? (
        <div className={styles.downloads} data-testid="film-downloads">
          <span>Download the video</span>
          <ul>
            {(["portrait", "square", "landscape"] as FilmFormat[]).flatMap(shape => {
              const file = manifest.files.find(f => f.format === shape);
              return file ? [<li key={shape}>
                <a href={`${BASE}/films/${name}/${file.file}`} download={downloadName(shape, manifest.week)}
                  onClick={() => countEvent(events.download[0], events.download[1])}>
                  <IconDownload /><b>{SHAPE[shape].name}</b><small>{SHAPE[shape].use} · {megabytes(file.bytes)}</small>
                </a>
              </li>] : [];
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
