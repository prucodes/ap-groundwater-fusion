"use client";

import { useEffect, useRef, useState } from "react";
import { basePath } from "../lib/data";
import styles from "./CycloneAkvan.module.css";

/* The last two days over the Bay from Himawari-9 (phase3_levels/build_live_clouds.py),
   looping, with the State's outline and the hour each frame was taken. */

export type LiveClouds = { width: number; height: number; fps: number; frames: string[]; outline: string; video: string; posterImage: string };

const ist = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export function LiveLoop({ d }: { d: LiveClouds }) {
  const video = useRef<HTMLVideoElement>(null);
  const [at, setAt] = useState(d.frames.length - 1);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { v.pause(); return; }
    let handle = 0;
    const tick = () => { setAt(Math.min(d.frames.length - 1, Math.floor(v.currentTime * d.fps))); handle = requestAnimationFrame(tick); };
    handle = requestAnimationFrame(tick);
    v.play().catch(() => undefined);
    return () => cancelAnimationFrame(handle);
  }, [d.fps, d.frames.length]);
  return (
    <figure className={styles.live} style={{ aspectRatio: `${d.width} / ${d.height}` }} data-testid="akvan-live">
      <video ref={video} src={`${basePath}/${d.video}`} poster={`${basePath}/${d.posterImage}`} muted playsInline loop preload="metadata"
        aria-label={`Infrared satellite loop of the Bay of Bengal, the 48 hours to ${ist(d.frames[d.frames.length - 1])} IST.`} />
      <svg viewBox={`0 0 ${d.width} ${d.height}`} aria-hidden="true"><path d={d.outline} /></svg>
      <figcaption>
        <span className={styles.liveDot} aria-hidden="true" />
        <b>{ist(d.frames[at])} IST</b>
        <em>Himawari-9 infrared · last 48 hours</em>
      </figcaption>
    </figure>
  );
}
