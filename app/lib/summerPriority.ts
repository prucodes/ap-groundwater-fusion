import priorityJson from "../data/summer_priority.json";
import { csvBanner } from "./csv";

/* Where to plan summer drinking water first (phase3_levels/build_summer_priority.py):
   the mandals heading past their deepest May, ordered by how many independent signs
   from this season agree. Server code only. */

export type PrioritySign = "storms" | "monsoon" | "tanks" | "quality";
export type PriorityBand = "first" | "next" | "watch";

export type PriorityRow = {
  index: number; id: string | null; mandal: string; district: string; band: PriorityBand; tier: "beyond" | "dry"; deep: boolean;
  nowM: number; typicalM: number; dryM: number; deepestMayM: number; pastRecordM: number;
  people: number | null; sources: number | null; testedAboveLimitPct: number | null;
  stormMm: number | null; monsoon: "short" | "severe" | null; tankNowPct: number | null; tankUsualPct: number | null;
  signs: PrioritySign[];
};

type Tally = { mandals: number; people: number; sources: number; deep: number; signs: Record<PrioritySign, number> };

export type SummerPriority = {
  generatedAt: string; targetMay: string; anchor: string; deepM: number;
  rules: { stormDryMm: number; tankGapPoints: number; minTested: number; stateAboveLimitPct: number | null; firstSigns: number; watchSigns: number };
  summary: Record<PriorityBand, Tally>;
  districts: Array<{ district: string; first: number; next: number; watch: number; people: number }>;
  mandals: PriorityRow[];
};

export const summerPriority = priorityJson as unknown as SummerPriority;

export const SIGNS: PrioritySign[] = ["storms", "monsoon", "tanks", "quality"];

/** Each sign in a few words, and what it rests on. */
export function signLabel(sign: PrioritySign, rules = summerPriority.rules) {
  return {
    storms: { short: "Cyclones missed it", long: `under ${rules.stormDryMm} mm from Arnab and Murasu together (State rain gauges)` },
    monsoon: { short: "Monsoon recharge fell short", long: "a provisional shortfall flag on the monsoon recharge watch (APWRIMS readings)" },
    tanks: { short: "Tanks emptier than usual", long: `village tanks hold ${rules.tankGapPoints} points less water than usual for the time of year (Sentinel-2)` },
    quality: { short: "Sources failing tests", long: `drinking-water sources failing chemical tests at or above the State's ${rules.stateAboveLimitPct ?? "–"}% (Jal Jeevan Mission)` },
  }[sign];
}

export const BAND_LABEL: Record<PriorityBand, string> = {
  first: "Plan first",
  next: "Plan next",
  watch: "Watch",
};

const cell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The whole list as a file a district office can work from: every reason as its own column. */
export function priorityCsv(p: SummerPriority = summerPriority) {
  const head = ["band", "rank", "district", "mandal", "people", "drinking_water_sources", "typical_may_depth_m", "deepest_may_on_record_m",
    "past_record_m", "signs", "cyclone_rain_mm", "monsoon_flag", "tank_water_now_pct", "tank_water_usual_pct", "sources_above_chemical_limit_pct"];
  const ranks: Record<PriorityBand, number> = { first: 0, next: 0, watch: 0 };
  const lines = p.mandals.map((r) => [
    BAND_LABEL[r.band], ++ranks[r.band], r.district, r.mandal, r.people, r.sources, r.typicalM, r.deepestMayM, r.pastRecordM,
    r.signs.map((s) => signLabel(s, p.rules).short).join("; "), r.stormMm, r.monsoon, r.tankNowPct, r.tankUsualPct, r.testedAboveLimitPct,
  ].map(cell).join(","));
  const banner = csvBanner([
    `Summer ${p.targetMay.slice(0, 4)} drinking-water priority, from the ${p.anchor} APWRIMS groundwater readings, refreshed weekly.`,
    `Plan first: heading past its deepest May in a typical winter, and at least ${p.rules.firstSigns} of the four signs agree. Plan next: heading past it, fewer signs. Watch: past it only in a winter as dry as its driest, more than ${p.deepM} m down, and at least ${p.rules.watchSigns} signs agree.`,
    `Signs: ${SIGNS.map((s) => `${signLabel(s, p.rules).short}, ${signLabel(s, p.rules).long}`).join(". ")}.`,
    `An order to start planning in, not a forecast of wells failing: the depth a well fails at depends on how deep it was drilled, which no public record gives. People: WorldPop 2020, modelled.`,
  ]);
  return [banner, head.join(","), ...lines].join("\n") + "\n";
}
