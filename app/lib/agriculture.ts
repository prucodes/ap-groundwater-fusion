import type { MonsoonWatch } from "./data";
import type { MandalGroundwaterRecordV2 } from "./types";

export type WaterSignal = "severe" | "short" | "normal" | "unavailable";
export const WATER_SIGNALS: Record<WaterSignal, { label: string; color: string }> = {
  severe: { label: "Larger shortfall", color: "#b64c42" },
  short: { label: "Flagged shortfall", color: "#ce982b" },
  normal: { label: "Not flagged", color: "#5e9c89" },
  unavailable: { label: "Unresolved / missing", color: "#b7c2c6" },
};

export type AgricultureMandal = {
  index: number;
  id: string | null;
  district: string;
  mandal: string;
  path: string;
  signal: WaterSignal;
  reason: string | null;
  depthM: number | null;
  changeM: number | null;
  typicalM: number | null;
  shortfallM: number | null;
  comparableYears: number | null;
  sourceStatus: string;
};

export type AgricultureDistrict = {
  name: string;
  total: number;
  compared: number;
  flagged: number;
  severe: number;
  medianShortfallM: number | null;
};

export type AgricultureEvidence = {
  period: string;
  startPeriod: string;
  generatedAt: string;
  mandals: AgricultureMandal[];
  districts: AgricultureDistrict[];
  counts: { boundaries: number; compared: number; flagged: number; severe: number; unresolved: number; unmappedSeries: number; ambiguousBoundaries: number };
  rainfall: MonsoonWatch["rainfall"];
  cropExposureHa: null;
  cropReadiness: "not_connected";
};

const key = (district: string, mandal: string) => `${district.trim().toUpperCase()}|${mandal.trim().toUpperCase()}`;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const round = (value: number) => Math.round(value * 100) / 100;
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2);
}

/** One result per prototype boundary, never one per raw source series.
 * Ambiguous joins remain missing rather than selecting the first or worst row. */
export function buildAgricultureEvidence(
  watch: MonsoonWatch,
  records: MandalGroundwaterRecordV2[],
  features: Array<{ d: string; m: string; path: string }>,
): AgricultureEvidence {
  const recordsByPlace = new Map<string, MandalGroundwaterRecordV2[]>();
  for (const record of records) {
    const name = key(record.identity.districtName, record.identity.mandalName);
    recordsByPlace.set(name, [...(recordsByPlace.get(name) ?? []), record]);
  }
  const byBoundary = new Map<number, MonsoonWatch["mandals"]>();
  let unmappedSeries = 0;
  for (const row of watch.mandals) {
    const index = row.boundaryIndex;
    if (index === null || !Number.isInteger(index) || index < 0 || index >= features.length) {
      unmappedSeries++;
      continue;
    }
    byBoundary.set(index, [...(byBoundary.get(index) ?? []), row]);
  }
  let ambiguousBoundaries = 0;
  const mandals = features.map((feature, index): AgricultureMandal => {
    const candidates = byBoundary.get(index) ?? [];
    const matches = recordsByPlace.get(key(feature.d, feature.m)) ?? [];
    const record = matches.length === 1 ? matches[0] : null;
    const row = candidates.length === 1 ? candidates[0] : null;
    if (candidates.length > 1 || matches.length > 1) ambiguousBoundaries++;
    let reason: string | null = null;
    if (candidates.length > 1 || matches.length > 1) reason = "Multiple source series or identities share this boundary. Reconciliation required.";
    else if (!row) reason = "No comparable seasonal source series is linked to this boundary.";
    else if (!record || !record.identity.joinedSourceSeriesIds.includes(row.mandalUuid)) reason = "Seasonal source identity does not match the groundwater record. Verification required.";
    else if (![row.latestDepthM, row.thisSeasonM, row.typicalM, row.shortfallM, row.comparableYears].every(finite) || row.comparableYears < 7) reason = "Insufficient valid measurements or comparable seasons.";
    const usable = row !== null && reason === null;
    return {
      index, id: record?.identity.mandalId ?? null, district: feature.d, mandal: feature.m, path: feature.path,
      signal: usable ? row.status : "unavailable", reason,
      depthM: usable ? row.latestDepthM : null, changeM: usable ? row.thisSeasonM : null,
      typicalM: usable ? row.typicalM : null, shortfallM: usable ? row.shortfallM : null,
      comparableYears: usable ? row.comparableYears : null,
      sourceStatus: record?.observation?.authorizationStatus === "authorized" ? "Authorized source" : "Research sample; authorization pending",
    };
  });
  const names = [...new Set(mandals.map(row => row.district))].sort();
  const districts = names.map((name): AgricultureDistrict => {
    const rows = mandals.filter(row => row.district === name);
    const compared = rows.filter(row => row.signal !== "unavailable");
    return {
      name, total: rows.length, compared: compared.length,
      flagged: rows.filter(row => row.signal === "short" || row.signal === "severe").length,
      severe: rows.filter(row => row.signal === "severe").length,
      medianShortfallM: median(compared.map(row => row.shortfallM!)),
    };
  }).sort((a, b) => b.flagged - a.flagged || a.name.localeCompare(b.name));
  const compared = mandals.filter(row => row.signal !== "unavailable").length;
  return {
    period: watch.season.latestMonth, startPeriod: watch.season.preMonsoonMonth, generatedAt: watch.generatedAt,
    mandals, districts,
    counts: {
      boundaries: mandals.length, compared,
      flagged: mandals.filter(row => row.signal === "short" || row.signal === "severe").length,
      severe: mandals.filter(row => row.signal === "severe").length,
      unresolved: mandals.length - compared, unmappedSeries, ambiguousBoundaries,
    },
    rainfall: watch.rainfall, cropExposureHa: null, cropReadiness: "not_connected",
  };
}

// FAO-56 Table 12 standard-condition coefficients. These are reference
// endpoints, not AP-calibrated calendars or crop-specific watering advice.
export const CROP_REFERENCE = {
  maize: { name: "Maize", kc: [0.3, 1.2, 0.35], note: "Grain maize; end coefficient assumes field-dried grain." },
  groundnut: { name: "Groundnut", kc: [0.4, 1.15, 0.6], note: "Groundnut; standard-condition reference coefficients." },
} as const;
export type CropKey = keyof typeof CROP_REFERENCE;
export const CROP_STAGES = ["Initial", "Mid-season", "End-season"] as const;
export const CROP_REFERENCE_URL = "https://www.fao.org/4/x0490e/x0490e0b.htm";
export const DEFAULT_BUDGET = { crop: "maize" as CropKey, stage: 1, eto: 4, rain: 8, reserve: 14 };

/** Illustrative seven-day total only. Effective rain is already net of losses;
 * no irrigation, capillary rise or intraperiod timing is represented. */
export function cropWaterBudget(input: { crop: CropKey; stage: number; eto: number; rain: number; reserve: number }) {
  if (!Object.hasOwn(CROP_REFERENCE, input.crop) || !Number.isInteger(input.stage) || input.stage < 0 || input.stage > 2 ||
      ![input.eto, input.rain, input.reserve].every(value => finite(value) && value >= 0)) {
    throw new RangeError("Crop water budget requires valid, non-negative scenario inputs.");
  }
  const kc = CROP_REFERENCE[input.crop].kc[input.stage];
  const demand = round(7 * input.eto * kc);
  const rainUsed = Math.min(input.rain, demand);
  const reserveUsed = Math.min(input.reserve, Math.max(0, demand - rainUsed));
  return {
    days: 7, kc, demand, rainUsed: round(rainUsed), reserveUsed: round(reserveUsed),
    gap: round(Math.max(0, demand - rainUsed - reserveUsed)),
    remainingReserve: round(input.reserve - reserveUsed),
    unusedRain: round(input.rain - rainUsed),
  };
}

export function agricultureCsv(rows: AgricultureMandal[], evidence: Pick<AgricultureEvidence, "period" | "startPeriod">) {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[=+@-]/.test(text) && typeof value !== "number") text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    "# Agriculture water watch - PROTOTYPE; not a crop-loss estimate or irrigation instruction.",
    `# Period: ${evidence.startPeriod} to ${evidence.period}. One row per prototype boundary; unresolved joins retained.`,
    "# Positive change means deeper groundwater. Crop area, crop stage and supply records are not connected.",
    "# Seasonal baseline review pending. Flags are provisional; not approved operational advisories.",
    ["district", "mandal", "mandal_id", "water_signal", "depth_mbgl", "season_change_m", "typical_change_m", "shortfall_m", "comparable_years", "source_status", "missing_reason", "crop_exposure_ha"].join(","),
    ...rows.map(row => [row.district, row.mandal, row.id, row.signal, row.depthM, row.changeM, row.typicalM, row.shortfallM, row.comparableYears, row.sourceStatus, row.reason, null].map(cell).join(",")),
  ].join("\n");
}
