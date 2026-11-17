import changesJson from "../data/weekly_changes.json";
import { shortDate } from "./drought";

/* The week-on-week comparison build_weekly_changes.py writes each Monday, with the one way
   its figures are written out, shared by This Week and the weekly film so the two can never
   print the same reading differently. */

export type Item = {
  key: string; label: string; unit: string; better: "higher" | "lower" | "context"; href: string;
  before: number | null; after: number | null; beforeAsOf: string | null; afterAsOf: string | null;
  change: number | null; direction: "better" | "worse" | "same" | "moved" | null; refreshed: boolean | null; note?: string;
};
export type Mover = { i?: number; id?: string; d?: string; m?: string; mandal?: string; district?: string; from: string; to: string; worse?: boolean };
export type Changes = {
  generatedAt: string;
  comparedWith: { label: string; commit?: string; committedAt?: string };
  items: Item[];
  groundwater: { worse: number; better: number; moved: Mover[]; truncated: boolean; latestMonth: { before: string | null; after: string | null } };
  drought: { worse: Mover[]; better: Mover[]; basis: string };
  counts: { better: number; worse: number; same: number; unknown: number; revised?: number };
};

export const changes = changesJson as unknown as Changes;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function asOf(value: string | null) {
  if (!value) return "–";
  if (/^\d{4}-\d{2}$/.test(value)) return `${MONTHS[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`;
  return shortDate(value, true);
}

export function format(value: number | null, unit: string) {
  if (value === null) return "–";
  if (unit === "%") return `${value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
  if (unit === "°C") return `${value > 0 ? "+" : ""}${value.toFixed(2)} °C`;
  return String(value);
}

export function delta(item: Item) {
  if (item.change === null) return null;
  const sign = item.change > 0 ? "+" : item.change < 0 ? "−" : "±";
  const size = Math.abs(item.change);
  const unit = item.unit === "%" ? " pts" : item.unit === "°C" ? " °C" : "";
  return `${sign}${item.unit === "°C" ? size.toFixed(2) : item.unit === "%" ? size.toFixed(1) : size}${unit}`;
}

/** Moved figures lead, worse first; the ones that held steady follow. */
const ORDER: Record<string, number> = { worse: 0, better: 1, moved: 2, revised: 3, new: 4, same: 5 };
export function sortedItems() {
  const rank = (item: Item) => ORDER[item.direction ?? "new"];
  return changes.items.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(({ item }) => item);
}
