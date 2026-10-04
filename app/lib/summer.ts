import outlookJson from "../data/summer_outlook.json";
import { GEC_CATEGORIES, type GecCategory } from "./agriculture";
import { mapGeometry, titleCase } from "./data";
import { fieldSignals } from "./fieldSignalsServer";

/* The summer drinking-water outlook (phase3_levels/build_summer_outlook.py): each
   mandal's May depth projected from its latest APWRIMS reading and its own past
   winters, against its own deepest May on record. Server code only (~125 KB). */

export type SummerTier = "beyond" | "dry" | "within";
type Projection = {
  anchor: number; typical: number; dry: number; deepestMay: number; winters: number; medianDrawdown: number; maxDrawdown: number;
  tier: SummerTier; anchorMonth: string; district: string; mandal: string; people?: number | null;
};
type Outlook = {
  generatedAt: string; source: string; anchor: string; targetMay: string; firstYear: number; method: string; deepM: number;
  summary: { mandals: number; beyond: number; dry: number; within: number; beyondDeep: number; dryDeep: number; series: number; boundaries: number };
  people: { source: string; year: number; beyond: number; beyondDeep: number; dry: number; dryDeep: number } | null;
  backtest: {
    anchorMonth: string; comparisons: number; years: number[]; typicalErrorM: number; persistenceErrorM: number; withinDryPct: number;
    pastRecordPct: Record<SummerTier, number | null>; tierCounts: Record<SummerTier, number>; baseRatePct: number; recordsFlaggedPct: number | null;
    byYear: Array<{ may: number; comparisons: number; medianErrorM: number }>;
  } | null;
  districts: Array<{ district: string; beyond: number; dry: number; within: number; deep: number; people: number; mandals: number }>;
  mandals: Array<Projection | null>;
};

const raw = outlookJson as unknown as Outlook;
/** District names arrive in the outlines' capitals; shown as the rest of the site shows them. */
export const summerOutlook: Outlook = { ...raw, districts: raw.districts.map(d => ({ ...d, district: /[a-z]/.test(d.district) ? d.district : titleCase(d.district) })) };

/** People in Indian notation: 5.6 lakh, 1.3 crore. */
export function lakhs(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(n >= 1e8 ? 0 : 1)} crore`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} lakh`;
  return Math.round(n).toLocaleString("en-IN");
}

export const SUMMER_TIERS: Record<SummerTier, { label: string; short: string; color: string; key: string }> = {
  beyond: { label: "Deeper than any May on record, in a typical winter", short: "Beyond its record", color: "#a33b2c", key: "x" },
  dry: { label: "Deeper than any May on record only if the winter is as dry as its driest", short: "In a dry winter", color: "#e0a24a", key: "d" },
  within: { label: "Within its record either way", short: "Within its record", color: "#8fbfa6", key: "w" },
};

/** Beyond its record but still within 10 m of the surface: a record, if a shallow one. */
export const SHALLOW_BEYOND = { short: "Beyond its record, under 10 m", color: "#e7a69a", key: "s" };

const place = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));

/** Every boundary's projection with its place and the official category, for the page's map and table. */
export function summerRows() {
  const gw = fieldSignals.assessment?.mandals ?? [];
  return summerOutlook.mandals.map((row, index) => {
    const feature = mapGeometry.mandals[index];
    const category = gw[index]?.cat ?? null;
    return row ? {
      ...row, index, district: place(feature?.d ?? row.district), mandal: place(feature?.m ?? row.mandal),
      margin: Math.round((row.typical - row.deepestMay) * 100) / 100,
      deep: (row.tier === "beyond" ? row.typical : row.dry) >= summerOutlook.deepM,
      category: category as GecCategory | null, categoryLabel: category ? GEC_CATEGORIES[category as GecCategory].label : null,
    } : null;
  });
}
