import type { Metadata } from "next";
import changesJson from "../../data/weekly_changes.json";
import droughtJson from "../../data/drought_watch_summary.json";
import { DigestActions } from "../../components/DigestActions";
import { day } from "../../components/agriculture/waterContextFormat";
import { basePath, titleCase } from "../../lib/data";
import { fieldPriority, PRIORITY_SIGNALS, standsOut } from "../../lib/fieldPriority";
import { fieldSignals } from "../../lib/fieldSignalsServer";
import { checkRecord } from "../../lib/cropWaterRecord";
import { rabiView } from "../../lib/rabi";
import { stateSummary } from "../../lib/stateSummary";
import { summerOutlook } from "../../lib/summer";
import styles from "./Digest.module.css";

/* The Monday digest: one A4 sheet for the CMO, RTGS and the collectors, built
   from the same files as the site and printed to PDF by each deploy
   (scripts/print-digest.mjs). Every figure carries its own date; nothing here
   is computed that the site does not already show. */

export const metadata: Metadata = {
  title: "Weekly Digest | AP Water Intelligence",
  description: "One A4 page each Monday: reservoirs, rain, the drought manual, groundwater, crops short of water, where to send field teams, and the rabi starting position.",
};

type Item = { key: string; label: string; unit: string; before: number | null; after: number | null; change: number | null; direction: string | null; afterAsOf: string | null };
const changes = changesJson as unknown as { generatedAt: string; items: Item[] };
const drought = droughtJson as unknown as { season: { label?: string } | string; state: { assessed: number; counts: Record<string, number> } };

const DIGEST_PDF = "ap-water-weekly-digest.pdf";
const place = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));
const COLUMN: Record<string, string> = { groundwater: "Wells", rain: "Rain", soil: "Soil", crops: "Crops", vegetation: "Green", pressure: "Draw" };
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${Math.round(value)}%`);
const signed = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value))}%`);

function moved(item: Item) {
  if (item.after === null) return "—";
  const unit = item.unit === "%" ? "%" : item.unit === "°C" ? " °C" : "";
  const value = item.unit === "°C" ? `+${item.after.toFixed(2)}` : item.unit === "%" ? item.after.toFixed(1) : String(item.after);
  return `${value}${unit}`;
}

export default function DigestPage() {
  const rabi = rabiView();
  const res = rabi.reservoirs, soil = rabi.soil;
  const week = fieldSignals.crossCheck?.issued ?? changes.generatedAt.slice(0, 10);
  const counts = drought.state.counts;
  // As This Week counts them: the manual's own severe and moderate readings; the in-between ones are not added.
  const severe = counts.severe ?? 0, moderate = counts.moderate ?? 0;
  const gw = stateSummary.state;
  const teams = fieldPriority().rows.filter(row => row.lit >= 4).slice(0, 10);
  const mostShort = (fieldSignals.crossCheck as { mostCropsShortMid?: number } | null)?.mostCropsShortMid ?? null;
  const record = checkRecord();
  const weak = Object.values(record.record).filter(e => e.rainfed.verdict === "weak").length;
  const backed = Object.values(record.record).filter(e => e.rainfed.verdict === "backed").length;
  const fieldWeak = Object.values(record.record).filter(e => e.sentinel?.verdict === "weak").length;
  const fieldBacked = Object.values(record.record).filter(e => e.sentinel?.verdict === "backed").length;
  const hardest = res ? [...res.basins].filter(b => b.storagePct !== null && b.lastYearPct !== null).sort((a, b) => (a.storagePct! - a.lastYearPct!) - (b.storagePct! - b.lastYearPct!))[0] : null;
  const moves = changes.items.filter(item => item.change !== null && item.direction && item.direction !== "same");
  const first = !moves.length;
  const summerTarget = new Date(`${summerOutlook.targetMay}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <div className={styles.page}>
      <DigestActions pdf={`${basePath}/digest/${DIGEST_PDF}`} filename={`AP-water-digest-${week}.pdf`} />
      <article className={styles.sheet} data-testid="digest">
        <header className={styles.head}>
          <div>
            <span className={styles.kicker}>Andhra Pradesh · Weekly water digest</span>
            <h1>Week of {day(week)}</h1>
          </div>
          <p>Prototype built from public sources, refreshed each Monday. A screening view for where to look, not a declaration or an order.</p>
        </header>

        <section className={styles.figures} aria-label="The week in six figures">
          {res ? <div><span>Reservoir storage</span><b>{pct(res.state.storagePct)}</b><em>{pct(res.state.lastYearPct)} a year ago · {day(rabi.asOf.reservoirs, false)}</em></div> : null}
          {rabi.rain ? <div><span>Rain since 1 June</span><b data-tone={rabi.rain.deviationPct !== null && rabi.rain.deviationPct < -19 ? "bad" : undefined}>{signed(rabi.rain.deviationPct)}</b><em>State gauges · to {day(rabi.rain.end, false)}</em></div> : null}
          <div><span>Drought manual</span><b data-tone={severe ? "bad" : undefined}>{severe}<small> severe</small></b><em>{moderate} moderate, of {drought.state.assessed} mandals assessed</em></div>
          {gw && gw.currentM !== null && gw.vsYearAgoM !== null ? <div><span>State wells</span><b>{gw.currentM.toFixed(1)}<small> m</small></b><em>{gw.vsYearAgoM >= 0 ? `${gw.vsYearAgoM.toFixed(1)} m deeper` : `${Math.abs(gw.vsYearAgoM).toFixed(1)} m shallower`} than a year ago · {gw.stationsTotal.toLocaleString("en-IN")} wells · {day(gw.date, false)}</em></div> : null}
          {mostShort !== null ? <div><span>Most crops short of water</span><b data-tone={mostShort > 50 ? "bad" : undefined}>{mostShort}<small> mandals</small></b><em>4 or more of 7 crops at mid-season · forecast from {day(week, false)}</em></div> : null}
          <div><span>El Niño, Oct–Dec</span><b>{rabi.enso.ondElNinoPct !== null ? `${Math.round(rabi.enso.ondElNinoPct)}%` : "—"}</b><em>{rabi.enso.alert} · NOAA, {day(rabi.enso.issued, false)}</em></div>
        </section>

        <div className={styles.columns}>
          <section className={styles.teams} aria-labelledby="digest-teams">
            <h2 id="digest-teams">Where field teams would learn most</h2>
            <p className={styles.sub}>Mandals where four or more of six signals point to water stress at once. Filled: the signal is lit.</p>
            <table>
              <thead><tr><th>Mandal</th>{PRIORITY_SIGNALS.map(s => <th key={s.key} title={s.label}>{COLUMN[s.key] ?? s.short}</th>)}<th>What stands out</th></tr></thead>
              <tbody>
                {teams.map(row => <tr key={row.index}>
                  <td><b>{place(row.mandal)}</b><small>{place(row.district)}</small></td>
                  {PRIORITY_SIGNALS.map(s => <td key={s.key} className={styles.dot} data-state={row.signals[s.key] === null ? "none" : row.signals[s.key] ? "on" : "off"} />)}
                  <td className={styles.why}>{standsOut(row)}</td>
                </tr>)}
              </tbody>
            </table>
            {!teams.length ? <p className={styles.sub}>No mandal has four or more signals lit this week.</p> : null}
            <p className={styles.key}>Wells below their seasonal normal · gauge rain 20% or more short · soil among the driest quarter of years · 4 or more of 7 crops short of water · crop vegetation severely below normal · groundwater drawn semi-critical or worse.</p>
          </section>

          <aside className={styles.side}>
            <section aria-labelledby="digest-moved">
              <h2 id="digest-moved">What moved this week</h2>
              {first ? <p className={styles.sub}>The first week-on-week comparison lands with the next Monday refresh; the figures above are this week&rsquo;s.</p> : (
                <ul className={styles.moves}>
                  {moves.slice(0, 6).map(item => <li key={item.key} data-direction={item.direction ?? undefined}><span>{item.label}</span><b>{moved(item)}</b></li>)}
                </ul>
              )}
            </section>
            <section aria-labelledby="digest-rabi">
              <h2 id="digest-rabi">The season ahead</h2>
              <ul className={styles.notes}>
                <li>By {summerTarget}, the water table in <b>{summerOutlook.summary.beyond} mandals</b> is projected past its deepest May on record on a typical winter, {summerOutlook.summary.beyondDeep} of them more than 10 m down; {summerOutlook.summary.dry} more in a dry one.</li>
                {hardest ? <li>The <b>{hardest.name}</b> reservoirs hold <b>{pct(hardest.storagePct)}</b>, against {pct(hardest.lastYearPct)} a year ago.</li> : null}
                {soil ? <li>In <b>{soil.record + soil.below} of {soil.read}</b> mostly rainfed mandals the topsoil is drier than in its median year; {soil.record} are the driest on record.</li> : null}
                {rabi.sowing.issued ? <li>A {rabi.sowing.crop} crop sown now would run short within a week in <b>{rabi.sowing.stressed + rabi.sowing.soon}</b> of {rabi.sowing.stressed + rabi.sowing.soon + rabi.sowing.ok} rainfed mandals.</li> : null}
                {rabi.enso.past ? <li>Past El Niño years brought Oct–Dec rain {signed(rabi.enso.past.anomalyPct)} on average: a tilt, not a forecast.</li> : null}
              </ul>
            </section>
            <section aria-labelledby="digest-check">
              <h2 id="digest-check">How far to trust the crop check</h2>
              <p className={styles.sub}>Re-run on {record.checks} past kharif weeks over rainfed fields. 4 km satellite index: {backed} crop-stages backed, {weak} weak{record.sentinel ? `; field scale (Sentinel-2): ${fieldBacked} backed, ${fieldWeak} weak` : ""}. Read it as where crops need water now, not as a forecast.{record.live?.frozen ? ` Live scorecard: ${record.live.scored} of ${record.live.frozen} frozen weeks scored.` : ""}</p>
            </section>
          </aside>
        </div>

        <div className={styles.lower}>
          {res ? <section aria-labelledby="digest-basins">
            <h2 id="digest-basins">Reservoirs by basin</h2>
            <ul className={styles.bars}>
              {res.basins.map(b => <li key={b.basin}>
                <span>{b.name}</span>
                <span className={styles.bar} aria-hidden="true"><i style={{ width: `${Math.min(100, b.storagePct ?? 0)}%` }} />{b.lastYearPct !== null ? <s style={{ left: `${Math.min(100, b.lastYearPct)}%` }} /> : null}</span>
                <b>{pct(b.storagePct)}</b><small>{pct(b.lastYearPct)} last year</small>
              </li>)}
            </ul>
          </section> : null}
          {rabi.districts.length ? <section aria-labelledby="digest-seedbed">
            <h2 id="digest-seedbed">Where the rainfed seedbed is driest</h2>
            <ul className={styles.bars}>
              {rabi.districts.slice(0, 5).map(d => <li key={d.district}>
                <span>{place(d.district)}</span>
                <span className={styles.bar} data-tone="dry" aria-hidden="true"><i style={{ width: `${d.dryPct}%` }} /></span>
                <b>{d.dry} of {d.rainfed}</b><small>{d.neSharePct !== null ? `${Math.round(d.neSharePct)}% of rain Oct–Dec` : ""}</small>
              </li>)}
            </ul>
          </section> : null}
        </div>

        <footer className={styles.foot}>
          Sources: APWRIMS (reservoirs, gauge rain, NRSC soil moisture, State wells), the national drought manual&rsquo;s indicators (Drought Watch), ECMWF forecast via Open-Meteo, NOAA STAR vegetation health, CGWB/INGRES assessment, ESA WorldCereal, NOAA CPC. Each figure&rsquo;s own date is beside it. Full detail at prucodes.github.io/ap-groundwater-fusion.
        </footer>
      </article>
    </div>
  );
}
