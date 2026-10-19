"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./StateOutlineMap.module.css";
import { mapTooltipStyle } from "../lib/mapTooltip";

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

/** How long the west-to-east wash takes to cross the State. */
const SWEEP_MS = 420;

const title = (value: string) => (/[a-z]/.test(value) ? value : value.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()));

export function StateOutlineMap({ keys, colors, notes, label, aspect, legend, testId, marks }: {
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
  /** Boundary indices to outline in ink, drawn last so the ring sits above its neighbours. */
  marks?: number[];
}) {
  const [outlines, setOutlines] = useState<Outlines | null>(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const marked = marks?.length ? new Set(marks) : null;
  const colorFor = (index: number) => {
    const key = keys[index], color = colors[key] ?? colors.n ?? "var(--field)";
    return key === "n" ? `var(--map-held, ${color})` : key === "i" ? `var(--map-insufficient, ${color})` : color;
  };
  /* The choropleth lands west to east, the way the monsoon crosses the State, rather than
     all at once. The delay per mandal comes from the first point of its own outline, so it
     needs no extra data; the whole wash is under three quarters of a second and the CSS
     turns it off for a reader who asked for less motion. */
  const sweep = (path: string | undefined) => {
    const at = path?.match(/^M\s*(-?[\d.]+)/);
    if (!at || !outlines) return undefined;
    const across = Math.min(1, Math.max(0, Number(at[1]) / outlines.view.width));
    return `${Math.round(across * SWEEP_MS)}ms`;
  };
  // Marked mandals draw after the district lines, so their ring is never cut by one.
  const shape = (index: number) => <path key={index} d={outlines?.mandals[index]} data-key={keys[index]} data-mark={marked?.has(index) ? "" : undefined}
    style={{ "--sweep": sweep(outlines?.mandals[index]) } as React.CSSProperties}
    fill={colorFor(index)}
    onPointerMove={event => { const box = frame.current?.getBoundingClientRect(); if (box && event.pointerType !== "touch") setHover({ index, x: event.clientX - box.left, y: event.clientY - box.top }); }} />;
  useEffect(() => {
    let live = true;
    load().then(value => { if (live) setOutlines(value); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return <figure className={styles.figure} data-testid={testId} data-ready={outlines ? "true" : "false"}>
    <div ref={frame} className={styles.frame} style={{ aspectRatio: String(aspect) }} onPointerLeave={() => setHover(null)}>
      {outlines ? <svg viewBox={`0 0 ${outlines.view.width} ${outlines.view.height}`} role="img" aria-label={label}>
        {outlines.mandals.map((_, index) => (marked?.has(index) ? null : shape(index)))}
        <path d={outlines.districts} className={styles.districts} />
        {marks?.filter(index => index < outlines.mandals.length).map(shape)}
      </svg> : <div className={styles.placeholder} role="img" aria-label={label}>{failed ? "The map outlines did not load; the figures beside it stand on their own." : null}</div>}
      {hover && outlines ? (() => {
        const [district, mandal] = outlines.names[hover.index] ?? ["", ""];
        const width = frame.current?.clientWidth ?? 600;
        return <div className={styles.tooltip} role="tooltip" style={{ ...mapTooltipStyle(colorFor(hover.index)), left: Math.max(4, Math.min(hover.x + 14, width - 230)), top: hover.y + 12 }}>
          <span>{title(district)}</span><strong>{title(mandal)}</strong><em>{notes[hover.index]}</em>
        </div>;
      })() : null}
    </div>
    <figcaption className={styles.legend}>{legend}</figcaption>
  </figure>;
}
