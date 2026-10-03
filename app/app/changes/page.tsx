import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import changesJson from "../../data/weekly_changes.json";
import { CATEGORY_META, place, shortDate } from "../../lib/drought";
import styles from "./Changes.module.css";

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
        subtitle={<>What moved since the data the site was showing before this refresh. Each figure keeps its own date, because the sources run on different clocks. Nothing here is recomputed; every number is read from a published file.</>}
        showChips={false}
        variant="compact"
      />

      <section className={styles.summary} aria-label="Week at a glance">
        <div className={styles.summaryText}>
          <span className={styles.kicker}>Refresh of {shortDate(changes.generatedAt, true)}</span>
          <h2>
            {first
              ? "Every figure below is this week's reading. The first week-on-week comparison lands with the next Monday refresh."
              : `${changes.counts.worse} headline${changes.counts.worse === 1 ? "" : "s"} worse, ${changes.counts.better} better, ${changes.counts.same} unchanged.`}
          </h2>
          <p>Compared with {changes.comparedWith.label}{changes.comparedWith.commit ? ` (commit ${changes.comparedWith.commit}${changes.comparedWith.committedAt ? `, ${shortDate(changes.comparedWith.committedAt, true)}` : ""})` : ""}.</p>
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
