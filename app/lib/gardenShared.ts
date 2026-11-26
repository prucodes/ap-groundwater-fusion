/* The water garden's rules, shared by the page, its film and the build (lib/waterGarden.ts
   writes the data; this file never imports it, so the browser can use it without carrying
   the State's whole record). Every mandal is one plant: its roots reach down to the water
   table measured in the chosen month, to scale; its grain head stands full where the water
   is shallower than its usual for that month (the median of its own readings in that month, every year
   on record) and droops where it stands deeper. A drooping plant is a place worse off than
   is normal for it, not merely worse than last year. */

/** One mandal: id, name, district, region, its depth (m below ground) in each year of `years`,
    and its usual depth in that month (null with fewer than MIN_YEARS readings to judge by). */
export type GardenPlant = [id: string, name: string, district: string, region: number, depths: Array<number | null>, usual: number | null];

export type GardenStep = {
  year: number;
  /** Index of `year` in `years`. */
  index: number;
};

/** A mandal needs this many years read in the month before it has a usual to be set against. */
export const MIN_YEARS = 5;

export type Garden = {
  /** The month every year is read in (the latest month most mandals report), 1 to 12. */
  month: number;
  monthName: string;
  years: number[];
  /** Each year read, oldest first; the last is the latest. */
  steps: GardenStep[];
  /** Years with no readings at all in that month, which the playback steps over. */
  missingYears: number[];
  regions: string[];
  /** The depth the roots are drawn to scale against: the deepest reading shown, rounded up to 10 m. */
  scaleM: number;
  plants: GardenPlant[];
};

/** Deeper or shallower than the year before means by more than this. */
export const MOVED_CM = 10;

/** +1 deeper than usual (the plant droops), -1 shallower (it opens), 0 within 0.1 m (a bud),
    null where the reading or the usual is missing. Decided in whole centimetres on
    two-decimal figures, so 1.23 against 1.13 m is within 0.1 m whatever floating point
    makes of the subtraction. */
export function sideOf(now: number | null, usual: number | null): -1 | 0 | 1 | null {
  if (now === null || usual === null) return null;
  const cm = Math.round((now - usual) * 100);
  return cm > MOVED_CM ? 1 : cm < -MOVED_CM ? -1 : 0;
}

export type StepCounts = { deeper: number; shallower: number; steady: number; compared: number; noReading: number; total: number };

/** The figures the page prints for a year: the same rule the plants are drawn by. */
export function stepCounts(garden: Garden, step: GardenStep): StepCounts {
  let deeper = 0, shallower = 0, steady = 0, noReading = 0;
  for (const plant of garden.plants) {
    const side = sideOf(plant[4][step.index], plant[5]);
    if (side === 1) deeper++;
    else if (side === -1) shallower++;
    else if (side === 0) steady++;
    else noReading++;
  }
  return { deeper, shallower, steady, compared: deeper + shallower + steady, noReading, total: garden.plants.length };
}

/** A steady number in 0..1 for each plant, so a plant leans and stands the same way on every visit. */
export function seedOf(i: number, salt = 0) {
  let h = (i + 1) * 374761393 + salt * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return ((h >>> 0) % 10007) / 10007;
}

/* ---------------- Layout ---------------- */

/** Room at the left of a row for the depth scale, and at the right. */
export const PAD_LEFT = 46, PAD_RIGHT = 10;
/** The gap between regions when they share one row. */
export const REGION_GAP = 16;

export type GardenRow = {
  width: number;
  region: number | null;
  /** Plant index in garden.plants and its x, left to right. */
  plants: Array<{ i: number; x: number }>;
  /** Where each region's plants span, for its label. */
  spans: Array<{ region: number; from: number; to: number }>;
};

/** "one": the whole State in a single row, north to south, a gap between regions.
    "regions": a row for each region, the same spacing in each, so their lengths compare. */
export function gardenRows(garden: Garden, mode: "one" | "regions", spacing: number): GardenRow[] {
  const byRegion = garden.regions.map((_, r) => garden.plants.flatMap((p, i) => (p[3] === r ? [i] : [])));
  if (mode === "one") {
    const plants: GardenRow["plants"] = [], spans: GardenRow["spans"] = [];
    let x = PAD_LEFT + spacing / 2;
    byRegion.forEach((members, region) => {
      if (!members.length) return;
      if (plants.length) x += REGION_GAP;
      const from = x - spacing / 2;
      for (const i of members) { plants.push({ i, x }); x += spacing; }
      spans.push({ region, from, to: x - spacing / 2 });
    });
    return [{ width: x - spacing / 2 + PAD_RIGHT, region: null, plants, spans }];
  }
  const most = Math.max(...byRegion.map(m => m.length));
  const width = PAD_LEFT + most * spacing + PAD_RIGHT;
  return byRegion.flatMap((members, region) => members.length ? [{
    width, region,
    plants: members.map((i, k) => ({ i, x: PAD_LEFT + (k + 0.5) * spacing })),
    spans: [{ region, from: PAD_LEFT, to: PAD_LEFT + members.length * spacing }],
  }] : []);
}

/** The spacing that makes a row `width` units wide. */
export function spacingFor(garden: Garden, mode: "one" | "regions", width: number) {
  const counts = garden.regions.map((_, r) => garden.plants.filter(p => p[3] === r).length).filter(Boolean);
  return mode === "one"
    ? (width - PAD_LEFT - PAD_RIGHT - REGION_GAP * (counts.length - 1)) / garden.plants.length
    : (width - PAD_LEFT - PAD_RIGHT) / Math.max(...counts);
}

export const monthYear = (garden: Garden, year: number) => `${garden.monthName} ${year}`;
