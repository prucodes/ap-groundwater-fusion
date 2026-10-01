import { expect, test } from "@playwright/test";
import { agricultureCsv, buildAgricultureEvidence, cropWaterBudget, DEFAULT_BUDGET } from "../lib/agriculture";
import watchJson from "../data/monsoon_watch.json";
import recordsJson from "../data/mandal_groundwater_records_v2.json";
import geometry from "../data/ap_map_geometry.json";
import type { MonsoonWatch } from "../lib/data";
import type { MandalGroundwaterRecordV2 } from "../lib/types";

const watch = watchJson as MonsoonWatch;
const records = recordsJson.records as MandalGroundwaterRecordV2[];
const features = geometry.mandals.map(feature => ({ d: feature.d, m: feature.m, path: "M0 0Z" }));
const evidence = buildAgricultureEvidence(watch, records, features);

test("one result per boundary, reconciled denominators and no invented crop exposure", () => {
  expect(evidence.mandals).toHaveLength(features.length);
  expect(new Set(evidence.mandals.map(row => row.index)).size).toBe(features.length);
  expect(evidence.counts.compared + evidence.counts.unresolved).toBe(features.length);
  expect(evidence.counts.flagged).toBe(evidence.mandals.filter(row => ["severe", "short"].includes(row.signal)).length);
  expect(evidence.counts.severe).toBeLessThanOrEqual(evidence.counts.flagged);
  expect(evidence.districts.reduce((n, district) => n + district.compared, 0)).toBe(evidence.counts.compared);
  expect(evidence.cropExposureHa).toBeNull();
  expect(evidence.cropReadiness).toBe("not_connected");
});

test("duplicate seasonal sources become unresolved, never the worst or first selected", () => {
  const valid = evidence.mandals.find(row => row.signal !== "unavailable")!;
  const source = watch.mandals.find(row => row.boundaryIndex === valid.index)!;
  const updated = buildAgricultureEvidence({ ...watch, mandals: [...watch.mandals, { ...source, shortfallM: 1000 }] }, records, features);
  expect(updated.mandals[valid.index].signal).toBe("unavailable");
  expect(updated.mandals[valid.index].depthM).toBeNull();
  expect(updated.counts.compared).toBe(evidence.counts.compared - 1);
});

test("mismatched identities and insufficient history cannot become field evidence", () => {
  const valid = evidence.mandals.find(row => row.signal !== "unavailable")!;
  for (const change of [{ mandalUuid: "wrong-id" }, { comparableYears: 6 }, { comparableYears: NaN }, { latestDepthM: Infinity }]) {
    const updated = buildAgricultureEvidence({ ...watch, mandals: watch.mandals.map(row => row.boundaryIndex === valid.index ? { ...row, ...change } : row) }, records, features);
    expect(updated.mandals[valid.index].signal).toBe("unavailable");
  }
});

test("rainfall and nowcasts do not change the groundwater classification", () => {
  const updated = buildAgricultureEvidence({ ...watch, rainfall: null }, records.map(row => ({ ...row, nowcast: null, forecast: null })), features);
  expect(updated.counts).toEqual(evidence.counts);
  expect(updated.mandals.map(row => row.signal)).toEqual(evidence.mandals.map(row => row.signal));
});

test("unmapped series stay outside boundary totals and unknown values stay null", () => {
  const updated = buildAgricultureEvidence({ ...watch, mandals: [...watch.mandals, { ...watch.mandals[0], boundaryIndex: null }] }, records, features);
  expect(updated.counts.unmappedSeries).toBe(evidence.counts.unmappedSeries + 1);
  expect(updated.counts.compared).toBe(evidence.counts.compared);
  for (const row of updated.mandals.filter(row => row.signal === "unavailable")) {
    expect(row.shortfallM).toBeNull(); expect(row.depthM).toBeNull(); expect(row.reason).toBeTruthy();
  }
});

test("reference seven-day budget and stage changes are arithmetically correct", () => {
  const current = cropWaterBudget(DEFAULT_BUDGET);
  expect(current).toMatchObject({ kc: 1.2, demand: 33.6, rainUsed: 8, reserveUsed: 14, gap: 11.6 });
  expect(cropWaterBudget({ ...DEFAULT_BUDGET, stage: 0 })).toMatchObject({ demand: 8.4, gap: 0, reserveUsed: .4 });
  expect(cropWaterBudget({ ...DEFAULT_BUDGET, crop: "groundnut" })).toMatchObject({ demand: 32.2, gap: 10.2 });
});

test("budget conserves allocation, reports excess, and handles zero demand", () => {
  for (const eto of [0, 2, 5, 10]) for (const rain of [0, 8, 70]) for (const reserve of [0, 14, 60]) {
    const budget = cropWaterBudget({ ...DEFAULT_BUDGET, eto, rain, reserve });
    expect(budget.rainUsed + budget.reserveUsed + budget.gap).toBeCloseTo(budget.demand, 5);
    expect(budget.rainUsed + budget.unusedRain).toBeCloseTo(rain, 5);
    expect(budget.reserveUsed + budget.remainingReserve).toBeCloseTo(reserve, 5);
    expect(budget.gap).toBeGreaterThanOrEqual(0);
  }
});

test("invalid scenario inputs fail instead of becoming attractive fake values", () => {
  for (const bad of [{ eto: NaN }, { rain: -2 }, { reserve: Infinity }, { stage: 7 }, { stage: .5 }]) {
    expect(() => cropWaterBudget({ ...DEFAULT_BUDGET, ...bad })).toThrow(RangeError);
  }
});

test("export retains caveats, filtered rows, empty crop area and formula safety", () => {
  const row = { ...evidence.mandals[0], mandal: "=CMD()" };
  const csv = agricultureCsv([row], evidence);
  expect(csv).toContain("PROTOTYPE"); expect(csv).toContain("not a crop-loss estimate");
  expect(csv).toContain("\"'=CMD()\"");
  expect(csv).toContain("Seasonal baseline review pending");
  expect(csv.trim().split("\n")).toHaveLength(6);
  expect(csv.trim().endsWith(',""')).toBe(true);
});
