import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { IconActivity, IconCalendar, IconDroplet, IconMap } from "../../components/icons";
import { RankList } from "../../components/RankList";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { ForecastStrip } from "../../components/readings/ForecastStrip";
import { brief } from "../../lib/pageBriefs";
import { mandalByMapKey, mapGeometry } from "../../lib/data";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import { MIN_TO_JUDGE, MOVE_BINS, moveKey, nextMonth, readingsDay, type Mover } from "../../lib/readingsDay";

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

/** Likely misread: grey, and ringed on the map. No reading in both months: the map's own held tone. */
const MISREAD = "#9aa3ab";
const NONE = "#eef1f4";

/** Each outline's mandal, so the map can colour it by the mandal's move. */
function moveMap(all: Mover[], previous: string, latest: string) {
  const byId = new Map(all.map(c => [c.id, c]));
  const keys: string[] = [], notes: string[] = [], marks: number[] = [];
  mapGeometry.mandals.forEach((feature, index) => {
    const c = byId.get(mandalByMapKey(feature.d, feature.m)?.id ?? "");
    if (!c) { keys.push("n"); notes.push(`No reading in both ${name(previous)} and ${name(latest)}.`); return; }
    if (c.doubted) { keys.push("x"); marks.push(index); notes.push(`Moved ${m(c.changeM)} ${way(c.changeM)}: likely a misread month, left out of every count.`); return; }
    keys.push(moveKey(c.changeM));
    notes.push(`${mv(c.changeM)} ${way(c.changeM)} than in ${name(previous)}; now ${c.nowM.toFixed(1)} m below ground.`);
  });
  return { keys, notes, marks };
}

/* Readings day: the newest month in, and the tests that were waiting for it (lib/readingsDay.ts).
   Rebuilt from the Monday refresh, so a new month turns the page by itself. */
export default function ReadingsPage() {
  const r = readingsDay(), c = r.change, f = r.forecast, s = r.sensors, b = f.block, nx = f.next;
  const test = s.test, sy = test?.sensorYear ?? null;
  const map = moveMap(c.all, r.previous, r.month);
  const scale = Math.max(0.1, ...[...c.deeper5, ...c.shallower5].map(row => Math.abs(row.changeM)));
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

      <section className={shared.block} aria-labelledby="moved-title" data-testid="readings-moved">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconMap /> What moved since {name(r.previous)}</span>
          <h2 id="moved-title">Since {name(r.previous)} the water table rose in {c.shallower} mandals and fell in {c.deeper}</h2>
          <p>{c.steady} more held within 0.1 m. Each mandal&rsquo;s {name(r.month)} reading against its {name(r.previous)} reading, the median of its wells in both months, for the {c.compared} read in both.{c.doubted.length ? <> Ringed: {c.doubted.length} {c.doubted.length === 1 ? "move" : "moves"} too large to trust, left out of every count.</> : null}</p>
        </header>
        <div className={shared.soilGrid}>
          <StateOutlineMap testId="readings-map" aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height}
            keys={map.keys} notes={map.notes} marks={map.marks}
            colors={{ ...Object.fromEntries(MOVE_BINS.map(b => [b.key, b.color])), x: MISREAD, n: NONE }}
            label={`Water table since ${name(r.previous)}, by mandal: rose more than 0.1 m in ${c.shallower}, fell more than 0.1 m in ${c.deeper}, held within 0.1 m in ${c.steady}.`}
            legend={<>
              {[...MOVE_BINS].reverse().map(b => <span key={b.key} data-key={b.key}><i style={{ background: b.color }} />{b.label} · {c.bins[b.key]}</span>)}
              {c.doubted.length ? <span><i style={{ background: MISREAD, outline: "1.5px solid var(--ink)" }} />Likely misread · {c.doubted.length}</span> : null}
            </>} />
          <div className={shared.soilSide}>
            <RankList title="Rose furthest" rows={c.shallower5.map(row => ({ name: row.name, href: `/mandals/${row.id}/`, note: row.district, value: mv(row.changeM), share: (100 * Math.abs(row.changeM)) / scale, color: MOVE_BINS[4].color }))} />
            <RankList title="Fell furthest" rows={c.deeper5.map(row => ({ name: row.name, href: `/mandals/${row.id}/`, note: row.district, value: mv(row.changeM), share: (100 * Math.abs(row.changeM)) / scale, color: MOVE_BINS[0].color }))} />
            {c.doubted.length ? (
              <p className={styles.doubt} data-testid="readings-doubted">
                <b>Ringed on the map, likely misreadings worth checking with the department:</b>{" "}
                {c.doubted.map((d, i) => <span key={d.id}>{i ? ", " : ""}<Link href={`/mandals/${d.id}/`}>{d.name}</Link> ({d.changeM > 0 ? "+" : "−"}{m(d.changeM)})</span>)}.
                {" "}Each moved more than twice its largest move between {name(r.previous)} and {name(r.month)} on record, or more than 20 m.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className={shared.block} aria-labelledby="forecast-title" data-testid="readings-forecast" data-judged={f.judged ? "" : undefined}>
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconActivity /> Did the forecasts hold?</span>
          <h2 id="forecast-title">{f.judged && b
            ? <>The {b.forecasts} forecasts for {name(r.month)} missed by {m(b.maeM)}, {pct(b.gainPct)} than no change</>
            : nx ? <>The first verdict is {name(nx.target)}: the forecasts expect {mv(nx.expectedChangeM)} {way(nx.expectedChangeM)}, and by {name(nx.latestMonth)} the water had come {mv(nx.soFarChangeM)}</>
              : <>{month(r.month)} had {f.forecasts === 0 ? "no" : f.forecasts} frozen {f.forecasts === 1 ? "forecast" : "forecasts"} to score: too few to judge</>}</h2>
          {f.judged && b
            ? <p>Each was frozen the week it was published, from {month(b.origin)} readings, and scored against {name(r.month)}&rsquo;s. On average a forecast missed by <b>{m(b.maeM)}</b>; carrying the {name(b.origin)} reading forward missed by <b>{m(b.noChangeMaeM)}</b>.</p>
            : nx ? <p data-testid="readings-next-forecast">{nx.forecasts} forecasts frozen on {day(nx.issued)}, from {month(nx.origin)} readings. {name(r.month)} itself had {f.forecasts === 0 ? "none" : f.forecasts} to score, too few to judge: a verdict needs {MIN_TO_JUDGE}.</p> : null}
        </header>
        {f.judged && b && b.path?.length ? (
          <ForecastStrip origin={b.origin} target={r.month} path={b.path} expectedM={b.expectedChangeM} landsBy={nextMonth(r.month)} forecasts={b.forecasts} />
        ) : !f.judged && nx?.path?.length ? (
          <ForecastStrip origin={nx.origin} target={nx.target} path={nx.path} expectedM={nx.expectedChangeM} landsBy={nextMonth(nx.target)} forecasts={nx.forecasts} />
        ) : null}
        <details className="foldMore">
          <summary><span>How the test works</span><span>frozen before the readings existed</span></summary>
          <div className={styles.prose}>
            {f.judged && b ? (
              <p>
                They expected the median mandal {m(b.expectedChangeM)} {way(b.expectedChangeM)} than in {name(b.origin)}; it moved {m(b.measuredChangeM)} {way(b.measuredChangeM)}.
                {b.biasM < 0 ? ` On average they forecast ${m(b.biasM)} more water than came.` : ` On average they forecast ${m(b.biasM)} less water than came.`}
                {` ${Math.round(b.bandCoveragePct)}% of readings fell inside the forecast's band.`}
              </p>
            ) : (
              <p>
                A verdict needs {MIN_TO_JUDGE} or more forecasts for the month, and the ledger began on {day(f.began)}.
                {nx && Math.abs(nx.yearAgoMinusLatestM) >= 0.5 ? ` Part of each forecast leans on the same month a year earlier, and last year's ${name(nx.target)} water table stood ${m(nx.yearAgoMinusLatestM)} ${way(nx.yearAgoMinusLatestM)} than this ${name(nx.latestMonth)}'s: if this year stays drier, that lean will show as a miss.` : ""}
              </p>
            )}
            <p>The line is the median mandal among the forecasts&rsquo; own mandals, month by month since the month they started from; the dashed line runs to where they said it would be.</p>
            <p className={styles.small}>Frozen forecasts are never changed after publication, and the result is published as it comes; the ledger with every week&rsquo;s fingerprint is on <Link href="/methodology/">the method page</Link>.</p>
          </div>
        </details>
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
