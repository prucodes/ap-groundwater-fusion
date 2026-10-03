import summaryJson from "../data/drought_watch_summary.json";
import type { DroughtSummary } from "./drought";

/** Drought Watch counts by state and district, and one outcome per map boundary.
 * Small enough for client components. */
export const droughtSummary = summaryJson as unknown as DroughtSummary;
