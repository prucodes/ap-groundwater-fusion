import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { DownloadTextButton } from "../../components/ExportButtons";
import { IconDroplet, IconMap, IconShield, IconClock } from "../../components/icons";
import { brief } from "../../lib/pageBriefs";
import { basePath } from "../../lib/data";
import { districtOutlines, mandalOutlines, STATIC_MAP_VIEW } from "../../lib/staticMap";
import { callOf, day, fieldCheck, place, PROTOCOL, readingSheetCsv, TERRAIN, wellListCsv } from "../../lib/fieldPilot";
import shared from "../rabi/Rabi.module.css";
import styles from "./FieldCheck.module.css";

export const metadata: Metadata = {
  title: "Field check pilot | AP Water Intelligence",
  description: "A pilot with the Groundwater Department: 100 wells in two districts read every fortnight, scored in public against what the site said before the first reading.",
};

const SHEET_PDF = "ap-field-check-protocol.pdf";
const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

export default function FieldCheckPage() {
  const f = fieldCheck, p = f.predictions, r = f.results;
  const wells = f.mandals.reduce((n, m) => n + m.observationWells + m.privateWellsToAdd, 0);
  const observed = f.mandals.reduce((n, m) => n + m.observationWells, 0);
  const chosen = new Map(f.mandals.map(m => [m.index, m]));
  const outlines = mandalOutlines();
  const fill = (i: number) => {
    const m = chosen.get(i);
    return !m ? "var(--map-none, #e4e8eb)" : m.band ? "#a33b2c" : m.tier === "dry" ? "#e0a24a" : "#1f8a8a";
  };
  const hard = p.byAquifer.hard_rock, alluvial = p.byAquifer.alluvial;
  const last = f.rounds[f.rounds.length - 1];
  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero
        title="Field check pilot"
        brief={brief("/field-check", <><b>{wells} wells</b> in {f.districts.length} districts, read every fortnight from {day(f.rounds[0])} to {day(last)}, scored in public against what the site wrote down first.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={styles.hero} aria-label="The field check in one view" data-testid="field-check-hero">
        <div>
          <span className={styles.kicker}><IconShield /> {f.status === "proposed" ? "Proposed to the Groundwater Department" : "Readings coming in"} · plan fixed {day(f.plannedAt)}</span>
          <h2>The site&rsquo;s figures are mandal figures. This is the test of how far they hold in the villages.</h2>
          <p>
            {f.mandals.length} mandals, {f.wellsPerMandal} wells each: the {observed}{" "}observation wells already there, with fixed
            measuring points, and private wells the field teams add, three or more of one kind in a village. Every reading is
            set against the mandal figure, against the village&rsquo;s recorded offset, and against the well&rsquo;s own first
            readings. The predictions below were written down before any of it, and are not revised.
          </p>
        </div>
        <ul className={styles.facts}>
          <li><b>{wells}</b><span>wells</span><em>{observed} observation wells, {wells - observed} private</em></li>
          <li><b>{f.rounds.length}</b><span>rounds</span><em>every {f.roundDays} days, {day(f.rounds[0])} to {day(last)}</em></li>
          <li><b>{f.districts.length}</b><span>terrains</span><em>{f.districts.map(d => place(d.district)).join(" and ")}</em></li>
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="fc-predict" data-testid="field-check-predictions">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconDroplet /> Written down before the first reading</span>
          <h2 id="fc-predict">What the site expects the wells to show</h2>
          <p>From its own tests on {"CGWB's"} past readings, each well scored only on readings after the ones that set its offset. The pilot checks each number on the ground. Fingerprint <code>{f.planSha256.slice(0, 12)}</code>, fixed {day(f.plannedAt)}.</p>
        </header>
        <ol className={styles.claims}>
          <li><span>Dug wells</span><b>{p.dugMandalOnlyM.toFixed(1)} m → {p.dugAfterThreeM.toFixed(1)} m</b><em>the mandal figure alone misses a dug well by {p.dugMandalOnlyM.toFixed(1)} m; after three readings of that well, by {p.dugAfterThreeM.toFixed(1)} m</em></li>
          <li><span>Bore wells</span><b>{p.boreMandalOnlyM.toFixed(1)} m → {p.boreAfterThreeM.toFixed(1)} m</b><em>three readings help a bore well far less: its water comes from deeper and moves with pumping</em></li>
          {hard && alluvial ? <li><span>By terrain</span><b>{hard.mandalOnlyM.toFixed(1)} → {hard.withOffsetM.toFixed(1)} m · {alluvial.mandalOnlyM.toFixed(1)} → {alluvial.withOffsetM.toFixed(1)} m</b><em>hard rock gains most from a well&rsquo;s own readings; the alluvial delta starts closest</em></li> : null}
          {p.mayDropListedM != null && p.mayDropOthersM != null ? <li><span>By May</span><b>{p.mayDropListedM.toFixed(1)} m against {p.mayDropOthersM.toFixed(1)} m</b><em>the fall in the mandals the summer priority list names, against the others, on a typical winter</em></li> : null}
        </ol>
      </section>

      <section className={shared.block} aria-labelledby="fc-where" data-testid="field-check-where">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconMap /> Where</span>
          <h2 id="fc-where">{WORDS[f.mandals.length] ?? f.mandals.length} mandals in {(WORDS[f.districts.length] ?? String(f.districts.length)).toLowerCase()} terrains</h2>
          <p>{f.districts.map(d => <span key={d.district}><b>{place(d.district)}.</b> {d.why} </span>)}</p>
        </header>
        <div className={styles.where}>
          <figure className={styles.mapWrap}>
            <svg viewBox={`0 0 ${STATIC_MAP_VIEW.width} ${STATIC_MAP_VIEW.height}`} role="img" aria-label={`The ${f.mandals.length} pilot mandals on the State map`}>
              <g stroke="var(--card, #fff)" strokeWidth="0.5">{outlines.map((d, i) => <path key={i} d={d} fill={fill(i)} />)}</g>
              <path d={districtOutlines()} fill="none" stroke="var(--card, #fff)" strokeWidth="1.3" />
            </svg>
            <figcaption><span><i style={{ background: "#a33b2c" }} />On the priority list</span><span><i style={{ background: "#e0a24a" }} />Past its record in a dry winter</span><span><i style={{ background: "#1f8a8a" }} />Within its record</span></figcaption>
          </figure>
          <div className={styles.tableWrap}>
            <table className={styles.table} data-testid="field-check-mandals">
              <thead><tr><th>Mandal</th><th>Summer call</th><th className={styles.num}>Wells there</th><th className={styles.num}>To add</th><th>Villages with wells</th></tr></thead>
              <tbody>
                {f.mandals.map(m => (
                  <tr key={m.index}>
                    <td><b>{m.mandal}</b><small>{place(m.district)} · {TERRAIN[m.aquifer] ?? m.aquifer}{m.nowM != null ? ` · ${m.nowM.toFixed(1)} m now` : ""}</small></td>
                    <td>{callOf(m)}</td>
                    <td className={styles.num}>{m.observationWells}</td>
                    <td className={styles.num}>{m.privateWellsToAdd}</td>
                    <td className={styles.villages}>{[...new Set(m.villages.map(v => v.village))].join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className={shared.block} aria-labelledby="fc-how" data-testid="field-check-protocol">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconClock /> How a well is read</span>
          <h2 id="fc-how">The same way, every well, every round</h2>
          <p>Private wells read this way can stand beside observation wells: a fixed point, read at rest, the same well each time. Without those three, a reading measures the pump, not the water table.</p>
        </header>
        <ol className={styles.steps}>
          {PROTOCOL.map(([title, text]) => <li key={title}><b>{title}</b><span>{text}</span></li>)}
        </ol>
        <p className={styles.rounds}><b>Rounds:</b> {f.rounds.map(day).join(" · ")}</p>
        <div className={styles.downloads}>
          <DownloadTextButton filename="ap_field_check_well_list.csv" content={wellListCsv()} label="Well list (CSV)" event={["field-check/well-list", "Field check: downloaded the well list"]} />
          <DownloadTextButton filename="ap_field_check_reading_sheet.csv" content={readingSheetCsv()} label="Reading sheet (CSV)" event={["field-check/reading-sheet", "Field check: downloaded the reading sheet"]} />
          <a className="ghostBtn" href={`${basePath}/field-check/sheet/${SHEET_PDF}`} download="AP-field-check-protocol.pdf" data-testid="field-check-pdf">One-page protocol (PDF)</a>
          <Link className="ghostBtn" href="/field-check/sheet/">Open the one-page protocol</Link>
        </div>
      </section>

      <section className={shared.block} aria-labelledby="fc-results" data-testid="field-check-results">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconShield /> The score</span>
          <h2 id="fc-results">{r?.all ? `${r.readingsFiled.toLocaleString("en-IN")} readings from ${r.wells} wells, to ${day(r.lastRound)}` : "No readings filed yet"}</h2>
          <p>{r?.all
            ? <>Each reading against the mandal&rsquo;s hand-read figure for its month, that figure plus the village&rsquo;s recorded offset, and that plus the well&rsquo;s own offset from its earlier readings.{r.awaitingMandalFigure ? ` ${r.awaitingMandalFigure} wait for their month's mandal figure.` : ""}{r.dryReadings ? ` ${r.dryReadings} wells read dry.` : ""}</>
            : <>The first round is due {day(f.rounds[0])}. Readings filed as CSV are scored the following Monday, here, against the predictions above.</>}</p>
        </header>
        {r?.all ? (
          <table className={styles.table} data-testid="field-check-score">
            <thead><tr><th>Wells</th><th className={styles.num}>Mandal figure alone</th><th className={styles.num}>With the village offset</th><th className={styles.num}>With the well&rsquo;s own readings</th></tr></thead>
            <tbody>
              {[["All", r.all] as const, ...Object.entries(r.by)].map(([name, b]) => b ? (
                <tr key={name}><td><b>{TERRAIN[name] ?? name}</b><small>{b.readings} readings</small></td>
                  {(["mandalOnly", "villageOffset", "ownThree"] as const).map(k => <td key={k} className={styles.num}>{b[k] ? `${b[k]!.maeM.toFixed(1)} m` : "–"}</td>)}</tr>
              ) : null)}
            </tbody>
          </table>
        ) : null}
        <p className={styles.note}>The summer calls are from the <Link href="/summer/">Summer Water Outlook</Link>; the village offsets and the predictions from the village test in the <Link href="/brief/">project brief</Link>. This is a proposal: the department sets the wells and the dates.</p>
      </section>
    </div>
  );
}
