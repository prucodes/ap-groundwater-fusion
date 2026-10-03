import waterSummaryJson from "../data/water_context_summary.json";
import type { WaterDistrictContext, WaterSummary } from "./data";

/** State and district digest of the water context: a few kilobytes, safe in any component. */
export const waterSummary = waterSummaryJson as unknown as WaterSummary;

const districtKey = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** The district's gauge rainfall, soil moisture and reservoir figures, matched by name. */
export function waterForDistrict(name: string): WaterDistrictContext | null {
  return waterSummary.districts.find(row => row.key === districtKey(name)) ?? null;
}
