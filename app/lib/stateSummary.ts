import summaryJson from "../data/gw_state_summary.json";
import type { StateReading } from "./stateSnapshot";

/** Statewide and district digest of the State groundwater snapshot: a few
 *  kilobytes, safe in client components (no mandal rows). */
export type StateSummary = {
  generatedAt: string;
  source: string;
  note: string;
  readingDates: { first: string | null; last: string | null; mostCommon: string | null };
  state: (StateReading & { stationsTotal: number }) | null;
  summary: {
    feedMandals: number; matched: number; preMonsoonComparable: number; preMonsoonSameAsOurMay: number;
    deeperSinceMay: number; withChange: number; deeperThanYearAgo: number; withYear: number;
    medianVsOurLatestM: number | null; stationsPerMandal: Record<string, number>;
    byOfficialBand?: Record<string, number>;
  };
  districts: Array<StateReading & { district: string }>;
  officialBands?: Array<{ label: string; min: number; max: number; color: string | null; alert: boolean }>;
  awareModules?: Array<{ module: string; advisories: number; alerts: number }> | null;
};

export const stateSummary = summaryJson as unknown as StateSummary;
