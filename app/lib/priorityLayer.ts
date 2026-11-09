import priorityJson from "../data/summer_priority.json";
import type { PriorityBand, PriorityRow, PrioritySign, SummerPriority } from "./summerPriority";

/* The summer drinking-water priority as a map layer: one colour per group, keyed
   "DISTRICT|MANDAL" like the other mandal layers so a fill is one lookup. Safe for
   the browser: it reads only summer_priority.json (about 50 KB). */

const priority = priorityJson as unknown as SummerPriority;

export const PRIORITY_COLORS: Record<PriorityBand | "none", string> = {
  first: "#a33b2c",
  next: "#e7a69a",
  watch: "#e0a24a",
  none: "#e4e8eb",
};

export const PRIORITY_BAND_WORDS: Record<PriorityBand, string> = {
  first: "Plan first",
  next: "Plan next",
  watch: "Watch",
};

export const PRIORITY_SIGN_WORDS: Record<PrioritySign, string> = {
  storms: "Cyclones missed it",
  monsoon: "Monsoon recharge fell short",
  tanks: "Tanks emptier than usual",
  quality: "Sources failing tests",
};

const key = (district: string, mandal: string) => `${district.toUpperCase()}|${mandal.toUpperCase()}`;
const byKey = new Map<string, PriorityRow>(priority.mandals.map((row) => [key(row.district, row.mandal), row]));

export type PriorityLayer = "drinking_priority";
export function isPriorityLayer(layer: string | null | undefined): layer is PriorityLayer {
  return layer === "drinking_priority";
}

export const PRIORITY_LAYER_META: Record<PriorityLayer, { label: string; badge: string; period: string; note: string }> = {
  drinking_priority: {
    label: "Drinking-water priority",
    badge: `Summer ${priority.targetMay.slice(0, 4)}`,
    period: `summer ${priority.targetMay.slice(0, 4)}, from the ${priority.anchor} readings`,
    note: "Plan first: heading past its deepest May in a typical winter, and at least two of four signs agree (the cyclones missed it, "
      + "the monsoon recharge fell short, its village tanks are emptier than usual, its drinking-water sources fail chemical tests at or "
      + "above the State's rate). Plan next: heading past it, fewer signs. Watch: past it only in a dry winter, more than "
      + `${priority.deepM} m down, three or more signs. An order to start planning in, not a forecast of wells failing.`,
  },
};

export function priorityFor(district: string, mandal: string) {
  return byKey.get(key(district, mandal)) ?? null;
}

export function priorityColor(district: string, mandal: string) {
  const row = priorityFor(district, mandal);
  return row ? PRIORITY_COLORS[row.band] : PRIORITY_COLORS.none;
}

export function priorityText(district: string, mandal: string): string | null {
  const row = priorityFor(district, mandal);
  if (!row) return null;
  const signs = row.signs.length ? row.signs.map((s) => PRIORITY_SIGN_WORDS[s].toLowerCase()).join(", ") : "no other sign yet";
  return `${PRIORITY_BAND_WORDS[row.band]} · ${row.pastRecordM.toFixed(1)} m past its deepest May · ${signs}`;
}

export function priorityLegend() {
  return (["first", "next", "watch"] as PriorityBand[]).map((band) => ({
    key: band, label: PRIORITY_BAND_WORDS[band], color: PRIORITY_COLORS[band], count: priority.summary[band].mandals,
  }));
}

export const prioritySummary = priority.summary;
