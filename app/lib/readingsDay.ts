import seriesJson from "../data/mandal_observation_series_v2.json";
import ledgerJson from "../data/forecast_ledger.json";
import sensorJson from "../data/sensor_wells_check.json";
import { MOVED_CM, sideOf } from "./gardenShared";
import { summerOutlook } from "./summer";
import { gardenSummary, waterGarden } from "./waterGarden";

/* Readings day (/readings/): what the newest month of the State's hand-read wells says, and
   the tests that were waiting for it. It is built around the newest month with readings for
   most mandals, so when the Monday refresh brings a new month in, the page turns to it by
   itself: what moved since the month before, against how much it usually moves; whether the
   forecasts frozen for that month held; whether the daily sensors could have stood in for the
   wells; and what the next month will test. Server code only. */

type Obs = { period: string; value: number | null };
const series = (seriesJson as unknown as { series: Record<string, { observations: Obs[] }> }).series;

/** The median mandal's move since a forecast's origin, month by month, among that month's forecasts (negative is nearer the surface). */
export type PathPoint = { month: string; changeM: number; mandals: number };
type Block = { forecasts: number; maeM: number; biasM: number; bandCoveragePct: number; noChangeMaeM: number; gainPct: number; origin: string; expectedChangeM: number; measuredChangeM: number; yearAgoMinusMeasuredM: number; path?: PathPoint[] };
type Ledger = {
  firstIssued: string; weeksFrozen: number; forecastsTracked: number;
  byTarget: Record<string, Block>; pendingByTarget: Record<string, number>;
  nextTest: { target: string; forecasts: number; issued: string; origin: string; latestMonth: string; expectedChangeM: number; soFarChangeM: number; yearAgoMinusLatestM: number; path?: PathPoint[] } | null;
  weeks: Array<{ issued: string; forecasts: number; sha256: string }>;
};
type SensorTest = { month: string; sameMonth: boolean; sensorDays: number; sensorYear?: { mandals: number; maeM: number; carryMaeM: number; gainPct: number; biasM: number }; sensorMonth?: { mandals: number; maeM: number; carryMaeM: number; gainPct: number } };
type Sensors = { question: string; rule: string; nextTest: string; verdict: string; tests: SensorTest[] };

/** A forecast verdict needs this many forecasts for the month (as /methodology's ledger). */
export const MIN_TO_JUDGE = 100;
/** A month counts as in once at least this share of mandals have a reading for it. */
const MIN_SHARE_READ = 0.5;
/** A move is doubted (likely a misread month) past twice the mandal's largest move between the
    same two months on record, never less than 5 m, or past 20 m whatever the record. */
const DOUBT_FLOOR_M = 5, DOUBT_ANY_M = 20;

const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b), n = v.length;
  return n ? (n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2) : null;
};
export const nextMonth = (ym: string, by = 1) => {
  const [y, m] = ym.split("-").map(Number), k = y * 12 + (m - 1) + by;
  return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, "0")}`;
};

export type Mover = { id: string; name: string; district: string; changeM: number; nowM: number; doubted?: boolean };

/** The map's classes for a month-to-month move, metres below ground (positive is deeper): past 1 m, past 0.1 m, or within it. */
export const MOVE_BINS = [
  { key: "D", label: "More than 1 m deeper", color: "#b4493a" },
  { key: "d", label: "0.1 to 1 m deeper", color: "#e6a593" },
  { key: "s", label: "Within 0.1 m", color: "#d3dbe1" },
  { key: "u", label: "0.1 to 1 m nearer the surface", color: "#8fcac6" },
  { key: "U", label: "More than 1 m nearer the surface", color: "#1f7f86" },
] as const;
export type MoveKey = (typeof MOVE_BINS)[number]["key"];
/** Same threshold as the counts (sideOf: more than 10 cm), so the map's colours add up to them. */
export const moveKey = (changeM: number): MoveKey => {
  const cm = Math.round(changeM * 100);
  return cm > 100 ? "D" : cm > MOVED_CM ? "d" : cm < -100 ? "U" : cm < -MOVED_CM ? "u" : "s";
};
export type ReadingsDay = {
  month: string; previous: string; read: number; total: number;
  /** Since the month before: mandals read in both, by side (more than 0.1 m), the median change and the usual one.
      Likely misreadings (doubted) are left out of every count and the median, and listed on their own. */
  change: { compared: number; deeper: number; shallower: number; steady: number; medianChangeM: number | null; usualChangeM: number | null; medianNowM: number | null; deeper5: Mover[]; shallower5: Mover[]; doubted: Mover[]; all: Mover[]; bins: Record<MoveKey, number> };
  /** Against each mandal's usual for this month, as the Water Garden counts it (when the garden shows this month). */
  usual: { deeper: number; compared: number; shallower: number; worstSince: number | null } | null;
  forecast: { judged: boolean; target: string; block: Block | null; forecasts: number; issued: string | null; began: string; next: Ledger["nextTest"] };
  sensors: { test: SensorTest | null; nextTest: string; verdict: string; rule: string };
  summer: { anchor: string; beyond: number; dry: number; mandals: number };
  next: { month: string; landsBy: string; forecasts: number; sensorTest: boolean };
};

export function readingsDay(): ReadingsDay {
  const ids = Object.keys(series), total = ids.length;
  const at = new Map(ids.map(id => [id, new Map(series[id].observations.filter(o => o.value !== null).map(o => [o.period, o.value as number]))]));
  // The newest month most mandals have been read for.
  const counts = new Map<string, number>();
  at.forEach(byMonth => byMonth.forEach((_, period) => counts.set(period, (counts.get(period) ?? 0) + 1)));
  const month = [...counts].filter(([, n]) => n >= total * MIN_SHARE_READ).map(([p]) => p).sort().pop()!;
  const previous = nextMonth(month, -1);

  const garden = waterGarden();
  const who = new Map(garden.plants.map(p => [p[0], { name: p[1], district: p[2] }]));
  const changes: Mover[] = [];
  const usualChanges: number[] = [];
  for (const id of ids) {
    const byMonth = at.get(id)!, now = byMonth.get(month), before = byMonth.get(previous);
    // This mandal's moves between the same two months, over the years before.
    const past: number[] = [];
    for (let y = Number(month.slice(0, 4)) - 1; y >= 2014; y--) {
      const a = byMonth.get(`${y}${month.slice(4)}`), b = byMonth.get(`${nextMonth(`${y}${month.slice(4)}`, -1)}`);
      if (a !== undefined && b !== undefined) past.push(a - b);
    }
    if (past.length >= 5) usualChanges.push(median(past)!);
    if (now !== undefined && before !== undefined) {
      const changeM = Math.round((now - before) * 100) / 100, largest = past.length >= 3 ? Math.max(...past.map(Math.abs)) : null;
      const doubted = Math.abs(changeM) > DOUBT_ANY_M || (largest !== null && Math.abs(changeM) > 2 * Math.max(largest, DOUBT_FLOOR_M));
      changes.push({ id, ...(who.get(id) ?? { name: id, district: "" }), changeM, nowM: now, doubted });
    }
  }
  const trusted = changes.filter(c => !c.doubted);
  const sides = trusted.map(c => sideOf(c.nowM, c.nowM - c.changeM));
  const byChange = [...trusted].sort((a, b) => b.changeM - a.changeM);
  const bins = Object.fromEntries(MOVE_BINS.map(b => [b.key, 0])) as Record<MoveKey, number>;
  trusted.forEach(c => { bins[moveKey(c.changeM)] += 1; });

  const latest = garden.steps[garden.steps.length - 1];
  const gardenMonth = `${latest.year}-${String(garden.month).padStart(2, "0")}`;
  const g = gardenMonth === month ? gardenSummary(garden) : null;

  const ledger = ledgerJson as unknown as Ledger;
  const block = ledger.byTarget[month] ?? null;
  const issuedFor = (target: string) => ledger.nextTest?.target === target ? ledger.nextTest.issued : null;
  const sensors = sensorJson as unknown as Sensors;
  const test = sensors.tests.find(t => t.month === month) ?? null;
  const following = nextMonth(month);
  const o = summerOutlook.summary;

  return {
    month, previous, read: counts.get(month) ?? 0, total,
    change: {
      compared: trusted.length,
      deeper: sides.filter(s => s === 1).length, shallower: sides.filter(s => s === -1).length, steady: sides.filter(s => s === 0).length,
      medianChangeM: median(trusted.map(c => c.changeM)), usualChangeM: median(usualChanges), medianNowM: median(trusted.map(c => c.nowM)),
      deeper5: byChange.slice(0, 5).filter(c => c.changeM > 0.1), shallower5: byChange.slice(-5).reverse().filter(c => c.changeM < -0.1),
      doubted: changes.filter(c => c.doubted).sort((a, b) => Math.abs(b.changeM) - Math.abs(a.changeM)),
      all: changes, bins,
    },
    usual: g ? { deeper: g.counts.deeper, compared: g.counts.compared, shallower: g.counts.shallower, worstSince: g.worstSince } : null,
    forecast: { judged: Boolean(block && block.forecasts >= MIN_TO_JUDGE), target: month, block, forecasts: block?.forecasts ?? 0, issued: issuedFor(month), began: ledger.firstIssued, next: ledger.nextTest },
    sensors: { test, nextTest: sensors.nextTest, verdict: sensors.verdict, rule: sensors.rule },
    summer: { anchor: summerOutlook.anchor, beyond: o.beyond, dry: o.dry, mandals: o.mandals },
    next: { month: following, landsBy: nextMonth(following), forecasts: ledger.pendingByTarget[following] ?? 0, sensorTest: sensors.nextTest === following },
  };
}
