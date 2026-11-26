import fieldQueueJson from "../data/field_queue.json";
import { MAP_VIEW, mandalByMapKey, mapGeometry, monsoonWatch, titleCase } from "./data";
import { droughtSummary } from "./droughtSummary";
import { sideOf, type GardenAquifer } from "./gardenShared";
import { summerOutlook, type SummerTier } from "./summer";
import { summerPriority, type PriorityRow } from "./summerPriority";
import { waterGarden } from "./waterGarden";
import { waterForDistrict, waterSummary } from "./waterSummary";
import type { WaterDistrictContext } from "./data";

/* One A4 sheet per district, for the District Collector: the district's figures as the
   site already publishes them, gathered in one place. Nothing here computes a new
   statistic: the water table against its usual is the Water Garden's rule
   (lib/gardenShared.ts), the summer call is the Summer Outlook's, the priority list is
   the summer brief's, and rain, soil, reservoirs and the drought manual are read as the
   Rabi, Drought and This Week pages read them. Server code only. */

/** A district's name with everything but its letters dropped: how the sources' spellings are matched. */
export const districtKey = (name: string) => name.toUpperCase().replace(/[^A-Z]/g, "");
/** The sheet's address: "Y.S.R Kadapa" is ysr-kadapa, "Sri Potti Sriramulu Nellore" is sri-potti-sriramulu-nellore. */
export const districtSlug = (name: string) => name.toLowerCase().replace(/^y\.s\.r\s*/, "ysr ").replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");

/** Where the deploy prints a district's sheet, beside its page. */
export const pdfName = (slug: string, lang: "en" | "te" = "en") => `ap-${slug}-district-sheet${lang === "te" ? "-te" : ""}.pdf`;

export type SheetMandal = {
  id: string; name: string; nowM: number | null; usualM: number | null;
  /** The deepest October on record, for how deep its borewell is drawn. */
  deepestM: number | null;
  /** Depth now less the usual, m: positive is deeper than usual. */
  vsUsualM: number | null; side: -1 | 0 | 1 | null;
  summer: SummerTier | null; priority: PriorityRow["band"] | null;
};

export type DistrictSheet = {
  name: string; slug: string; key: string;
  month: string;
  /** The ground most of the district's mandals sit on, and the depth its borewells are drawn to scale against. */
  aquifer: GardenAquifer;
  scaleM: number;
  mandals: SheetMandal[];
  counts: { deeper: number; shallower: number; steady: number; compared: number; total: number };
  medianNowM: number | null; medianUsualM: number | null;
  monsoon: { thisSeasonM: number; typicalM: number; shortfallM: number; shortMandals: number; mandals: number } | null;
  summer: { beyond: number; dry: number; within: number; deep: number; people: number; mandals: number } | null;
  priority: { first: number; next: number; watch: number; people: number; rows: PriorityRow[] };
  drought: { severe: number; moderate: number; between: number; normal: number; assessed: number; mandals: number } | null;
  water: WaterDistrictContext | null;
  fieldTeams: string[];
  map: { viewBox: string; shapes: Array<{ d: string; side: -1 | 0 | 1 | null; priority: boolean }> };
};

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b), mid = Math.floor(s.length / 2);
  return s.length ? (s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2) : null;
};

/** A district's outlines, projected as every map on the site is, kept finer than the State
    map's because one district fills the drawing. */
function ringPath(ring: number[][], tolerance: number) {
  let out = "", keptX = NaN, keptY = NaN;
  ring.forEach(([lon, lat], i) => {
    const [x, y] = MAP_VIEW.project(lon, lat);
    if (i > 0 && i < ring.length - 1 && Math.hypot(x - keptX, y - keptY) < tolerance) return;
    out += `${i === 0 ? "M" : "L"}${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`;
    keptX = x; keptY = y;
  });
  return out + "Z";
}

type QueueRow = { district: string; mandal: string; rank: number };

let sheets: DistrictSheet[] | undefined;

export function districtSheets(): DistrictSheet[] {
  if (sheets) return sheets;
  const garden = waterGarden(), last = garden.steps[garden.steps.length - 1];
  const month = `${garden.monthName} ${last.year}`;
  const plantById = new Map(garden.plants.map(p => [p[0], p]));
  // Every mandal outline, with the record it belongs to.
  const features = mapGeometry.mandals.map((feature, index) => ({ feature, index, record: mandalByMapKey(feature.d, feature.m) }));
  const priorityByIndex = new Map(summerPriority.mandals.map(r => [r.index, r]));
  const queue = (fieldQueueJson as unknown as { queue: QueueRow[] }).queue;

  sheets = monsoonWatch.districts.map(d => {
    const name = /[a-z]/.test(d.district) ? d.district : titleCase(d.district), key = districtKey(name);
    const mine = features.filter(f => districtKey(f.feature.d) === key);

    const mandals: SheetMandal[] = mine.flatMap(f => {
      const plant = f.record ? plantById.get(f.record.id) : undefined;
      if (!plant || !f.record) return [];
      const now = plant[4][last.index], usual = plant[5];
      const outlook = summerOutlook.mandals[f.index];
      const read = plant[4].filter((v): v is number => v !== null);
      return [{
        id: plant[0], name: plant[1], nowM: now, usualM: usual, deepestM: read.length ? Math.max(...read) : null,
        vsUsualM: now !== null && usual !== null ? Math.round((now - usual) * 100) / 100 : null,
        side: sideOf(now, usual), summer: outlook?.tier ?? null, priority: priorityByIndex.get(f.index)?.band ?? null,
      }];
    });
    const sides = mandals.map(m => m.side);
    const kinds = mine.flatMap(f => { const p = f.record ? plantById.get(f.record.id) : undefined; return p && p[7] !== null ? [p[7]] : []; });
    const aquifer = ([0, 1, 2] as GardenAquifer[]).sort((a, b) => kinds.filter(k => k === b).length - kinds.filter(k => k === a).length)[0];
    const deepest = Math.max(10, ...mandals.map(m => m.deepestM ?? 0));
    const compared = mandals.filter(m => m.nowM !== null && m.usualM !== null);

    // The map: the district's own outlines, framed with a margin.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const f of mine) for (const ring of f.feature.rings) for (const [lon, lat] of ring) {
      const [x, y] = MAP_VIEW.project(lon, lat);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 0.04, tolerance = Math.max(maxX - minX, maxY - minY) / 400;
    const sideOfIndex = new Map(mine.map(f => [f.index, f.record ? (mandals.find(m => m.id === f.record!.id)?.side ?? null) : null]));

    const outlook = summerOutlook.districts.find(o => districtKey(o.district) === key) ?? null;
    const priority = summerPriority.districts.find(p => districtKey(p.district) === key);
    const drought = droughtSummary.districts.find(x => districtKey(x.district) === key);
    const c = drought?.counts;
    return {
      name, slug: districtSlug(name), key, month, mandals, aquifer: kinds.length ? aquifer : 0, scaleM: Math.ceil((deepest + 6) / 10) * 10,
      counts: { deeper: sides.filter(s => s === 1).length, shallower: sides.filter(s => s === -1).length, steady: sides.filter(s => s === 0).length, compared: compared.length, total: mandals.length },
      medianNowM: median(compared.map(m => m.nowM as number)),
      medianUsualM: median(compared.map(m => m.usualM as number)),
      monsoon: { thisSeasonM: d.thisSeasonM, typicalM: d.typicalM, shortfallM: d.shortfallM, shortMandals: d.shortMandals, mandals: d.mandals },
      summer: outlook ? { beyond: outlook.beyond, dry: outlook.dry, within: outlook.within, deep: outlook.deep, people: outlook.people, mandals: outlook.mandals } : null,
      priority: {
        first: priority?.first ?? 0, next: priority?.next ?? 0, watch: priority?.watch ?? 0, people: priority?.people ?? 0,
        rows: summerPriority.mandals.filter(r => districtKey(r.district) === key),
      },
      drought: c ? {
        severe: c.severe ?? 0, moderate: c.moderate ?? 0, between: (c["moderate|severe"] ?? 0) + (c["normal|moderate"] ?? 0), normal: c.normal ?? 0,
        assessed: drought!.mandals - (c.insufficient ?? 0), mandals: drought!.mandals,
      } : null,
      water: waterForDistrict(name),
      fieldTeams: queue.filter(q => districtKey(q.district) === key).sort((a, b) => a.rank - b.rank).map(q => titleCase(q.mandal)),
      map: {
        viewBox: `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`,
        shapes: mine.map(f => ({ d: f.feature.rings.map(r => ringPath(r, tolerance)).join(""), side: sideOfIndex.get(f.index) ?? null, priority: priorityByIndex.has(f.index) })),
      },
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return sheets;
}

export function districtSheet(slug: string) {
  return districtSheets().find(s => s.slug === slug) ?? null;
}

/** When each source was read, for the sheet's foot. */
export function sheetDates() {
  return {
    rain: waterSummary.rain ? { start: waterSummary.rain.start, end: waterSummary.rain.end } : null,
    reservoirs: waterSummary.reservoirs?.asOf ?? null,
    drought: droughtSummary.season.asOf,
    summer: summerOutlook.targetMay,
  };
}
