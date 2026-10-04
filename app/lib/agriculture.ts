import type { MonsoonWatch, RainCategory, ReservoirTotals, WaterContext } from "./data";
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
  /** Drawn with the State's official outline (AWARE, rebuilt) rather than the public prototype. */
  officialOutline: boolean;
  signal: WaterSignal;
  reason: string | null;
  depthM: number | null;
  changeM: number | null;
  typicalM: number | null;
  shortfallM: number | null;
  comparableYears: number | null;
  sourceStatus: string;
  /** Modelled available soil moisture at the headline depth, set against the same day in earlier years. */
  soil: { pct: number; weekAgoPct: number | null; median: number | null; rankDriest: number | null; ofYears: number | null } | null;
  /** Measured gauge rainfall, water year to date, against the department's normal. */
  rain: { actualMm: number; normalMm: number; deviationPct: number; category: RainCategory | null; gauges: number | null } | null;
  /** Whether each source points to water stress here: true, false, or null when that source has no usable value. */
  agreement: Agreement;
};

/** A count of sources that point the same way, not a score: each test is stated in AGREEMENT_RULES. */
export type Agreement = { groundwater: boolean | null; rain: boolean | null; soil: boolean | null; stressed: number; known: number };
export const AGREEMENT_RULES = {
  groundwater: "Seasonal groundwater shortfall flagged (measured APWRIMS wells, against the mandal's own past seasons)",
  rain: "Gauge rainfall deficient or worse: 20% or more below the department's normal, water year to date (measured)",
  soil: "Soil moisture at 30 cm among the driest quarter of years for this date (modelled; the model is driven by rainfall, so it is not independent of it)",
} as const;
const RAIN_SHORT = new Set<RainCategory>(["deficient", "scanty", "noRain"]);

function agreementOf(signal: WaterSignal, soil: AgricultureMandal["soil"], rain: AgricultureMandal["rain"]): Agreement {
  const groundwater = signal === "unavailable" ? null : signal === "short" || signal === "severe";
  const rainShort = rain?.category ? RAIN_SHORT.has(rain.category) : null;
  const soilDry = soil?.rankDriest && soil.ofYears ? soil.rankDriest <= Math.max(1, Math.floor(soil.ofYears / 4)) : null;
  const tests = [groundwater, rainShort, soilDry];
  return { groundwater, rain: rainShort, soil: soilDry, stressed: tests.filter(test => test === true).length, known: tests.filter(test => test !== null).length };
}

export type AgricultureWater = {
  soil: {
    asOf: string | null; asOfNote: string | null; weekAgo: string; depthCm: number; medianPct: number | null;
    driestOnRecord: number; belowOwnMedian: number; withBaseline: number; mandals: number;
    baselineYears: [number, number] | null; source: string; url: string;
  } | null;
  rain: {
    start: string; end: string; deviationPct: number | null; gauges: number; mandals: number;
    categories: Record<RainCategory, number>; source: string; url: string;
  } | null;
  reservoirs: {
    asOf: string | null; state: ReservoirTotals; byBasin: Array<ReservoirTotals & { basin: string }>; staleCount: number;
    topCanalReleases: Array<{ reservoir: string; outlet: string; cusecs: number }>; releasingToCanals: number;
    releaseNote: string; source: string; url: string;
  } | null;
};

export type AgricultureDistrict = {
  name: string;
  total: number;
  compared: number;
  flagged: number;
  severe: number;
  medianShortfallM: number | null;
  /** Boundary units where groundwater, gauge rain and soil all point to stress. */
  agreeAll: number;
};

export type AgricultureEvidence = {
  period: string;
  startPeriod: string;
  generatedAt: string;
  mandals: AgricultureMandal[];
  districts: AgricultureDistrict[];
  counts: {
    boundaries: number; compared: number; flagged: number; severe: number; unresolved: number; unmappedSeries: number; ambiguousBoundaries: number;
    /** All three sources usable / all three pointing to stress / exactly two pointing to stress. */
    allKnown: number; agreeAll: number; agreeTwo: number;
  };
  rainfall: MonsoonWatch["rainfall"];
  water: AgricultureWater;
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

/** At most one row per boundary. A boundary claimed by two rows maps to null:
 * ambiguous, so neither value is shown. */
function uniqueByBoundary<T extends { boundaryIndex: number | null }>(rows: T[] | undefined, size: number) {
  const out = new Map<number, T | null>();
  for (const row of rows ?? []) {
    const index = row.boundaryIndex;
    if (index === null || !Number.isInteger(index) || index < 0 || index >= size) continue;
    out.set(index, out.has(index) ? null : row);
  }
  return out;
}

function summarizeWater(water: WaterContext | null | undefined): AgricultureWater {
  const soil = water?.soilMoisture, rain = water?.rainfall, store = water?.reservoirs;
  const canal = (store?.reservoirs ?? []).flatMap(r => r.releases.filter(o => o.kind === "canal" && o.cusecs > 0).map(o => ({ reservoir: r.name, outlet: o.outlet, cusecs: o.cusecs })));
  return {
    soil: soil ? {
      asOf: soil.asOf, asOfNote: soil.asOfNote, weekAgo: soil.weekAgo, depthCm: soil.headlineDepthCm, medianPct: soil.summary.medianPct,
      driestOnRecord: soil.summary.driestOnRecord, belowOwnMedian: soil.summary.belowOwnMedian, withBaseline: soil.summary.withBaseline,
      mandals: soil.summary.mandals, baselineYears: soil.baseline.firstYear !== null && soil.baseline.lastYear !== null ? [soil.baseline.firstYear, soil.baseline.lastYear] : null,
      source: soil.source, url: soil.url,
    } : null,
    rain: rain ? {
      start: rain.window.start, end: rain.window.end, deviationPct: rain.state.deviationPct, gauges: rain.state.gauges,
      mandals: rain.summary.mandals, categories: rain.categories, source: rain.source, url: rain.url,
    } : null,
    reservoirs: store ? {
      asOf: store.asOf, state: store.state, byBasin: store.byBasin, staleCount: store.staleCount,
      // Releases are not summed: a balancing reservoir fed by one canal releases
      // the same water again into the next, so a total would count it twice.
      topCanalReleases: canal.sort((a, b) => b.cusecs - a.cusecs).slice(0, 6),
      releasingToCanals: new Set(canal.map(release => release.reservoir)).size,
      releaseNote: store.releaseNote, source: store.source, url: store.url,
    } : null,
  };
}

/** The outline a row is drawn with, worded as boundaryLabel in lib/data (which
 * client code cannot import without the data it carries). */
export function outlineLabel(row: Pick<AgricultureMandal, "officialOutline">) {
  return row.officialOutline ? "Official boundary (AWARE, rebuilt)" : "Public prototype boundary";
}

/** One result per boundary unit, never one per raw source series.
 * Ambiguous joins remain missing rather than selecting the first or worst row. */
export function buildAgricultureEvidence(
  watch: MonsoonWatch,
  records: MandalGroundwaterRecordV2[],
  features: Array<{ d: string; m: string; path: string; src?: string }>,
  water?: WaterContext | null,
): AgricultureEvidence {
  const soilRows = uniqueByBoundary(water?.soilMoisture?.mandals, features.length);
  const rainRows = uniqueByBoundary(water?.rainfall?.mandals, features.length);
  const depth = water?.soilMoisture ? water.soilMoisture.depthsCm.indexOf(water.soilMoisture.headlineDepthCm) : -1;
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
    const soilRow = soilRows.get(index), rainRow = rainRows.get(index);
    const signal: WaterSignal = usable ? row.status : "unavailable";
    const soil: AgricultureMandal["soil"] = soilRow && depth >= 0 && finite(soilRow.pct[depth]) ? {
      pct: soilRow.pct[depth], weekAgoPct: soilRow.weekAgoPct, median: soilRow.baseline?.median ?? null,
      rankDriest: soilRow.baseline?.rankDriest ?? null, ofYears: soilRow.baseline?.ofYears ?? null,
    } : null;
    const rain: AgricultureMandal["rain"] = rainRow ? { actualMm: rainRow.actualMm, normalMm: rainRow.normalMm, deviationPct: rainRow.deviationPct, category: rainRow.category, gauges: rainRow.gauges } : null;
    return {
      index, id: record?.identity.mandalId ?? null, district: feature.d, mandal: feature.m, path: feature.path,
      officialOutline: feature.src === "official",
      signal, reason,
      depthM: usable ? row.latestDepthM : null, changeM: usable ? row.thisSeasonM : null,
      typicalM: usable ? row.typicalM : null, shortfallM: usable ? row.shortfallM : null,
      comparableYears: usable ? row.comparableYears : null,
      sourceStatus: record?.observation?.authorizationStatus === "authorized" ? "Authorized source" : "Research sample; authorization pending",
      soil, rain, agreement: agreementOf(signal, soil, rain),
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
      agreeAll: rows.filter(row => row.agreement.stressed === 3).length,
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
      allKnown: mandals.filter(row => row.agreement.known === 3).length,
      agreeAll: mandals.filter(row => row.agreement.stressed === 3).length,
      agreeTwo: mandals.filter(row => row.agreement.stressed === 2).length,
    },
    rainfall: watch.rainfall, water: summarizeWater(water), cropExposureHa: null, cropReadiness: "not_connected",
  };
}

// FAO-56 standard-condition references: crop coefficients and maximum heights
// from Table 12, maximum effective rooting depths from Table 22. They are
// reference endpoints, not AP-calibrated calendars or crop-specific watering
// advice. Where FAO-56 has no row for the crop, the nearest row is used and
// the note says so. `form` picks how the field section draws the plant.
type CropProfile = {
  name: string;
  kc: readonly [number, number, number];
  rootM: { min: number; max: number };
  heightM: number;
  rootBasis: string;
  form: "cereal" | "groundnut" | "bush";
  note: string;
  /** Shown beside the crop picker when FAO-56 has no row for the crop. */
  standIn?: string;
};

export const CROP_REFERENCE = {
  maize: { name: "Maize", kc: [0.3, 1.2, 0.35], rootM: { min: 1.0, max: 1.7 }, heightM: 2.0, rootBasis: "FAO-56 Table 22", form: "cereal",
    note: "Grain maize; end coefficient assumes field-dried grain." },
  groundnut: { name: "Groundnut", kc: [0.4, 1.15, 0.6], rootM: { min: 0.5, max: 1.0 }, heightM: 0.4, rootBasis: "FAO-56 Table 22", form: "groundnut",
    note: "Groundnut; standard-condition reference coefficients." },
  cotton: { name: "Cotton", kc: [0.35, 1.15, 0.6], rootM: { min: 1.0, max: 1.7 }, heightM: 1.4, rootBasis: "FAO-56 Table 22", form: "bush",
    note: "Cotton; Table 12 gives 1.15–1.20 at mid-season and 0.70–0.50 at the end; 1.15 and the middle of the end range are used. Drawn at 1.4 m (Table 12: 1.2–1.5 m)." },
  chilli: { name: "Chilli", kc: [0.6, 1.05, 0.9], rootM: { min: 0.5, max: 1.0 }, heightM: 0.7, rootBasis: "FAO-56, sweet pepper", form: "bush",
    note: "Chilli; FAO-56 lists only sweet (bell) pepper, whose row is used here. Its end coefficient (0.90) assumes fresh harvest; chilli left to dry on the plant would use less late in the season.",
    standIn: "Sweet-pepper values: FAO-56 has no chilli row." },
  redgram: { name: "Red gram", kc: [0.4, 1.15, 0.35], rootM: { min: 0.6, max: 2.0 }, heightM: 1.5, rootBasis: "FAO-56 pulses · ICRISAT", form: "bush",
    note: "Red gram (pigeon pea); FAO-56 has no pigeon-pea row, so its coefficients are the general 'beans, dry and pulses' row. Roots from that row's 0.6 m to the 2 m ICRISAT gives for the taproot; drawn at 1.5 m (ICRISAT: 1–4 m by variety). A long-duration crop: the three stages span longer than for the others.",
    standIn: "Pulses values, with ICRISAT's rooting depth and height: FAO-56 has no pigeon-pea row." },
  bengalgram: { name: "Bengal gram", kc: [0.4, 1.0, 0.35], rootM: { min: 0.6, max: 1.0 }, heightM: 0.4, rootBasis: "FAO-56 Table 22", form: "bush",
    note: "Bengal gram (chick pea); a rabi crop in Andhra Pradesh, largely grown on the moisture the soil holds after the monsoon." },
  jowar: { name: "Jowar", kc: [0.3, 1.05, 0.55], rootM: { min: 1.0, max: 2.0 }, heightM: 1.5, rootBasis: "FAO-56 Table 22", form: "cereal",
    note: "Jowar (grain sorghum); Table 12 gives 1.00–1.10 at mid-season, and the middle is used. Drawn at 1.5 m (Table 12: 1–2 m)." },
} as const satisfies Record<string, CropProfile>;
/** ICRISAT's botanical description of pigeonpea, for the red gram rooting depth and height. */
export const PIGEONPEA_REFERENCE_URL = "https://oar.icrisat.org/10485/";
export type CropKey = keyof typeof CROP_REFERENCE;
export const CROP_STAGES = ["Initial", "Mid-season", "End-season"] as const;
export const CROP_REFERENCE_URL = "https://www.fao.org/4/x0490e/x0490e0b.htm";
/** FAO-56 Chapter 8, Table 22: maximum effective rooting depths. */
export const ROOT_REFERENCE_URL = "https://www.fao.org/4/x0490e/x0490e0e.htm";
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

export function agricultureCsv(rows: AgricultureMandal[], evidence: Pick<AgricultureEvidence, "period" | "startPeriod"> & Partial<Pick<AgricultureEvidence, "water">>) {
  const cell = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (/^[=+@-]/.test(text) && typeof value !== "number") text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const soil = evidence.water?.soil, rain = evidence.water?.rain;
  return [
    "# Agriculture water watch - PROTOTYPE; not a crop-loss estimate or irrigation instruction.",
    `# Period: ${evidence.startPeriod} to ${evidence.period}. One row per boundary unit; unresolved joins retained. outline: official = the State's outline (AWARE, rebuilt), prototype = public prototype.`,
    "# Positive change means deeper groundwater. Crop area, crop stage and canal delivery records are not connected.",
    soil ? `# Soil moisture: APWRIMS copy of the NRSC VIC model (modelled, not measured), ${soil.depthCm} cm, as of ${soil.asOf ?? "unconfirmed date"}; rank 1 = driest for that date since ${soil.baselineYears?.[0] ?? "record start"}.` : "# Soil moisture: not available in this build.",
    rain ? `# Gauge rainfall: APWRIMS / AP DES mandal rain gauges, ${rain.start} to ${rain.end}, against the department's normal for the same window.` : "# Gauge rainfall: not available in this build.",
    `# Signals pointing to stress (0-3), each a stated test, not a score: ${AGREEMENT_RULES.groundwater}; ${AGREEMENT_RULES.rain}; ${AGREEMENT_RULES.soil}.`,
    "# Seasonal baseline review pending. Flags are provisional; not approved operational advisories.",
    ["district", "mandal", "mandal_id", "water_signal", "depth_mbgl", "season_change_m", "typical_change_m", "shortfall_m", "comparable_years", "source_status", "outline", "missing_reason",
      "soil_moisture_pct", "soil_moisture_week_ago_pct", "soil_moisture_same_date_median_pct", "soil_moisture_rank_driest", "soil_moisture_of_years",
      "gauge_rain_mm", "gauge_rain_normal_mm", "gauge_rain_departure_pct", "gauge_rain_category",
      "signals_pointing_to_stress", "signals_known", "crop_exposure_ha"].join(","),
    ...rows.map(row => [row.district, row.mandal, row.id, row.signal, row.depthM, row.changeM, row.typicalM, row.shortfallM, row.comparableYears, row.sourceStatus, row.officialOutline ? "official" : "prototype", row.reason,
      row.soil?.pct, row.soil?.weekAgoPct, row.soil?.median, row.soil?.rankDriest, row.soil?.ofYears,
      row.rain?.actualMm, row.rain?.normalMm, row.rain?.deviationPct, row.rain?.category,
      row.agreement.stressed, row.agreement.known, null].map(cell).join(",")),
  ].join("\n");
}
