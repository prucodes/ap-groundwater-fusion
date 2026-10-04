import outlookJson from "../data/enso_outlook.json";
import { CROP_REFERENCE } from "./agriculture";
import { cropWaterCheck, type CropWaterCounts } from "./cropWater";
import { mapGeometry, monsoonWatch, titleCase, type EnsoOutlook, type Reservoir, type ReservoirTotals } from "./data";
import { fieldSignals, liveField } from "./fieldSignalsServer";
import { waterContext } from "./waterContext";
import { waterSummary } from "./waterSummary";

/* The rabi season's starting position, from files the site already publishes:
   APWRIMS reservoir storage for irrigated rabi, APWRIMS soil moisture against
   its own past for rainfed rabi, read only where ESA WorldCereal maps the
   cropland as mostly rainfed, the State's rain gauges, and NOAA's El Niño
   outlook beside the CHIRPS record of what past El Niño years brought from
   October to December. Server code only. */

export type SoilClass = "record" | "below" | "above" | "irrigated" | "none";
export const SOIL_CLASSES: Record<SoilClass, { label: string; color: string }> = {
  record: { label: "Driest on record for the date", color: "#8c2f29" },
  below: { label: "Drier than its median year", color: "#d08a3c" },
  above: { label: "At or above its median year", color: "#7fb59a" },
  irrigated: { label: "Mostly irrigated cropland", color: "#d9dee2" },
  none: { label: "No reading", color: "#eef1f3" },
};

const BASIN_NAMES: Record<string, string> = { KRISHNA: "Krishna", PENNAR: "Pennar", GODAVARI: "Godavari", OTHERS: "Other basins" };
const display = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));
const norm = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export type RabiMandal = { index: number; district: string; mandal: string; cls: SoilClass; pct: number | null; median: number | null; rank: number | null; of: number | null; irrigatedPct: number | null };

function soilRows() {
  const soil = waterContext?.soilMoisture;
  const count = mapGeometry.mandals.length;
  const seen = new Map<number, (typeof soil extends null ? never : NonNullable<typeof soil>["mandals"][number]) | null>();
  for (const row of soil?.mandals ?? []) {
    const index = row.boundaryIndex;
    if (typeof index === "number" && index >= 0 && index < count) seen.set(index, seen.has(index) ? null : row);
  }
  return seen;
}

function buildRabi() {
  const soil = waterContext?.soilMoisture ?? null;
  const reservoirs = waterContext?.reservoirs ?? null;
  const irrigation = fieldSignals.irrigation;
  const share = irrigation?.share ?? [];
  const below = irrigation?.mostlyRainfedBelowPct ?? 50;
  const depth = soil ? soil.depthsCm.indexOf(soil.headlineDepthCm) : -1;
  const rows = soilRows();

  const mandals: RabiMandal[] = mapGeometry.mandals.map((feature, index) => {
    const irrigatedPct = share[index] ?? null;
    const row = rows.get(index) ?? null;
    const base = { index, district: display(feature.d), mandal: display(feature.m), irrigatedPct };
    if (irrigatedPct !== null && irrigatedPct >= below) return { ...base, cls: "irrigated", pct: row?.pct[depth] ?? null, median: row?.baseline?.median ?? null, rank: row?.baseline?.rankDriest ?? null, of: row?.baseline?.ofYears ?? null };
    if (!row || depth < 0 || !row.baseline || row.pct[depth] === undefined) return { ...base, cls: "none", pct: null, median: null, rank: null, of: null };
    const pct = row.pct[depth], { median, rankDriest, ofYears } = row.baseline;
    const cls: SoilClass = rankDriest === 1 ? "record" : pct < median ? "below" : "above";
    return { ...base, cls, pct, median, rank: rankDriest, of: ofYears };
  });
  const rainfed = mandals.filter(m => m.irrigatedPct !== null && m.irrigatedPct < below);
  const read = rainfed.filter(m => m.cls !== "none");
  const tally = (cls: SoilClass) => read.filter(m => m.cls === cls).length;

  // Districts: the share of their rainfed mandals with soil drier than the median year.
  const ne = monsoonWatch.elNinoRainfall.neMonsoon;
  const neByDistrict = new Map((ne?.byDistrict ?? []).map(d => [norm(d.district), d]));
  const districtNames = Array.from(new Set(read.map(m => m.district)));
  const districts = districtNames.map(district => {
    const own = read.filter(m => m.district === district);
    const dry = own.filter(m => m.cls === "record" || m.cls === "below").length;
    const composite = neByDistrict.get(norm(district));
    return {
      district, rainfed: own.length, dry, record: own.filter(m => m.cls === "record").length,
      dryPct: own.length ? Math.round((100 * dry) / own.length) : 0,
      neSharePct: composite?.shareOfAnnualPct ?? null, neElNinoPct: composite?.elNinoAnomalyPct ?? null,
    };
  }).filter(d => d.rainfed >= 3).sort((a, b) => b.dryPct - a.dryPct || b.rainfed - a.rainfed);

  // A Bengal gram crop sown this week, over the rainfed mandals: the live check at the initial stage.
  const live = liveField();
  const sowing: CropWaterCounts & { crop: string; issued: string | null } = { crop: CROP_REFERENCE.bengalgram.name, issued: live?.issued ?? null, stressed: 0, severe: 0, soon: 0, ok: 0, unknown: 0 };
  for (const m of rainfed) {
    const result = live ? cropWaterCheck(live.mandals[m.index] ?? null, live.today, "bengalgram", 0) : null;
    if (!result) { sowing.unknown++; continue; }
    sowing[result.state]++;
    if (result.severe) sowing.severe++;
  }

  const basins = (reservoirs?.byBasin ?? []).map(b => ({ ...b, name: BASIN_NAMES[b.basin] ?? display(b.basin) }))
    .sort((a, b) => b.capacityTmc - a.capacityTmc);
  const major = (reservoirs?.reservoirs ?? []).filter((r: Reservoir) => r.type === "major" && r.capacityTmc !== null && r.storagePct !== null)
    .sort((a, b) => (b.capacityTmc ?? 0) - (a.capacityTmc ?? 0)).slice(0, 8)
    .map(r => ({ name: display(r.name).replace(/\bR\b$/, "").replace(/ Reservoir$| Project$| Dam$/i, "").trim(), district: r.district ? display(r.district) : null, basin: BASIN_NAMES[r.basin] ?? r.basin, capacityTmc: r.capacityTmc, storageTmc: r.storageTmc, storagePct: r.storagePct, lastYearPct: r.lastYearPct, observedAt: r.observedAt }));

  const outlook = outlookJson as unknown as EnsoOutlook;
  const ond = outlook.probabilities.find(p => p.season === "OND") ?? null;
  return {
    asOf: { soil: soil?.asOf ?? null, reservoirs: reservoirs?.asOf ?? null, rain: waterSummary.rain?.end ?? null, outlook: outlook.issued },
    reservoirs: reservoirs ? { state: reservoirs.state as ReservoirTotals, basins, major, source: reservoirs.source, url: reservoirs.url, releaseNote: reservoirs.releaseNote } : null,
    rain: waterSummary.rain ? { deviationPct: waterSummary.rain.deviationPct, start: waterSummary.rain.start, end: waterSummary.rain.end, ne: waterSummary.rain.neMonsoon ?? null } : null,
    enso: {
      alert: outlook.alert, issued: outlook.issued, synopsis: outlook.synopsis, ondElNinoPct: ond?.elNino ?? null,
      peak: (outlook as unknown as { peak?: { label: string; medianC: number } }).peak ?? null,
      past: ne ? { elNinoYears: ne.elNinoYears, anomalyPct: ne.elNinoAnomalyPct, belowNormal: ne.elNinoBelowNormal, belowNormalAll: ne.belowNormalAllYears, allYears: ne.allYears, range: ne.elNinoRangePct } : null,
    },
    soil: soil ? {
      depthCm: soil.headlineDepthCm, asOf: soil.asOf, firstYear: soil.baseline.firstYear, lastYear: soil.baseline.lastYear, source: soil.source, url: soil.url,
      rainfed: rainfed.length, read: read.length, record: tally("record"), below: tally("below"), above: tally("above"),
      irrigated: mandals.filter(m => m.cls === "irrigated").length,
    } : null,
    irrigation: irrigation ? { source: irrigation.source, url: irrigation.url, caveat: irrigation.caveat, belowPct: below, stateIrrigatedPct: irrigation.summary?.stateIrrigatedPct ?? null } : null,
    districts, sowing, mandals,
  };
}

let cache: ReturnType<typeof buildRabi> | undefined;
export function rabiView() {
  cache ??= buildRabi();
  return cache;
}
