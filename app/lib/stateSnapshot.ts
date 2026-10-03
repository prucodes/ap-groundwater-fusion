import snapshotJson from "../data/gw_state_snapshot.json";

/** The State's own groundwater snapshot (AWARE feed via the AI Living Labs
 *  data lake): one recent reading per location, shown beside our monthly series.
 *  Server-only: the full file stays out of the browser bundle. */
export type StateReading = {
  stations: number;
  currentM: number | null;
  date: string | null;
  preMonsoonM: number | null;
  postMonsoonM: number | null;
  yearAgoM: number | null;
  sinceMayM: number | null;
  vsYearAgoM: number | null;
  feedName?: string;
  matchedBy?: string;
  ourLatestMonth?: string;
  ourLatestM?: number;
  vsOurLatestM?: number;
  /** The department's own depth band for the latest reading (ground_water_category). */
  band?: string | null;
};

export type StateSnapshot = {
  contractVersion: string;
  generatedAt: string;
  source: string;
  kind: string;
  note: string;
  readingDates: { first: string | null; last: string | null; mostCommon: string | null };
  state: (StateReading & { stationsTotal: number }) | null;
  summary: {
    feedMandals: number; matched: number; unmatched: string[];
    preMonsoonComparable: number; preMonsoonSameAsOurMay: number;
    deeperSinceMay: number; withChange: number; deeperThanYearAgo: number; withYear: number;
    medianVsOurLatestM: number | null; stationsPerMandal: Record<string, number>;
  };
  districts: Array<StateReading & { district: string }>;
  mandals: Record<string, StateReading>;
};

export const stateSnapshot = snapshotJson as unknown as StateSnapshot;

/** Keyed as the map layers are: "DISTRICT|MANDAL" from the boundary geometry. */
export function stateReadingFor(district: string, mandal: string): StateReading | null {
  return stateSnapshot.mandals[`${district}|${mandal}`] ?? null;
}
