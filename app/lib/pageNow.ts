import changesJson from "../data/weekly_changes.json";
import { droughtSummary } from "./droughtSummary";
import sensorState from "../data/gw_sensors_state.json";
import { waterSummary } from "./waterSummary";

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

/** The State's wells, as the latest snapshot reads them. */
export function wellsNow() {
  const s = sensorState.state;
  return `Daily sensor snapshot, ${day(sensorState.latestReading)}: ${s.active.toLocaleString("en-IN")} reporting automatic recorders, median depth ${metres(s.medianM)} below ground, against ${metres(s.medianYearAgoM)} for the same sensors a year ago.`;
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
  const rows = waterSummary.districts ?? [];
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
