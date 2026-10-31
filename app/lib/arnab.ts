import cyclone from "../data/cyclone_arnab.json";

/* Cyclone Arnab, as build_cyclone_arnab.py writes it: the storm measured once,
   the days after it logged daily, and the groundwater check once it is published. */

export type ArnabBand = { band: string; mandals: number; medianMm: number | null; heavy: number };
export type ArnabPrecedent = { band: string; mandals: number; extraRiseM: number; roseMorePct: number };
export type ArnabDay = { date: string; rainTo: string; rainSinceTmc: number; soilMedian30: number; reservoirTmc: number; reservoirPct: number };
export type ArnabGain = { name: string; basin: string; district: string; capacityTmc: number; beforeTmc: number; nowTmc: number; gainTmc: number; beforePct: number; nowPct: number };
export type ArnabWatch = { district: string; mandal: string; stormMm: number; depthM: number; precedentM: number | null; octRiseM?: number; novExtraRiseM?: number };
export type Arnab = {
  landfall: string; updatedAt: string | null; rainWindow: { from: string; to: string; days: number }; groundwaterLatest: string;
  state: {
    rainTmc: number; normalTmc: number; seasonDeviationBefore: number; seasonDeviationAfter: number;
    soilMedianBefore: number; soilMedianAfter: number; soilDriestBefore: number; soilDriestAfter: number;
    soilAsOf: { before: string; after: string }; reservoirTmcBefore: number; reservoirTmcAfter: number;
    mandals: number; heavyMandals: number; deepMandals: number; deepHeavyMandals: number;
  };
  heavyMm: number; deepM: number;
  districts: Array<{ district: string; mandals: number; medianMm: number; heavy: number }>;
  byDepth: ArnabBand[];
  precedent: { mandalsWithHeavyRain: number; bands: ArnabPrecedent[] };
  since: { from: string; to: string; days: ArnabDay[]; gainTmc: number; basins: Array<{ basin: string; beforePct: number; nowPct: number; gainTmc: number }>; reservoirs: ArnabGain[] } | null;
  follow: { published: string[]; bands: Array<{ band: string; mandals: number; extraRiseM: number; precedentM: number | null }> };
  map: Array<[number, string, string, number, number | null, string]>;
  drought: { asOf: string; declareBy: string; flagged: number; flaggedHeavy: number; medianMm: number; severe: number; severeHeavy: number; byDrySpell: number } | null;
  watch: ArnabWatch[];
  caveat: string;
};

export const arnab = cyclone as unknown as Arnab;

export const arnabDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
export const arnabMonth = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
export const listOf = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
export const BASIN_NAMES: Record<string, string> = { KRISHNA: "Krishna", GODAVARI: "Godavari", PENNAR: "Pennar", OTHERS: "Smaller rivers" };
export const titleName = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bReservoir\b/, "").trim();

/** The districts whose median mandal got heavy rain, wettest first. */
export const soakedDistricts = (d: Arnab = arnab) => d.districts.filter(x => x.medianMm >= d.heavyMm).map(x => x.district);

export { RAIN_SCALE } from "./arnabScale";
