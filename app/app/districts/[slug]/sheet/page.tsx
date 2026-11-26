import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { basePath } from "../../../../lib/data";
import { districtSheet, districtSheets, pdfName, sheetDates, type SheetMandal } from "../../../../lib/districtSheet";
import { lakhs } from "../../../../lib/summer";
import { BAND_LABEL } from "../../../../lib/summerPriority";
import brief from "../../../summer/brief/SummerBrief.module.css";
import styles from "./DistrictSheet.module.css";

/* One district on one A4 page, for its Collector: where the water table stands against
   each mandal's usual, this season's recharge, rain and reservoirs, which mandals to plan
   summer drinking water for first, and the drought manual's reading. Every figure is one
   the site already publishes (lib/districtSheet.ts). The deploy prints each sheet to
   districts/<slug>/sheet/ap-<slug>-district-sheet.pdf (scripts/print-digest.mjs --manifest). */

export function generateStaticParams() {
  return districtSheets().map(s => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const s = districtSheet(slug);
  return {
    title: `${s?.name ?? "District"} district sheet | AP Water Intelligence`,
    description: s ? `${s.name} on one A4 page for the District Collector: groundwater against its usual, the monsoon's recharge, rain and reservoirs, summer drinking water and the drought manual.` : undefined,
  };
}

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const m1 = (v: number) => `${Math.abs(v).toFixed(1)} m`;
const TONE = { deeper: "#c4563a", shallower: "#2a9fd6", steady: "#9aa8b5", none: "#dfe5ec" } as const;
const toneOf = (side: -1 | 0 | 1 | null) => (side === 1 ? TONE.deeper : side === -1 ? TONE.shallower : side === 0 ? TONE.steady : TONE.none);
const SUMMER_WORD = { beyond: "Past its record", dry: "Past it if dry", within: "Within its record" } as const;
/** Rows the table has room for under the rest of the sheet. */
const TABLE_ROWS = 12;


export default async function DistrictSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = districtSheet(slug);
  if (!s) notFound();
  const dates = sheetDates(), c = s.counts, month = s.month.split(" ")[0], target = dates.summer.slice(0, 4);
  const below = s.mandals.filter(m => m.side === 1).sort((a, b) => (b.vsUsualM ?? 0) - (a.vsUsualM ?? 0));
  const shown = below.slice(0, TABLE_ROWS), rest = below.length - shown.length;
  const firstRows = s.priority.rows.filter(r => r.band !== "watch").slice(0, 5);
  const w = s.water, mon = s.monsoon, sum = s.summer, dr = s.drought;
  const rose = mon ? mon.thisSeasonM < 0 : false;

  return (
    <div className="pageWrap">
      <div className={brief.viewer}>
        <div className={brief.toolbar}>
          <p>{s.name} on one A4 page, rebuilt from each Monday&rsquo;s data. <Link href="/districts/sheets/">Every district&rsquo;s sheet</Link></p>
          <a className={brief.download} href={`${basePath}/districts/${s.slug}/sheet/${pdfName(s.slug)}`} download={`AP-${s.slug}-district-sheet.pdf`} data-testid="district-sheet-pdf">Download PDF</a>
        </div>

        <section className={brief.page} data-testid="district-sheet" data-deeper={c.deeper} data-compared={c.compared}>
          <div className={brief.band}>
            <div className={brief.eyebrow}>Andhra Pradesh · {s.name} district · for the Collector</div>
            <h1>
              {c.compared ? <><b>{c.deeper} of {c.compared}</b> mandals stand deeper than their usual {month}</> : <>No mandal read in {s.month}</>}
            </h1>
            <p className={brief.sub}>
              {s.month}, each mandal against the median of its own {month}s on record{c.shallower ? `; ${c.shallower} stand above it` : ""}.
              {sum ? <> By May {target}, on a typical winter, <b>{sum.beyond} of {sum.mandals}</b> are projected past their deepest May on record{sum.people ? <>, home to about <b>{lakhs(sum.people)} people</b></> : null}.</> : null}
            </p>
          </div>

          <div className={brief.body}>
            <ul className={brief.tiles} data-testid="district-sheet-tiles">
              <li><span>Water table, {month}</span><b data-tone={s.medianNowM !== null && s.medianUsualM !== null && s.medianNowM - s.medianUsualM > 0.5 ? "bad" : undefined}>{s.medianNowM !== null ? s.medianNowM.toFixed(1) : "–"}<small>m</small></b><em>below ground at the median mandal{s.medianUsualM !== null ? `, against a usual ${month} of ${s.medianUsualM.toFixed(1)} m` : ""}</em></li>
              <li><span>Since May</span><b data-tone={mon && mon.shortfallM > 0.5 ? "bad" : undefined}>{mon ? <>{Math.abs(mon.thisSeasonM).toFixed(1)}<small>m {rose ? "higher" : "deeper"}</small></> : "–"}</b><em>{mon ? <>{`the water table after the monsoon, against May; usually it ${mon.typicalM < 0 ? "rises" : "falls"} ${m1(mon.typicalM)}`}{mon.shortMandals ? `. ${mon.shortMandals} mandals flagged short` : ""}</> : "no comparable seasons"}</em></li>
              <li><span>Rain since {dates.rain ? day(dates.rain.start).replace(/ \d{4}$/, "") : "June"}</span><b data-tone={w?.rain && w.rain.deviationPct <= -20 ? "bad" : undefined}>{w?.rain ? `${w.rain.deviationPct > 0 ? "+" : "−"}${Math.abs(Math.round(w.rain.deviationPct))}` : "–"}<small>%</small></b><em>{w?.rain ? <>{Math.round(w.rain.actualMm)} mm against a normal {Math.round(w.rain.normalMm)} mm, State gauges to {dates.rain ? day(dates.rain.end).replace(/ \d{4}$/, "") : "–"}</> : "no gauge figure"}</em></li>
              {w?.reservoirs && w.reservoirs.storagePct !== null ? (
                <li><span>Reservoirs</span><b data-tone={w.reservoirs.lastYearPct !== null && w.reservoirs.storagePct < w.reservoirs.lastYearPct - 10 ? "bad" : undefined}>{Math.round(w.reservoirs.storagePct)}<small>% full</small></b><em>{w.reservoirs.count} in the district{w.reservoirs.lastYearPct !== null ? `, against ${Math.round(w.reservoirs.lastYearPct)}% a year ago` : ""} ({day(dates.reservoirs)})</em></li>
              ) : w?.soil ? (
                <li><span>Soil moisture</span><b>{Math.round(w.soil.medianPct)}<small>%</small></b><em>at the median mandal; {w.soil.belowOwnMedian} of {w.soil.withBaseline} below their own usual for the date</em></li>
              ) : <li><span>Reservoirs</span><b>–</b><em>none recorded in the district</em></li>}
            </ul>

            <div className={styles.split}>
              <figure className={styles.mapWrap}>
                <svg viewBox={s.map.viewBox} className={styles.map} role="img" aria-label={`${s.name}'s mandals coloured by their water table against the usual ${month}`}>
                  {s.map.shapes.map((shape, i) => <path key={i} d={shape.d} fill={toneOf(shape.side)} stroke="#fff" strokeWidth={0.35} strokeLinejoin="round" />)}
                  {s.map.shapes.filter(shape => shape.priority).map((shape, i) => <path key={`p${i}`} d={shape.d} fill="none" stroke="#0d2138" strokeWidth={0.9} strokeLinejoin="round" />)}
                </svg>
                <figcaption className={styles.key}>
                  <span><i style={{ background: TONE.deeper }} />Deeper than usual</span>
                  <span><i style={{ background: TONE.shallower }} />Shallower</span>
                  <span><i style={{ background: TONE.steady }} />Within 0.1 m</span>
                  {s.priority.rows.length ? <span><i className={styles.ring} />On the summer list</span> : null}
                </figcaption>
              </figure>

              <div className={styles.side}>
                <h3>Summer drinking water: plan first</h3>
                {firstRows.length ? (
                  <ul className={styles.first} data-testid="district-sheet-first">
                    {firstRows.map(r => (
                      <li key={r.index}>
                        <span><b>{r.mandal}</b><small>{BAND_LABEL[r.band]} · now {r.nowM.toFixed(1)} m, deepest May {r.deepestMayM.toFixed(1)} m{r.people ? ` · ${lakhs(r.people)} people` : ""}</small></span>
                        <strong>{r.typicalM.toFixed(1)} m</strong>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.none}>No mandal here is on the summer list to plan first or next.</p>}
                <p className={styles.note}>
                  {firstRows.length ? <>Right: the May depth projected on a typical winter. </> : null}
                  {s.priority.watch ? `${s.priority.watch} more to watch: past their record only in a dry winter. ` : ""}
                  <Link href="/summer/">The full list, with reasons</Link>.
                </p>
                {dr ? (
                  <p className={styles.note}><b>Drought manual, to {day(dates.drought)}:</b> {dr.severe} severe, {dr.moderate} moderate{dr.between ? `, ${dr.between} between two readings` : ""} of {dr.assessed} mandals assessed. A screening reading, not a declaration.</p>
                ) : null}
                {s.fieldTeams.length ? <p className={styles.note}><b>On the field-teams list:</b> {s.fieldTeams.join(", ")}.</p> : null}
              </div>
            </div>

            <div className={brief.sec}>Furthest below their usual {month}</div>
            {shown.length ? (
              <table className={styles.table} data-testid="district-sheet-table">
                <thead><tr><th>Mandal</th><th className={styles.num}>{month} {s.month.split(" ")[1]}</th><th className={styles.num}>Usual</th><th className={styles.num}>Deeper by</th><th>By May, typical winter</th></tr></thead>
                <tbody>
                  {shown.map((m: SheetMandal) => (
                    <tr key={m.id}>
                      <td><b>{m.name}</b>{m.priority && m.priority !== "watch" ? <small> · on the summer list</small> : null}</td>
                      <td className={styles.num}>{m.nowM?.toFixed(1)} m</td>
                      <td className={styles.num}>{m.usualM?.toFixed(1)} m</td>
                      <td className={`${styles.num} ${styles.bad}`}>{m.vsUsualM !== null ? m1(m.vsUsualM) : "–"}</td>
                      <td>{m.summer ? SUMMER_WORD[m.summer] : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className={styles.none}>No mandal stands more than 0.1 m below its usual {month}.</p>}
            {rest > 0 ? <p className={styles.more}>And {rest} more deeper than usual: {below.slice(TABLE_ROWS).map(m => m.name).join(", ")}.</p> : null}
          </div>

          <div className={brief.foot}>
            <span>
              {`Groundwater: APWRIMS monthly hand-read wells, the mandal median, ${s.month}; usual is each mandal’s median ${month} on record. Summer: the site’s outlook from the same readings and each mandal’s past winters. Rain and reservoirs: State gauges and reservoir levels via APWRIMS. Drought: the national drought manual’s indicators. Prototype built from public sources: a screening view for where to look, not a declaration or an order.`}
            </span>
            <span><b>prucodes.github.io/ap-groundwater-fusion</b><br />/districts/{s.slug}/sheet/</span>
          </div>
        </section>
      </div>
    </div>
  );
}
