import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import changesJson from "../../data/weekly_changes.json";
import { CATEGORY_META, place, shortDate } from "../../lib/drought";
import { GEC_CATEGORIES, type GecCategory } from "../../lib/agriculture";
import { fieldPriority, PRIORITY_SIGNALS, standsOut } from "../../lib/fieldPriority";
import { fieldSignals } from "../../lib/fieldSignalsServer";
import styles from "./Changes.module.css";
import { brief } from "../../lib/pageBriefs";

export const metadata: Metadata = {
  title: "This Week | AP Water Intelligence",
  description: "What moved since the last weekly refresh: gauge rain, soil moisture, reservoirs, drought-manual triggers, groundwater status and NOAA's El Niño outlook, each with its own date.",
};

type Item = {
  key: string; label: string; unit: string; better: "higher" | "lower" | "context"; href: string;
  before: number | null; after: number | null; beforeAsOf: string | null; afterAsOf: string | null;
  change: number | null; direction: "better" | "worse" | "same" | "moved" | null; refreshed: boolean | null; note?: string;
};
type Mover = { i?: number; id?: string; d?: string; m?: string; mandal?: string; district?: string; from: string; to: string; worse?: boolean };
type Changes = {
  generatedAt: string;
  comparedWith: { label: string; commit?: string; committedAt?: string };
  items: Item[];
  groundwater: { worse: number; better: number; moved: Mover[]; truncated: boolean; latestMonth: { before: string | null; after: string | null } };
  drought: { worse: Mover[]; better: Mover[]; basis: string };
  counts: { better: number; worse: number; same: number; unknown: number };
};

const changes = changesJson as unknown as Changes;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function asOf(value: string | null) {
  if (!value) return "—";
  if (/^\d{4}-\d{2}$/.test(value)) return `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  return shortDate(value, true);
}

function format(value: number | null, unit: string) {
  if (value === null) return "—";
  if (unit === "%") return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
  if (unit === "°C") return `${value > 0 ? "+" : ""}${value.toFixed(2)} °C`;
  return String(value);
}

function delta(item: Item) {
  if (item.change === null) return null;
  const sign = item.change > 0 ? "+" : item.change < 0 ? "−" : "±";
  const size = Math.abs(item.change);
  const unit = item.unit === "%" ? " pts" : item.unit === "°C" ? " °C" : "";
  return `${sign}${item.unit === "°C" ? size.toFixed(2) : item.unit === "%" ? size.toFixed(1) : size}${unit}`;
}

const DIRECTION_TEXT: Record<string, string> = { better: "Better", worse: "Worse", same: "No change", moved: "Moved" };
const STATUS_TEXT: Record<string, string> = { stable: "Stable", watch: "Watch", stress: "Stress" };

function categoryLabel(key: string) {
  return (CATEGORY_META as Record<string, { label: string }>)[key]?.label ?? key;
}

export default function ChangesPage() {
  const items = changes.items;
  const first = items.every(item => item.before === null || item.direction === "same");
  const droughtMoves = [...changes.drought.worse.map(m => ({ ...m, worse: true })), ...changes.drought.better.map(m => ({ ...m, worse: false }))];

  return (
    <div className={`pageWrap ${styles.page}`}>
      <HeaderHero
        title="This Week"
        brief={brief("/changes", first ? <>The first week-on-week comparison lands with the next Monday refresh; <b>{fieldPriority().rows.filter(r => r.lit >= 4).length} mandals</b> have four or more stress signals at once.</> : <>{changes.counts.worse} headlines worse and {changes.counts.better} better since last week; <b>{fieldPriority().rows.filter(r => r.lit >= 4).length} mandals</b> have four or more stress signals at once.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={styles.summary} aria-label="Week at a glance">
        <div className={styles.summaryText}>
          <span className={styles.kicker}>Refresh of {shortDate(changes.generatedAt, true)}</span>
          <p>Compared with {changes.comparedWith.label}{changes.comparedWith.commit ? ` (commit ${changes.comparedWith.commit}${changes.comparedWith.committedAt ? `, ${shortDate(changes.comparedWith.committedAt, true)}` : ""})` : ""}.</p>
          <Link href="/digest/" className={styles.digestLink} data-testid="digest-link">This week on one A4 page: the digest →</Link>
        </div>
        <ul className={styles.tally}>
          <li data-tone="worse"><b>{changes.counts.worse}</b>worse</li>
          <li data-tone="better"><b>{changes.counts.better}</b>better</li>
          <li data-tone="same"><b>{changes.counts.same}</b>unchanged</li>
          <li data-tone="unknown"><b>{changes.counts.unknown}</b>new</li>
        </ul>
      </section>

      <section className={styles.cards} aria-label="Headlines this week" data-testid="weekly-changes">
        {items.map(item => (
          <Link href={item.href} className={styles.card} key={item.key} data-direction={item.direction ?? "new"}>
            <span className={styles.cardLabel}>{item.label}</span>
            <strong className={styles.value}>{format(item.after, item.unit)}</strong>
            <span className={styles.status}>
              <span className={styles.badge}>
                {item.direction ? DIRECTION_TEXT[item.direction] : "First reading"}
                {delta(item) && item.direction !== "same" ? ` · ${delta(item)}` : ""}
              </span>
              {item.before !== null && item.direction !== "same" ? <span className={styles.was}>was {format(item.before, item.unit)}</span> : null}
            </span>
            <span className={styles.dates}>
              {item.beforeAsOf && item.beforeAsOf !== item.afterAsOf ? `${asOf(item.beforeAsOf)} → ${asOf(item.afterAsOf)}` : `As of ${asOf(item.afterAsOf)}`}
              {item.refreshed === false ? " · source has not updated" : ""}
            </span>
            {item.note ? <span className={styles.note}>{item.note}</span> : null}
          </Link>
        ))}
      </section>

      <FieldTeams />

      <div className={styles.lists}>
        <section className={styles.list} aria-label="Drought manual readings that moved">
          <div className={styles.listHead}>
            <h3>Drought manual readings that moved</h3>
            <span>{changes.drought.basis}</span>
          </div>
          {droughtMoves.length ? (
            <ul>
              {droughtMoves.map(m => (
                <li key={`${m.d}-${m.m}`} data-worse={m.worse}>
                  <span className={styles.mark}>{m.worse ? "▲" : "▼"}</span>
                  <span className={styles.where}><b>{place(m.m ?? "")}</b><small>{place(m.d ?? "")}</small></span>
                  <span className={styles.move}>{categoryLabel(m.from)} → <b>{categoryLabel(m.to)}</b></span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.empty}>No mandal changed its reading this week.</p>}
          <Link href="/drought" className={styles.more}>Open the Drought Watch →</Link>
        </section>

        <section className={styles.list} aria-label="Groundwater status that moved">
          <div className={styles.listHead}>
            <h3>Groundwater status that moved</h3>
            <span>Latest reading {asOf(changes.groundwater.latestMonth.before)} → {asOf(changes.groundwater.latestMonth.after)} · {changes.groundwater.worse} worse, {changes.groundwater.better} better</span>
          </div>
          {changes.groundwater.moved.length ? (
            <ul>
              {changes.groundwater.moved.map(m => (
                <li key={m.id} data-worse={m.worse}>
                  <span className={styles.mark}>{m.worse ? "▲" : "▼"}</span>
                  <span className={styles.where}><b>{place(m.mandal ?? "")}</b><small>{place(m.district ?? "")}</small></span>
                  <span className={styles.move}>{STATUS_TEXT[m.from] ?? m.from} → <b>{STATUS_TEXT[m.to] ?? m.to}</b></span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>
              {changes.groundwater.latestMonth.before === changes.groundwater.latestMonth.after
                ? `No new month of groundwater readings since the last refresh; the latest is still ${asOf(changes.groundwater.latestMonth.after)}. Readings arrive monthly.`
                : "No mandal changed its groundwater status."}
            </p>
          )}
          {changes.groundwater.truncated ? <p className={styles.empty}>Showing the first {changes.groundwater.moved.length}; the full list is on the watchlist.</p> : null}
          <Link href="/watchlist" className={styles.more}>Open the watchlist →</Link>
        </section>
      </div>

      <p className={styles.foot}>
        Built each Monday by the weekly refresh, after every source has been fetched and before anything is published. A feed that failed or looked
        mid-revision keeps last week&rsquo;s figure, and its date above says so. Rain, soil and reservoirs: APWRIMS. Drought readings: this site&rsquo;s reading
        of the national drought manual, not a declaration. Groundwater: APWRIMS monthly series. El Niño: NOAA CPC.
      </p>
    </div>
  );
}

/** Where several published signals point the same way: a list for field verification visits. */
function FieldTeams() {
  const { rows, soilAsOf, window } = fieldPriority();
  const shown = rows.filter(row => row.lit >= 4).slice(0, 15);
  const tally = [6, 5, 4].map(n => ({ n, count: rows.filter(row => row.lit === n).length }));
  const veg = fieldSignals.vegetation, gw = fieldSignals.assessment;
  if (!shown.length) return null;
  return (
    <section className={styles.teams} id="field-teams" aria-labelledby="field-teams-title" data-testid="field-teams">
      <div className={styles.teamsHead}>
        <div>
          <span className={styles.kicker}>Where field teams would learn most this week</span>
          <h2 id="field-teams-title">Mandals where most signals point to water stress at once</h2>
          <p>Six published signals, each a stated test on a figure this site already shows. Where four or more agree, a visit can confirm or rule out stress quickly. A list for verification visits: not a ranking of need, an allocation or a declaration. The signals are not all independent: soil moisture is modelled from rain, and the crop check starts from the soil moisture.</p>
        </div>
        <ul className={styles.teamsTally} aria-label="Mandals by how many signals agree">
          {tally.map(t => <li key={t.n}><b>{t.count}</b>{t.n === 6 ? "all six" : `${t.n} of 6`}</li>)}
        </ul>
      </div>
      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th scope="col">Mandal</th>
              {PRIORITY_SIGNALS.map(signal => <th scope="col" key={signal.key} title={signal.label}><span>{signal.short}</span></th>)}
              <th scope="col">Agree</th>
              <th scope="col">What stands out</th>
              <th scope="col"><span className={styles.srOnly}>Field report</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row, rank) => (
              <tr key={row.index}>
                <th scope="row"><span className={styles.rank}>{rank + 1}</span>{row.id ? <Link href={`/mandals/${row.id}`}>{place(row.mandal)}</Link> : place(row.mandal)}<small>{place(row.district)}</small></th>
                {PRIORITY_SIGNALS.map(signal => {
                  const value = row.signals[signal.key];
                  return <td key={signal.key} data-state={value === null ? "unknown" : value ? "yes" : "no"} aria-label={`${signal.short}: ${value === null ? "no usable value" : value ? "points to stress" : "does not"}`}><i /></td>;
                })}
                <td className={styles.agree}><b>{row.lit}</b><small>/{row.known}</small></td>
                <td className={styles.stands}>{standsOut(row)}</td>
                <td className={styles.report}><Link href={`/field-report/?m=${row.index}`} aria-label={`Write a field report for ${place(row.mandal)}`}>Report</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className={styles.signalKey}>
        {PRIORITY_SIGNALS.map(signal => <li key={signal.key}><b>{signal.short}.</b> {signal.label}</li>)}
      </ol>
      <p className={styles.teamsFoot}>
        Filled: points to stress. Open: does not. Faint: no usable value. Crop water: soil moisture of {soilAsOf ? shortDate(soilAsOf, true) : "this week"} and ECMWF&rsquo;s forecast{window ? ` (${shortDate(window.slice(0, 10), true)} to ${shortDate(window.slice(-10), true)})` : ""}, the seven reference crops taken at mid-season.
        {veg ? ` Vegetation: NOAA VCI over cropland, ${shortDate(veg.averaged[0].approxStart, true)} to ${shortDate(veg.averaged[veg.averaged.length - 1].approxEnd, true)}.` : ""}
        {gw ? ` Extraction: CGWB / State GWD assessment ${gw.year}.` : ""} <Link href="/agriculture/#field-week">Check any of them crop by crop →</Link>{" "}
        <Link href="/field-report/">Teams: write and share a field report →</Link>
      </p>
    </section>
  );
}
