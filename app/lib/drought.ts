/** Drought Watch: India's Manual for Drought Management (2020), applied per mandal.
 *
 * Types and display rules only, safe for client components. The full per-mandal
 * file is read by server code through droughtWatch.ts; client pages that need
 * only counts or a map layer use droughtSummary.ts. */

export type DroughtCategory =
  | "severe" | "moderate|severe" | "moderate" | "normal|moderate" | "normal" | "noTrigger" | "insufficient";
export type ImpactClass = "normal" | "moderate" | "severe";
export type RainClass = "excess" | "normal" | "deficient" | "largeDeficient" | "noRain";
export type SpiClass = "extremelyDry" | "severelyDry" | "moderatelyDry" | "nearNormal" | "wet";
export type HydroBand = "normal" | "mild" | "moderate" | "severe" | "extreme";

export type DroughtMandal = {
  i: number;
  d: string;
  m: string;
  rain: { mm: number; normal: number; dev: number | null; cls: RainClass | null } | null;
  /** Rain as % of normal in each week from 1 June; null where a week is missing. */
  weeks: (number | null)[] | null;
  dry: { longest: number; runs: [number, number][]; set: boolean | null; setLight: boolean | null } | null;
  spi: { v: number; cls: SpiClass; mm: number | null } | null;
  t1: boolean | null;
  t1Why: "drySpell" | "largeDeficient" | "deficitWithoutDrySpell" | "normalRainfall" | "insufficient";
  t1Spi: boolean | null;
  t1Light: boolean | null;
  vci: { v: number; cls: ImpactClass; weeks: (number | null)[] } | null;
  pasm: { v: number; cls: ImpactClass; usual: number | null; severeYears: number | null; years: number | null; prev: number | null } | null;
  gwdi: { v: number; band: HydroBand; cls: ImpactClass; years: number; depth: number; mean: number } | null;
  impact: { rs: ImpactClass | null; sm: ImpactClass | null; hy: ImpactClass | null };
  severity: DroughtCategory;
  category: DroughtCategory;
  categoryLight: DroughtCategory;
  prev: DroughtCategory;
};

export type CategoryCounts = Record<DroughtCategory, number>;

export type DroughtWeek = { start: string; end: string; counted: boolean };
export type DroughtDistrict = {
  district: string;
  mandals: number;
  assessed: number;
  trigger1: number;
  drySpell: number;
  counts: CategoryCounts;
  medianRainDev: number | null;
  medianVci: number | null;
  medianPasm: number | null;
  medianGwdi: number | null;
  sown: { district: string; pctOfNormal: number; sownLakhHa: number | null; cls: ImpactClass } | null;
};
export type DroughtReservoir = {
  name: string; district: string | null; type: string; storageTmc: number; averageTmc: number;
  deficitPct: number | null; band: HydroBand | null; cls: ImpactClass | null; years: number;
};
export type DroughtChange = { i: number; d: string; m: string; from: DroughtCategory; to: DroughtCategory };

export type DroughtWatch = {
  contractVersion: string;
  generatedAt: string;
  manual: { title: string; publisher: string; url: string; tables: Record<string, string> };
  season: { name: string; start: string; asOf: string; declareBy: string; earlyFrom: string; weeks: DroughtWeek[] };
  rules: {
    drySpell: { share: number; weeks: number; weeksLightSoil: number; countedFrom: string | null };
    trigger1Route: string;
    severity: string;
    interpretations: string[];
    groundTruth: { villageShare: number; sitesPerCrop: number; qualifyingLossPct: number; severeLossPct: number };
    irrigationDowngradePct: number;
  };
  sources: {
    rain: { source: string; kind: string; window: { start: string; end: string }; note: string };
    spi: { months: string; baselineFirstYear: number; baselineLastYear: number; product: string; kind: string } | null;
    vci: { product: string; url: string; kind: string; weeks: { year: number; week: number; approxStart: string; approxEnd: string }[];
      averaged: { year: number; week: number; approxStart: string; approxEnd: string }[]; caveat: string } | null;
    pasm: { source: string; kind: string; asOf: string; averaged: string[]; baselineYears: number[] } | null;
    gwdi: { source: string; kind: string; month: string; rule: string } | null;
    rsi: { source: string; kind: string; date: string; years: number[]; notReporting?: string[];
      state: { reservoirs: number; storageTmc: number; averageTmc: number; deficitPct: number | null; band: HydroBand | null } } | null;
    sowing: { source: string; asOf: string; reportedBy: string; url: string; kind: string; note: string;
      state: { sownLakhHa: number; normalLakhHa: number; pctOfNormal: number; cls: ImpactClass } } | null;
  };
  timeline: { end: string; classes: Record<RainClass, number>; drySpell: number; trigger1: number }[];
  state: {
    mandals: number; assessed: number; trigger1: number; trigger1Spi: number; trigger1Light: number; drySpell: number;
    counts: CategoryCounts; countsLight: CategoryCounts; previous: CategoryCounts;
    changes: { worse: DroughtChange[]; better: DroughtChange[]; total: number };
    impactKnown: { rs: number; sm: number; hy: number };
  };
  districts: DroughtDistrict[];
  reservoirs: DroughtReservoir[];
  reservoirDistricts: { district: string; reservoirs: number; storageTmc: number; averageTmc: number; deficitPct: number | null; band: HydroBand | null; cls: ImpactClass | null }[];
  sowingDistricts: { district: string; pctOfNormal: number; sownLakhHa: number | null; cls: ImpactClass }[];
  mandals: DroughtMandal[];
};

export type DroughtSummary = {
  contractVersion: string;
  generatedAt: string;
  season: DroughtWatch["season"];
  manual: DroughtWatch["manual"];
  state: DroughtWatch["state"];
  districts: Pick<DroughtDistrict, "district" | "mandals" | "trigger1" | "counts">[];
  categories: DroughtCategory[];
};

/** Most severe first: the order every legend, stack and count follows. */
export const CATEGORY_ORDER: DroughtCategory[] = ["severe", "moderate|severe", "moderate", "normal|moderate", "normal", "noTrigger", "insufficient"];

export const CATEGORY_META: Record<DroughtCategory, { label: string; short: string; color: string; ink: string; note: string }> = {
  severe: { label: "Severe", short: "Severe", color: "#b23a2e", ink: "#fff",
    note: "Trigger 1 set; at least two impact indicators severe and the third at least moderate." },
  "moderate|severe": { label: "Moderate or severe", short: "Mod–Sev", color: "#d4573a", ink: "#fff",
    note: "Trigger 1 set; the two known impact indicators give moderate, and the missing one would decide severe." },
  moderate: { label: "Moderate", short: "Moderate", color: "#e39a3b", ink: "#2b1a05",
    note: "Trigger 1 set; at least two impact indicators moderate or worse." },
  "normal|moderate": { label: "Normal or moderate", short: "Nor–Mod", color: "#eccb7c", ink: "#2b1a05",
    note: "Trigger 1 set; the missing impact indicator would decide between normal and moderate." },
  normal: { label: "Trigger 1 only", short: "T1 only", color: "#b9d3ae", ink: "#13321d",
    note: "Rainfall trigger set, but the impact indicators read normal: no drought by the manual's matrix." },
  noTrigger: { label: "No trigger", short: "No trigger", color: "#5e9b6b", ink: "#fff",
    note: "No dry spell and rainfall not large-deficient: the manual's first trigger is not set." },
  insufficient: { label: "Not assessed", short: "No data", color: "#c3cad5", ink: "#1d2939",
    note: "No unique gauge record for this prototype boundary, so the manual's first step cannot run." },
};

export const IMPACT_META: Record<ImpactClass, { label: string; color: string }> = {
  severe: { label: "Severe", color: "#b23a2e" },
  moderate: { label: "Moderate", color: "#e39a3b" },
  normal: { label: "Normal", color: "#5e9b6b" },
};

export const RAIN_CLASS_META: Record<RainClass, { label: string; color: string; range: string }> = {
  excess: { label: "Excess", color: "#2789af", range: "+20% or more" },
  normal: { label: "Normal", color: "#5e9b6b", range: "+19% to −19%" },
  deficient: { label: "Deficient", color: "#ce982b", range: "−20% to −59%" },
  largeDeficient: { label: "Large deficient", color: "#b64c42", range: "−60% to −99%" },
  noRain: { label: "No rain", color: "#7a2e27", range: "−100%" },
};

export const SPI_LABEL: Record<SpiClass, string> = {
  extremelyDry: "Extremely dry", severelyDry: "Severely dry", moderatelyDry: "Moderately dry", nearNormal: "Near normal", wet: "Wet",
};

export const HYDRO_LABEL: Record<HydroBand, string> = {
  normal: "Normal", mild: "Mild", moderate: "Moderate", severe: "Severe", extreme: "Extreme",
};

/** The manual's own thresholds, as printed beside each value. */
export const RULES = {
  rain: "Table 3.1 (IMD): normal +19 to −19%, deficient −20 to −59%, large deficient −60 to −99%, no rain −100%.",
  drySpell: "3.2.1 B: consecutive weeks after the monsoon's due onset with under 50% of the week's normal; usually 4 weeks, 3 on light soils.",
  trigger1: "Table 3.11: a dry spell sets Trigger 1. Without one, only large-deficient rainfall (or SPI below −1.5) does.",
  spi: "3.2.1 C: SPI below −1 is a deficit; below −1.5 sets Trigger 1 without a dry spell.",
  vci: "Table 3.4: VCI 60–100 normal, 40–60 moderate, 0–40 severe.",
  pasm: "Table 3.6 (2020): PASM 76–100 no drought, 51–75 moderate, 0–50 severe. The State may recalibrate.",
  gwdi: "Table 3.9: GWDI above −0.15 normal, to −0.30 mild, to −0.45 moderate, to −0.60 severe, below extreme.",
  rsi: "Table 3.8: storage deficit against the last 10 years' average: under 20% normal, 20–30 mild, 30–40 moderate, 40–60 severe, over 60 extreme.",
  sown: "3.2.3.1: sown area under 85% of normal is drought; 75% or less is severe.",
  severity: "3.3.1 Step 2: severe if two of three are severe and the third at least moderate; moderate if two are moderate or worse.",
  groundTruth: "3.2.6: field checks in 10% of villages, about 5 sites per major crop; crop loss of 33% qualifies, over 50% for severe.",
  declaration: "3.4: notify kharif drought by 31 October (extendable by up to 3 weeks for late sowing); NDRF memorandum within a week, if severe.",
} as const;

export function categoryCount(counts: CategoryCounts, keys: DroughtCategory[]) {
  return keys.reduce((sum, key) => sum + (counts[key] ?? 0), 0);
}

/** "Y.S.R Kadapa", "NTR", "Sri Potti Sriramulu Nellore" from the map's capitals. */
export function place(value: string) {
  if (/[a-z]/.test(value)) return value;
  return value.toLowerCase()
    .replace(/(^|[\s(\-/.])([a-z])/g, (_, lead: string, letter: string) => lead + letter.toUpperCase())
    .replace(/\bNtr\b/g, "NTR");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "26 Sep" from an ISO date, as written. Manual rather than Intl, so the server
 * render and the browser's hydration always produce the same text. */
export function shortDate(iso: string, withYear = false) {
  const [year, month, date] = iso.slice(0, 10).split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? month}${withYear ? ` ${year}` : ""}`;
}

function utc(iso: string) {
  const [year, month, date] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

/** An ISO date moved by whole days, with no timezone in the arithmetic. */
export function addDays(iso: string, days: number) {
  return new Date(utc(iso) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((utc(toIso) - utc(fromIso)) / 86_400_000);
}

export function signedPct(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

export function signed(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
}

/** Colour for a value on one of the indicator layers. */
export type DroughtLayer = "outcome" | "rain" | "dry" | "spi" | "vci" | "pasm" | "gwdi";

export const LAYER_META: Record<DroughtLayer, { label: string; legend: { color: string; label: string }[]; note: string }> = {
  outcome: { label: "Manual outcome", legend: CATEGORY_ORDER.map(key => ({ color: CATEGORY_META[key].color, label: CATEGORY_META[key].label })),
    note: "Trigger 1, then three impact indicators, by the manual's matrix. Not a declaration." },
  rain: { label: "Rainfall vs normal", legend: (["excess", "normal", "deficient", "largeDeficient", "noRain"] as RainClass[]).map(key => ({ color: RAIN_CLASS_META[key].color, label: RAIN_CLASS_META[key].label })),
    note: "AP DES gauges via APWRIMS, season to date. Measured." },
  dry: { label: "Longest dry spell", legend: [
    { color: "#e8eef5", label: "0–1 wk" }, { color: "#f2d29b", label: "2 wk" }, { color: "#e39a3b", label: "3 wk" }, { color: "#c65a46", label: "4–5 wk" }, { color: "#7a2e27", label: "6+ wk" }],
    note: "Consecutive weeks under 50% of normal, from 8 June. Measured." },
  spi: { label: "SPI (satellite)", legend: [
    { color: "#5e9b6b", label: "Above −1" }, { color: "#e39a3b", label: "−1 to −1.5" }, { color: "#c65a46", label: "−1.5 to −2" }, { color: "#7a2e27", label: "Below −2" }],
    note: "CHIRPS v3, June to the latest month, against 1981 onward. Satellite estimate." },
  vci: { label: "Vegetation (VCI)", legend: [
    { color: "#5e9b6b", label: "60–100" }, { color: "#e39a3b", label: "40–60" }, { color: "#b23a2e", label: "0–40" }],
    note: "NOAA STAR VHP, 4 km, mean of the last four weeks. Satellite index." },
  pasm: { label: "Soil moisture (PASM)", legend: [
    { color: "#5e9b6b", label: "76–100" }, { color: "#e39a3b", label: "51–75" }, { color: "#b23a2e", label: "0–50" }],
    note: "NRSC VIC model at 30 cm via APWRIMS, four-week mean. Modelled." },
  gwdi: { label: "Groundwater (GWDI)", legend: [
    { color: "#5e9b6b", label: "Normal" }, { color: "#a9c7a3", label: "Mild" }, { color: "#e39a3b", label: "Moderate" }, { color: "#c65a46", label: "Severe" }, { color: "#7a2e27", label: "Extreme" }],
    note: "APWRIMS wells, latest month against the same month since 2014. Measured." },
};

const NO_VALUE = "var(--drought-empty, #d8dee8)";

export function layerColor(layer: DroughtLayer, row: DroughtMandal | undefined, light = false): string {
  if (!row) return NO_VALUE;
  switch (layer) {
    case "outcome":
      return CATEGORY_META[light ? row.categoryLight : row.category].color;
    case "rain":
      return row.rain?.cls ? RAIN_CLASS_META[row.rain.cls].color : NO_VALUE;
    case "dry": {
      const weeks = row.dry?.longest;
      if (weeks === undefined || weeks === null) return NO_VALUE;
      return weeks >= 6 ? "#7a2e27" : weeks >= 4 ? "#c65a46" : weeks === 3 ? "#e39a3b" : weeks === 2 ? "#f2d29b" : "#e8eef5";
    }
    case "spi": {
      const v = row.spi?.v;
      if (v === undefined || v === null) return NO_VALUE;
      return v < -2 ? "#7a2e27" : v < -1.5 ? "#c65a46" : v < -1 ? "#e39a3b" : "#5e9b6b";
    }
    case "vci":
      return row.vci ? IMPACT_META[row.vci.cls].color : NO_VALUE;
    case "pasm":
      return row.pasm ? IMPACT_META[row.pasm.cls].color : NO_VALUE;
    case "gwdi": {
      const band = row.gwdi?.band;
      return band ? { normal: "#5e9b6b", mild: "#a9c7a3", moderate: "#e39a3b", severe: "#c65a46", extreme: "#7a2e27" }[band] : NO_VALUE;
    }
  }
}

export function layerText(layer: DroughtLayer, row: DroughtMandal | undefined, light = false): string {
  if (!row) return "No record";
  switch (layer) {
    case "outcome":
      return CATEGORY_META[light ? row.categoryLight : row.category].label;
    case "rain":
      return row.rain ? `${signedPct(row.rain.dev)} · ${row.rain.cls ? RAIN_CLASS_META[row.rain.cls].label : "—"}` : "No unique gauge record";
    case "dry":
      return row.dry ? `${row.dry.longest} week${row.dry.longest === 1 ? "" : "s"} under 50% of normal` : "No unique gauge record";
    case "spi":
      return row.spi ? `${signed(row.spi.v)} · ${SPI_LABEL[row.spi.cls]}` : "No value";
    case "vci":
      return row.vci ? `${row.vci.v.toFixed(0)} · ${IMPACT_META[row.vci.cls].label}` : "No value";
    case "pasm":
      return row.pasm ? `${row.pasm.v.toFixed(0)}% · ${IMPACT_META[row.pasm.cls].label}` : "No unique model record";
    case "gwdi":
      return row.gwdi ? `${signed(row.gwdi.v)} · ${HYDRO_LABEL[row.gwdi.band]}` : "Under 10 years of record";
  }
}

/** Today's date in India (UTC+5:30, no daylight saving), as an ISO date. */
export function todayInIndia(now = new Date()) {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Days from today (Indian date) to an ISO date; negative once it has passed. */
export function daysUntil(iso: string, now = new Date()) {
  return daysBetween(todayInIndia(now), iso);
}
