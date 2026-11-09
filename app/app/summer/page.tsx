import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { IconArrowRight, IconCyclone, IconDroplet, IconFlask, IconMap, IconShield, IconSun, IconWaves } from "../../components/icons";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import { lakhs, SHALLOW_BEYOND, SUMMER_TIERS, summerOutlook, summerRows, type SummerTier } from "../../lib/summer";
import { rabiView } from "../../lib/rabi";
import shared from "../rabi/Rabi.module.css";
import styles from "./Summer.module.css";
import { brief } from "../../lib/pageBriefs";
import drinking from "../../data/drinking_water.json";
import { waterQuality } from "../../lib/waterQuality";
import { mapGeometry, titleCase } from "../../lib/data";
import { BAND_LABEL, priorityCsv, SIGNS, signLabel, summerPriority, type PriorityBand, type PriorityRow, type PrioritySign } from "../../lib/summerPriority";
import { DownloadTextButton } from "../../components/ExportButtons";
import { PriorityMap } from "../../components/PriorityMap";

export const metadata: Metadata = {
  title: "Summer Water Outlook | AP Water Intelligence",
  description: "Where the water table may stand next May, mandal by mandal, against each mandal's own deepest May on record, with how the same projection has fared in past years.",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const m = (value: number) => `${value.toFixed(1)} m`;
const ORDER: SummerTier[] = ["beyond", "dry", "within"];

export default function SummerPage() {
  const o = summerOutlook, s = o.summary, bt = o.backtest, people = o.people;
  const rows = summerRows();
  const target = month(o.targetMay);
  const top = rows.filter((r): r is NonNullable<typeof r> => r !== null && r.tier === "beyond" && r.deep).sort((a, b) => b.margin - a.margin).slice(0, 12);
  // One scale for every row, in metres from its own deepest May: the record line sits at 0 for all of them.
  const lo = Math.min(-2, Math.floor(Math.min(...top.map(r => r.anchor - r.deepestMay)) / 2) * 2);
  const hi = Math.max(4, Math.min(16, Math.ceil(Math.max(...top.map(r => r.dry - r.deepestMay)) / 2) * 2));
  const x = (depth: number, record: number) => `${Math.min(100, Math.max(0, ((depth - record - lo) / (hi - lo)) * 100))}%`;
  const ticks = [...(lo <= -4 ? [lo] : []), 0, Math.round(hi / 2), hi];
  const keyOf = (r: NonNullable<(typeof rows)[number]>) => (r.tier === "beyond" && !r.deep ? SHALLOW_BEYOND.key : SUMMER_TIERS[r.tier].key);
  const rabi = rabiView();
  const elNinoYear = bt?.byYear.find(y => y.may === 2024) ?? null;   // the May after the 2023 El Niño monsoon
  const errorScale = Math.max(1, ...(bt?.byYear ?? []).map(y => Math.abs(y.medianErrorM)));

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero
        title="Summer Water Outlook"
        brief={brief("/summer", people ? <><b>{s.beyondDeep} mandals</b>, home to about <b>{lakhs(people.beyondDeep)} people</b>, are heading past their deepest May on record and more than {o.deepM} m down.</> : <><b>{s.beyondDeep} mandals</b> are heading past their deepest May on record and more than {o.deepM} m down.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={styles.hero} aria-label="Summer outlook in figures" data-testid="summer-summary">
        <div>
          <span className={styles.kicker}>Summer {o.targetMay.slice(0, 4)} · from the {month(o.anchor)} readings</span>
          <p>Each mandal against its own record: the depth at which a well fails depends on how deep it was drilled, which no public record gives.</p>
        </div>
        <ul className={styles.summaryTiles}>
          {ORDER.map(tier => <li key={tier}><span>{SUMMER_TIERS[tier].short}</span><b data-tone={tier === "beyond" ? "bad" : undefined}>{s[tier]}<small> mandals</small></b><em>{tier === "beyond"
            ? `typical winter · ${s.beyondDeep} more than ${o.deepM} m down${people ? `, home to ${lakhs(people.beyondDeep)}` : ""}`
            : tier === "dry" ? `only in a winter as dry as their driest · ${s.dryDeep} more than ${o.deepM} m down${people ? `, home to ${lakhs(people.dryDeep)}` : ""}`
              : `either way · of ${s.mandals} mandals on the map`}</em></li>)}
          {bt ? <li><span>Track record</span><b>1 in {Math.round(100 / (bt.pastRecordPct.beyond ?? 100))}</b><em>&ldquo;Beyond&rdquo; calls that set a new record, against 1 in {Math.round(100 / bt.baseRatePct)} overall ({bt.years[0]}–{String(bt.years[bt.years.length - 1]).slice(2)})</em></li> : null}
        </ul>
      </section>

      <SummerPriority />

      <section className={shared.block} aria-labelledby="summer-map" data-testid="summer-map-section">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconMap /> Mandal by mandal</span>
          <h2 id="summer-map">Where the record may break</h2>
          <p>Projected from each mandal&rsquo;s {month(o.anchor)} reading and its own past winters: the typical drawdown from {MONTHS[Number(o.anchor.slice(5, 7)) - 1]} to May, and the largest. Grey: too short a record to project, or no reading. <Link href="/crystal/?mode=outlook" data-testid="summer-3d-link">See it in 3D →</Link></p>
        </header>
        <div className={shared.soilGrid}>
          <StateOutlineMap testId="summer-map" aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height}
            keys={rows.map(r => (r ? keyOf(r) : "n"))}
            colors={{ ...Object.fromEntries(ORDER.map(t => [SUMMER_TIERS[t].key, SUMMER_TIERS[t].color])), [SHALLOW_BEYOND.key]: SHALLOW_BEYOND.color, n: "#e3e8ec" }}
            notes={rows.map(r => r ? `${SUMMER_TIERS[r.tier].short}: ${m(r.anchor)} in ${month(r.anchorMonth)}, ${m(r.typical)} by May on a typical winter (${m(r.dry)} in a dry one); deepest May on record ${m(r.deepestMay)}.` : "No projection: too short a record, or no reading.")}
            label={`Summer outlook by mandal: ${s.beyond} beyond their record on a typical winter, ${s.dry} in a dry winter, ${s.within} within their record.`}
            legend={<>
              <span><i style={{ background: SUMMER_TIERS.beyond.color }} />Beyond its record, {o.deepM} m or deeper</span>
              <span><i style={{ background: SHALLOW_BEYOND.color }} />{SHALLOW_BEYOND.short}</span>
              <span><i style={{ background: SUMMER_TIERS.dry.color }} />{SUMMER_TIERS.dry.short}</span>
              <span><i style={{ background: SUMMER_TIERS.within.color }} />{SUMMER_TIERS.within.short}</span>
            </>} />
          <div className={shared.soilSide}>
            <div className={shared.districts}>
              <h3>Districts with the most mandals at risk, more than {o.deepM} m down</h3>
              <ol>
                {o.districts.slice(0, 9).map(d => <li key={d.district}>
                  <span><b>{d.district}</b><small>{d.people ? `${lakhs(d.people)} people live in them · ` : ""}{d.beyond} beyond its record, {d.dry} in a dry winter</small></span>
                  <span className={styles.stack} aria-hidden="true">
                    <i style={{ width: `${(100 * d.beyond) / d.mandals}%`, background: SUMMER_TIERS.beyond.color }} />
                    <i style={{ width: `${(100 * d.dry) / d.mandals}%`, background: SUMMER_TIERS.dry.color }} />
                  </span>
                  <span className={shared.districtValue}><b>{d.deep}</b> of {d.mandals}</span>
                </li>)}
              </ol>
            </div>
            {rabi.reservoirs ? <p className={styles.context}>
              <IconDroplet /><span>Surface water for the towns: reservoirs hold <b>{Math.round(rabi.reservoirs.state.storagePct ?? 0)}%</b> of capacity against {Math.round(rabi.reservoirs.state.lastYearPct ?? 0)}% a year ago. <Link href="/rabi/">Basin by basin →</Link></span>
            </p> : null}
          </div>
        </div>
      </section>

      <section className={shared.block} aria-labelledby="summer-top" data-testid="summer-top">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconSun /> Furthest past the record</span>
          <h2 id="summer-top">More than {o.deepM} m down, and furthest past their record</h2>
          <p>Each row on one scale: metres from the mandal&rsquo;s own deepest May, the dark line at zero. The open dot is today&rsquo;s reading; the bar runs from a typical winter to the driest on record. The depth below ground is on the right.</p>
        </header>
        <div className={styles.rangeHead} aria-hidden="true">
          <span>Mandal</span>
          <span className={styles.axis}>{ticks.map(t => <i key={t} style={{ left: `${((t - lo) / (hi - lo)) * 100}%` }}>{t > 0 ? "+" : t < 0 ? "−" : ""}{Math.abs(t)} m</i>)}</span>
          <span>Typical May</span>
        </div>
        <ol className={styles.ranges}>
          {top.map(r => <li key={r.index} data-testid="summer-row">
            <span className={styles.who}><b>{r.mandal}</b><small>{r.district}{r.people ? ` · ${lakhs(r.people)} people` : ""}{r.categoryLabel ? ` · ${r.categoryLabel.toLowerCase()}` : ""}</small></span>
            <span className={styles.track} role="img" aria-label={`${r.mandal}: ${m(r.anchor)} now, ${m(r.typical)} to ${m(r.dry)} by May; deepest May on record ${m(r.deepestMay)}`}>
              <span className={styles.band} style={{ left: x(r.typical, r.deepestMay), width: `calc(${x(r.dry, r.deepestMay)} - ${x(r.typical, r.deepestMay)})` }} data-runs-off={r.dry - r.deepestMay > hi ? "" : undefined} />
              <span className={styles.now} style={{ left: x(r.anchor, r.deepestMay) }} />
              <span className={styles.typical} style={{ left: x(r.typical, r.deepestMay) }} />
              <span className={styles.record} style={{ left: x(r.deepestMay, r.deepestMay) }} />
            </span>
            <span className={styles.value}><b>{m(r.typical)}</b><small>{(r.typical - r.deepestMay).toFixed(1)} m past its record</small></span>
          </li>)}
        </ol>
        <div className={styles.rangeKey} aria-hidden="true">
          <span><i className={styles.keyNow} /> {month(o.anchor)} reading</span>
          <span><i className={styles.keyTypical} /> Typical winter</span>
          <span><i className={styles.keyBand} /> To the driest winter on record</span>
          <span><i className={styles.keyRecord} /> Deepest May on record</span>
        </div>
      </section>

      <DrinkingWater beyondPeople={people?.beyond ?? null} />

      {bt ? <section className={shared.block} aria-labelledby="summer-record" data-testid="summer-record">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconShield /> How it has fared</span>
          <h2 id="summer-record">The same projection, run on every past year</h2>
          <p>
            Each year from {bt.years[0] - 1} was projected from the other years&rsquo; winters alone, from its {bt.anchorMonth} reading, and set against the May that followed ({bt.comparisons.toLocaleString("en-IN")} mandal-years).
            The typical projection was off by a median <b>{m(bt.typicalErrorM)}</b>, against {m(bt.persistenceErrorM)} for assuming no change; {Math.round(bt.withinDryPct)}% of Mays came in no deeper than the dry-winter projection.
          </p>
        </header>
        <div className={styles.recordGrid}>
          <figure className={styles.hits}>
            <figcaption>How often the May set a new record <span>by what the outlook had said, against all mandal-years</span></figcaption>
            {ORDER.map(tier => <div key={tier} className={styles.hit}>
              <span>{SUMMER_TIERS[tier].short}</span>
              <span className={styles.hitTrack}><i style={{ width: `${bt.pastRecordPct[tier] ?? 0}%`, background: SUMMER_TIERS[tier].color }} /><u style={{ left: `${bt.baseRatePct}%` }} /></span>
              <b>{bt.pastRecordPct[tier]?.toFixed(0)}%</b>
            </div>)}
            <p className={styles.hitNote}>Dashed: all mandal-years, {bt.baseRatePct.toFixed(0)}%. {bt.recordsFlaggedPct !== null ? `${Math.round(bt.recordsFlaggedPct)}% of the Mays that did set a new record had been flagged beyond the record or in a dry winter.` : ""}</p>
          </figure>
          <figure className={styles.years}>
            <figcaption>Actual May against the typical projection <span>median by year, metres; right: deeper than projected</span></figcaption>
            {bt.byYear.map(y => <div key={y.may} className={styles.year} data-elnino={y.may === 2024 ? "" : undefined}>
              <span>May {y.may}</span>
              <span className={styles.yearTrack}><i style={{ left: y.medianErrorM < 0 ? `${50 - (Math.abs(y.medianErrorM) / errorScale) * 50}%` : "50%", width: `${(Math.abs(y.medianErrorM) / errorScale) * 50}%` }} data-dir={y.medianErrorM > 0 ? "deeper" : "shallower"} /><b /></span>
              <em>{y.medianErrorM > 0 ? "+" : y.medianErrorM < 0 ? "−" : ""}{Math.abs(y.medianErrorM).toFixed(1)}</em>
            </div>)}
            {elNinoYear ? <p className={styles.hitNote}>May 2024 followed the 2023 El Niño monsoon and came in {elNinoYear.medianErrorM > 0 ? `${elNinoYear.medianErrorM.toFixed(1)} m deeper` : `${Math.abs(elNinoYear.medianErrorM).toFixed(1)} m shallower`} than the typical projection. This is an El Niño year too.</p> : null}
          </figure>
        </div>
      </section> : null}

      <p className={shared.foot}>
        Source: {o.source}, {o.firstYear} to {month(o.anchor)}.{people ? ` People: ${people.source} (CC BY 4.0), a modelled estimate for ${people.year} that counts everyone in the mandal, towns included, not only those on wells.` : ""} A mandal is projected when it has at least four past winters with readings in both months. APWRIMS reports a mandal&rsquo;s average across its piezometers; one village&rsquo;s wells can sit well above or below it. Rain this winter, recharge structures and new pumping all move the answer; the outlook is refreshed as each month&rsquo;s readings arrive. <Link href="/methodology/">Methodology <IconArrowRight /></Link>
      </p>
    </div>
  );
}

/** The ranked list: where to start summer drinking-water plans, with every reason beside each name. */
function SummerPriority() {
  const p = summerPriority, first = p.summary.first, next = p.summary.next, watch = p.summary.watch;
  if (!first.mandals) return null;
  const total = first.mandals + next.mandals + watch.mandals;
  const firstRows = p.mandals.filter(r => r.band === "first");
  const places = p.districts.filter(d => d.first);
  const byIndex = new Map(p.mandals.map(r => [r.index, r]));
  const onMap = mapGeometry.mandals.map((_, i) => byIndex.get(i) ?? null);
  const widest = Math.max(...firstRows.slice(0, SHOWN).map(r => r.pastRecordM), 1);
  return (
    <section className={styles.priority} aria-labelledby="summer-priority" data-testid="summer-priority">
      <div className={styles.pHero}>
        <div className={styles.pHeroText}>
          <span className={styles.pKicker}><IconDroplet /> Summer {p.targetMay.slice(0, 4)} · drinking water first</span>
          <h2 id="summer-priority">
            Start with <b>{first.mandals} mandals</b>: heading past their deepest May on record, and the season&rsquo;s other signs agree.
          </h2>
          <p>Home to about {lakhs(first.people)} people and {count(first.sources)} drinking-water sources. Four sources the outlook does not use each had to agree, at least {p.rules.firstSigns} of them.</p>
        </div>
        <div className={styles.pBands} role="img" aria-label={`${first.mandals} to plan first, ${next.mandals} next, ${watch.mandals} to watch`}>
          <div className={styles.pBar}>
            <i data-band="first" style={{ flexGrow: first.mandals }} />
            <i data-band="next" style={{ flexGrow: next.mandals }} />
            <i data-band="watch" style={{ flexGrow: watch.mandals }} />
          </div>
          <ul className={styles.pBandKey}>
            <li data-band="first"><b>{first.mandals}</b> {BAND_LABEL.first.toLowerCase()}<small>past the record, {p.rules.firstSigns}+ signs · {lakhs(first.people)} people</small></li>
            <li data-band="next"><b>{next.mandals}</b> {BAND_LABEL.next.toLowerCase()}<small>past the record, fewer signs · {lakhs(next.people)} people</small></li>
            <li data-band="watch"><b>{watch.mandals}</b> to watch<small>only in a dry winter, over {p.deepM} m down, {p.rules.watchSigns}+ signs</small></li>
          </ul>
          <span className={styles.pTotal}>{total} mandals in all</span>
        </div>
        <ul className={styles.pSigns} aria-label="The four signs, and how many of the first list carry each">
          {SIGNS.map(sign => (
            <li key={sign} data-sign={sign}>
              <span className={styles.pSignIcon}><SignIcon sign={sign} /></span>
              <b>{signLabel(sign).short}</b>
              <span className={styles.pMeter}><i style={{ width: `${(first.signs[sign] / first.mandals) * 100}%` }} /></span>
              <em><strong>{first.signs[sign]}</strong> of {first.mandals} · {signLabel(sign).long}</em>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${shared.block} ${styles.pBody}`}>
        <div className={styles.pMapRow}>
          <PriorityMap aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height} counts={first.signs}
            bands={onMap.map(r => r?.band ?? null)} signs={onMap.map(r => r?.signs ?? [])}
            notes={onMap.map(r => r
              ? `${BAND_LABEL[r.band]} · ${r.pastRecordM.toFixed(1)} m past its deepest May · ${r.people ? `${lakhs(r.people)} people · ` : ""}${r.signs.length ? r.signs.map(sg => signLabel(sg).short.toLowerCase()).join(", ") : "no other sign yet"}`
              : "Not on the list: within its record, or past it only in a dry winter without three signs.")} />
          <div className={styles.pPlaces}>
            <h3>Where they are</h3>
            <ol>
              {places.slice(0, 8).map(d => (
                <li key={d.district}>
                  <span><b>{d.district}</b><small>{lakhs(d.people)} people in the {d.first} to plan first{d.next ? ` · ${d.next} next` : ""}{d.watch ? ` · ${d.watch} to watch` : ""}</small></span>
                  <span className={styles.pPlaceBar} aria-hidden="true"><i style={{ width: `${(100 * d.first) / places[0].first}%` }} /></span>
                  <strong>{d.first}</strong>
                </li>
              ))}
            </ol>
            {places.length > 8 ? <p>And {places.length - 8} more districts with one or two each.</p> : null}
          </div>
        </div>
        <ol className={styles.pCards} data-testid="priority-first">
          {firstRows.slice(0, SHOWN).map((r, i) => (
            <li key={r.index}>
              <span className={styles.pRank}>{String(i + 1).padStart(2, "0")}</span>
              <div className={styles.pWho}>
                {r.id ? <Link href={`/mandals/${r.id}`}>{r.mandal}</Link> : <span>{r.mandal}</span>}
                <small>{r.district}</small>
              </div>
              <div className={styles.pPast}>
                <b>{r.pastRecordM.toFixed(1)}<small> m</small></b>
                <small>past its deepest May</small>
                <span className={styles.pPastBar}><i style={{ width: `${Math.max(6, (r.pastRecordM / widest) * 100)}%` }} /></span>
              </div>
              <dl className={styles.pFacts}>
                <div><dt>People</dt><dd>{r.people ? lakhs(r.people) : "–"}</dd></div>
                <div><dt>Sources</dt><dd>{r.sources === null ? "–" : count(r.sources)}</dd></div>
                <div><dt>Typical May</dt><dd>{r.typicalM.toFixed(1)} m</dd></div>
              </dl>
              <SignChips row={r} />
            </li>
          ))}
        </ol>
        {firstRows.length > SHOWN ? <details className="foldMore" data-testid="priority-first-rest">
          <summary><span>Show all {firstRows.length} to plan first</span><span>The other {firstRows.length - SHOWN}, in the same order</span></summary>
          <PriorityTable rows={firstRows.slice(SHOWN)} band="first" from={SHOWN} />
        </details> : null}
        <details className="foldMore">
          <summary><span>{BAND_LABEL.next}: {next.mandals} more heading past the record</span><span>Fewer than {p.rules.firstSigns} signs agree so far</span></summary>
          <PriorityTable rows={p.mandals.filter(r => r.band === "next")} band="next" />
        </details>
        {watch.mandals ? <details className="foldMore">
          <summary><span>{BAND_LABEL.watch}: {watch.mandals} that break the record only in a dry winter</span><span>More than {p.deepM} m down, and {p.rules.watchSigns} or more signs agree</span></summary>
          <PriorityTable rows={p.mandals.filter(r => r.band === "watch")} band="watch" />
        </details> : null}
        <div className={styles.priorityFoot}>
          <DownloadTextButton filename={`ap_summer_${p.targetMay.slice(0, 4)}_drinking_water_priority.csv`} content={priorityCsv()}
            label="Download the full list (CSV)" event={["summer/priority-csv", "Summer: downloaded the drinking-water priority list"]} />
          <p className="cardNote">
            An order to start planning in, not a forecast of wells failing: the depth a well fails at depends on how deep it was
            drilled, which no public record gives. Each sign is a second opinion from a source the outlook does not use: State rain
            gauges, the monsoon recharge watch, Sentinel-2 over the tank beds and Jal Jeevan Mission tests. Inside each group, more
            signs first, then more people. Refreshed every Monday with the outlook.
          </p>
        </div>
      </div>
    </section>
  );
}

const SIGN_ICON: Record<PrioritySign, () => ReactElement> = {
  storms: () => <IconCyclone />, monsoon: () => <IconWaves />, tanks: () => <IconDroplet />, quality: () => <IconFlask />,
};
const SIGN_WORD: Record<PrioritySign, string> = { storms: "Storms", monsoon: "Monsoon", tanks: "Tanks", quality: "Tests" };

function SignIcon({ sign }: { sign: PrioritySign }) {
  return SIGN_ICON[sign]();
}

/** All four signs in a fixed order, lit where this mandal carries it, so rows compare at a glance. */
function SignChips({ row }: { row: PriorityRow }) {
  return (
    <ul className={styles.pChips} aria-label={row.signs.length ? `Signs that agree: ${row.signs.map(s => signLabel(s).short).join(", ")}` : "No other sign agrees yet"}>
      {SIGNS.map(sign => (
        <li key={sign} data-sign={sign} data-on={row.signs.includes(sign) ? "" : undefined} title={signLabel(sign).short} aria-hidden="true">
          <SignIcon sign={sign} /><span>{SIGN_WORD[sign]}</span>
        </li>
      ))}
    </ul>
  );
}

const SHOWN = 10;   // the rest of the first list folds: ten names are what a meeting reads

function PriorityTable({ rows, band, from = 0 }: { rows: PriorityRow[]; band: PriorityBand; from?: number }) {
  return (
    <div className="tableWrap">
      <table className={`dataTable compact ${styles.priorityTable}`} data-testid={`priority-${band}${from ? "-rest" : ""}`}>
        <thead><tr><th>#</th><th>Mandal</th><th>People</th><th>Drinking-water sources</th><th>{band === "watch" ? "Dry-winter May" : "Typical May"}</th><th>Signs that agree</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.index}>
              <td>{from + i + 1}</td>
              <td>{r.id ? <Link href={`/mandals/${r.id}`}><b>{r.mandal}</b></Link> : <b>{r.mandal}</b>}<small>{r.district}</small></td>
              <td data-label="People">{r.people ? lakhs(r.people) : "–"}</td>
              <td data-label="Sources">{r.sources === null ? "–" : count(r.sources)}</td>
              <td>{(band === "watch" ? r.dryM : r.typicalM).toFixed(1)} m<small>{r.pastRecordM.toFixed(1)} m past its record</small></td>
              <td><SignChips row={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const pct = (share: number) => `${Math.round(share * 100)}%`;
const count = (n: number) => n.toLocaleString("en-IN");

/** Who drinks from these wells: the State's rural drinking-water sources in the mandals heading past their record. */
function DrinkingWater({ beyondPeople }: { beyondPeople: number | null }) {
  const d = drinking;
  const b = d.byTier.beyond;
  const piped = d.state.pipedSchemes;
  const asOf = d.asOf ? new Date(`${d.asOf}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;
  const rows = [...d.formerDistricts].sort((x, y) => y.beyond.sources - x.beyond.sources);
  return (
    <section className={shared.block} aria-labelledby="summer-drinking" data-testid="summer-drinking">
      <header className={shared.blockHead}>
        <span className={shared.eyebrow}><IconDroplet /> Drinking water</span>
        <h2 id="summer-drinking">Drinking water rests on these wells</h2>
        <p>
          Nineteen in twenty of the State&rsquo;s rural drinking-water schemes draw on groundwater. The {b.mandals} mandals heading
          past their deepest May hold {count(b.sources)} of its drinking-water sources and delivery points: where a summer supply
          plan starts.
        </p>
      </header>
      <div className="overviewHeadlines headlines3 headlinesFlat">
        <div className="headlineCard headlineStatic">
          <span className="headlineKicker">On groundwater</span>
          <strong>{pct(d.state.groundwaterShare)}<small>of rural drinking-water schemes</small></strong>
          <span className="headlineText">{pct(d.state.pipedGroundwaterShare)} of piped schemes too: {count(piped.groundwater)} on groundwater against {count(piped.surface)} on surface water.</span>
        </div>
        <div className="headlineCard headlineStatic">
          <span className="headlineKicker">Heading past the record</span>
          <strong>{count(b.sources)}<small>drinking-water sources</small></strong>
          <span className="headlineText">In the {b.mandals} mandals heading past their deepest May{beyondPeople ? `, home to about ${lakhs(beyondPeople)} people` : ""}.</span>
        </div>
        <div className="headlineCard headlineStatic">
          <span className="headlineKicker">Already above a limit</span>
          <strong>{count(b.chemical)}<small>tested above a chemical limit</small></strong>
          <span className="headlineText">Sources in those mandals that tested above a permissible chemical limit; a supply plan should not lean on them.</span>
        </div>
      </div>
      <p className={styles.unsafe} data-testid="summer-unsafe">
        <b>Where the water itself is unsafe.</b>{" "}{waterQuality.totals.habitations} habitations are marked affected since
        April {waterQuality.since.slice(0, 4)}, {waterQuality.totals.fluoride} for fluoride and {waterQuality.totals.salinity} for
        salinity, home to {waterQuality.totals.households.toLocaleString("en-IN")} households. The fluoride is concentrated
        in {waterQuality.fluorideTopMandals.slice(0, 3).map(t => `${titleCase(t.mandal)} (${t.habitations})`).join(", ")}.{" "}
        <Link href="/map/">See every mandal on the Mandal Map</Link>, under &ldquo;Unsafe drinking water&rdquo;.
      </p>
      <details className="foldMore">
        <summary><span>By district</span><span>Schemes on groundwater, mandals past the record and their sources</span></summary>
        <div className="tableWrap">
          <table className="dataTable compact">
            <thead><tr><th>District (as the mission reports it)</th><th>Schemes on groundwater</th><th>Mandals past the record</th><th>Their sources</th><th>Above a chemical limit</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.groundwaterShare === null ? "–" : pct(row.groundwaterShare)}</td>
                  <td>{row.beyond.mandals}</td>
                  <td>{count(row.beyond.sources)}</td>
                  <td>{count(row.beyond.chemical)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cardNote">
          Jal Jeevan Mission, public IMIS reports{asOf ? `, as on ${asOf}` : ""}: schemes by source (format B26) and tested
          sources by block (format E5). The mission still reports the 13 districts from before 2022, so each mandal is listed
          under that district. Sources include delivery points and stand posts as the mission counts them. All {d.matching.blocks} blocks
          are placed on a mandal outline, {d.matching.exactName} by name and {d.matching.reviewed} through a reviewed list of spellings
          and of names two districts share, placed by location. A test above a chemical limit is a reading of water quality,
          not a forecast. Only counts are read; no habitation or scheme is named.
        </p>
      </details>
    </section>
  );
}
