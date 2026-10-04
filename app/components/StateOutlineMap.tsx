"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./StateOutlineMap.module.css";

/* A whole-State mandal map whose outlines load after the page: the page passes
   one colour key per mandal and a sentence per mandal for the tooltip, and the
   outlines come from /geo/mandal-outlines.json (built once, cached by the
   browser). Until they arrive, a frame of the same shape holds the place. */

type Outlines = { view: { width: number; height: number }; names: Array<[string, string]>; mandals: string[]; districts: string };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
let pending: Promise<Outlines> | null = null;
const load = () => (pending ??= fetch(`${BASE}/geo/mandal-outlines.json`).then(r => {
  if (!r.ok) throw new Error(`outlines ${r.status}`);
  return r.json() as Promise<Outlines>;
}));

const title = (value: string) => (/[a-z]/.test(value) ? value : value.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()));

export function StateOutlineMap({ keys, colors, notes, label, aspect, legend, testId }: {
  /** One key per boundary index (a character or a short code), looked up in `colors`. */
  keys: string[];
  colors: Record<string, string>;
  /** A short line per boundary index for the tooltip, after the mandal's name. */
  notes: string[];
  label: string;
  /** Width / height of the map, so the frame does not jump when the outlines arrive. */
  aspect: number;
  legend: ReactNode;
  testId?: string;
}) {
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    load().then(value => { if (live) setOutlines(value); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return <figure className={styles.figure} data-testid={testId} data-ready={outlines ? "true" : "false"}>
    <div ref={frame} className={styles.frame} style={{ aspectRatio: String(aspect) }} onPointerLeave={() => setHover(null)}>
      {outlines ? <svg viewBox={`0 0 ${outlines.view.width} ${outlines.view.height}`} role="img" aria-label={label}>
        {outlines.mandals.map((d, index) => <path key={index} d={d} data-key={keys[index]} fill={colors[keys[index]] ?? colors.n}
          onPointerMove={event => { const box = frame.current?.getBoundingClientRect(); if (box && event.pointerType !== "touch") setHover({ index, x: event.clientX - box.left, y: event.clientY - box.top }); }} />)}
        <path d={outlines.districts} className={styles.districts} />
      </svg> : <div className={styles.placeholder} role="img" aria-label={label}>{failed ? "The map outlines did not load; the figures beside it stand on their own." : null}</div>}
      {hover && outlines ? (() => {
        const [district, mandal] = outlines.names[hover.index] ?? ["", ""];
        const width = frame.current?.clientWidth ?? 600;
        return <div className={styles.tooltip} role="tooltip" style={{ left: Math.min(hover.x + 14, width - 230), top: hover.y + 12 }}>
          <span>{title(district)}</span><strong>{title(mandal)}</strong><em>{notes[hover.index]}</em>
        </div>;
      })() : null}
    </div>
    <figcaption className={styles.legend}>{legend}</figcaption>
  </figure>;
}
