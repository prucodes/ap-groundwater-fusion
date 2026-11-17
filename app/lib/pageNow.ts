import changesJson from "../data/weekly_changes.json";
import { droughtSummary } from "./droughtSummary";
import { stateSummary } from "./stateSummary";
import { waterSummary } from "./waterSummary";
import sensorsState from "../data/gw_sensors_state.json";

/* "What it says now" for the page briefs, from the small summary files only (a few KB each),
   so a client page can import it without carrying the full data. Pages with their own heavy
   data on the server write their line themselves. */

const DAYS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${Number(m[3])} ${DAYS[Number(m[2]) - 1]}` : "";
};
const pct = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${Math.round(value)}%`);
const metres = (value: number) => `${value.toFixed(1)} m`;
type Item = { key: string; after: number | null };
const item = (key: string) => (changesJson as unknown as { items: Item[] }).items.find(i => i.key === key)?.after ?? null;

/** The State's water table now: today's automatic sensors, each against itself a year ago. The
    September well snapshot (a different network and aggregation) stands in only if they are missing. */
export function wellsNow() {
  const live = sensorsState?.state;
  if (live && live.compared) {
    const deeper = Math.round((100 * live.deeperThanYearAgo) / live.compared);
    return `The State's ${live.active.toLocaleString("en-IN")} reporting sensors read a median ${metres(live.medianM)} below ground on ${day(sensorsState.latestReading)}; ${deeper}% are deeper than on the same date last year.`;
  }
  const s = stateSummary.state;
  if (!s || s.currentM === null) return null;
  const change = s.vsYearAgoM;
  return `The State's ${s.stationsTotal.toLocaleString("en-IN")} wells averaged ${metres(s.currentM)} below ground on ${day(s.date)}${change !== null ? `, ${metres(Math.abs(change))} ${change >= 0 ? "deeper" : "shallower"} than a year ago` : ""}.`;
}

export function groundwaterStressNow() {
  const stress = item("gwStress");
  const wells = wellsNow();
  return [wells, stress !== null ? `${stress} mandals read groundwater stress.` : null].filter(Boolean).join(" ");
}

export function droughtNow() {
  const s = droughtSummary.state as unknown as { assessed: number; trigger1: number; counts: Record<string, number> };
  return `${s.counts.severe ?? 0} mandals read severe and ${s.counts.moderate ?? 0} moderate on the manual's indicators; ${s.trigger1} of ${s.assessed} meet its rainfall trigger.`;
}

export function districtsNow() {
  // Districts with gauge rain only: the summary also carries a Karnataka district for its reservoir, with no rain of its own.
  const rows = (waterSummary.districts ?? []).filter(d => d.rain);
  const short = rows.filter(d => d.rain?.category === "deficient" || d.rain?.category === "scanty").length;
  const res = waterSummary.reservoirs as unknown as { storagePct?: number | null; lastYearPct?: number | null } | null;
  return `Rain since 1 June is deficient or scanty in ${short} of ${rows.length} districts${res?.storagePct !== undefined ? `; reservoirs hold ${pct(res.storagePct)} against ${pct(res.lastYearPct)} a year ago` : ""}.`;
}

export function rainNow() {
  const rain = waterSummary.rain;
  const soil = waterSummary.soil as unknown as { belowOwnMedian: number; withBaseline: number } | null;
  const dev = rain?.deviationPct ?? null;
  return `Gauge rain since 1 June is ${dev !== null ? `${Math.abs(Math.round(dev))}% ${dev < 0 ? "below" : "above"}` : "–"} normal${soil ? `; soil is drier than its usual for the date in ${soil.belowOwnMedian} of ${soil.withBaseline} mandals` : ""}.`;
}
