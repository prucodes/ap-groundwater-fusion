"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CREATOR_CREDIT } from "../../lib/creator";
import { gardenRows, monthYear, stepCounts, type Garden } from "../../lib/gardenShared";
import { EXIT, FilmPlayer, at, easeInOut, fade, rise, type FilmFormat } from "../film/FilmPlayer";
import { GardenRow, heightOf, type Painter, type RowGeometry } from "./GardenRows";
import { easeStep, lookAt } from "./gardenLook";
import styles from "./GardenFilm.module.css";

/* The water garden as a film of about half a minute, for forwarding: the garden grows in,
   droops where the water fell since last year, then plays every year since the first. One
   garden stays on screen throughout and only the words change, so the picture never cuts.
   The shell (clock, stage, controls, recorder handles, downloads) is FilmPlayer.tsx; each
   deploy records it to MP4 in three shapes (scripts/render-film.mjs --film garden). */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SITE = "prucodes.github.io/ap-groundwater-fusion";
const CAVEAT = "Prototype built from public sources. A screening view for where to look, not a declaration or an order.";
const OPEN_S = 6.2, NOW_S = 7.2, CLOSE_S = 4.8;
/** The years scene: a rewind to the first year, then each year in turn, then a rest on the latest. */
const REWIND_END = 1.7, PER_YEAR = 0.8, MOVE = 0.45, REST_END = 1.7;
const yearsSeconds = (garden: Garden) => REWIND_END + (garden.steps.length - 1) * PER_YEAR + REST_END;

/** How each shape lays the garden out, in the stage's own pixels. */
const SHAPES: Record<FilmFormat, { mode: "one" | "regions"; spacing: number; geometry: RowGeometry; box: [number, number]; labels: number; gap: number }> = {
  landscape: { mode: "one", spacing: 1.7, geometry: { stemMax: 150, soil: 200, headScale: 1 }, box: [1720, 532], labels: 40, gap: 0 },
  square: { mode: "one", spacing: 1.7, geometry: { stemMax: 150, soil: 200, headScale: 1 }, box: [952, 548], labels: 40, gap: 0 },
  portrait: { mode: "regions", spacing: 2.8, geometry: { stemMax: 80, soil: 110, headScale: 1.45 }, box: [936, 990], labels: 40, gap: 30 },
};

/** Where the garden is at a moment of the film: which year, how far grown, whether the heads show. */
function moment(garden: Garden, index: number, local: number) {
  const last = garden.steps.length - 1;
  if (index === 0) return { position: last, heads: 0, waterIn: at(local, 0.3, 1.2), growAt: (u: number) => Math.max(0, Math.min(1, (local - 0.6 - 2.2 * u) / 1.3)), rootsAt: (u: number) => Math.max(0, Math.min(1, (local - 1.7 - 2.0 * u) / 1.2)), dim: 1 };
  const full = { waterIn: 1, growAt: () => 1, rootsAt: () => 1 };
  if (index === 1) return { ...full, position: last, heads: at(local, 1.0, 1.8, easeInOut), dim: 1 };
  if (index === 2) {
    if (local < REWIND_END) return { ...full, position: last * (1 - at(local, 0.4, 1.1, easeInOut)), heads: 1, dim: 1 };
    const k = Math.min(last, Math.floor((local - REWIND_END) / PER_YEAR) + 1), from = REWIND_END + (k - 1) * PER_YEAR;
    return { ...full, position: k - 1 + easeStep(Math.max(0, Math.min(1, (local - from) / MOVE))), heads: 1, dim: 1 };
  }
  return { ...full, position: last, heads: 1, dim: 1 - at(local, 0, 0.7) };
}

export function GardenFilm() {
  const [garden, setGarden] = useState<Garden | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`${BASE}/garden/data.json`).then(r => (r.ok ? r.json() : null)).then(json => { if (live && json) setGarden(json as Garden); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  const segments = useMemo(() => [
    { id: "open", seconds: OPEN_S }, { id: "now", seconds: NOW_S },
    { id: "years", seconds: garden ? yearsSeconds(garden) : 10 }, { id: "close", seconds: CLOSE_S },
  ], [garden]);
  const latest = garden ? garden.steps[garden.steps.length - 1] : null;
  const edition = garden && latest ? `${latest.year}-${String(garden.month).padStart(2, "0")}` : "";

  return (
    <FilmPlayer name="garden" edition={edition} segments={segments} posterAt={OPEN_S + 3.6} ready={!!garden} stageClass={styles.stage} testId="garden-film"
      playLabel="the water garden film" downloadName={(shape, month) => `AP-water-garden-${month}-${shape}.mp4`}
      events={{ play: ["app/garden-film-play", "Water garden film: played on the page"], download: ["app/garden-film-download", "Water garden film: downloaded a video"] }}>
      {({ index, local, format, segments: placed }) => garden && latest ? (
        <GardenFrame garden={garden} index={index} local={local} format={format} scenes={placed.length} />
      ) : null}
    </FilmPlayer>
  );
}

function GardenFrame({ garden, index, local, format, scenes }: { garden: Garden; index: number; local: number; format: FilmFormat; scenes: number }) {
  const shape = SHAPES[format];
  const rows = useMemo(() => gardenRows(garden, shape.mode, shape.spacing), [garden, shape.mode, shape.spacing]);
  const along = useMemo(() => {
    const m = new Map<number, number>();
    rows.forEach(row => row.plants.forEach((p, k) => m.set(p.i, k / Math.max(row.plants.length - 1, 1))));
    return m;
  }, [rows]);
  const now = moment(garden, index, local);
  // The rows are drawn once, at the latest year; every frame is painted onto them.
  const last0 = garden.steps.length - 1;
  const resting = useCallback((i: number) => lookAt(garden, i, last0), [garden, last0]);
  const painters = useRef(new Map<number, Painter>());
  const register = useCallback((row: number, paint: Painter | null) => { if (paint) painters.current.set(row, paint); else painters.current.delete(row); }, []);
  useLayoutEffect(() => {
    const look = (i: number) => {
      const u = along.get(i) ?? 0;
      return lookAt(garden, i, now.position, { grow: now.growAt(u), roots: now.rootsAt(u), heads: now.heads });
    };
    painters.current.forEach(paint => paint(look, now.waterIn));
  });
  const last = garden.steps.length - 1, latest = garden.steps[last], first = garden.steps[0];
  const shown = garden.steps[Math.round(now.position)], counts = stepCounts(garden, shown), latestCounts = stepCounts(garden, latest);
  const seconds = [OPEN_S, NOW_S, yearsSeconds(garden), CLOSE_S][index];
  const leaving = index === 3 ? 1 : 1 - at(local, seconds - EXIT, EXIT, p => p * p);
  // The last earlier year with as large a share of mandals deeper than usual, if any.
  const share = (s: typeof latest) => { const c = stepCounts(garden, s); return c.deeper / Math.max(c.compared, 1); };
  const worse = garden.steps.slice(0, -1).filter(s => share(s) >= share(latest)).map(s => s.year);
  const worstSince = worse.length ? worse[worse.length - 1] : null;
  const labelsIn = index === 0 ? fade(local, 2.4) : undefined;

  // The garden's rows, each no wider than the box's height allows.
  const [boxW, boxH] = shape.box, H = heightOf(shape.geometry);
  const rowH = (boxH - rows.length * shape.labels - (rows.length - 1) * shape.gap) / rows.length;
  const rowW = Math.min(boxW, rowH * (rows[0].width / H));

  return (
    <>
      <div className={styles.chrome} style={{ opacity: index === 0 ? at(local, 3.2) : index === scenes - 1 ? 1 - at(local, 0, 0.4) : 1 }}>
        <span>AP Water Intelligence</span><span>Water garden · {monthYear(garden, latest.year)}</span>
      </div>

      <div className={styles.words} data-film-box="" data-kind={index === 3 ? "close" : undefined} style={{ opacity: leaving }} key={index}>
        {index === 0 ? <>
          <span className={styles.eyebrow} style={rise(local, 0.2)}>Andhra Pradesh · water garden</span>
          <h2 className={styles.title} style={rise(local, 0.5)}>Every mandal is a sorghum plant</h2>
          <p className={styles.headline} style={rise(local, 1.8)}>Its roots reach the water table in {monthYear(garden, latest.year)}, to scale: as deep as a borewell must go.</p>
        </> : index === 1 ? <>
          <span className={styles.eyebrow} style={rise(local, 0.1)}>{monthYear(garden, latest.year)} against each mandal&rsquo;s usual</span>
          <b className={styles.big} style={rise(local, 0.3)}>{Math.round(latestCounts.deeper * at(local, 0.4, 1.3))}</b>
          <p className={styles.headline} style={rise(local, 0.6)}>of {latestCounts.compared} mandals droop: their water stands deeper than their usual {garden.monthName}.</p>
          <p className={styles.note} style={rise(local, 3.0)}>{worstSince ? `The most since ${garden.monthName} ${worstSince}. ` : `The most of any ${garden.monthName} on record. `}{latestCounts.shallower} stand full, above their usual.</p>
        </> : index === 2 ? <>
          <span className={styles.eyebrow} style={rise(local, 0.1)}>Every {garden.monthName} since {first.year}</span>
          <b className={styles.big} data-tone="year" style={rise(local, 0.3)}>{shown.year}</b>
          <p className={styles.headline} style={fade(local, 0.6)}>{counts.deeper} of {counts.compared} deeper than usual</p>
          {garden.missingYears.length ? <p className={styles.note} style={fade(local, 1.2)}>No {garden.monthName} readings were published in {garden.missingYears.join(", ")}.</p> : null}
        </> : <div className={styles.close}>
          <p className={styles.closeLine} style={rise(local, 0.3)}>Every figure is on the site, with its source and its date.</p>
          <span className={styles.site} style={rise(local, 0.9)}>{SITE}/garden</span>
          <span className={styles.credit} style={rise(local, 1.5)}>AP Water Intelligence · {CREATOR_CREDIT}</span>
          <span className={styles.caveat} style={rise(local, 1.9)}>{CAVEAT}</span>
          <span className={styles.sources} style={rise(local, 2.3)}>Source: APWRIMS monthly well readings, the median of each mandal&rsquo;s wells, {garden.monthName} {first.year} to {latest.year}. A mandal&rsquo;s usual is its median {garden.monthName}.</span>
        </div>}
      </div>

      <div className={styles.visual} data-film-box="" style={{ opacity: now.dim, gap: shape.gap }}>
        {rows.map((row, r) => (
          <div key={r} className={styles.row} style={{ width: rowW }}>
            {shape.mode === "regions" && row.region !== null ? <span className={styles.rowLabel} style={labelsIn}>{garden.regions[row.region]}</span> : null}
            <GardenRow garden={garden} row={row} rowIndex={r} look={resting} geometry={shape.geometry} ticks={false} register={register} pixelRatio={1}
              className={styles.svg} label="The water garden" />
            {shape.mode === "one" ? (
              <div className={styles.regions} style={labelsIn}>
                {row.spans.map(span => <span key={span.region} style={{ left: `${(span.from / row.width) * 100}%`, width: `${((span.to - span.from) / row.width) * 100}%` }}>{garden.regions[span.region]}</span>)}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className={styles.progress} style={{ opacity: index === 0 ? at(local, 3.2) : 1 }}>
        {Array.from({ length: scenes }, (_, i) => <i key={i} data-state={i < index ? "done" : i === index ? "now" : undefined} />)}
      </div>
    </>
  );
}
