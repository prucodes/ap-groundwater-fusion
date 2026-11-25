import type { Metadata } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import contextJson from "../../../data/water_context_summary.json";
import sensorsJson from "../../../data/gw_sensors_state.json";
import ensoJson from "../../../data/enso_outlook.json";
import { basePath } from "../../../lib/data";
import { districtOutlines, mandalOutlines, STATIC_MAP_VIEW } from "../../../lib/staticMap";
import { lakhs, summerOutlook } from "../../../lib/summer";
import { BAND_LABEL, summerPriority, type PriorityBand } from "../../../lib/summerPriority";
import { PRIORITY_COLORS } from "../../../lib/priorityLayer";
import styles from "./SummerBrief.module.css";

export const metadata: Metadata = {
  title: "Summer water brief | AP Water Intelligence",
  description: "Summer drinking water on one A4 page: the mandals to plan first, why this summer starts lower, where and when the water table passes its record, and how far to trust it.",
};

/* The summer drinking-water outlook on one sheet, for officials planning the summer:
   the priority list (build_summer_priority.py), the outlook it rests on
   (build_summer_outlook.py), and why this year starts lower (sensors, reservoirs,
   rain, the Pacific). Every figure is read from the published data at build time,
   so the sheet moves with each Monday's refresh; the deploy prints it to
   summer/brief/ap-summer-water-brief.pdf (scripts/print-digest.mjs --route summer/brief). */

const PDF = "ap-summer-water-brief.pdf";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
const monthYear = (ym: string) => `${monthOf(ym)} ${ym.slice(0, 4)}`;
const addMonth = (ym: string, n = 1) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const count = (n: number) => n.toLocaleString("en-IN");
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Context = {
  rain: { start: string; end: string; deviationPct: number; mandals: number; categories: Record<string, number> };
  reservoirs: { asOf: string; storagePct: number; lastYearPct: number; byBasin: Array<{ basin: string; storagePct: number; lastYearPct: number }> };
};
type Sensors = { latestReading: string; state: { active: number; medianM: number; medianYearAgoM: number; deeperThanYearAgo: number; compared: number } };
type Enso = { alert: string; issued: string; probabilities: Array<{ label: string; elNino: number; endsYear: number; endsMonth: number }> };
type Pacific = { byState: Array<{ state: string; months: number; medianDeeperPct: number }> };

/** The twelve-year split of the water table by the Pacific's state, from the time-lapse the map page plays. */
function pacificSplit(): Pacific | null {
  try {
    const raw = JSON.parse(readFileSync(path.resolve(process.cwd(), "public/geo/depth-timelapse.json"), "utf8")) as { pacific?: Pacific };
    return raw.pacific?.byState?.length ? raw.pacific : null;
  } catch { return null; }
}

const BANDS: PriorityBand[] = ["first", "next", "watch"];
/** The tallest clock bar, in millimetres on the sheet. */
const CLOCK_MM = 15;
const KEY: Record<PriorityBand, string> = { first: "f", next: "x", watch: "w" };

export default function SummerBriefPage() {
  const p = summerPriority, o = summerOutlook, bt = o.backtest;
  const ctx = contextJson as unknown as Context;
  const sensorFile = sensorsJson as unknown as Sensors, sensors = sensorFile.state;
  const enso = ensoJson as unknown as Enso;
  const pacific = pacificSplit();
  const first = p.summary.first, next = p.summary.next, watch = p.summary.watch;
  const target = o.targetMay.slice(0, 4);

  // The map: one colour per group, the rest pale.
  const bandAt = new Map(p.mandals.map(r => [r.index, r.band] as [number, PriorityBand]));
  const fills: Record<string, string> = { f: PRIORITY_COLORS.first, x: PRIORITY_COLORS.next, w: PRIORITY_COLORS.watch, n: PRIORITY_COLORS.none };
  const outlines = mandalOutlines();
  const places = p.districts.filter(d => d.first).slice(0, 6);

  // The groundwater clock: how many mandals are past their deepest May, month by month, on a typical winter.
  const months: string[] = [o.anchor];
  while (months[months.length - 1] < o.targetMay) months.push(addMonth(months[months.length - 1]));
  const passes = o.mandals.flatMap(r => (r?.passes?.typical ? [r.passes.typical] : []));
  const byMonth = months.map(ym => passes.filter(at => at <= ym).length);
  const tallest = Math.max(...byMonth, 1);

  const wetDeficit = (ctx.rain.categories.deficient ?? 0) + (ctx.rain.categories.scanty ?? 0) + (ctx.rain.categories.noRain ?? 0);
  const basin = (name: string) => ctx.reservoirs.byBasin.find(b => b.basin === name);
  const krishna = basin("KRISHNA"), pennar = basin("PENNAR");
  const deeperBy = sensors.medianM - sensors.medianYearAgoM;
  // The El Nino chance for the three months that end with the target May.
  const season = enso.probabilities.find(s => s.endsYear === Number(target) && s.endsMonth === 5) ?? enso.probabilities[enso.probabilities.length - 1];
  const elNino = pacific?.byState.find(s => s.state === "El Nino"), laNina = pacific?.byState.find(s => s.state === "La Nina");
  const nextReading = addMonth(o.anchor);

  return (
    <div className="pageWrap">
      <div className={styles.viewer}>
        <div className={styles.toolbar}>
          <p>The summer outlook on one A4 page, rebuilt from each Monday&rsquo;s data. The full list, with every reason, is on <Link href="/summer/#summer-priority">Summer Water Outlook</Link>.</p>
          <a className={styles.download} href={`${basePath}/summer/brief/${PDF}`} download={`AP-summer-water-brief-${target}.pdf`} data-testid="summer-brief-pdf">Download PDF</a>
        </div>

        <section className={styles.page} data-testid="summer-brief">
          <div className={styles.band}>
            <div className={styles.eyebrow}>Andhra Pradesh · Summer {target} drinking water</div>
            <h1>Plan drinking water first in <b>{first.mandals} mandals</b></h1>
            <p className={styles.sub}>
              {`On a typical winter they pass their deepest May on record, and at least ${p.rules.firstSigns} of the season’s other signs agree. Home to about `}
              <b>{lakhs(first.people)} people</b> and <b>{count(first.sources)} drinking-water sources</b>.
            </p>
            <div className={styles.groups} role="img" aria-label={`${first.mandals} to plan first, ${next.mandals} next, ${watch.mandals} to watch`}>
              <div className={styles.bar}>
                {BANDS.map(b => <i key={b} style={{ flexGrow: p.summary[b].mandals, background: PRIORITY_COLORS[b] }} />)}
              </div>
              <ul className={styles.key}>
                <li style={{ ["--c" as string]: PRIORITY_COLORS.first }}><b>{first.mandals}<small>{BAND_LABEL.first.toLowerCase()}</small></b>past the record, {p.rules.firstSigns}+ signs · {lakhs(first.people)} people</li>
                <li style={{ ["--c" as string]: PRIORITY_COLORS.next }}><b>{next.mandals}<small>{BAND_LABEL.next.toLowerCase()}</small></b>past the record, fewer signs · {lakhs(next.people)} people</li>
                <li style={{ ["--c" as string]: PRIORITY_COLORS.watch }}><b>{watch.mandals}<small>to watch</small></b>past it only in a dry winter, over {p.deepM} m down · {lakhs(watch.people)} people</li>
              </ul>
            </div>
          </div>

          <div className={styles.body}>
            <div className={styles.sec}>Why this summer starts lower</div>
            <ul className={styles.tiles} data-testid="summer-brief-why">
              <li><span>Water table</span><b data-tone={deeperBy > 0.5 ? "bad" : undefined}>{deeperBy > 0 ? "+" : "−"}{Math.abs(deeperBy).toFixed(1)}<small>m</small></b><em>deeper than a year ago: the median State sensor is {sensors.medianM.toFixed(1)} m down, and {count(sensors.deeperThanYearAgo)} of {count(sensors.compared)} read deeper ({day(sensorFile.latestReading).replace(/ \d{4}$/, "")})</em></li>
              <li><span>Reservoirs</span><b data-tone={ctx.reservoirs.storagePct < ctx.reservoirs.lastYearPct - 10 ? "bad" : undefined}>{Math.round(ctx.reservoirs.storagePct)}<small>% full</small></b><em>against {Math.round(ctx.reservoirs.lastYearPct)}% a year ago{krishna && pennar ? `; Krishna basin ${Math.round(krishna.storagePct)}% (${Math.round(krishna.lastYearPct)}%), Pennar ${Math.round(pennar.storagePct)}% (${Math.round(pennar.lastYearPct)}%)` : ""}</em></li>
              <li><span>Rain since {day(ctx.rain.start).replace(/ \d{4}$/, "")}</span><b data-tone={ctx.rain.deviationPct <= -20 ? "bad" : undefined}>{ctx.rain.deviationPct > 0 ? "+" : "−"}{Math.abs(Math.round(ctx.rain.deviationPct))}<small>%</small></b><em>{ctx.rain.deviationPct < 0 ? "below" : "above"} normal to {day(ctx.rain.end).replace(/ \d{4}$/, "")}; {count(wetDeficit)} of {count(ctx.rain.mandals)} mandals deficient or worse</em></li>
              <li><span>The Pacific</span><b>{Math.round(season.elNino)}<small>% El Niño</small></b><em>chance it lasts through {season.label} (NOAA){elNino && laNina ? `. In El Niño months since 2014, ${Math.round(elNino.medianDeeperPct)}% of mandals ran deeper than usual; in La Niña, ${Math.round(laNina.medianDeeperPct)}%` : ""}</em></li>
            </ul>

            <div className={styles.split}>
              <figure style={{ margin: 0 }}>
                <div className={styles.sec}>Where</div>
                <svg className={styles.map} viewBox={`0 0 ${STATIC_MAP_VIEW.width} ${STATIC_MAP_VIEW.height}`} role="img"
                  aria-label={`Drinking-water priority by mandal: ${first.mandals} to plan first, ${next.mandals} next, ${watch.mandals} to watch`}>
                  <g stroke="#ffffff" strokeWidth="0.5" strokeLinejoin="round">
                    {outlines.map((d, i) => <path key={i} d={d} fill={fills[(bandAt.has(i) ? KEY[bandAt.get(i)!] : "n")]} />)}
                  </g>
                  <path d={districtOutlines()} fill="none" stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                <figcaption className={styles.mapKey}>
                  {BANDS.map(b => <span key={b}><i style={{ background: PRIORITY_COLORS[b] }} />{BAND_LABEL[b]}</span>)}
                  <span><i style={{ background: PRIORITY_COLORS.none }} />Not on the list</span>
                </figcaption>
              </figure>
              <div className={styles.side}>
                <div className={styles.sec}>Plan first, by district</div>
                <ol className={styles.places} data-testid="summer-brief-places">
                  {places.map(d => (
                    <li key={d.district}>
                      <span><b>{d.district}</b><small>{lakhs(d.people)} people{d.next ? ` · ${d.next} next` : ""}{d.watch ? ` · ${d.watch} to watch` : ""}</small></span>
                      <i style={{ width: `${(100 * d.first) / places[0].first}%` }} aria-hidden="true" />
                      <strong>{d.first}</strong>
                    </li>
                  ))}
                </ol>
                <div className={styles.sec}>When, on a typical winter</div>
                <div className={styles.clock} role="img" aria-label={`Mandals past their deepest May on record: ${months.map((ym, i) => `${monthOf(ym)} ${byMonth[i]}`).join(", ")}`}>
                  {months.map((ym, i) => (
                    <div key={ym}>
                      <b>{byMonth[i]}</b>
                      <i style={{ height: `${(CLOCK_MM * byMonth[i]) / tallest}mm` }} data-now={i === 0 || undefined} />
                      <span>{monthOf(ym).slice(0, 3)}</span>
                    </div>
                  ))}
                </div>
                <p className={styles.clockNote}>Mandals past their deepest May on record, counted to each month. <b>{byMonth[0]}</b> already are at the {monthOf(o.anchor)} reading; <b>{byMonth[byMonth.length - 1]}</b> will be by May. A calendar to start work by, not a forecast of wells failing.</p>
              </div>
            </div>

            <div className={styles.pair}>
              <div>
                <div className={styles.sec}>How far to trust it</div>
                {bt ? <p>Each past year was projected from the other years&rsquo; winters alone ({bt.years[0]}–{bt.years[bt.years.length - 1]}, {count(bt.comparisons)} mandal-years). The typical projection was off by <b>{bt.typicalErrorM.toFixed(1)} m</b> in the median mandal, against {bt.persistenceErrorM.toFixed(1)} m for assuming no change. A mandal named past its record went deeper than its earlier deepest May <b>{Math.round(bt.pastRecordPct.beyond ?? 0)}%</b> of the time, against {Math.round(bt.baseRatePct)}% for all mandals{bt.recordsFlaggedPct != null ? <>; of the Mays that did set a record, <b>{Math.round(bt.recordsFlaggedPct)}%</b> had been flagged</> : null}.</p> : null}
              </div>
              <div>
                <div className={styles.sec}>What it cannot say</div>
                <p>A well fails at the depth it was drilled to, which no public record gives, so each mandal is set against its own record, not a fixed depth. This is the water table in the State&rsquo;s observation wells: which villages need water first is for the field check. From the {monthYear(o.anchor)} readings; {monthYear(nextReading)}&rsquo;s, due early {monthOf(addMonth(nextReading))}, will move every figure here.</p>
              </div>
            </div>
          </div>

          <div className={styles.foot}>
            <span>Sources: APWRIMS (Ground Water and Water Audit Department wells and sensors, reservoirs, State rain gauges), NOAA CPC, WorldPop 2020, Jal Jeevan Mission, Sentinel-2. Prototype built from public sources: a screening view for where to look, not a declaration or an order. Built {day(p.generatedAt)}.</span>
            <span><b>AP Water Intelligence</b> · prucodes.github.io/ap-groundwater-fusion/summer</span>
          </div>
        </section>
      </div>
    </div>
  );
}
