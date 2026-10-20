"use client";

import { useEffect, useRef, useState } from "react";
import { basePath } from "../lib/data";

/* Twelve years of measured depth for one mandal, in the map's tooltip.
 *
 * Distinct from Hydrograph.tsx, which draws the full instrument on the mandal
 * panel from the in-bundle series. This one is the hover-sized version and reads
 * a slim fetched payload instead, because the tooltip cannot afford that series.
 *
 * The whole record lives in mandal_observation_series_v2.json, which is 6.3 MB and
 * is imported at the top of lib/data.ts. Reading it here would pull all of it into
 * the browser for a line a couple of hundred pixels wide, so the map fetches a slim
 * copy instead (build_mandal_hydrographs.py), and only once somebody hovers: a page
 * that is never pointed at never pays for this.
 *
 * Depth runs downward, the way a hydrograph is read, so the line falling means the
 * water table falling. The shape is the point: the saw-tooth is the monsoon filling
 * and the summer drawing down, and a reader can see at a glance whether the teeth
 * are marching down the page or holding level.
 */

type Payload = {
  months: string[]; mandals: number; levels: number; noData: number;
  minM: Array<number | null>; rangeM: Array<number | null>; cells: string;
};

let cache: { payload: Payload; bytes: Uint8Array } | null = null;
let inflight: Promise<void> | null = null;

function fetchOnce(): Promise<void> {
  if (cache) return Promise.resolve();
  if (!inflight) {
    inflight = fetch(`${basePath}/geo/mandal-hydrographs.json`)
      .then(r => r.json() as Promise<Payload>)
      .then(payload => {
        const binary = atob(payload.cells);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        cache = { payload, bytes };
      })
      .catch(() => undefined)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

const W = 208, H = 46, PAD = 3;

export function HoverHydrograph({ index }: { index: number | undefined }) {
  const [, bump] = useState(0);
  const asked = useRef(false);

  useEffect(() => {
    if (index === undefined || cache || asked.current) return;
    asked.current = true;
    fetchOnce().then(() => bump(n => n + 1));
  }, [index]);

  if (index === undefined || !cache) return null;
  const { payload, bytes } = cache;
  const low = payload.minM[index];
  const width = payload.rangeM[index];
  if (low === null || low === undefined || !width) return null;

  const points: Array<{ x: number; y: number } | null> = [];
  let deepest = -Infinity, shallowest = Infinity, latest: number | null = null;
  for (let month = 0; month < payload.months.length; month += 1) {
    const byte = bytes[month * payload.mandals + index];
    if (byte === payload.noData) { points.push(null); continue; }
    const metres = low + (byte / payload.levels) * width;
    deepest = Math.max(deepest, metres);
    shallowest = Math.min(shallowest, metres);
    latest = metres;
    points.push({
      x: PAD + (W - 2 * PAD) * month / Math.max(payload.months.length - 1, 1),
      // Deeper is further down the page, as a hydrograph is drawn.
      y: PAD + (H - 2 * PAD) * (byte / payload.levels),
    });
  }
  if (latest === null) return null;

  // Each unbroken run is its own path, so a gap in the record reads as a gap.
  const runs: string[] = [];
  let run = "";
  for (const point of points) {
    if (!point) { if (run) { runs.push(run); run = ""; } continue; }
    run += `${run ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
  }
  if (run) runs.push(run);
  const last = [...points].reverse().find(Boolean);

  return (
    <div className="estHoverSpark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Measured depth from ${payload.months[0]} to ${payload.months[payload.months.length - 1]}, between ${shallowest.toFixed(1)} and ${deepest.toFixed(1)} metres`}>
        {runs.map((d, i) => <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.1"
          strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />)}
        {last && <circle cx={last.x} cy={last.y} r="2" fill="currentColor" />}
      </svg>
      <div className="estHoverSparkFoot">
        <span>{payload.months[0].slice(0, 4)}</span>
        <span>{shallowest.toFixed(1)}&ndash;{deepest.toFixed(1)} m</span>
        <span>{payload.months[payload.months.length - 1].slice(0, 4)}</span>
      </div>
    </div>
  );
}
