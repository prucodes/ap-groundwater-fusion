"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { monthIn, type Lang } from "../../lib/telugu";
import { monthYear, sideOf, type Garden, type GardenAquifer } from "../../lib/gardenShared";
import { IconPause, IconPlay } from "../icons";
import { Borewells, pumpState, PUMP_BELOW_USUAL_M, type Bore, type PumpState } from "./Borewells";
import { able, navigate, transition } from "../../lib/viewTransition";
import styles from "./WaterGarden.module.css";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
/** Where the field hands over to the close-up: picking a plant zooms into its district here. */
export type BoresFocus = { district: string; id: string; n: number };

/* The close-up under the State's field: one district's mandals as borewells, in two modes.
   The years: the bores in the October the field shows, following its playback.
   The summer countdown: from the latest October to next May on the Summer Outlook's own
   monthly paths (typical or dry winter). Each pump is reset to the mandal's deepest May on
   record; a lamp goes amber when the water comes within 1 m of it, and red in the month
   the outlook says the mandal passes it: so a Collector sees when, not only whether. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Water within this much of the deepest May on record turns a lamp amber in the countdown. */
const NEAR_RECORD_M = 1;
/** Seconds per month while the countdown plays: the move is the bores' own 0.6 s glide. */
const MONTH_S = 1.2;

/** The presenter's control: the years, the countdown played on a typical winter, or the same May on a dry one. */
export type BoresStage = "years" | "summer" | "dry";

export function DistrictBores({ garden, stepIndex, initialDistrict = null, stage, bare = false, focus = null, lang = "en" }: {
  garden: Garden; stepIndex: number;
  /** Open on this district instead of the one with the largest share below its usual. */
  initialDistrict?: string | null;
  /** Driven by the presenter instead of its own buttons. */
  stage?: BoresStage;
  /** Without the buttons and the long key: the presenter says it in its own words. */
  bare?: boolean;
  /** A plant picked in the field: open on its district with its bore marked. */
  focus?: BoresFocus | null;
  /** The words the presenter shows, in English or Telugu. */
  lang?: Lang;
}) {
  const te = lang === "te";
  const router = useRouter();
  const latest = garden.steps[garden.steps.length - 1];
  const districts = useMemo(() => {
    const by = new Map<string, number[]>();
    garden.plants.forEach((p, i) => by.set(p[2], [...(by.get(p[2]) ?? []), i]));
    return [...by].map(([name, members]) => {
      const sides = members.map(i => sideOf(garden.plants[i][4][latest.index], garden.plants[i][5]));
      const compared = sides.filter(s => s !== null).length, deeper = sides.filter(s => s === 1).length;
      return { name, members, share: compared ? deeper / compared : 0 };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [garden, latest.index]);
  const worst = useMemo(() => [...districts].sort((a, b) => b.share - a.share)[0]?.name ?? districts[0]?.name, [districts]);
  const [chosen, setChosen] = useState<string | null>(initialDistrict);
  const [picked, setPicked] = useState<string | null>(null);
  const district = districts.find(d => d.name === (chosen ?? worst)) ?? districts[0];
  const summer = garden.summer;
  const [mode, setMode] = useState<"years" | "summer">(stage && stage !== "years" && summer ? "summer" : "years");
  const [winter, setWinter] = useState<"typical" | "dry">("typical");
  /** The countdown's month: 0 is the latest October, then one a month to May. */
  const [month, setMonth] = useState(0);
  const [playing, setPlaying] = useState(false);
  // A plant picked in the field takes the close-up to its district, in the year the field shows
  // (set while rendering, so the view transition's new picture already has it).
  const [focusSeen, setFocusSeen] = useState(0);
  if (focus && focus.n !== focusSeen) {
    setFocusSeen(focus.n); setChosen(focus.district); setPicked(focus.id); setMode("years"); setPlaying(false);
  }

  // The bores drill in when the close-up comes into view, not while it is off screen.
  const [seen, setSeen] = useState(false), box = useRef<HTMLElement>(null), strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    if (!node || seen) return;
    const watcher = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setSeen(true); watcher.disconnect(); } }, { threshold: 0.25 });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [seen]);
  // On a narrow screen each bore keeps a readable size and the strip scrolls sideways in its panel.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const fit = () => setNarrow(node.getBoundingClientRect().width < 640);
    fit();
    const watcher = new ResizeObserver(fit);
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const months = summer ? [summer.anchor, ...summer.months] : [];
  const last = months.length - 1;
  // Playing the countdown: a month every MONTH_S seconds, the bores gliding between; stop on May.
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setMonth(m => {
      if (m >= last) { setPlaying(false); return m; }
      return m + 1;
    }), MONTH_S * 1000);
    return () => window.clearInterval(timer);
  }, [playing, last]);
  // The presenter's steps. The countdown plays from October once the bores have drilled in;
  // the dry winter keeps the month reached and lets the extra lamps go red.
  const seenAt = useRef(0);
  useEffect(() => {
    if (!stage || !seen) return;
    seenAt.current ||= performance.now();
    if (stage === "years" || !summer) { setPlaying(false); setMode("years"); return; }
    setMode("summer");
    if (stage === "dry") { setWinter("dry"); setPlaying(false); setMonth(last); return; }
    setWinter("typical"); setPlaying(false); setMonth(0);
    const start = window.setTimeout(() => setPlaying(true), Math.max(700, 2600 - (performance.now() - seenAt.current)));
    return () => window.clearTimeout(start);
  }, [stage, seen, summer, last]);

  const plants = useMemo(() => district.members.map(i => ({ plant: garden.plants[i], path: summer?.plants[i] ?? null })), [district, garden, summer]);
  const scaleM = useMemo(() => {
    const all = plants.flatMap(({ plant, path }) => [...plant[4], ...(path ? [path[0], ...path[1], ...path[2]] : [])].filter((v): v is number => v !== null));
    return Math.ceil((Math.max(10, ...all) + 6) / 10) * 10;
  }, [plants]);
  const aquifer = useMemo(() => {
    const kinds = plants.map(({ plant }) => plant[7]).filter((a): a is GardenAquifer => a !== null);
    return kinds.length ? ([0, 1, 2] as GardenAquifer[]).sort((a, b) => kinds.filter(k => k === b).length - kinds.filter(k => k === a).length)[0] : 0 as GardenAquifer;
  }, [plants]);

  const step = garden.steps[stepIndex];
  const deepestOf = (depths: Array<number | null>) => Math.max(...depths.filter((v): v is number => v !== null));
  const bores: Bore[] = plants.map(({ plant, path }) => {
    const usual = plant[5];
    if (mode === "years" || !summer) {
      const now = plant[4][step.index];
      return { id: plant[0], name: plant[1], nowM: now, usualM: usual, side: sideOf(now, usual), deepestM: deepestOf(plant[4]) };
    }
    const anchorM = plant[4][latest.index];
    if (!path || anchorM === null) return { id: plant[0], name: plant[1], nowM: anchorM, usualM: usual, side: null, deepestM: deepestOf(plant[4]), state: "none" as PumpState };
    // The month's depth on the chosen path; a month too few winters cover takes its neighbours' mean.
    const series = [anchorM, ...path[winter === "typical" ? 1 : 2]];
    let now = series[month];
    if (now === null) {
      const before = series.slice(0, month).reverse().find((v): v is number => v !== null), after = series.slice(month + 1).find((v): v is number => v !== null);
      now = before !== undefined && after !== undefined ? (before + after) / 2 : before ?? after ?? anchorM;
    }
    const passes = path[winter === "typical" ? 3 : 4], past = passes !== null && passes <= months[month];
    const state: PumpState = past ? "dry" : now > path[0] - NEAR_RECORD_M ? "trickle" : "full";
    return { id: plant[0], name: plant[1], nowM: now, usualM: usual, side: sideOf(now, usual), deepestM: Math.max(deepestOf(plant[4]), deepestOf(series), path[0]), pumpM: path[0], state };
  });
  const states = bores.map(b => b.state ?? pumpState(b));
  const count = (k: string) => states.filter(s => s === k).length;
  const below = count("trickle") + count("dry");
  const projected = plants.filter(p => p.path).length;
  const when = mode === "summer" && summer ? monthName(months[month]) : monthYear(garden, step.year);
  const whenShown = te ? (mode === "summer" && summer ? `${monthIn("te", Number(months[month].slice(5, 7)))} ${months[month].slice(0, 4)}` : `${monthIn("te", garden.month)} ${step.year}`) : when;
  const width = narrow ? Math.max(360, bores.length * 46 + 70) : 1000;

  // Another district: the strip changes as one view transition, the bores drilling in anew.
  const pick = (name: string) => {
    const node = strip.current;
    if (node) node.style.viewTransitionName = "district-zoom";
    void transition(() => flushSync(() => { setChosen(name); setPicked(null); })).then(() => { if (node) node.style.viewTransitionName = ""; });
  };
  // A bore opens its mandal's page; its name carries over into the page's title.
  // (SVG text cannot carry a view-transition name, so a small label stands in for it while leaving.)
  const open = (bore: Bore, name: Element | null) => {
    if (!bore.id) return;
    let tag: HTMLElement | null = null;
    if (name && able()) {
      const r = name.getBoundingClientRect();
      tag = document.createElement("div");
      tag.textContent = bore.name;
      Object.assign(tag.style, { position: "fixed", left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px`, transform: "translate(-50%, -50%)", font: "650 14px var(--font-display)", color: "#fff", whiteSpace: "nowrap", pointerEvents: "none", zIndex: "50", viewTransitionName: "mandal-name" });
      document.body.appendChild(tag);
    }
    void navigate(() => router.push(`/mandals/${bore.id}/`), () => tag?.remove());
  };

  return (
    <section ref={box} className={styles.bores} data-bare={bare ? "" : undefined} aria-labelledby="bores-title" data-testid="district-bores" data-winter={winter} data-district={district.name} data-mode={mode}
      data-month={mode === "summer" ? months[month] : undefined} data-dry={count("dry")} data-trickle={count("trickle")} data-running={count("full") + count("steady")}>
      <header className={styles.boresHead}>
        <div>
          <span className={styles.boresEyebrow}>{te ? "జిల్లా, దగ్గరగా" : "A district, close up"} · {whenShown}{mode === "summer" && month > 0 ? (te ? " · అంచనా" : " · projected") : ""}</span>
          <h3 id="bores-title">{mode === "summer" && summer
            ? <>{district.name}: {count("dry")} of {projected} borewells past their deepest May on record by {monthName(months[month])}</>
            : <>{district.name}: {below} of {bores.length} borewells below their usual {garden.monthName}</>}</h3>
        </div>
        <div className={styles.boresTools}>
          {summer ? (
            <div className={styles.modes} role="group" aria-label="What the borewells show">
              <button type="button" aria-pressed={mode === "years"} onClick={() => { setPlaying(false); setMode("years"); }}>The years</button>
              <button type="button" aria-pressed={mode === "summer"} onClick={() => { setMode("summer"); setMonth(0); }} data-testid="district-bores-countdown">Summer countdown</button>
            </div>
          ) : null}
          <label className={styles.pick}>
            <span>District</span>
            <select value={district.name} onChange={e => pick(e.target.value)} data-testid="district-bores-pick">
              {districts.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      {mode === "summer" && summer ? (
        <div className={styles.countdown}>
          <button type="button" className={styles.countPlay} onClick={() => { if (!playing && month >= last) setMonth(0); setPlaying(p => !p); }} aria-pressed={playing} data-testid="district-bores-play">
            {playing ? <IconPause /> : <IconPlay />}<span>{playing ? "Pause" : `Play to ${monthName(summer.target)}`}</span>
          </button>
          <input type="range" min={0} max={last} step={1} value={month} onChange={e => { setPlaying(false); setMonth(Number(e.target.value)); }}
            aria-label="Month of the countdown" aria-valuetext={monthName(months[month])} data-testid="district-bores-month" />
          <div className={styles.modes} role="group" aria-label="Which winter">
            <button type="button" aria-pressed={winter === "typical"} onClick={() => setWinter("typical")}>Typical winter</button>
            <button type="button" aria-pressed={winter === "dry"} onClick={() => setWinter("dry")} data-testid="district-bores-dry">Dry winter</button>
          </div>
        </div>
      ) : null}

      <div ref={strip} className={styles.boresFigure} data-scroll={narrow ? "" : undefined} data-zoom="">
        {narrow ? <span className={styles.swipe} aria-hidden="true">{te ? `మొత్తం ${bores.length} చూడటానికి జరపండి →` : `Swipe to see all ${bores.length} →`}</span> : null}
        <div style={narrow ? { width } : undefined}>
          <Borewells key={district.name} uid="db" bores={bores} scaleM={scaleM} aquifer={aquifer} animated play={seen}
            selected={picked ? bores.findIndex(b => b.id === picked) : null}
            hrefOf={bare ? undefined : b => (b.id ? `${BASE}/mandals/${b.id}/` : null)} onOpen={bare ? undefined : open}
            unit={te ? "మీ." : "m"} groundLabel={te ? ["గట్టి శిల", "ఒండ్రు నేల", "తీర ఇసుక నేల"][aquifer] : undefined}
            width={width} soil={narrow ? 260 : 300} nameSize={narrow ? 11 : bores.length > 30 ? 10 : 11.5}
            label={mode === "summer"
              ? `${district.name}'s ${bores.length} mandals as borewells in ${when}, projected on a ${winter} winter: ${count("dry")} past their deepest May on record, ${count("trickle")} within ${NEAR_RECORD_M} m of it.`
              : `${district.name}'s ${bores.length} mandals as borewells in ${when}: ${plural(count("full") + count("steady"), "pump")} running, ${plural(count("trickle"), "trickle")}, ${count("dry")} dry.`} />
        </div>
      </div>

      {mode === "summer" && summer ? (
        <p className={styles.boresKey}>
          <span><i style={{ background: "#5be38a" }} />{te ? `నడుస్తోంది: అత్యంత లోతైన మే కంటే ${NEAR_RECORD_M} మీ. పైగా పైన` : `Running: more than ${NEAR_RECORD_M} m above its deepest May`} ({count("full")})</span>
          <span><i style={{ background: "#f2b442" }} />{te ? `దగ్గరవుతోంది: ${NEAR_RECORD_M} మీ. లోపు` : `Nearing it: within ${NEAR_RECORD_M} m`} ({count("trickle")})</span>
          <span><i style={{ background: "#ff5a3c" }} />{te ? "ఎండిపోయింది: రికార్డులోని అత్యంత లోతైన మే మట్టాన్ని దాటింది" : "Dry: past its deepest May on record"} ({count("dry")})</span>
          <span>
            {`The Summer Outlook’s monthly paths from each mandal’s own past winters, ${winter === "dry" ? "the driest on record" : "the median"}; pumps here are set at the deepest May on record. Tested on past years, the outlook’s May is off by ${summer.errorM?.toFixed(1) ?? "–"} m at the median mandal${summer.persistenceM ? `, against ${summer.persistenceM.toFixed(1)} m for carrying the reading forward` : ""}. A projection, not a forecast of any one well.`}
          </span>
        </p>
      ) : (
        <p className={styles.boresKey}>
          <span><i style={{ background: "#5be38a" }} />{te ? "నడుస్తోంది: సాధారణం కంటే పైన, లేదా 0.1 మీ. లోపు" : "Running: water above its usual, or within 0.1 m"} ({count("full") + count("steady")})</span>
          <span><i style={{ background: "#f2b442" }} />{te ? "సన్నగా: సాధారణం కంటే దిగువ, ఇంకా పంపు పైన" : "A trickle: below its usual, still over the pump"} ({count("trickle")})</span>
          <span><i style={{ background: "#ff5a3c" }} />{te ? "ఎండిపోయింది: నీరు పంపు కంటే దిగువకు పడిపోయింది" : "Dry: the water has fallen past the pump"} ({count("dry")})</span>
          <span>Each bore reaches its mandal&rsquo;s measured water table, to scale; its pump is set {PUMP_BELOW_USUAL_M} m below the usual {garden.monthName} level, as for a normal year. A picture of the readings, not of any one well.</span>
        </p>
      )}
    </section>
  );
}
