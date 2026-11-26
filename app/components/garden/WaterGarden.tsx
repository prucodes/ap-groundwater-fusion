"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { gardenRows, monthYear, rainLine, stepCounts, type Garden } from "../../lib/gardenShared";
import { IconPause, IconPlay } from "../icons";
import { transition } from "../../lib/viewTransition";
import { DistrictBores, type BoresFocus } from "./DistrictBores";
import { GardenDistrictMark, GardenMark, GardenRow, type Painter, type RainMoment, type RowGeometry } from "./GardenRows";
import { easeStep, lookAt } from "./gardenLook";
import styles from "./WaterGarden.module.css";

/* The water garden on its page: every mandal a plant, grown in when the garden is reached,
   with the years to step or play through and each plant answering to a pointer. The
   drawing is GardenRows.tsx; what each plant looks like at a moment is gardenLook.ts.

   Motion (growing in, moving between years) is painted frame by frame straight onto the
   drawn rows; React only redraws when the garden comes to rest, so the page keeps the
   screen's own frame rate on a phone. */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const WIDE: { spacing: number; geometry: RowGeometry } = { spacing: 1.7, geometry: { stemMax: 150, soil: 200, headScale: 1 } };
const NARROW: { spacing: number; geometry: RowGeometry } = { spacing: 1.32, geometry: { stemMax: 92, soil: 150, headScale: 1.15 } };
/** Seconds to grow in; and, playing the years, for each monsoon to fall, the water and crops to move, and a rest on the October. */
const GROW_S = 3.4, RAIN_S = 0.9, MOVE_S = 0.6, REST_S = 0.6;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The presenter's control: rest on the latest year, play every year from the first, or hold where it is. */
export type GardenStage = "rest" | "play" | "hold";

export function WaterGarden({ data = null, stage, bare = false }: {
  /** The garden already fetched (the presenter shares one copy); otherwise it is fetched here. */
  data?: Garden | null;
  /** Driven by the presenter instead of the play button. */
  stage?: GardenStage;
  /** Without the controls, the close-up and the key: the presenter shows its own. */
  bare?: boolean;
} = {}) {
  const [garden, setGarden] = useState<Garden | null>(data);
  const [narrow, setNarrow] = useState(false);
  /** Where the garden rests: how grown, and which year (an index into garden.steps). */
  const [grown, setGrown] = useState(0);
  const [position, setPosition] = useState<number | null>(null);
  /** The year the words show while the garden moves; the drawing is painted, not rendered. */
  const [passing, setPassing] = useState<number | null>(null);
  /** The year whose monsoon is falling, while it falls. */
  const [raining, setRaining] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [lit, setLit] = useState<{ i: number; row: number; x: number; y: number } | null>(null);
  const figure = useRef<HTMLDivElement>(null), tapped = useRef<number | null>(null);
  const painters = useRef(new Map<number, Painter>());
  const moving = useRef<number | null>(null);
  /** Set when the presenter asks for the latest year: a paused playback settles there, not part way. */
  const settleLast = useRef(false);
  const router = useRouter();
  /** A plant picked: its district lights up, then the field zooms into its borewells below. */
  const [marked, setMarked] = useState<string | null>(null);
  const [focus, setFocus] = useState<BoresFocus | null>(null);

  useEffect(() => {
    if (data) { setGarden(data); return; }
    let live = true;
    fetch(`${BASE}/garden/data.json`).then(r => (r.ok ? r.json() : null)).then(json => { if (live && json) setGarden(json as Garden); }).catch(() => undefined);
    return () => { live = false; };
  }, [data]);

  useEffect(() => {
    const node = figure.current;
    if (!node) return;
    const fit = () => setNarrow(node.getBoundingClientRect().width < 640);
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const last = garden ? garden.steps.length - 1 : 0;
  const resting = position ?? last;
  const layout = narrow ? NARROW : WIDE;
  const rows = useMemo(() => (garden ? gardenRows(garden, narrow ? "regions" : "one", layout.spacing) : []), [garden, narrow, layout.spacing]);
  /** How far along its row each plant stands, 0 to 1: the garden grows in from the left. */
  const along = useMemo(() => {
    const at = new Map<number, number>();
    rows.forEach(row => row.plants.forEach((p, k) => at.set(p.i, k / Math.max(row.plants.length - 1, 1))));
    return at;
  }, [rows]);

  /** The garden at a moment: `t` seconds into growing in, at a point in the years. */
  const lookFor = useCallback((t: number, at: number) => (i: number) => {
    const u = along.get(i) ?? 0;
    return lookAt(garden!, i, at, {
      grow: Math.max(0, Math.min(1, (t - 1.1 * u) / 1.5)),
      roots: Math.max(0, Math.min(1, (t - 0.6 - 1.1 * u) / 1.4)),
      heads: Math.max(0, Math.min(1, (t - 2.6) / 0.8)),
    });
  }, [garden, along]);
  const look = useMemo(() => (garden ? lookFor(grown, resting) : () => { throw new Error("no garden"); }), [garden, lookFor, grown, resting]);
  const paintAll = useCallback((t: number, at: number, rain: RainMoment | null = null) => {
    const moment = lookFor(t, at);
    painters.current.forEach(paint => paint(moment, Math.min(1, t / 0.8), rain));
  }, [lookFor]);
  const register = useCallback((row: number, paint: Painter | null) => {
    if (paint) painters.current.set(row, paint); else painters.current.delete(row);
  }, []);

  // Grow in once the garden is on screen; at once for a reader who asks for less motion.
  useEffect(() => {
    const node = figure.current;
    if (!garden || !node || grown >= GROW_S) return;
    if (reducedMotion()) { setGrown(GROW_S); return; }
    let request = 0, start = 0;
    const tick = (now: number) => {
      start ||= now;
      const t = Math.min(GROW_S, (now - start) / 1000);
      paintAll(t, position ?? last);
      if (t < GROW_S) request = requestAnimationFrame(tick); else setGrown(GROW_S);
    };
    const watcher = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { watcher.disconnect(); request = requestAnimationFrame(tick); }
    }, { threshold: 0.15 });
    watcher.observe(node);
    return () => { watcher.disconnect(); cancelAnimationFrame(request); };
    // The rows are repainted from scratch on a layout change; growing in runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [garden, paintAll]);

  // Play every year from the first (or on from the one shown): the monsoon falls, then the water
  // and the crops move to the October after it, a rest, and on; stop on the latest.
  useEffect(() => {
    if (!playing || !garden) return;
    settleLast.current = false;
    const reduced = reducedMotion();
    const from = resting < last ? Math.round(resting) : 0;
    let request = 0, began = 0, shownYear = -1, shownRain = -1;
    const show = (at: number, rain: { index: number; p: number } | null = null) => {
      moving.current = at;
      const season = rain ? garden.rain[garden.steps[rain.index].index] : null;
      paintAll(GROW_S, at, season && !reduced ? { p: rain!.p, amount: season.mm / garden.rainNormalMm } : null);
      const year = Math.round(at);
      if (year !== shownYear) { shownYear = year; setPassing(year); }
      const falling = rain ? rain.index : -1;
      if (falling !== shownRain) { shownRain = falling; setRaining(rain ? rain.index : null); }
    };
    if (from !== resting) show(from);
    const tick = (now: number) => {
      began ||= now;
      const t = (now - began) / 1000 - (from !== resting ? REST_S : 0), per = RAIN_S + MOVE_S + REST_S;
      if (t < 0) { request = requestAnimationFrame(tick); return; }
      const k = Math.floor(t / per), target = from + k + 1, inStep = t - k * per;
      if (target > last) { moving.current = null; setPassing(null); setRaining(null); setPosition(last); setPlaying(false); return; }
      if (inStep < RAIN_S) show(target - 1, { index: target, p: inStep / RAIN_S });
      else {
        const p = Math.min(1, (inStep - RAIN_S) / MOVE_S);
        show(target - 1 + (reduced ? (p >= 1 ? 1 : 0) : easeStep(p)));
      }
      request = requestAnimationFrame(tick);
    };
    request = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(request);
      // Paused part way: settle on the year being shown.
      setRaining(null);
      if (moving.current !== null) {
        const year = settleLast.current ? last : Math.round(moving.current);
        paintAll(GROW_S, year); setPosition(settleLast.current ? null : year); moving.current = null; setPassing(null);
      }
      settleLast.current = false;
    };
    // Starts only when play is pressed; the year it starts from is read then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, garden, last, paintAll]);

  // The presenter's steps: play once grown; rest on the latest year, repainted there.
  useEffect(() => {
    if (!garden || !stage || grown < GROW_S) return;
    if (stage === "play") { setPosition(null); setPlaying(true); }
    else if (stage === "rest") {
      settleLast.current = true;
      setPlaying(false); setPosition(null); paintAll(GROW_S, last);
    }
  }, [stage, garden, grown, last, paintAll]);

  const shownIndex = passing ?? Math.round(resting);
  const step = garden ? garden.steps[shownIndex] : null;
  const counts = garden && step ? stepCounts(garden, step) : null;
  /** The monsoon the words name: the one falling, or the one before the October shown. */
  const rainStep = garden ? garden.steps[raining ?? shownIndex] : null;
  const season = garden && rainStep ? garden.rain[rainStep.index] : null, monsoon = rainLine(season);

  const point = useCallback((event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>, rowIndex: number) => {
    const rect = event.currentTarget.getBoundingClientRect(), box = figure.current?.getBoundingClientRect();
    if (!garden || !box || !rect.width || !rows[rowIndex]) return null;
    const x = ((event.clientX - rect.left) / rect.width) * rows[rowIndex].width;
    const plants = rows[rowIndex].plants;
    let lo = 0, hi = plants.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (plants[mid].x < x) lo = mid + 1; else hi = mid; }
    const near = lo > 0 && Math.abs(plants[lo - 1].x - x) < Math.abs(plants[lo].x - x) ? plants[lo - 1] : plants[lo];
    if (Math.abs(near.x - x) > 6) { setLit(null); return null; }
    setLit(was => (was && was.i === near.i && Math.abs(was.x - (event.clientX - box.left)) < 1 ? was : { i: near.i, row: rowIndex, x: event.clientX - box.left, y: event.clientY - box.top }));
    return near.i;
  }, [garden, rows]);
  // A click opens the mandal's page; on a touch screen the first tap shows the plant, a second opens it.
  const open = useCallback((event: ReactMouseEvent<HTMLCanvasElement>, rowIndex: number) => {
    const i = point(event, rowIndex);
    if (i === null || !garden) return;
    const touch = (event.nativeEvent as PointerEvent).pointerType === "touch";
    if (!touch || tapped.current === i) zoomTo(i);
    tapped.current = i;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point, garden]);

  /** From the State to a district: light the district's plants, then let the field glide down into
      its close-up (one view transition), its borewells in the year shown and this mandal's marked.
      Bare (in the presenter) there is no close-up: the plant opens its mandal. */
  const zoomTo = (i: number) => {
    if (!garden) return;
    const [id, , district] = garden.plants[i];
    if (bare) { router.push(`/mandals/${id}/`); return; }
    setLit(null); setMarked(district);
    window.setTimeout(() => {
      const field = figure.current, closeUp = () => document.querySelector<HTMLElement>('[data-testid="district-bores"] [data-zoom]');
      if (field) field.style.viewTransitionName = "district-zoom";
      void transition(() => {
        flushSync(() => setFocus(was => ({ district, id, n: (was?.n ?? 0) + 1 })));
        if (field) field.style.viewTransitionName = "";
        const strip = closeUp();
        if (strip) { strip.style.viewTransitionName = "district-zoom"; strip.closest("section")?.scrollIntoView({ block: "center" }); }
      }).then(() => { const strip = closeUp(); if (strip) strip.style.viewTransitionName = ""; setMarked(null); });
    }, reducedMotion() ? 0 : 520);
  };
  const markedMembers = useMemo(() => new Set(garden && marked ? garden.plants.flatMap((p, k) => (p[2] === marked ? [k] : [])) : []), [garden, marked]);

  const plant = garden && lit ? garden.plants[lit.i] : null;
  const now = plant && step ? plant[4][step.index] : null, usual = plant ? plant[5] : null;
  const moved = now !== null && usual !== null ? Math.round((now - usual) * 100) : null;

  return (
    <div className={styles.garden} data-bare={bare ? "" : undefined} data-zooming={marked ? "" : undefined} data-testid="water-garden" data-ready={garden && grown >= GROW_S ? "done" : "growing"} data-year={step?.year ?? ""}>
      <div ref={figure} className={styles.figure} data-mode={narrow ? "regions" : "one"} onPointerLeave={() => setLit(null)}>
        {garden && step ? (
          <div className={styles.when} data-raining={raining !== null ? "" : undefined}>
            <b data-testid="garden-year">{raining !== null && monsoon ? monsoon.title : monthYear(garden, step.year)}</b>
            <span>{raining !== null ? "the rain before the October" : <>against each mandal&rsquo;s usual {garden.monthName}</>}</span>
            {monsoon && season ? (
              <span className={styles.monsoon} data-testid="garden-monsoon">
                <i className={styles.gauge} aria-hidden="true"><i style={{ width: `${Math.round(Math.min(1, season.mm / garden.rainNormalMm / 1.5) * 100)}%` }} /><s /></i>
                {raining !== null ? `${monsoon.amount}${monsoon.enso}` : monsoon.text}
              </span>
            ) : null}
          </div>
        ) : null}
        {garden ? rows.map((row, r) => (
          <div key={`${narrow ? "n" : "w"}${r}`} className={styles.row}>
            {narrow && row.region !== null ? <span className={styles.rowLabel}>{garden.regions[row.region]}</span> : null}
            <div className={styles.plot}>
              <GardenRow garden={garden} row={row} rowIndex={r} geometry={layout.geometry} look={look} waterIn={Math.min(1, grown / 0.8)}
                ticks tickFont={narrow ? 13 : 10.5} className={styles.svg} register={register} onPointerMove={point} onClick={open}
                label={`${row.region !== null ? `${garden.regions[row.region]}: ` : ""}${row.plants.length} mandals as sorghum plants: roots reach each one's water table; the head full where it stands above its usual ${garden.monthName}, drooping where it stands below.`} />
              {marked ? <GardenDistrictMark row={row} geometry={layout.geometry} members={markedMembers} name={marked} className={styles.districtMark} /> : null}
              {lit && lit.row === r && playing === false ? <GardenMark garden={garden} row={row} geometry={layout.geometry} look={look} i={lit.i} /> : null}
            </div>
            {!narrow ? (
              <div className={styles.regions} aria-hidden="true">
                {row.spans.map(span => <span key={span.region} style={{ left: `${(span.from / row.width) * 100}%`, width: `${((span.to - span.from) / row.width) * 100}%` }}>{garden.regions[span.region]}</span>)}
              </div>
            ) : null}
          </div>
        )) : <div className={styles.waiting} />}
        {plant && lit && step ? (
          <div className={styles.tip} style={{ left: lit.x, top: lit.y }} data-testid="garden-tip" data-flip={lit.x > (figure.current?.clientWidth ?? 0) * 0.6 ? "left" : undefined}>
            <b>{plant[1]}</b><small>{plant[2]}</small>
            {now !== null ? <span>{now.toFixed(1)} m below ground, {monthYear(garden!, step.year)}</span> : <span>Not read in {monthYear(garden!, step.year)}</span>}
            {moved !== null && usual !== null ? <em data-tone={moved > 10 ? "deeper" : moved < -10 ? "shallower" : undefined}>
              {Math.abs(moved) <= 10 ? `Within 0.1 m of its usual ${garden!.monthName}, ${usual.toFixed(1)} m` : `${(Math.abs(moved) / 100).toFixed(1)} m ${moved > 0 ? "deeper" : "shallower"} than its usual ${garden!.monthName}, ${usual.toFixed(1)} m`}
            </em> : plant[5] === null ? <em>Too few {garden!.monthName}s read to know its usual</em> : null}
            {bare ? null : <small className={styles.tipHint}>Click for {plant[2]}&rsquo;s borewells</small>}
          </div>
        ) : null}
      </div>

      {garden && counts && step ? (
        <div className={styles.controls}>
          {bare ? null : <><button type="button" className={styles.play} onClick={() => setPlaying(p => !p)} data-testid="garden-play" aria-pressed={playing}>
            {playing ? <IconPause /> : <IconPlay />}<span>{playing ? "Pause" : `Play every ${garden.monthName} since ${garden.steps[0].year}`}</span>
          </button>
          <input type="range" className={styles.years} min={0} max={last} step={1} value={shownIndex} aria-label={`${garden.monthName} of which year`}
            aria-valuetext={monthYear(garden, step.year)} onChange={e => { setPlaying(false); setPosition(Number(e.target.value)); }} data-testid="garden-years" /></>}
          <p className={styles.counts} data-testid="garden-counts" data-deeper={counts.deeper} data-shallower={counts.shallower} data-steady={counts.steady}>
            <span data-tone="deeper"><b>{counts.deeper}</b> deeper than usual</span>
            <span data-tone="shallower"><b>{counts.shallower}</b> shallower</span>
            <span><b>{counts.steady}</b> within 0.1 m</span>
            {counts.noReading ? <span><b>{counts.noReading}</b> not read</span> : null}
          </p>
        </div>
      ) : null}
      {bare ? null : <p className={styles.key}>
        <span><i data-kind="open" />Full, golden head: water above its usual {garden?.monthName ?? "level"}</span>
        <span><i data-kind="bud" />Green head: within 0.1 m of usual</span>
        <span><i data-kind="droop" />Drooping, browned: deeper than usual</span>
        <span>Roots reach the water table, to scale: as deep as a borewell must go. Plants stand taller where it is near.</span>
        <span>Paddy where most of a mandal&rsquo;s farmland is irrigated, sorghum elsewhere.</span>
      </p>}
      {garden && step && !bare ? <DistrictBores garden={garden} stepIndex={shownIndex} focus={focus} /> : null}
      {plant ? <p className={styles.srOnly}><Link href={`/mandals/${plant[0]}/`}>Open {plant[1]}</Link></p> : null}
    </div>
  );
}
