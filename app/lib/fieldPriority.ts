import { CROP_REFERENCE, type AgricultureMandal, type CropKey } from "./agriculture";
import { agricultureEvidence } from "./agricultureServer";
import { cropWaterCheck } from "./cropWater";
import { liveField } from "./fieldSignalsServer";

/* Where field teams would learn most this week: mandals where several published
   signals point the same way. A list for verification visits, not a ranking of
   need, an allocation or a declaration. Each signal is a stated test on a
   figure the site already shows; they are not all independent (the soil model
   is driven by rain, and the crop check starts from the soil model), so the
   count is a reason to look, not a measure of severity. Server code only. */

export type SignalKey = "groundwater" | "rain" | "soil" | "crops" | "vegetation" | "pressure";

export const PRIORITY_SIGNALS: Array<{ key: SignalKey; short: string; label: string }> = [
  { key: "groundwater", short: "Groundwater", label: "Groundwater short of its own seasonal normal (measured wells)" },
  { key: "rain", short: "Rain", label: "Gauge rain 20% or more below normal since 1 June (measured)" },
  { key: "soil", short: "Soil", label: "Soil moisture among the driest quarter of years for the date (modelled)" },
  { key: "crops", short: "Crop water", label: "Most field crops short of water now: 4 or more of the 7 reference crops at mid-season (FAO-56 check)" },
  { key: "vegetation", short: "Vegetation", label: "Crop vegetation severely below normal, last four weeks (satellite, VCI under 40)" },
  { key: "pressure", short: "Extraction", label: "Groundwater semi-critical or worse in the official assessment (structural, yearly)" },
];

export type PriorityRow = {
  index: number; id: string | null; district: string; mandal: string;
  signals: Record<SignalKey, boolean | null>; lit: number; known: number;
  cropsShort: number | null; cropsKnown: number; vci: number | null; category: string | null; stagePct: number | null;
};

const CROPS_SHORT_MIN = 4;
let cached: { rows: PriorityRow[]; soilAsOf: string | null; window: string | null } | null = null;

/** Mid-season crop water for one mandal: how many of the seven reference crops are short of water now. */
export function cropsShortNow(index: number) {
  const live = liveField();
  if (!live) return { short: null, known: 0 };
  let short = 0, known = 0;
  for (const crop of Object.keys(CROP_REFERENCE) as CropKey[]) {
    const result = cropWaterCheck(live.mandals[index] ?? null, live.today, crop, 1);
    if (!result) continue;
    known++;
    if (result.state === "stressed") short++;
  }
  return { short: known ? short : null, known };
}

function rowFor(row: AgricultureMandal): PriorityRow {
  const crops = cropsShortNow(row.index);
  const signals: Record<SignalKey, boolean | null> = {
    groundwater: row.agreement.groundwater,
    rain: row.agreement.rain,
    soil: row.agreement.soil,
    crops: crops.short === null ? null : crops.short >= CROPS_SHORT_MIN,
    vegetation: row.vegetation ? row.vegetation.cls === "severe" : null,
    pressure: row.assessment ? ["semi_critical", "critical", "over_exploited"].includes(row.assessment.cat) : null,
  };
  const values = Object.values(signals);
  return {
    index: row.index, id: row.id, district: row.district, mandal: row.mandal, signals,
    lit: values.filter(value => value === true).length, known: values.filter(value => value !== null).length,
    cropsShort: crops.short, cropsKnown: crops.known, vci: row.vegetation?.vci ?? null,
    category: row.assessment?.cat ?? null, stagePct: row.assessment?.stagePct ?? null,
  };
}

/** Every mandal, most signals first; ties broken by more crops short, then the lower vegetation index. */
export function fieldPriority() {
  if (cached) return cached;
  const live = liveField();
  const rows = agricultureEvidence().mandals.map(rowFor)
    .sort((a, b) => b.lit - a.lit || (b.cropsShort ?? -1) - (a.cropsShort ?? -1) || (a.vci ?? 101) - (b.vci ?? 101) || a.mandal.localeCompare(b.mandal));
  cached = { rows, soilAsOf: live?.soilAsOf ?? null, window: live ? `${live.issued} to ${live.dates[live.dates.length - 1]}` : null };
  return cached;
}

/** The priority rows for a set of boundary indexes, in the same order. */
export function priorityFor(indexes: number[]) {
  const byIndex = new Map(fieldPriority().rows.map(row => [row.index, row]));
  return indexes.map(index => byIndex.get(index) ?? null);
}

/** For a set of mandals: per reference crop at mid-season, how many are short of water now. */
export function cropWaterByCrop(indexes: number[]) {
  const live = liveField();
  return (Object.keys(CROP_REFERENCE) as CropKey[]).map(crop => {
    let short = 0, known = 0;
    for (const index of indexes) {
      const result = live ? cropWaterCheck(live.mandals[index] ?? null, live.today, crop, 1) : null;
      if (!result) continue;
      known++;
      if (result.state === "stressed") short++;
    }
    return { crop, name: CROP_REFERENCE[crop].name, short, known };
  });
}
