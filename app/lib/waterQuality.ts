import qualityJson from "../data/water_quality.json";

/* Where the drinking water itself is unsafe: habitations the Jal Jeevan Mission
 * has marked as quality affected since April 2019, by mandal and contaminant
 * (build_water_quality.py). The map layer's side, shaped like the other mandal
 * layers and keyed "DISTRICT|MANDAL", so a fill is one lookup.
 *
 * Fluoride and salinity get different hues because they have different causes
 * and different fixes; a mandal with none is left pale rather than green, since
 * no affected habitation can also mean fewer tests. */

type Quality = {
  generatedAt: string; source: string; url: string; since: string; readOn: string;
  method: string; caveat: string;
  totals: Record<string, number>;
  fields: string[];
  /** "DISTRICT|MANDAL" -> [fluoride, salinity, nitrate, iron, arsenic, heavy metal, habitations, households, taps] */
  mandals: Record<string, number[]>;
  fluorideMandals: number;
  fluorideTopMandals: Array<{ mandal: string; district: string; habitations: number }>;
};

export const waterQuality = qualityJson as unknown as Quality;

export type QualityLayer = "water_quality";
export function isQualityLayer(layer: string | null | undefined): layer is QualityLayer {
  return layer === "water_quality";
}

export const QUALITY_LAYER_META: Record<QualityLayer, { label: string; period: string; note: string }> = {
  water_quality: {
    label: "Unsafe drinking water",
    period: `habitations marked affected since April ${waterQuality.since.slice(0, 4)}, read ${waterQuality.readOn}`,
    note: `${waterQuality.method} ${waterQuality.caveat}`,
  },
};

const NONE = "#e4e8eb";
const FLUORIDE_FEW = "#e3a35a";
const FLUORIDE_MANY = "#a8551f";
const SALINITY = "#3f8fb5";
const OTHER = "#7d6aa8";
const MANY = 5;

export function qualityForMandal(district: string, mandal: string) {
  const row = waterQuality.mandals[`${district.toUpperCase()}|${mandal.toUpperCase()}`];
  if (!row) return null;
  const [fluoride, salinity, nitrate, iron, arsenic, heavy, habitations, households] = row;
  return { fluoride, salinity, other: nitrate + iron + arsenic + heavy, habitations, households };
}

export function qualityColor(district: string, mandal: string): string {
  const q = qualityForMandal(district, mandal);
  if (!q) return NONE;
  if (q.fluoride > 0) return q.fluoride >= MANY ? FLUORIDE_MANY : FLUORIDE_FEW;
  if (q.salinity > 0) return SALINITY;
  return OTHER;
}

export function qualityText(district: string, mandal: string): string | null {
  const q = qualityForMandal(district, mandal);
  if (!q) return null;
  const parts = [q.fluoride ? `${q.fluoride} fluoride` : "", q.salinity ? `${q.salinity} salinity` : "", q.other ? `${q.other} other` : ""].filter(Boolean);
  return `${q.habitations} habitation${q.habitations === 1 ? "" : "s"} affected (${parts.join(", ")}) · ${q.households.toLocaleString("en-IN")} households`;
}

export function qualityLegend() {
  const rows = Object.values(waterQuality.mandals);
  const count = (test: (r: number[]) => boolean) => rows.filter(test).length;
  return [
    { key: "fluoride-many", label: `Fluoride, ${MANY} or more habitations`, color: FLUORIDE_MANY, count: count(r => r[0] >= MANY) },
    { key: "fluoride-few", label: "Fluoride, fewer", color: FLUORIDE_FEW, count: count(r => r[0] > 0 && r[0] < MANY) },
    { key: "salinity", label: "Salinity", color: SALINITY, count: count(r => r[0] === 0 && r[1] > 0) },
    { key: "other", label: "Nitrate or other", color: OTHER, count: count(r => r[0] === 0 && r[1] === 0) },
  ];
}
