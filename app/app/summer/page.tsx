import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { IconArrowRight, IconDroplet, IconMap, IconShield, IconSun } from "../../components/icons";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import { lakhs, SHALLOW_BEYOND, SUMMER_TIERS, summerOutlook, summerRows, type SummerTier } from "../../lib/summer";
import { rabiView } from "../../lib/rabi";
import shared from "../rabi/Rabi.module.css";
import styles from "./Summer.module.css";
import { brief } from "../../lib/pageBriefs";

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

      <section className={`${shared.hero} ${styles.hero}`} aria-label="Summer outlook in figures" data-testid="summer-summary">
        <div className={shared.heroText}>
          <span className={shared.kicker}>Summer {o.targetMay.slice(0, 4)} · from the {month(o.anchor)} readings</span>
          <p>Each mandal against its own record: the depth at which a well fails depends on how deep it was drilled, which no public record gives.</p>
        </div>
        <ul className={shared.tiles}>
          {ORDER.map(tier => <li key={tier}><span>{SUMMER_TIERS[tier].short}</span><b data-tone={tier === "beyond" ? "bad" : undefined}>{s[tier]}<small> mandals</small></b><em>{tier === "beyond"
            ? `typical winter · ${s.beyondDeep} more than ${o.deepM} m down${people ? `, home to ${lakhs(people.beyondDeep)}` : ""}`
            : tier === "dry" ? `only in a winter as dry as their driest · ${s.dryDeep} more than ${o.deepM} m down${people ? `, home to ${lakhs(people.dryDeep)}` : ""}`
              : `either way · of ${s.mandals} mandals on the map`}</em></li>)}
          {bt ? <li><span>Track record</span><b>1 in {Math.round(100 / (bt.pastRecordPct.beyond ?? 100))}</b><em>&ldquo;Beyond&rdquo; calls that set a new record, against 1 in {Math.round(100 / bt.baseRatePct)} overall ({bt.years[0]}–{String(bt.years[bt.years.length - 1]).slice(2)})</em></li> : null}
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="summer-map" data-testid="summer-map-section">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconMap /> Mandal by mandal</span>
          <h2 id="summer-map">Where the record may break</h2>
          <p>Projected from each mandal&rsquo;s {month(o.anchor)} reading and its own past winters: the typical drawdown from {MONTHS[Number(o.anchor.slice(5, 7)) - 1]} to May, and the largest. Grey: too short a record to project, or no reading.</p>
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
