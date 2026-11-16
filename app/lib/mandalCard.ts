import { mandalByMapKey, mapGeometry, titleCase } from "./data";
import { summerOutlook } from "./summer";
import { summerPriority, type PriorityBand } from "./summerPriority";
import { arnab } from "./arnab";
import { sensors } from "./sensors";

/* One mandal's season on a card to share: the latest reading, its deepest May,
   the month the groundwater clock says it passes it, its place on the summer
   drinking-water list and the rain the two cyclones brought. Server code only:
   the page passes these few figures to the card, not the files behind them. */

export type ClockKind = "already" | "typical" | "dry" | "within";

export type MandalCardFacts = {
  mandal: string; district: string;
  readingMonth: string; depthM: number; deepestMayM: number;
  clock: { kind: ClockKind; month: string | null };
  band: PriorityBand | null;
  cycloneMm: number | null; cycloneDays: number | null;
  targetMay: string;
  /** The median of the mandal's automatic sensors today and the same sensors a year ago. */
  sensorsToday: { todayM: number; yearAgoM: number | null; count: number; reading: string } | null;
};

const place = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));

export function mandalCardFacts(id: string): MandalCardFacts | null {
  const index = mapGeometry.mandals.findIndex(x => mandalByMapKey(x.d, x.m)?.id === id);
  const row = index >= 0 ? summerOutlook.mandals[index] : null;
  if (!row) return null;
  const passes = row.passes;
  const clock: MandalCardFacts["clock"] = passes?.typical
    ? { kind: passes.typical <= row.anchorMonth ? "already" : "typical", month: passes.typical }
    : passes?.dry ? { kind: "dry", month: passes.dry } : { kind: "within", month: null };
  const band = summerPriority.mandals.find(r => r.index === index)?.band ?? null;
  const storm = arnab.together?.map.find(r => r[0] === index);
  const feature = mapGeometry.mandals[index];
  return {
    mandal: place(feature?.m ?? row.mandal), district: place(feature?.d ?? row.district),
    readingMonth: row.anchorMonth, depthM: row.anchor, deepestMayM: row.deepestMay,
    clock, band,
    cycloneMm: storm ? storm[3] : null, cycloneDays: storm ? arnab.together?.rainWindow.days ?? null : null,
    targetMay: summerOutlook.targetMay,
    sensorsToday: (() => {
      const row = sensors.mandals.find(m => m[0] === index);
      return row ? { todayM: row[2], yearAgoM: row[3], count: row[1], reading: sensors.latestReading } : null;
    })(),
  };
}
