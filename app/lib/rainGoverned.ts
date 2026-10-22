import rainGovernedJson from "../data/rain_governed.json";

/* Historical in-sample rainfall association; neither causation nor forecast skill.
 * This does not measure extraction. */

export type RainClass = "rain governed" | "partly" | "not rain";

type RainGoverned = {
  generatedAt: string; method: string; caveat: string; limits: string[];
  scored: number; medianR2: number;
  thresholds: { governedR2: number; partlyR2: number };
  window: { preMonsoonMonth: number; postMonsoonMonth: number; rainMonths: number[]; minSeasons: number };
  groups: Array<{ class: RainClass; mandals: number; aquifers: Record<string, number>;
                  medianIrrigatedPct: number | null; stressedPct: number;
                  medianRisePer100mm: number }>;
  codes: { class: RainClass[] };
  /** "DISTRICT|MANDAL" -> [R2, class code, rise m per 100 mm, seasons, irrigated %]. */
  values: Record<string, [number, number, number, number, number | null]>;
};

export const rainGoverned = rainGovernedJson as unknown as RainGoverned;

export type RainLayer = "rain_governed";
export function isRainLayer(layer: string | null | undefined): layer is RainLayer {
  return layer === "rain_governed";
}

export const RAIN_LAYER_META: Record<RainLayer, { label: string; period: string; note: string }> = {
  rain_governed: {
    label: "Rainfall association with seasonal water-level change",
    period: `${rainGoverned.scored} mandals on ${rainGoverned.window.minSeasons}+ seasons`,
    note: `${rainGoverned.method}. ${rainGoverned.caveat}`,
  },
};

export function rainForMandal(district: string, mandal: string) {
  const row = rainGoverned.values[`${district.toUpperCase()}|${mandal.toUpperCase()}`];
  if (!row) return null;
  return { r2: row[0], klass: rainGoverned.codes.class[row[1]] ?? null,
           risePer100mm: row[2], seasons: row[3], irrigatedPct: row[4] };
}

/* Three steps, not a ramp. The classes are the finding, and a continuous scale
   would invite reading a 0.38 as meaningfully different from a 0.42 on seven
   points of data, which it is not. */
const NO_VALUE = "#d3d9dc";
const SHADE: Record<RainClass, string> = {
  "rain governed": "#2d6f94",
  "partly": "#9bbcc9",
  "not rain": "#d8c9a8",
};

export function rainColor(district: string, mandal: string): string {
  const row = rainForMandal(district, mandal);
  return row?.klass ? SHADE[row.klass] : NO_VALUE;
}

export function rainText(district: string, mandal: string): string | null {
  const row = rainForMandal(district, mandal);
  if (!row || !row.klass) return null;
  const rise = `fitted ${row.risePer100mm >= 0 ? "rise" : "fall"} ${Math.abs(row.risePer100mm).toFixed(2)} m per 100 mm · R² ${row.r2.toFixed(2)}`;
  if (row.klass === "rain governed") return `stronger historical association · ${rise}`;
  if (row.klass === "partly") return `moderate historical association · ${rise}`;
  return `weak or inverse association · ${rise}`;
}

export function rainLegend() {
  return rainGoverned.groups.map(group => ({
    key: group.class,
    label: group.class === "rain governed" ? `Stronger association (R² ≥ ${rainGoverned.thresholds.governedR2}, rising with rain)`
      : group.class === "partly" ? `Moderate association (R² ≥ ${rainGoverned.thresholds.partlyR2}, rising with rain)`
      : "Weak fit or opposite-direction association",
    color: SHADE[group.class],
    count: group.mandals,
  }));
}
