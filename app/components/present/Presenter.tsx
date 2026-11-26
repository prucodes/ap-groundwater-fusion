"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { monthYear, sideOf, stepCounts, type Garden } from "../../lib/gardenShared";
import type { PrioritySign } from "../../lib/summerPriority";
import { DistrictBores, type BoresStage } from "../garden/DistrictBores";
import { WaterGarden, type GardenStage } from "../garden/WaterGarden";
import styles from "./Presenter.module.css";

/* Full screen, eight steps, moved with the arrow keys, Page Up/Down (a clicker), the space bar
   or the buttons. The garden and the borewells stay on screen between the steps that use them,
   so a step changes what they show rather than reloading them. */

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const SIGN_SHORT: Record<PrioritySign, string> = { storms: "Cyclones missed it", monsoon: "Monsoon short", tanks: "Tanks low", quality: "Sources failing tests" };
const SIGNS: PrioritySign[] = ["storms", "monsoon", "tanks", "quality"];

export type PresentFacts = {
  targetMay: string;
  outlook: { beyond: number; dry: number; mandals: number };
  first: { mandals: number; people: string; next: number };
  priority: Array<{ mandal: string; district: string; people: string | null; pastM: number; signs: PrioritySign[] }>;
  pilot: {
    wells: number; mandals: number; rounds: number; roundDays: number; first: string; status: string;
    districts: Array<{ name: string; why: string }>; fingerprint: string; plannedAt: string;
    bars: Array<{ label: string; alone: number; own: number }>;
  };
};

type Layer = "garden" | "bores" | "priority" | "pilot" | "asks";
type Step = { layer: Layer; garden?: GardenStage; bores?: BoresStage; eyebrow: ReactNode; title: ReactNode; text?: ReactNode };

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b), n = v.length;
  return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null;
};

/** What the steps say about the garden: the October, its rank, the years that show the memory, and the district closest up. */
function readGarden(garden: Garden) {
  const latest = garden.steps[garden.steps.length - 1];
  const count = stepCounts(garden, latest), compared = count.deeper + count.shallower + count.steady;
  const shareOf = (c: ReturnType<typeof stepCounts>) => c.deeper / Math.max(1, c.deeper + c.shallower + c.steady);
  const share = shareOf(count);
  const worstSince = [...garden.steps.slice(0, -1)].reverse().find(s => shareOf(stepCounts(garden, s)) >= share)?.year ?? null;
  // The pair of years that shows the memory best: a wetter monsoon, yet deeper water after it.
  const years = garden.steps.map(s => ({ year: s.year, rain: garden.rain[s.index], depth: median(garden.plants.map(p => p[4][s.index]).filter((v): v is number => v !== null)) }))
    .filter((y): y is { year: number; rain: NonNullable<typeof y.rain>; depth: number } => y.rain !== null && y.depth !== null);
  let pair: { wet: typeof years[number]; dry: typeof years[number] } | null = null;
  for (const wet of years) for (const dry of years) {
    if (wet.rain.anomalyPct > dry.rain.anomalyPct + 15 && wet.depth - dry.depth > 1 && (!pair || wet.depth - dry.depth > pair.wet.depth - pair.dry.depth)) pair = { wet, dry };
  }
  // The close-up: the district with the most mandals heading past their deepest May on a typical winter.
  const by = new Map<string, number[]>();
  garden.plants.forEach((p, i) => by.set(p[2], [...(by.get(p[2]) ?? []), i]));
  const districts = [...by].map(([name, members]) => {
    const sides = members.map(i => sideOf(garden.plants[i][4][latest.index], garden.plants[i][5]));
    const known = sides.filter(s => s !== null).length, deeper = sides.filter(s => s === 1).length;
    const passing = members.filter(i => (garden.summer?.plants[i]?.[3] ?? null) !== null).length;
    return { name, members, deeper, passing, share: known ? deeper / known : 0 };
  });
  const worst = [...districts].sort((a, b) => b.passing - a.passing || b.share - a.share || a.name.localeCompare(b.name))[0];
  const paths = worst.members.map(i => garden.summer?.plants[i] ?? null);
  return {
    when: monthYear(garden, latest.year), month: garden.monthName, first: garden.steps[0].year,
    deeper: count.deeper, compared, worstSince, pair,
    district: worst.name, size: worst.members.length, districtDeeper: worst.deeper,
    projected: paths.filter(Boolean).length,
    passTypical: paths.filter(p => p && p[3] !== null).length,
    passDry: paths.filter(p => p && p[4] !== null).length,
    errorM: garden.summer?.errorM ?? null,
  };
}

const signed = (pct: number) => `${Math.round(Math.abs(pct))}% ${pct < 0 ? "below" : "above"} normal`;

export function Presenter({ facts }: { facts: PresentFacts }) {
  const [garden, setGarden] = useState<Garden | null>(null);
  const [at, setAt] = useState(0);
  const [boresMounted, setBoresMounted] = useState(false);
  const [full, setFull] = useState(false);
  const deck = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`${BASE}/garden/data.json`).then(r => (r.ok ? r.json() : null)).then(json => { if (live && json) setGarden(json as Garden); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  const g = useMemo(() => (garden ? readGarden(garden) : null), [garden]);
  const may = monthOf(facts.targetMay);

  const steps: Step[] = useMemo(() => [
    {
      layer: "garden", garden: "rest",
      eyebrow: <>Andhra Pradesh · {g?.when ?? "the latest October"} · every mandal a plant</>,
      title: g ? <><b>{g.deeper}</b> of {g.compared} mandals stand deeper than their usual {g.month}{g.worstSince ? <>, the most since {g.worstSince}</> : null}.</> : <>The water table this October</>,
      text: <>Each plant&rsquo;s roots reach its mandal&rsquo;s measured water table, to scale. Golden heads stand above their usual {g?.month ?? "October"}; drooping, browned ones below it.</>,
    },
    {
      layer: "garden", garden: "play",
      eyebrow: <>Every {g?.month ?? "October"} since {g?.first ?? 2015}, each monsoon falling before it</>,
      title: <>One monsoon does not set the water table: it remembers the years before.</>,
      text: g?.pair ? <>In {g.pair.wet.year} the monsoon ran {signed(g.pair.wet.rain.anomalyPct)}, yet the median mandal&rsquo;s water stood {g.pair.wet.depth.toFixed(1)} m down that {g.month}; in {g.pair.dry.year} it ran {signed(g.pair.dry.rain.anomalyPct)} and stood at {g.pair.dry.depth.toFixed(1)} m.</> : null,
    },
    {
      layer: "bores", bores: "years",
      eyebrow: <>Close up · the district with the most mandals heading past their deepest May</>,
      title: g ? <>{g.district}: every mandal a borewell, {g.districtDeeper} of {g.size} below their usual {g.month}.</> : <>A district, close up</>,
      text: <>Each bore reaches its mandal&rsquo;s water table, to scale, with its pump set 2 m below the usual {g?.month ?? "October"}. Amber is a trickle; red, the water has fallen past the pump.</>,
    },
    {
      layer: "bores", bores: "summer",
      eyebrow: <>Summer countdown · {g?.month ?? "October"} to {may} · a typical winter</>,
      title: g ? <>On a typical winter, <b>{g.passTypical}</b> of its {g.projected} borewells pass their deepest May on record by {may}.</> : <>The countdown to May</>,
      text: <>Pumps now stand at each mandal&rsquo;s deepest May on record. The months follow the Summer Outlook: each mandal&rsquo;s own past winters, the median one.</>,
    },
    {
      layer: "bores", bores: "dry",
      eyebrow: <>Summer countdown · {may} · a dry winter</>,
      title: g ? <>On a dry winter, <b>{g.passDry}</b> of them. Statewide, {facts.outlook.beyond} mandals on a typical winter and {facts.outlook.beyond + facts.outlook.dry} on a dry one.</> : <>A dry winter</>,
      text: <>The driest winter on record for each mandal, from the same readings.{g?.errorM ? ` Tested on past years, the outlook’s May is off by ${g.errorM.toFixed(1)} m at the median mandal.` : ""} A projection, not a forecast of any one well.</>,
    },
    {
      layer: "priority",
      eyebrow: <>Summer drinking water · where to plan first</>,
      title: <><b>{facts.first.mandals}</b> mandals to plan first, home to {facts.first.people} people: past their record, and independent signs agree.</>,
      text: <>Ordered by how many of four signs from this season agree: the cyclones missed it, the monsoon recharge fell short, village tanks hold less than usual, drinking-water sources fail chemical tests. {facts.first.next} more to plan next.</>,
    },
    {
      layer: "pilot",
      eyebrow: <>Field check with the Groundwater Department · {facts.pilot.status}</>,
      title: <>From {day(facts.pilot.first)}: {facts.pilot.wells} wells read every {facts.pilot.roundDays === 14 ? "fortnight" : `${facts.pilot.roundDays} days`}, the predictions written down first.</>,
      text: <>{facts.pilot.mandals} mandals in {facts.pilot.districts.map(d => d.name).join(" and ")}, {facts.pilot.rounds} rounds. The errors below are what the model expects at a well; each round is scored against them, in public.</>,
    },
    {
      layer: "asks",
      eyebrow: <>What would move this forward</>,
      title: <>Three asks, the smallest first.</>,
    },
  ], [g, facts, may]);

  const last = steps.length - 1;
  const step = steps[at];
  const go = useCallback((to: number) => setAt(Math.max(0, Math.min(last, to))), [last]);
  useEffect(() => { if (step.layer === "bores") setBoresMounted(true); }, [step.layer]);

  // The step lives in the address (#3), so a reload or a shared link opens on it.
  useEffect(() => {
    const read = () => { const n = Number(location.hash.slice(1)); if (n >= 1 && n <= steps.length) setAt(n - 1); };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [steps.length]);
  useEffect(() => { history.replaceState(null, "", `#${at + 1}`); }, [at]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, select, textarea")) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) { e.preventDefault(); go(at + 1); }
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) { e.preventDefault(); go(at - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(last);
      else if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1);
      else if (e.key === "f" || e.key === "F") toggleFull();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  // A swipe across the words moves a step on a phone or tablet.
  const touch = useRef<{ x: number; y: number } | null>(null);

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void deck.current?.requestFullscreen?.().catch(() => undefined);
  };
  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("fullscreenchange", sync); document.body.style.overflow = before; };
  }, []);

  const layers: Layer[] = ["garden", "bores", "priority", "pilot", "asks"];
  const layerAt = layers.indexOf(step.layer);
  const place = (layer: Layer) => { const k = layers.indexOf(layer); return k === layerAt ? "on" : k < layerAt ? "past" : "next"; };
  const gardenStage = step.layer === "garden" ? step.garden : "hold";
  const maxBar = Math.max(1, ...facts.pilot.bars.map(b => b.alone));

  return (
    <div ref={deck} className={styles.deck} data-testid="presenter" data-step={at + 1} data-layer={step.layer}>
      <header className={styles.top}>
        <Link href="/garden/" className={styles.brand}>AP Water Intelligence</Link>
        <span className={styles.count} aria-live="polite">{at + 1} / {steps.length}</span>
        <button type="button" className={styles.tool} onClick={toggleFull} aria-pressed={full}>{full ? "Leave full screen" : "Full screen"}</button>
      </header>

      <section key={at} className={styles.words} aria-live="polite"
        onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
        onTouchEnd={e => {
          const from = touch.current; touch.current = null;
          if (!from) return;
          const dx = e.changedTouches[0].clientX - from.x, dy = e.changedTouches[0].clientY - from.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(at + (dx < 0 ? 1 : -1));
        }}>
        <span className={styles.eyebrow} style={{ ["--i" as string]: 0 }}>{step.eyebrow}</span>
        <h1 className={styles.title} style={{ ["--i" as string]: 1 }} data-testid="presenter-title">{step.title}</h1>
        {step.text ? <p className={styles.text} style={{ ["--i" as string]: 2 }}>{step.text}</p> : null}
      </section>

      <div className={styles.stage}>
        <div className={styles.layer} data-place={place("garden")} data-kind="garden" aria-hidden={step.layer !== "garden"}>
          <div className={styles.fit}>{garden ? <WaterGarden data={garden} stage={gardenStage} bare /> : null}</div>
        </div>

        <div className={styles.layer} data-place={place("bores")} data-kind="bores" aria-hidden={step.layer !== "bores"}>
          <div className={styles.fit}>
            {garden && boresMounted ? <DistrictBores garden={garden} stepIndex={garden.steps.length - 1} initialDistrict={g?.district ?? null} stage={step.layer === "bores" ? step.bores : undefined} bare /> : null}
          </div>
        </div>

        <div className={styles.layer} data-place={place("priority")} data-kind="priority" aria-hidden={step.layer !== "priority"}>
          <ol className={styles.priority} data-testid="presenter-priority">
            {facts.priority.map((r, i) => (
              <li key={`${r.district}-${r.mandal}`} style={{ ["--i" as string]: i }}>
                <span className={styles.rank}>{i + 1}</span>
                <span className={styles.who}><b>{r.mandal}</b><small>{r.district}{r.people ? ` · ${r.people} people` : ""}</small></span>
                <span className={styles.past}>{r.pastM.toFixed(1)} m<small>past its deepest May</small></span>
                <span className={styles.signs} aria-label={`${r.signs.length} of 4 signs: ${r.signs.map(s => SIGN_SHORT[s]).join(", ")}`}>
                  {SIGNS.map(s => <i key={s} data-on={r.signs.includes(s) ? "" : undefined} title={SIGN_SHORT[s]} />)}
                </span>
              </li>
            ))}
          </ol>
          <p className={styles.signKey}>{SIGNS.map((s, k) => <span key={s}><i data-n={k} />{SIGN_SHORT[s]}</span>)}</p>
        </div>

        <div className={styles.layer} data-place={place("pilot")} data-kind="pilot" aria-hidden={step.layer !== "pilot"}>
          <div className={styles.pilot}>
            <div className={styles.bars} role="img" aria-label={`Expected error at a well: ${facts.pilot.bars.map(b => `${b.label} ${b.alone.toFixed(1)} m from the mandal figure alone, ${b.own.toFixed(1)} m with the well's own readings`).join("; ")}.`}>
              <p className={styles.barsHead}><span><i data-kind="alone" />From the mandal figure alone</span><span><i data-kind="own" />With the well&rsquo;s own readings</span></p>
              {facts.pilot.bars.map((b, i) => (
                <div key={b.label} className={styles.bar} style={{ ["--i" as string]: i }}>
                  <span className={styles.barLabel}>{b.label}</span>
                  <span className={styles.track}><i data-kind="alone" style={{ ["--w" as string]: b.alone / maxBar }}><em>{b.alone.toFixed(1)} m</em></i></span>
                  <span className={styles.track}><i data-kind="own" style={{ ["--w" as string]: b.own / maxBar }}><em>{b.own.toFixed(1)} m</em></i></span>
                </div>
              ))}
            </div>
            <ul className={styles.places}>
              {facts.pilot.districts.map((d, i) => <li key={d.name} style={{ ["--i" as string]: i + 3 }}><b>{d.name}</b><span>{d.why}</span></li>)}
              <li style={{ ["--i" as string]: 5 }}><b>Written down first</b><span>The plan and every prediction were fingerprinted on {day(facts.pilot.plannedAt)} ({facts.pilot.fingerprint}), before any reading, so the score cannot be tuned afterwards.</span></li>
            </ul>
          </div>
        </div>

        <div className={styles.layer} data-place={place("asks")} data-kind="asks" aria-hidden={step.layer !== "asks"}>
          <ol className={styles.asks}>
            <li style={{ ["--i" as string]: 0 }}><b>Station-level readings for the {facts.pilot.mandals} mandals&rsquo; observation wells</b><span>No field work: the wells are already read. The mandal figures are their average.</span></li>
            <li style={{ ["--i" as string]: 1 }}><b>The Department&rsquo;s view on the mandals and wells chosen</b><span>Where the plan has picked a poor well or missed a better one.</span></li>
            <li style={{ ["--i" as string]: 2 }}><b>Field rounds from {day(facts.pilot.first)}</b><span>Every fortnight as planned, or monthly if that suits better; any round can be the first.</span></li>
          </ol>
          <p className={styles.close}>Every figure in these steps is on the site, with its source: <Link href="/garden/">the garden</Link>, <Link href="/summer/">the summer outlook</Link>, <Link href="/field-check/">the field check</Link>.</p>
        </div>
      </div>

      <footer className={styles.bottom}>
        <button type="button" className={styles.tool} onClick={() => go(at - 1)} disabled={at === 0} aria-label="Previous step" data-testid="presenter-prev">←</button>
        <nav className={styles.dots} aria-label="Steps">
          {steps.map((_, i) => <button key={i} type="button" aria-label={`Step ${i + 1}`} aria-current={i === at ? "step" : undefined} data-done={i < at ? "" : undefined} onClick={() => go(i)} />)}
        </nav>
        <button type="button" className={styles.tool} onClick={() => go(at + 1)} disabled={at === last} aria-label="Next step" data-testid="presenter-next">→</button>
        <span className={styles.hint}>← → or a clicker · F for full screen</span>
      </footer>
    </div>
  );
}
