import type { Metadata } from "next";
import Link from "next/link";
import { PageBriefList } from "../../components/PageBrief";
import { IconArrowRight, IconCalendar, IconFile, IconTarget } from "../../components/icons";
import changesJson from "../../data/weekly_changes.json";
import { CATEGORY_CODE, CATEGORY_META, place, shortDate } from "../../lib/drought";
import { droughtWatch } from "../../lib/droughtWatch";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import { WeekMoveMap } from "../../components/WeekMoveMap";
import { GEC_CATEGORIES, type GecCategory } from "../../lib/agriculture";
import { fieldPriority, PRIORITY_SIGNALS, standsOut } from "../../lib/fieldPriority";
import { fieldSignals } from "../../lib/fieldSignalsServer";
import styles from "./Changes.module.css";
import { RowFold, foldAt } from "../../components/RowFold";
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
  if (!value) return "–";
  if (/^\d{4}-\d{2}$/.test(value)) return `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  return shortDate(value, true);
}

function format(value: number | null, unit: string) {
  if (value === null) return "–";
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

/** Last week's and this week's manual reading for every mandal on the map, and which way the
 *  listed ones moved, each as one character per boundary index for the client map. */
function weekMoves() {
  const count = droughtWatch.mandals.reduce((n, row) => Math.max(n, row.i + 1), 0);
  const before = Array<string>(count).fill(CATEGORY_CODE.insufficient), after = [...before], moves = Array<string>(count).fill("n");
  for (const row of droughtWatch.mandals) {
    before[row.i] = CATEGORY_CODE[row.prev] ?? CATEGORY_CODE.insufficient;
    after[row.i] = CATEGORY_CODE[row.category] ?? CATEGORY_CODE.insufficient;
  }
  changes.drought.worse.forEach(m => { if (m.i !== undefined && m.i < count) moves[m.i] = "w"; });
  changes.drought.better.forEach(m => { if (m.i !== undefined && m.i < count) moves[m.i] = "b"; });
  return { before: before.join(""), after: after.join(""), moves: moves.join("") };
}

/** Where a group of movers sits: the districts holding three or more of them, or how thinly they spread. */
function spread(movers: Mover[], noun: string) {
  const byDistrict = new Map<string, number>();
  movers.forEach(m => byDistrict.set(m.d ?? "", (byDistrict.get(m.d ?? "") ?? 0) + 1));
  const ranked = [...byDistrict].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lead = ranked.filter(([, n]) => n >= 3).slice(0, 3);
  if (lead.length) {
    const names = lead.map(([d, n]) => `${place(d)} (${n})`);
    return `${noun} gather in ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0]}`;
  }
  return `${noun} are spread over ${ranked.length} districts, no more than ${ranked[0]?.[1] ?? 0} in any one`;
}

/** The map's finding in a sentence: how many moved into severe, and where the worse and better readings sit. */
function moveStory() {
  const { worse, better } = changes.drought;
  const severe = worse.filter(m => m.to === "severe").length;
  const parts = [
    worse.length ? spread(worse, "Worse readings") : null,
    better.length ? spread(better, worse.length ? "better ones" : "Better readings") : null,
  ].filter(Boolean);
  return `${severe ? `${severe} moved into severe. ` : ""}${parts.join("; ")}.`;
}

export default function ChangesPage() {
  const items = changes.items;
  const first = items.every(item => item.before === null);
  const priorityCount = fieldPriority().rows.filter(r => r.lit >= 4).length;
  // Moved figures lead, worse first; the ones that held steady follow as a slim row.
  const ORDER: Record<string, number> = { worse: 0, better: 1, moved: 2, new: 3, same: 4 };
  const rank = (item: Item) => ORDER[item.direction ?? "new"];
  const sorted = items.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(({ item }) => item);
  const moved = sorted.filter(item => item.direction !== "same");
  const steady = sorted.filter(item => item.direction === "same");
  const droughtMoves = [...changes.drought.worse.map(m => ({ ...m, worse: true })), ...changes.drought.better.map(m => ({ ...m, worse: false }))];

  return (
    <div className={`pageWrap ${styles.page}`}>
      <header className={styles.masthead}>
        <div>
          <span className={styles.kicker}>Andhra Pradesh / Weekly water briefing · Prototype</span>
          <h1>This Week<span className={styles.issueDate}><IconCalendar />{shortDate(changes.generatedAt, true)}</span></h1>
          <p>The changes. The places. The next field check.</p>
        </div>
        <Link href="/digest/" className={styles.digestLink} data-testid="digest-link"><IconFile />One-page digest<IconArrowRight /></Link>
      </header>
      <div className={styles.brief}>
        <PageBriefList brief={brief("/changes", first ? <>No earlier headline snapshot to compare yet; <b>{priorityCount} mandals</b> have four or more stress signals.</> : <>{changes.counts.worse} headlines worse and {changes.counts.better} better since the previous refresh; <b>{priorityCount} mandals</b> have four or more stress signals.</>)} />
      </div>
      <section className={styles.summary} aria-label="Week at a glance">
        <span className={styles.summaryText}>Headline changes <small>since the previous refresh</small></span>
        <ul className={styles.tally} aria-label="Headline comparison counts">
          <li data-tone="worse"><b>{changes.counts.worse}</b>worse</li>
          <li data-tone="better"><b>{changes.counts.better}</b>better</li>
          <li data-tone="same"><b>{changes.counts.same}</b>unchanged</li>
          <li data-tone="unknown"><b>{changes.counts.unknown}</b>new</li>
        </ul>
        {steady.length ? <a href="#weekly-register" className={styles.registerLink}>Source register <IconArrowRight /></a> : null}
      </section>
      <section className={styles.headlines} aria-label="Headlines this week" data-testid="weekly-changes">
      <div className={styles.briefingGrid}>
        <div className={styles.leadColumn}>
        {moved.length ? (
          <>
            <h2 className={styles.groupHead}>01 / Moved this week <span>{moved.length} headline{moved.length === 1 ? "" : "s"}</span></h2>
            <div className={styles.cards}>
              {moved.map(item => <ChangeCard item={item} key={item.key} />)}
            </div>
          </>
        ) : <p className={styles.empty}>No headline changed in this comparison. A retained figure is not evidence that conditions are safe.</p>}
          {priorityCount > 0 ? <a href="#field-teams" className={styles.priority} data-testid="weekly-field-priority">
            <span className={styles.priorityIcon}><IconTarget /></span>
            <span><span className={styles.kicker}>Next / Verify in the field</span><strong>{priorityCount}<small>mandals with 4+ stress signals</small></strong><span>Overlapping signals, not independent confirmations. Start with a verification visit.</span></span>
            <IconArrowRight />
          </a> : null}
          <p className={styles.scopeNote}>Prototype briefing. Dated source readings and derived screening, not live telemetry or a drought declaration.</p>
        </div>
      <section className={styles.moves} aria-labelledby="week-moves-title" data-testid="week-moves">
        <header className={styles.movesHead}>
          <span className={styles.kicker}>02 / Where it moved</span>
          <h2 id="week-moves-title">{droughtMoves.length
            ? <>{changes.drought.worse.length} mandals read worse on the drought manual this week, {changes.drought.better.length} better</>
            : <>No mandal changed its drought manual reading this week</>}</h2>
          {droughtMoves.length ? <p>{moveStory()}</p> : null}
          <p className={styles.basis}>Mandal comparison: one week of rain earlier. Separate from the headline refresh above.</p>
        </header>
        <div className={styles.movesGrid}>
          <div className={styles.movesMain}>
          <WeekMoveMap {...weekMoves()} aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height}
            label={`Drought manual reading by mandal: ${changes.drought.worse.length} worse and ${changes.drought.better.length} better than last week.`} />
          <details className={styles.movesList}>
            <summary>Readings that moved <b>{droughtMoves.length} mandals</b><span>View register</span></summary>
            <div className={styles.listHead}>
              <h3>Readings that moved</h3>
              <span>{changes.drought.basis.charAt(0).toUpperCase() + changes.drought.basis.slice(1)}</span>
            </div>
            {droughtMoves.length ? (
              <RowFold id="moved-drought-rows" total={droughtMoves.length} visible={8} noun="mandals">
              <ul>
                {droughtMoves.map((m, i) => (
                  <li key={`${m.d}-${m.m}`} data-worse={m.worse} {...foldAt(i, 8)}>
                    <span className={styles.mark}>{m.worse ? "▲" : "▼"}</span>
                    <span className={styles.where}><b>{place(m.m ?? "")}</b><small>{place(m.d ?? "")}</small></span>
                    <span className={styles.move}>{categoryLabel(m.from)} → <b>{categoryLabel(m.to)}</b></span>
                  </li>
                ))}
              </ul>
              </RowFold>
            ) : <p className={styles.empty}>No mandal changed its reading this week.</p>}
            <Link href="/drought" className={styles.more}>Open the Drought Watch →</Link>
          </details>
          </div>
          <section className={styles.list} aria-label="Groundwater status that moved">
            <div className={styles.listHead}>
              <h3>Groundwater status that moved</h3>
              <span>Latest reading {asOf(changes.groundwater.latestMonth.before)} → {asOf(changes.groundwater.latestMonth.after)} · {changes.groundwater.worse} worse, {changes.groundwater.better} better</span>
            </div>
            {changes.groundwater.moved.length ? (
              <RowFold id="moved-groundwater-rows" total={changes.groundwater.moved.length} visible={8} noun="mandals">
              <ul>
                {changes.groundwater.moved.map((m, i) => (
                  <li key={m.id} data-worse={m.worse} {...foldAt(i, 8)}>
                    <span className={styles.mark}>{m.worse ? "▲" : "▼"}</span>
                    <span className={styles.where}><b>{place(m.mandal ?? "")}</b><small>{place(m.district ?? "")}</small></span>
                    <span className={styles.move}>{STATUS_TEXT[m.from] ?? m.from} → <b>{STATUS_TEXT[m.to] ?? m.to}</b></span>
                  </li>
                ))}
              </ul>
              </RowFold>
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
      </section>
      </div>
        {steady.length ? (
          <details className={styles.steadyRegister} id="weekly-register">
            <summary><span>03 / Held steady</span><b>{steady.length} headline{steady.length === 1 ? "" : "s"}</b><span>Same figure does not mean a new reading</span></summary>
            <div className={`${styles.cards} ${styles.cardsSteady}`}>
              {steady.map(item => <ChangeCard item={item} key={item.key} />)}
            </div>
          </details>
        ) : null}
      </section>

      <FieldTeams />


      <p className={styles.foot}>
        Compared with {changes.comparedWith.label}{changes.comparedWith.commit ? ` (commit ${changes.comparedWith.commit}${changes.comparedWith.committedAt ? `, ${shortDate(changes.comparedWith.committedAt, true)}` : ""})` : ""}.{" "}
        Built each Monday by the weekly refresh, after every source has been fetched and before anything is published. A feed that failed or looked
        mid-revision keeps last week&rsquo;s figure, and its date above says so. Rain, soil and reservoirs: APWRIMS. Drought readings: this site&rsquo;s reading
        of the national drought manual, not a declaration. Groundwater: APWRIMS monthly series. El Niño: NOAA CPC.
      </p>
    </div>
  );
}

/** One headline: its figure now, which way it moved, what it was, and the dates of both readings. */
function ChangeCard({ item }: { item: Item }) {
  const comparable = item.before !== null && item.after !== null && Number.isFinite(item.before) && Number.isFinite(item.after) && item.direction !== "same";
  const low = Math.min(0, item.before ?? 0, item.after ?? 0);
  const high = Math.max(0, item.before ?? 0, item.after ?? 0);
  const position = (value: number) => 4 + 92 * (value - low) / (high - low || 1);
  return (
    <Link href={item.href} className={styles.card} data-direction={item.direction ?? "new"} data-key={item.key}>
      <span className={styles.cardLabel}>{item.label}</span>
      <strong className={styles.value}>{format(item.after, item.unit)}</strong>
      <span className={styles.status}>
        <span className={styles.badge}>
          {item.direction ? DIRECTION_TEXT[item.direction] : "First reading"}
          {delta(item) && item.direction !== "same" ? ` · ${delta(item)}` : ""}
        </span>
      </span>
      {comparable ? <span className={styles.comparison} data-testid="weekly-comparison" role="img"
        aria-label={`Previous ${format(item.before, item.unit)}; current ${format(item.after, item.unit)}. Two snapshots, not a trend.`}>
        <span className={styles.comparisonLabels}><span><i className={styles.previousKey} />Previous <b>{format(item.before, item.unit)}</b></span><span><i className={styles.currentKey} />Current <b>{format(item.after, item.unit)}</b></span></span>
        <span className={styles.comparisonTrack}>
          <i className={styles.changeRange} style={{ left: `${Math.min(position(item.before!), position(item.after!))}%`, width: `${Math.abs(position(item.before!) - position(item.after!))}%` }} />
          <i className={styles.beforePoint} style={{ left: `${position(item.before!)}%` }} />
          <i className={styles.afterPoint} style={{ left: `${position(item.after!)}%` }} />
        </span>
        <span className={styles.comparisonAxis}><span>{format(low, item.unit)}</span><span>{format(high, item.unit)}</span></span>
        <span className={styles.comparisonDates}><span>{asOf(item.beforeAsOf)}</span><span>{asOf(item.afterAsOf)}</span></span>
      </span> : null}
      {!comparable || item.refreshed === false ? <span className={styles.dates}>
        {item.beforeAsOf && item.beforeAsOf !== item.afterAsOf ? `${asOf(item.beforeAsOf)} → ${asOf(item.afterAsOf)}` : `As of ${asOf(item.afterAsOf)}`}
        {item.refreshed === false ? " · source has not updated" : ""}
      </span> : null}
      {item.note ? <span className={styles.note}>{item.note}</span> : null}
      <span className={styles.cardLink}>Open evidence <IconArrowRight /></span>
    </Link>
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
      <RowFold id="field-team-rows" total={shown.length} visible={8} noun="mandals">
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
              <tr key={row.index} {...foldAt(rank, 8)}>
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
      </RowFold>
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
