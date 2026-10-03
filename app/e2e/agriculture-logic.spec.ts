import { expect, test } from "@playwright/test";
import { agricultureCsv, buildAgricultureEvidence, cropWaterBudget, DEFAULT_BUDGET } from "../lib/agriculture";
import watchJson from "../data/monsoon_watch.json";
import recordsJson from "../data/mandal_groundwater_records_v2.json";
import waterJson from "../data/water_context.json";
import geometry from "../data/ap_map_geometry.json";
import type { MonsoonWatch, WaterContext } from "../lib/data";
import type { MandalGroundwaterRecordV2 } from "../lib/types";

const watch = watchJson as MonsoonWatch;
const records = recordsJson.records as MandalGroundwaterRecordV2[];
const water = waterJson as unknown as WaterContext;
const features = geometry.mandals.map(feature => ({ d: feature.d, m: feature.m, path: "M0 0Z" }));
const evidence = buildAgricultureEvidence(watch, records, features);
const withWater = buildAgricultureEvidence(watch, records, features, water);

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
  expect(csv.trim().split("\n")).toHaveLength(9);
  expect(csv.trim().endsWith(',""')).toBe(true);
});

test("soil and gauge rain join by boundary and leave the groundwater classification alone", () => {
  const groundwater = ({ boundaries, compared, flagged, severe, unresolved, unmappedSeries, ambiguousBoundaries }: typeof evidence.counts) =>
    ({ boundaries, compared, flagged, severe, unresolved, unmappedSeries, ambiguousBoundaries });
  expect(groundwater(withWater.counts)).toEqual(groundwater(evidence.counts));
  expect(withWater.mandals.map(row => row.signal)).toEqual(evidence.mandals.map(row => row.signal));
  const orvakal = withWater.mandals.find(row => row.mandal === "ORVAKAL")!;
  const soil = water.soilMoisture!.mandals.find(row => row.boundaryIndex === orvakal.index)!;
  const rain = water.rainfall!.mandals.find(row => row.boundaryIndex === orvakal.index)!;
  expect(orvakal.soil?.pct).toBe(soil.pct[water.soilMoisture!.depthsCm.indexOf(water.soilMoisture!.headlineDepthCm)]);
  expect(orvakal.rain?.deviationPct).toBe(rain.deviationPct);
  expect(withWater.mandals.filter(row => row.soil).length).toBeGreaterThan(550);
  expect(evidence.mandals.every(row => row.soil === null && row.rain === null)).toBe(true);
});

test("a boundary claimed by two soil or rain rows shows neither", () => {
  const orvakal = withWater.mandals.find(row => row.mandal === "ORVAKAL")!;
  const soil = water.soilMoisture!.mandals.find(row => row.boundaryIndex === orvakal.index)!;
  const doubled = { ...water, soilMoisture: { ...water.soilMoisture!, mandals: [...water.soilMoisture!.mandals, { ...soil, uuid: "other", pct: soil.pct.map(() => 1) }] } };
  const updated = buildAgricultureEvidence(watch, records, features, doubled);
  expect(updated.mandals[orvakal.index].soil).toBeNull();
  expect(updated.mandals[orvakal.index].rain).toEqual(orvakal.rain);
});

test("missing water sections stay missing instead of becoming zeros", () => {
  const updated = buildAgricultureEvidence(watch, records, features, { ...water, soilMoisture: null, rainfall: null, reservoirs: null });
  expect(updated.water).toEqual({ soil: null, rain: null, reservoirs: null });
  expect(updated.mandals.every(row => row.soil === null && row.rain === null)).toBe(true);
});

test("canal releases are listed, never summed into a supply total", () => {
  const releases = withWater.water.reservoirs!.topCanalReleases;
  expect(releases.length).toBeGreaterThan(0);
  expect(releases.length).toBeLessThanOrEqual(6);
  for (let i = 1; i < releases.length; i++) expect(releases[i - 1].cusecs).toBeGreaterThanOrEqual(releases[i].cusecs);
  expect(Object.keys(withWater.water.reservoirs!)).not.toContain("canalReleaseCusecs");
});

test("export carries soil and gauge columns with their own caveats", () => {
  const orvakal = withWater.mandals.find(row => row.mandal === "ORVAKAL")!;
  const csv = agricultureCsv([orvakal], withWater);
  expect(csv).toContain("modelled, not measured");
  expect(csv).toContain("soil_moisture_pct");
  expect(csv).toContain("gauge_rain_departure_pct");
  expect(csv).toContain(`"${orvakal.rain!.deviationPct}"`);
  expect(csv).toContain("signals_pointing_to_stress");
  expect(csv).toContain("not a score");
});

test("agreement counts stated tests and never treats a missing source as agreeing", () => {
  for (const row of withWater.mandals) {
    const a = row.agreement;
    expect(a.stressed).toBe([a.groundwater, a.rain, a.soil].filter(value => value === true).length);
    expect(a.known).toBe([a.groundwater, a.rain, a.soil].filter(value => value !== null).length);
    expect(a.groundwater).toBe(row.signal === "unavailable" ? null : row.signal === "short" || row.signal === "severe");
    if (!row.rain) expect(a.rain).toBeNull();
    if (!row.soil?.rankDriest) expect(a.soil).toBeNull();
  }
  expect(withWater.counts.agreeAll).toBe(withWater.mandals.filter(row => row.agreement.stressed === 3).length);
  expect(withWater.counts.agreeAll).toBeGreaterThan(0);
  expect(withWater.counts.agreeAll).toBeLessThanOrEqual(withWater.counts.flagged);
  expect(withWater.districts.reduce((n, district) => n + district.agreeAll, 0)).toBe(withWater.counts.agreeAll);
  expect(evidence.counts.agreeAll).toBe(0);
  expect(evidence.counts.allKnown).toBe(0);
});

test("the soil test is the driest quarter of years for that date, nothing looser", () => {
  const orvakal = withWater.mandals.find(row => row.mandal === "ORVAKAL")!;
  const soil = water.soilMoisture!.mandals.find(row => row.boundaryIndex === orvakal.index)!;
  const soilTest = (rankDriest: number) => buildAgricultureEvidence(watch, records, features, {
    ...water,
    soilMoisture: { ...water.soilMoisture!, mandals: water.soilMoisture!.mandals.map(row => row === soil ? { ...row, baseline: { ...row.baseline!, rankDriest, ofYears: 13 } } : row) },
  }).mandals[orvakal.index].agreement.soil;
  expect(soilTest(1)).toBe(true);
  expect(soilTest(3)).toBe(true);
  expect(soilTest(4)).toBe(false);
  expect(soilTest(13)).toBe(false);
});
