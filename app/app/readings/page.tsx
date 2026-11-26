import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { IconActivity, IconCalendar, IconDroplet } from "../../components/icons";
import { brief } from "../../lib/pageBriefs";
import { MIN_TO_JUDGE, readingsDay, type Mover } from "../../lib/readingsDay";

import shared from "../rabi/Rabi.module.css";
import styles from "./Readings.module.css";

export const metadata: Metadata = {
  title: "Readings Day | AP Water Intelligence",
  description: "The newest month of the State's hand-read wells: what moved since the month before, whether the forecasts frozen for it held, whether the daily sensors could have stood in for the wells, and what the next month will test.",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const name = (ym: string) => month(ym).split(" ")[0];
const m = (v: number) => `${Math.abs(v).toFixed(1)} m`;
/** A month-to-month move: under a metre it keeps centimetres, so 0.16 against 0.13 m is not shown as 0.2 against 0.1. */
const mv = (v: number) => `${Math.abs(v).toFixed(Math.abs(v) < 1 ? 2 : 1)} m`;
/** Positive is deeper (metres below ground grew). */
const way = (change: number, deeper = "deeper", nearer = "nearer the surface") => (change > 0 ? deeper : nearer);
const pct = (gain: number) => `${Math.abs(Math.round(gain))}% ${gain >= 0 ? "better" : "worse"}`;

function Movers({ title, rows }: { title: string; rows: Mover[] }) {
  return (
    <div className={styles.movers}>
      <h3>{title}</h3>
      {rows.length ? (
        <ol>
          {rows.map(r => (
            <li key={r.id}>
              <Link href={`/mandals/${r.id}/`}><b>{r.name}</b><small>{r.district}</small></Link>
              <span data-tone={r.changeM > 0 ? "deeper" : "nearer"}>{r.changeM > 0 ? "+" : "−"}{m(r.changeM)}</span>
              <em>now {r.nowM.toFixed(1)} m</em>
            </li>
          ))}
        </ol>
      ) : <p className={styles.none}>None moved more than 0.1 m this way.</p>}
    </div>
  );
}

/* Readings day: the newest month in, and the tests that were waiting for it (lib/readingsDay.ts).
   Rebuilt from the Monday refresh, so a new month turns the page by itself. */
export default function ReadingsPage() {
  const r = readingsDay(), c = r.change, f = r.forecast, s = r.sensors, b = f.block, nx = f.next;
  const test = s.test, sy = test?.sensorYear ?? null;
  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero title="Readings Day" brief={brief("/readings", <>{month(r.month)} readings, {r.read} of {r.total} mandals.</>)} showChips={false} variant="compact" />

      <section className={shared.hero} aria-label="The newest month in one view" data-testid="readings-hero" data-month={r.month}>
        <div className={shared.heroText}>
          <span className={shared.kicker}>Readings day · {month(r.month)}</span>
          <h2>
            {name(r.month)}&rsquo;s readings are in for {r.read} of {r.total} mandals.
            {c.medianChangeM !== null ? <> Since {name(r.previous)}, the median water table moved <b>{mv(c.medianChangeM)} {way(c.medianChangeM)}</b>{c.usualChangeM !== null ? <>, against a usual {mv(c.usualChangeM)} {way(c.usualChangeM)} between those months</> : null}.</> : null}
          </h2>
          <p>{c.deeper} mandals stand more than 0.1 m deeper than in {name(r.previous)}, {c.shallower} nearer the surface and {c.steady} within 0.1 m, of {c.compared} read in both months.</p>
        </div>
        <ul className={shared.tiles}>
          {r.usual ? <li><span>Below their usual {name(r.month)}</span><b data-tone="bad">{r.usual.deeper}<small> of {r.usual.compared}</small></b><em>{r.usual.worstSince ? `the most since ${r.usual.worstSince}` : `the most of any ${name(r.month)} on record`}</em></li> : null}
          <li data-testid="readings-forecast-tile"><span>Forecasts for {name(r.month)}</span>
            {f.judged && b ? <><b data-tone={b.gainPct < 0 ? "bad" : undefined}>{Math.abs(Math.round(b.gainPct))}<small>% {b.gainPct >= 0 ? "better" : "worse"}</small></b><em>than no change, over {b.forecasts} frozen forecasts</em></>
              : <><b>{f.forecasts}</b><em>{f.forecasts === 1 ? "forecast" : "forecasts"} to score: too few to judge</em></>}
          </li>
          <li><span>Sensors against the wells</span>
            {test?.sameMonth && sy ? <><b data-tone={sy.gainPct < 0 ? "bad" : undefined}>{Math.abs(Math.round(sy.gainPct))}<small>% {sy.gainPct >= 0 ? "better" : "worse"}</small></b><em>than carrying {name(r.previous)} forward</em></>
              : <><b>–</b><em>{test ? "an early look only, which never counts" : "no test this month"}</em></>}
          </li>
          <li><span>Next readings</span><b>{name(r.next.month)}</b><em>usually in by the first week of {name(r.next.landsBy)}</em></li>
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="forecast-title" data-testid="readings-forecast" data-judged={f.judged ? "" : undefined}>
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconActivity /> Did the forecasts hold?</span>
          <h2 id="forecast-title">{f.judged && b
            ? <>The {b.forecasts} forecasts for {name(r.month)} missed by {m(b.maeM)}, {pct(b.gainPct)} than no change</>
            : <>{month(r.month)} had {f.forecasts === 0 ? "no" : f.forecasts} frozen {f.forecasts === 1 ? "forecast" : "forecasts"} to score: too few to judge</>}</h2>
        </header>
        {f.judged && b ? (
          <div className={styles.prose}>
            <p>
              Each was frozen the week it was published{f.issued ? `, from ${day(f.issued)}` : ""}, from {month(b.origin)} readings, and scored now against {name(r.month)}&rsquo;s.
              On average a forecast missed by <b>{m(b.maeM)}</b>; carrying the {name(b.origin)} reading forward missed by <b>{m(b.noChangeMaeM)}</b>.
              They expected the median mandal {m(b.expectedChangeM)} {way(b.expectedChangeM)} than in {name(b.origin)}; it moved {m(b.measuredChangeM)} {way(b.measuredChangeM)}.
              {b.biasM < 0 ? ` On average they forecast ${m(b.biasM)} more water than came.` : ` On average they forecast ${m(b.biasM)} less water than came.`}
              {` ${Math.round(b.bandCoveragePct)}% of readings fell inside the forecast's band.`}
            </p>
            <p className={styles.small}>Frozen forecasts are never changed after publication; the ledger with every week&rsquo;s fingerprint is on <Link href="/methodology/">the method page</Link>.</p>
          </div>
        ) : (
          <div className={styles.prose}>
            <p>A verdict needs {MIN_TO_JUDGE} or more forecasts for the month, and the ledger began on {day(f.began)}.</p>
            {nx ? (
              <p data-testid="readings-next-forecast">
                The first verdict will be <b>{month(nx.target)}</b>: {nx.forecasts} forecasts frozen on {day(nx.issued)}, from {month(nx.origin)} readings.
                They expect the median mandal <b>{m(nx.expectedChangeM)} {way(nx.expectedChangeM)}</b> than in {name(nx.origin)}; by {name(nx.latestMonth)} it had moved {m(nx.soFarChangeM)} {way(nx.soFarChangeM)}.
                {Math.abs(nx.yearAgoMinusLatestM) >= 0.5 ? ` Part of each forecast leans on the same month a year earlier, and last year's ${name(nx.target)} water table stood ${m(nx.yearAgoMinusLatestM)} ${way(nx.yearAgoMinusLatestM)} than this ${name(nx.latestMonth)}'s: if this year stays drier, that lean will show as a miss.` : ""}
              </p>
            ) : null}
            <p className={styles.small}>Whatever the result, it is published as it comes: the forecasts were written down before the readings existed.</p>
          </div>
        )}
      </section>

      <section className={shared.block} aria-labelledby="sensors-title" data-testid="readings-sensors">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconDroplet /> Can the daily sensors stand in for the wells?</span>
          <h2 id="sensors-title">{test?.sameMonth && sy
            ? <>Against {name(r.month)}&rsquo;s hand readings, the sensors did {pct(sy.gainPct)} than carrying {name(r.previous)} forward</>
            : <>No fair test yet: the first same-month test is {month(s.nextTest)}</>}</h2>
        </header>
        <div className={styles.prose}>
          {test?.sameMonth && sy ? (
            <p>In {sy.mandals} mandals, last year&rsquo;s reading moved on by the sensors&rsquo; change over the year missed by <b>{m(sy.maeM)}</b>; carrying {name(r.previous)}&rsquo;s reading forward missed by <b>{m(sy.carryMaeM)}</b>. Verdict so far: <b>{s.verdict === "stands in" ? "the sensors stand in" : "not yet"}</b>.</p>
          ) : test && sy ? (
            <p>{name(r.month)} had only an early look, read from {test.sensorDays} days of sensors taken after the month, which never counts: it missed by <b>{m(sy.maeM)}</b> against <b>{m(sy.carryMaeM)}</b> for carrying {name(r.previous)} forward. Until the sensors win a fair test, no daily level is shown anywhere on the site.</p>
          ) : <p>No sensor estimate was made for {name(r.month)}.</p>}
          <p className={styles.small}>{s.rule}</p>
        </div>
      </section>

      <section className={shared.block} aria-labelledby="moved-title" data-testid="readings-moved">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconDroplet /> What moved since {name(r.previous)}</span>
          <h2 id="moved-title">The largest moves, mandal by mandal</h2>
          <p>Each mandal&rsquo;s {name(r.month)} reading against its {name(r.previous)} reading, the median of its wells in both months.</p>
        </header>
        <div className={styles.moverGrid}>
          <Movers title={`Most deeper than in ${name(r.previous)}`} rows={c.deeper5} />
          <Movers title="Most nearer the surface" rows={c.shallower5} />
        </div>
        {c.doubted.length ? (
          <p className={styles.doubt} data-testid="readings-doubted">
            <b>Left out as likely misreadings, worth checking with the department:</b>{" "}
            {c.doubted.map((d, i) => <span key={d.id}>{i ? ", " : ""}<Link href={`/mandals/${d.id}/`}>{d.name}</Link> ({d.changeM > 0 ? "+" : "−"}{m(d.changeM)})</span>)}.
            {" "}Each moved more than twice its largest move between {name(r.previous)} and {name(r.month)} on record, or more than 20 m.
          </p>
        ) : null}
      </section>

      <section className={shared.block} aria-labelledby="next-title" data-testid="readings-next">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconCalendar /> Next</span>
          <h2 id="next-title">{name(r.next.month)}&rsquo;s readings usually land in the first week of {name(r.next.landsBy)}</h2>
        </header>
        <div className={styles.prose}>
          <p>
            The Monday refresh after they arrive rebuilds this page around {name(r.next.month)}.
            {r.next.forecasts ? ` ${r.next.forecasts} frozen forecasts for ${name(r.next.month)} are scored` : " The forecasts are scored"}{r.next.sensorTest ? ", the sensors get their first same-month test" : ""}, and the Water Garden, the district sheets and the summer outlook move on to the new month.
            The outlook now runs from {month(r.summer.anchor)}: {r.summer.beyond} mandals past their deepest May on record on a typical winter, {r.summer.beyond + r.summer.dry} on a dry one.
          </p>
          <p className={styles.small}>Source: APWRIMS monthly hand-read wells (Ground Water and Water Audit Department), the mandal median; a month counts once most mandals have a reading for it. Prototype from public data: a screening view, not official results.</p>
        </div>
      </section>
    </div>
  );
}
