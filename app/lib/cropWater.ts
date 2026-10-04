import { CROP_REFERENCE, type CropKey } from "./agriculture";

/* The crop water check: an FAO-56 Chapter 8 root-zone water balance, per mandal,
   for a crop and growth stage the reader chooses. The same steps, in the same
   order, as phase3_levels/crop_water.py, whose statewide counts this page must
   reproduce (crossCheck in field_signals.json; app/e2e/agriculture-live.spec.ts).
   Client-safe: it reads only CROP_REFERENCE. */

export const SOWING_ROOT_M = 0.2;     // FAO-56: 0.15–0.20 m at sowing; the larger value
export const MAX_ROOT_M = 1.5;        // the deepest the soil-moisture model reports
export const SOIL_DEPTHS_CM = [5, 30, 100, 150] as const;
export const CAPACITY_DEPTHS_CM = [[0, 5], [5, 15], [15, 30], [30, 60], [60, 100], [100, 200]] as const;
export const OUTLOOK_DAYS = 7;
export const SEVERE_KS = 0.5;

/** One mandal's inputs: APWRIMS soil moisture (% of capacity at 5, 30, 100, 150 cm),
 * SoilGrids capacity (mm per m by depth interval), and daily ETo and rain (mm) from
 * the soil-moisture date (index 0) to the last outlook day. */
export type LiveMandal = { pct: number[] | null; cap: number[] | null; eto: number[] | null; rain: number[] | null };

export type LiveField = {
  /** The forecast's issue date: the first outlook day. */
  issued: string;
  /** Daily dates from the soil-moisture date to the last outlook day. */
  dates: string[];
  soilAsOf: string;
  /** Index of the issue date in `dates`. */
  today: number;
  mandals: Array<LiveMandal | null>;
  weather: { source: string; url: string; licence: string; model: string };
  soil: { source: string; url: string };
  capacity: { source: string; url: string; licence: string };
  /** The Python water balance's statewide counts, for every crop and stage. */
  crossCheck: Record<string, CropWaterCounts> | null;
};

export type CropWaterState = "stressed" | "soon" | "ok" | "unknown";
export type CropWaterCounts = { stressed: number; severe: number; soon: number; ok: number; unknown: number };
export type CropWaterResult = {
  state: Exclude<CropWaterState, "unknown">; severe: boolean; ksNow: number; ksEnd: number; onset: number | null;
  taw: number; raw: number; p: number; drNow: number; drEnd: number; kc: number; zr: number;
  etoMean: number; rainUsed: number; reserve: number;
  /** Available water (TAW − Dr, mm) at the end of each day from the soil-moisture date. */
  path: number[];
  /** Rain that counted (mm) and crop water use (Ks Kc ETo, mm) on each day, index 0 empty. */
  rainEffective: number[]; use: number[];
};

const mean = (values: number[]) => { let total = 0; for (const value of values) total += value; return total / values.length; };

export function rootDepth(crop: CropKey, stage: number) {
  return stage === 0 ? SOWING_ROOT_M : Math.min(CROP_REFERENCE[crop].rootM.max, MAX_ROOT_M);
}

/** Share of the 0..depth column's capacity still available, from the model's cumulative columns. */
export function availableFraction(pct: number[], depthM: number) {
  const depth = depthM * 100;
  const tops = [0, ...SOIL_DEPTHS_CM];
  const held = [0, ...pct.map((value, i) => value / 100 * SOIL_DEPTHS_CM[i])];
  for (let i = 1; i < tops.length; i++) {
    if (depth <= tops[i]) {
      const layer = Math.min(1, Math.max(0, (held[i] - held[i - 1]) / (tops[i] - tops[i - 1])));
      return Math.min(1, Math.max(0, (held[i - 1] + layer * (depth - tops[i - 1])) / depth));
    }
  }
  return Math.min(1, Math.max(0, pct[pct.length - 1] / 100));
}

/** Total available water (mm) in the 0..depth column, from SoilGrids' mm per metre by interval. */
export function capacityMm(cap: number[], depthM: number) {
  const depth = depthM * 100;
  let total = 0;
  CAPACITY_DEPTHS_CM.forEach(([a, b], i) => { total += cap[i] * Math.max(0, Math.min(b, depth) - a) / 100; });
  return total;
}

/** One mandal, one crop and stage; null when an input is missing. */
export function cropWaterCheck(input: LiveMandal | null, today: number, crop: CropKey, stage: number): CropWaterResult | null {
  const start = 0, end = today + OUTLOOK_DAYS;
  if (!input?.pct || !input.cap || !input.eto || !input.rain || end > input.eto.length || start >= end) return null;
  const { pct, cap, eto, rain } = input;
  for (let i = start + 1; i < end; i++) if (eto[i] == null || rain[i] == null) return null;
  const profile = CROP_REFERENCE[crop];
  const kc = profile.kc[stage];
  const zr = rootDepth(crop, stage);
  const taw = capacityMm(cap, zr);
  if (taw <= 0) return null;
  const etoMean = mean(eto.slice(today, end));
  const etc = kc * etoMean;
  const p = Math.min(0.8, Math.max(0.1, profile.p + 0.04 * (5 - etc)));
  const raw = p * taw;
  const ks = (depletion: number) => depletion <= raw ? 1 : Math.max(0, (taw - depletion) / ((1 - p) * taw));

  let dr = (1 - availableFraction(pct, zr)) * taw;
  let drNow: number | null = start + 1 >= today ? dr : null;
  let onset: number | null = null;
  let rainUsed = 0;
  const path = [taw - dr], rainEffective = [0], use = [0];
  for (let i = start + 1; i < end; i++) {
    if (i === today) drNow = dr;
    const effective = rain[i] >= 0.2 * eto[i] ? rain[i] : 0;
    if (i >= today) rainUsed += effective;
    const used = ks(dr) * kc * eto[i];
    dr = Math.min(taw, Math.max(0, dr - effective + used));
    if (i >= today && onset === null && ks(dr) < 1) onset = i - today;
    path.push(taw - dr); rainEffective.push(effective); use.push(used);
  }
  const now = drNow ?? dr;
  const ksNow = ks(now);
  return {
    state: ksNow < 1 ? "stressed" : onset !== null ? "soon" : "ok", severe: ksNow < SEVERE_KS, ksNow, ksEnd: ks(dr), onset,
    taw, raw, p, drNow: now, drEnd: dr, kc, zr, etoMean, rainUsed, reserve: Math.max(0, raw - now), path, rainEffective, use,
  };
}

export function cropWaterCounts(results: Array<CropWaterResult | null>): CropWaterCounts {
  const out = { stressed: 0, severe: 0, soon: 0, ok: 0, unknown: 0 };
  for (const result of results) {
    if (!result) { out.unknown++; continue; }
    out[result.state]++;
    if (result.severe) out.severe++;
  }
  return out;
}

export const CROP_WATER_STATES: Record<CropWaterState, { label: string; short: string; color: string }> = {
  stressed: { label: "Short of water now", short: "Short now", color: "#c0533e" },
  soon: { label: "Short within 7 days on the forecast", short: "Within 7 days", color: "#d9a13b" },
  ok: { label: "Comfortable through the week", short: "Comfortable", color: "#a9cdb9" },
  unknown: { label: "No soil-moisture value", short: "No value", color: "#d3d9dc" },
};
export const SEVERE_COLOR = "#8c2f29";

/** How the check has fared on past kharif weeks (phase3_levels/build_crop_water_record.py). */
export type WithinCell = { mandals: number; changeGap: number | null; afterGap: number | null; worsePct: number | null };
export type RecordVerdict = "backed" | "weak" | "not borne out" | "untested";
export type CheckRecord = {
  generatedAt: string; question: string; outcome: string; acrossCaveat: string; weather: string; seasons: number[]; checks: number;
  rules: { backedPoints: number; notedPoints: number; minMandals: number; text: string };
  /** sameSeason counts mandal-seasons and drives the verdict; acrossSeasons pools a mandal's seasons, for reference. */
  record: Record<string, { within: { sameSeason: WithinCell; acrossSeasons: WithinCell; seasons: Record<string, WithinCell> }; verdict: RecordVerdict }>;
};
export const RECORD_VERDICTS: Record<RecordVerdict, { label: string; tone: string }> = {
  backed: { label: "Backed by its record", tone: "#27745d" },
  weak: { label: "Weak record", tone: "#b17a17" },
  "not borne out": { label: "Not borne out", tone: "#b64c42" },
  untested: { label: "Untested", tone: "#6b7780" },
};
