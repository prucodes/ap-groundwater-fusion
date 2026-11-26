import { mandalByMapKey, mandals, mapGeometry, monsoonWatch, observationSeries, titleCase } from "./data";
import { districtHome, mandalHomes } from "./mapSpread";
import { MIN_YEARS, sideOf, stepCounts, type Garden, type GardenPlant, type GardenStep, type StepCounts } from "./gardenShared";

/* The water garden's data, built once at deploy from the State's monthly hand-read wells
   (mandal_observation_series_v2.json, the mandal median of the APWRIMS readings): every
   mandal's depth in the same month of every year. The page and its film load it as
   /garden/data.json; the rules for drawing and counting it are lib/gardenShared.ts. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Andhra Pradesh's three regions, north to south: Uttarandhra, the coast from the Godavari to Nellore, and Rayalaseema. */
export const GARDEN_REGIONS = ["North coast", "Godavari to Nellore", "Rayalaseema"];
const NORTH = new Set(["PARVATHIPURAM MANYAM", "SRIKAKULAM", "VIZIANAGARAM", "ALLURI SITHARAMA RAJU", "ANAKAPALLI", "VISAKHAPATNAM"]);
const RAYALASEEMA = new Set(["KURNOOL", "NANDYAL", "ANANTHAPURAMU", "SRI SATHYA SAI", "Y.S.R KADAPA", "ANNAMAYYA", "CHITTOOR", "TIRUPATI"]);
const regionOf = (district: string) => (NORTH.has(district.toUpperCase()) ? 0 : RAYALASEEMA.has(district.toUpperCase()) ? 2 : 1);

/** A year counts if at least this many mandals were read in the month. */
const MIN_MANDALS = 100;

let built: Garden | undefined;

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) : null;
};

export function waterGarden(): Garden {
  if (built) return built;
  const byPeriod = new Map(mandals.map(m => [m.id, new Map((observationSeries[m.id]?.observations ?? []).map(o => [o.period, o.value]))]));

  // The month: the latest one most mandals report.
  const latest = new Map<string, number>();
  for (const m of mandals) {
    const obs = observationSeries[m.id]?.observations;
    if (obs?.length) latest.set(obs[obs.length - 1].period, (latest.get(obs[obs.length - 1].period) ?? 0) + 1);
  }
  const latestPeriod = [...latest].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0][0];
  const [lastYear, month] = latestPeriod.split("-").map(Number);
  const mm = String(month).padStart(2, "0");

  const years: number[] = [], missingYears: number[] = [];
  for (let year = 2000; year <= lastYear; year++) {
    const read = mandals.filter(m => byPeriod.get(m.id)?.has(`${year}-${mm}`)).length;
    if (read >= MIN_MANDALS) years.push(year);
    else if (years.length) missingYears.push(year);
  }
  const steps: GardenStep[] = years.map((year, index) => ({ year, index }));

  // Where each mandal stands on the map, for ordering north to south within its region.
  const homes = mandalHomes(), homeById = new Map<string, number>();
  mapGeometry.mandals.forEach((feature, i) => {
    const record = mandalByMapKey(feature.d, feature.m);
    if (record && !homeById.has(record.id)) homeById.set(record.id, i);
  });
  const placeOf = (id: string, district: string) => {
    const i = homeById.get(id);
    return i !== undefined ? homes[i] : districtHome(district) ?? [0, 0, 0];
  };

  const plants = mandals
    .map(m => {
      const home = placeOf(m.id, m.district_name), series = byPeriod.get(m.id)!;
      const depths = years.map(year => { const v = series.get(`${year}-${mm}`); return v === undefined ? null : Math.round(v * 100) / 100; });
      const read = depths.filter((v): v is number => v !== null);
      const usual = read.length >= MIN_YEARS ? Math.round((median(read) as number) * 100) / 100 : null;
      return { home, plant: [m.id, titleCase(m.mandal_name), titleCase(m.district_name), regionOf(m.district_name), depths, usual] as GardenPlant };
    })
    .sort((a, b) => a.plant[3] - b.plant[3] || a.home[1] - b.home[1] || a.home[0] - b.home[0])
    .map(row => row.plant);

  const deepest = Math.max(...plants.flatMap(p => p[4].filter((v): v is number => v !== null)));
  // The monsoon before each October: the Monsoon page's State rainfall, June to September.
  const history = monsoonWatch.rainfallHistory, seasons = history?.years ?? [];
  const rain = years.map(year => {
    const season = seasons.find(y => y.year === year);
    return season ? { year, mm: season.mm, anomalyPct: season.anomalyPct, enso: season.state ?? "neutral" } : null;
  });
  const rainSource = `${monsoonWatch.rainfall?.product ?? "CHIRPS"}, June to September${seasons.length ? `, against the ${seasons[0].year}-${seasons[seasons.length - 1].year} mean` : ""}`;
  built = { month, monthName: MONTHS[month - 1], years, steps, missingYears, regions: GARDEN_REGIONS, scaleM: Math.ceil(deepest / 10) * 10, plants, rain, rainNormalMm: history?.meanMm ?? 0, rainSource };
  return built;
}

export type GardenSummary = {
  step: GardenStep;
  counts: StepCounts;
  /** Median depth of the mandals compared, this year and as usual. */
  medianNowM: number | null;
  medianUsualM: number | null;
  deepest: { name: string; district: string; depthM: number } | null;
  /** The mandals whose water stands furthest below its usual. */
  fallen: Array<{ id: string; name: string; district: string; nowM: number; usualM: number; changeM: number }>;
  /** The last earlier year with as large a share deeper than usual; null if none (the most on record). */
  worstSince: number | null;
};

/** The figures the page states for the latest year, by the rule the plants are drawn by. */
export function gardenSummary(garden = waterGarden()): GardenSummary {
  const step = garden.steps[garden.steps.length - 1];
  const compared = garden.plants.flatMap(p => {
    const now = p[4][step.index], usual = p[5];
    return now !== null && usual !== null ? [{ p, now, usual }] : [];
  });
  const withNow = garden.plants.flatMap(p => (p[4][step.index] !== null ? [{ p, now: p[4][step.index] as number }] : []));
  const deepestRow = withNow.sort((a, b) => b.now - a.now)[0];
  const fallen = compared
    .filter(row => sideOf(row.now, row.usual) === 1)
    .map(row => ({ id: row.p[0], name: row.p[1], district: row.p[2], nowM: row.now, usualM: row.usual, changeM: Math.round((row.now - row.usual) * 100) / 100 }))
    .sort((a, b) => b.changeM - a.changeM);
  const counts = stepCounts(garden, step);
  // The last earlier year with as large a share deeper than usual, if any.
  const share = (c: StepCounts) => c.deeper / Math.max(c.compared, 1);
  const worse = garden.steps.slice(0, -1).filter(s => share(stepCounts(garden, s)) >= share(counts)).map(s => s.year);
  return {
    step,
    counts,
    medianNowM: median(compared.map(row => row.now)),
    medianUsualM: median(compared.map(row => row.usual)),
    deepest: deepestRow ? { name: deepestRow.p[1], district: deepestRow.p[2], depthM: deepestRow.now } : null,
    fallen: fallen.slice(0, 8),
    worstSince: worse.length ? worse[worse.length - 1] : null,
  };
}
