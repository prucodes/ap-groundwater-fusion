import droughtJson from "../data/drought_watch.json";
import type { DroughtMandal, DroughtWatch } from "./drought";

/** The full Drought Watch file: every mandal's indicators and the manual's
 * outcome. Server code only. A client component that imports this ships half a
 * megabyte to every visitor; client pages read droughtSummary.ts instead. */
export const droughtWatch = droughtJson as unknown as DroughtWatch;

const byKey = new Map<string, DroughtMandal>(droughtWatch.mandals.map(row => [`${row.d}|${row.m}`, row]));

export function droughtForMandal(district: string, mandal: string): DroughtMandal | undefined {
  return byKey.get(`${district.trim().toUpperCase()}|${mandal.trim().toUpperCase()}`);
}
