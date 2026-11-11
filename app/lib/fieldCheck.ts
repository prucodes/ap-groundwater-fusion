import { fieldQueue, groundwaterRecords, titleCase } from "./data";
import { csvBanner } from "./csv";
import { summerPriority } from "./summerPriority";

/* The field check: where a tape in a well would test this site's numbers, and what
   each number to be tested says. Two lists meet here: the summer drinking-water
   mandals to plan first (is the alarm right?) and the field queue (where the model
   is least sure and the most people and irrigated land depend on it). For each, the
   State's latest mandal reading and the model's three-month forecast with its band,
   so a sounding taken in the forecast month is a fair test of it. Server code only. */

export type FieldCheckRow = {
  district: string; mandal: string; why: string[];
  readingM: number | null; readingMonth: string | null;
  forecastM: number | null; lower: number | null; upper: number | null; forecastMonth: string | null;
};

const key = (district: string, mandal: string) => `${district.toUpperCase()}|${mandal.toUpperCase()}`;
const place = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));

export function fieldCheckRows(): FieldCheckRow[] {
  const why = new Map<string, { district: string; mandal: string; why: string[] }>();
  const add = (district: string, mandal: string, reason: string) => {
    const k = key(district, mandal);
    const row = why.get(k) ?? { district, mandal, why: [] };
    row.why.push(reason);
    why.set(k, row);
  };
  for (const r of summerPriority.mandals.filter(r => r.band === "first")) add(r.district, r.mandal, "summer: plan first");
  for (const r of fieldQueue.queue) add(r.district, r.mandal, `field queue #${r.rank}`);
  const records = new Map(groundwaterRecords.map(r => [key(r.identity.districtName, r.identity.mandalName), r]));
  return [...why.entries()].map(([k, row]) => {
    const record = records.get(k);
    const forecast = record?.forecast;
    return {
      district: place(row.district), mandal: place(row.mandal), why: row.why,
      readingM: record?.observation?.latestMeasuredValue ?? null, readingMonth: record?.observation?.observationPeriod ?? null,
      forecastM: forecast?.value ?? null, lower: forecast?.lower ?? null, upper: forecast?.upper ?? null,
      forecastMonth: forecast?.targetDate ?? null,
    };
  }).sort((a, b) => a.district.localeCompare(b.district) || a.mandal.localeCompare(b.mandal));
}

const cell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The sheet a team carries: what the site says, then empty columns for what the tape says. */
export function fieldCheckCsv(rows = fieldCheckRows()) {
  const head = ["district", "mandal", "why_this_mandal", "state_reading_m", "state_reading_month", "forecast_m", "forecast_low_m",
    "forecast_high_m", "forecast_month", "visit_date", "well_type", "latitude", "longitude", "depth_to_water_m", "hours_since_pumping",
    "measured_by", "notes"];
  const lines = rows.map(r => [r.district, r.mandal, r.why.join("; "), r.readingM, r.readingMonth, r.forecastM, r.lower, r.upper,
    r.forecastMonth, "", "", "", "", "", "", "", ""].map(cell).join(","));
  return [csvBanner([
    "Field check: sound one or more wells per mandal and fill the empty columns; send the file back as it is.",
    "Depth to water in metres below ground level, measured from the ground beside the well, not the casing top.",
    "well_type: piezometer, open well, or bore well (say whether it is in use). A well pumped in the last few hours reads deeper than the water table.",
    "Best taken in the forecast month, so each reading tests the forecast and its band directly.",
  ]), head.join(","), ...lines].join("\n") + "\n";
}
