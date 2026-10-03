import waterContextJson from "../data/water_context.json";
import type { WaterContext } from "./data";

/** The full APWRIMS water context: soil moisture, gauge rainfall and reservoirs,
 * per mandal and per reservoir. About half a megabyte, so import it only from
 * code rendered on the server; a client component that imports it ships all of
 * it to every visitor. Client components use lib/waterSummary.ts instead. */
export const waterContext = waterContextJson as unknown as WaterContext;
