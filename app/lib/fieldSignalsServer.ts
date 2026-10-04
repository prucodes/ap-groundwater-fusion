import fieldJson from "../data/field_signals.json";
import type { FieldEvidenceInput, GecCategory, MandalAssessment, MandalVegetation, VciClass } from "./agriculture";
import type { LiveField, LiveMandal } from "./cropWater";
import { waterContext } from "./waterContext";

/* The full field-signals record: ECMWF's forecast for every mandal, the weekly
   vegetation series, the assessment's volumes, and SoilGrids' water-holding
   capacity. Server code only (~400 KB): pages pass on just what they draw. */

type Week = { year: number; week: number; approxStart: string; approxEnd: string };
type VegRow = { v: number; cls: VciClass; all: number | null; crop: number | null; few: boolean; weeks: Array<number | null> } | null;
type GwRow = {
  unit: string; district: string; match: string; cat: GecCategory; stage: number | null; resource: number | null; extraction: number | null;
  irrigation: number | null; domestic: number | null; industry: number | null; future: number | null; rainMm: number | null;
  prev: { cat: GecCategory; stage: number | null } | null; others: Array<{ unit: string; cat: GecCategory; stage: number | null }>;
} | null;
type FieldSignals = {
  generatedAt: string;
  weather: { source: string; model: string; url: string; licence: string; issued: string; dates: string[]; eto: Array<number[] | null>; rain: Array<number[] | null> } | null;
  vegetation: {
    product: string; url: string; weighting: string; classes: string; cropland: { source: string; url: string; caveat: string };
    weeks: Week[]; averaged: Week[]; byWeek: Array<Record<VciClass, number>>;
    summary: { mandals: number; normal: number; moderate: number; severe: number; fewFields: number; medianVci: number | null }; mandals: VegRow[];
  } | null;
  assessment: {
    source: string; url: string; year: string; previousYear: string | null; unitNote: string;
    state: NonNullable<NonNullable<FieldEvidenceInput["summary"]>["assessment"]>["state"];
    mandals: GwRow[];
  } | null;
  soilCapacity: { source: string; url: string; licence: string; values: Array<number[] | null> };
  crossCheck: { soilAsOf: string; issued?: string; counts?: Record<string, { stressed: number; severe: number; soon: number; ok: number; unknown: number }> } | null;
};

export const fieldSignals = fieldJson as unknown as FieldSignals;

const vegetationRow = (row: VegRow): MandalVegetation | null => row ? { vci: row.v, cls: row.cls, allVci: row.all, croplandPct: row.crop, fewFields: row.few, weeks: row.weeks } : null;
const assessmentRow = (row: GwRow): MandalAssessment | null => row ? {
  unit: row.unit, cat: row.cat, stagePct: row.stage, resourceHam: row.resource, extractionHam: row.extraction,
  irrigationHam: row.irrigation, domesticHam: row.domestic, industryHam: row.industry, futureHam: row.future,
  prev: row.prev ? { cat: row.prev.cat, stagePct: row.prev.stage } : null, match: row.match,
  others: row.others.map(other => ({ unit: other.unit, cat: other.cat, stagePct: other.stage })),
} : null;

/** Vegetation and assessment by boundary index, with the statewide summaries, for buildAgricultureEvidence.
 * `slim` drops what only the server-rendered mandal pages draw (weekly series, volumes), for a client page
 * that carries all 670 mandals. */
export function fieldEvidenceInput({ slim = false }: { slim?: boolean } = {}): FieldEvidenceInput {
  const veg = fieldSignals.vegetation, gw = fieldSignals.assessment;
  const trimVeg = (row: MandalVegetation | null): MandalVegetation | null => row && slim ? { vci: row.vci, cls: row.cls, allVci: row.allVci, croplandPct: row.croplandPct, fewFields: row.fewFields } : row;
  const trimGw = (row: MandalAssessment | null): MandalAssessment | null => row && slim ? { unit: row.unit, cat: row.cat, stagePct: row.stagePct, prev: row.prev, match: row.match } : row;
  return {
    vegetation: (veg?.mandals ?? []).map(vegetationRow).map(trimVeg),
    assessment: (gw?.mandals ?? []).map(assessmentRow).map(trimGw),
    summary: {
      vegetation: veg ? {
        product: veg.product, url: veg.url, weighting: veg.weighting, classes: veg.classes,
        croplandSource: veg.cropland.source, croplandUrl: veg.cropland.url, croplandCaveat: veg.cropland.caveat,
        weeks: veg.weeks.map(({ approxStart, approxEnd }) => ({ approxStart, approxEnd })),
        averaged: veg.averaged.map(({ approxStart, approxEnd }) => ({ approxStart, approxEnd })),
        byWeek: veg.byWeek, summary: veg.summary,
      } : null,
      assessment: gw ? { source: gw.source, url: gw.url, year: gw.year, previousYear: gw.previousYear, unitNote: gw.unitNote, state: gw.state } : null,
    },
  };
}

/** A boundary claimed by two soil rows is ambiguous and left out, as on the rest of the page. */
function soilByBoundary(count: number) {
  const seen = new Map<number, number[] | null>();
  for (const row of waterContext?.soilMoisture?.mandals ?? []) {
    const index = row.boundaryIndex;
    if (typeof index === "number" && index >= 0 && index < count) seen.set(index, seen.has(index) ? null : row.pct);
  }
  return Array.from({ length: count }, (_, i) => seen.get(i) ?? null);
}

/** What the crop water check needs, sliced to the days it uses: from the soil-moisture
 * date to the last outlook day. Null when the soil-moisture date falls outside the
 * forecast window (one of the two feeds has not refreshed). */
export function liveField(): LiveField | null {
  const weather = fieldSignals.weather, soil = waterContext?.soilMoisture, capacity = fieldSignals.soilCapacity;
  if (!weather || !soil?.asOf) return null;
  const start = weather.dates.indexOf(soil.asOf), issued = weather.dates.indexOf(weather.issued);
  if (start < 0 || issued < 0 || issued + 7 > weather.dates.length) return null;
  const end = issued + 7;
  const count = capacity.values.length;
  const pct = soilByBoundary(count);
  const mandals: Array<LiveMandal | null> = Array.from({ length: count }, (_, i) => {
    const eto = weather.eto[i], rain = weather.rain[i];
    if (!eto || !rain) return null;
    return { pct: pct[i], cap: capacity.values[i], eto: eto.slice(start, end), rain: rain.slice(start, end) };
  });
  const check = fieldSignals.crossCheck;
  return {
    issued: weather.issued, dates: weather.dates.slice(start, end), soilAsOf: soil.asOf, today: issued - start, mandals,
    weather: { source: weather.source, url: weather.url, licence: weather.licence, model: weather.model },
    soil: { source: soil.source, url: soil.url },
    capacity: { source: capacity.source, url: capacity.url, licence: capacity.licence },
    crossCheck: check?.counts && check.soilAsOf === soil.asOf && check.issued === weather.issued ? check.counts : null,
  };
}
