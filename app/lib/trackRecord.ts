import summerJson from "../data/summer_outlook.json";
import cardJson from "../data/model_card.json";
import crossJson from "../data/cross_network_check.json";
import ledgerJson from "../data/forecast_ledger.json";
import cropJson from "../data/crop_water_scorecard.json";
import sensorJson from "../data/sensor_wells_check.json";

/* Each product's track record in one place: what it said, what then happened, and how
   that was tested, read from the files the tests themselves write. Officials act on
   calls, not metres, so each line is a call and how often it came true, beside the rate
   it should beat. Nothing here is computed afresh: a figure moves only when its own test
   does. Server code only. */

export type TrackId = "summer" | "nowcast" | "forecast" | "ledger" | "crops" | "sensors";
export type TrackVerdict = "holds" | "mixed" | "not yet" | "pending";
export type TrackEntry = {
  id: TrackId;
  product: string;
  href: string;
  verdict: TrackVerdict;
  /** The call and how often it came true, in one sentence. */
  headline: string;
  /** How it was tested, and its limit. */
  detail: string;
  kind: "tested on past years" | "frozen as published" | "running test";
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthYear = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const pct = (v: number) => `${Math.round(v)}%`;
const m = (v: number) => `${v.toFixed(1)} m`;
const n = (v: number) => v.toLocaleString("en-IN");

type Summer = { backtest: { comparisons: number; years: number[]; pastRecordPct: Record<string, number | null>; baseRatePct: number; recordsFlaggedPct: number | null } | null };
type Card = { evaluations: {
  temporalNowcast: { depthBands: Array<{ band: string; maeM: number }>; intervalEvaluation: { empiricalCoveragePct: number; nominalCoveragePct: number } };
  rollingOriginNowcast: { sampleCount: number; maeM: number; lastReadingMaeM: number; skillVsLastReadingPct: number };
  directForecast: { horizons: Array<{ horizonMonths: number; rollingOrigin?: { validated?: boolean; sampleCount: number; originCount: number; maeM: number; baselines: { noChange: { maeM: number } } } }> };
} };
type Cross = { overall: { bySeason: { usual: { clearMoves: number; forecast: number; measured: number }; broke: { clearMoves: number; forecast: number; measured: number } } } };
type Ledger = { forecastsTracked: number; firstIssued: string | null; scored: { forecasts: number; maeM: number; noChangeMaeM?: number; gainPct?: number | null } | null;
  nextTest?: { target: string; forecasts: number } | null };
type Crop = { firstFrozen: string; scored: number; record: Record<string, { verdict: string }> };
type Sensors = { verdict: string; nextTest: string | null; tests: Array<{ month: string; sameMonth: boolean; sensorYear?: { maeM: number; carryMaeM: number; mandals: number }; sensorMonth?: { maeM: number; carryMaeM: number; mandals: number } }> };

const JUDGE = 100;

export function trackRecord(): TrackEntry[] {
  const out: TrackEntry[] = [];
  const s = (summerJson as unknown as Summer).backtest;
  if (s && s.pastRecordPct.beyond != null) {
    const ratio = s.pastRecordPct.beyond / s.baseRatePct;
    out.push({
      id: "summer", product: "Summer outlook", href: "/summer/", kind: "tested on past years", verdict: ratio >= 1.5 ? "holds" : "mixed",
      headline: `Mandals it named "past their record" went deeper than any earlier May ${ratio.toFixed(1)} times as often as mandals overall (${pct(s.pastRecordPct.beyond)} against ${pct(s.baseRatePct)})${s.recordsFlaggedPct != null ? `, and ${pct(s.recordsFlaggedPct)} of the Mays that did set a record had been flagged` : ""}.`,
      detail: `Each May from ${s.years[0]} to ${s.years[s.years.length - 1]} projected from August using the other years' winters only: ${n(s.comparisons)} mandal-years. Named "within its record", ${pct(100 - (s.pastRecordPct.within ?? 0))} stayed within it.`,
    });
  }
  const card = (cardJson as unknown as Card).evaluations;
  const roll = card.rollingOriginNowcast, interval = card.temporalNowcast.intervalEvaluation;
  const deepest = card.temporalNowcast.depthBands[card.temporalNowcast.depthBands.length - 1];
  out.push({
    id: "nowcast", product: "This month's level", href: "/map/", kind: "tested on past years", verdict: roll.skillVsLastReadingPct > 0 ? "holds" : "not yet",
    headline: `Off by ${m(roll.maeM)} on average, against ${m(roll.lastReadingMaeM)} for carrying last month's reading forward; its 80% range held ${pct(interval.empiricalCoveragePct)} of the time.`,
    detail: `${n(roll.sampleCount)} mandal-months, each estimated by a model retrained only on what came before. Deepest tables (${deepest.band}) are off by ${m(deepest.maeM)}.`,
  });
  const h3 = card.directForecast.horizons.find(h => h.horizonMonths === 3)?.rollingOrigin;
  const cross = (crossJson as unknown as Cross).overall.bySeason;
  if (h3?.validated !== false && h3) {
    const gain = 100 * (1 - h3.maeM / h3.baselines.noChange.maeM);
    out.push({
      id: "forecast", product: "Three months ahead", href: "/methodology/#forecast-ledger", kind: "tested on past years", verdict: gain >= 5 && cross.broke.forecast >= 0.5 ? "holds" : "mixed",
      headline: `Off by ${m(h3.maeM)} on average, against ${m(h3.baselines.noChange.maeM)} for assuming no change (${pct(gain)} better). On CGWB's own wells it called the direction right ${pct(100 * cross.usual.forecast)} of the time in usual seasons, but ${pct(100 * cross.broke.forecast)} when the season broke pattern.`,
      detail: `${n(h3.sampleCount)} forecasts over ${h3.originCount} retrains, each on earlier months only. CGWB's wells were never used to build it; the State's own wells agree with them ${pct(100 * cross.usual.measured)} and ${pct(100 * cross.broke.measured)} of the time.`,
    });
  }
  const ledger = ledgerJson as unknown as Ledger;
  if (ledger.forecastsTracked) {
    const scored = ledger.scored, judged = scored && scored.forecasts >= JUDGE;
    out.push({
      id: "ledger", product: "Forecasts as published", href: "/methodology/#forecast-ledger", kind: "frozen as published",
      verdict: !judged ? "pending" : (scored!.gainPct ?? 0) >= 0 ? "holds" : "not yet",
      headline: judged
        ? `${n(scored!.forecasts)} published forecasts scored: off by ${m(scored!.maeM)} against ${m(scored!.noChangeMaeM ?? 0)} for assuming no change.`
        : `${n(ledger.forecastsTracked)} published forecasts frozen since ${day(ledger.firstIssued!)}${ledger.nextTest ? `; the first ${n(ledger.nextTest.forecasts)} are scored when ${monthYear(ledger.nextTest.target)}'s readings arrive` : ""}.`,
      detail: "Each week's forecasts written down as published, fingerprinted, and never changed: the one record that cannot be fitted after the fact.",
    });
  }
  const crop = cropJson as unknown as Crop;
  const verdicts = Object.values(crop.record).map(r => r.verdict);
  const count = (v: string) => verdicts.filter(x => x === v).length;
  if (verdicts.length) {
    out.push({
      id: "crops", product: "Crop water calls", href: "/agriculture/", kind: "frozen as published", verdict: count("backed") > verdicts.length / 2 ? "holds" : count("backed") ? "mixed" : "not yet",
      headline: `Borne out from space in ${count("backed")} of ${verdicts.length} crop stages so far; weak in ${count("weak")}, not borne out in ${count("not borne out")}${count("untested") ? `, too few to test in ${count("untested")}` : ""}.`,
      detail: `Each week's calls frozen since ${day(crop.firstFrozen)} and checked three weeks later against the vegetation index over rainfed cropland; ${crop.scored} weeks scored. Read the check as where crops need water now, not as a forecast.`,
    });
  }
  const sensors = sensorJson as unknown as Sensors;
  const early = sensors.tests.find(t => !t.sameMonth && t.sensorYear);
  const same = sensors.tests.filter(t => t.sameMonth);
  const lastSame = same[same.length - 1];
  const best = lastSame ? [lastSame.sensorMonth, lastSame.sensorYear].filter(Boolean).sort((a, b) => a!.maeM - b!.maeM)[0] : null;
  out.push({
    id: "sensors", product: "Daily sensors as the water table", href: "/methodology/#track-record", kind: "running test",
    verdict: sensors.verdict === "stands in" ? "holds" : sensors.verdict === "not better" ? "not yet" : "pending",
    headline: sensors.verdict === "stands in"
      ? `The State's daily sensors now estimate each month's hand-read level better than last month's reading does.`
      : lastSame && best
        ? `Not used for levels: in ${monthYear(lastSame.month)} the sensors were off by ${m(best.maeM)}, against ${m(best.carryMaeM)} for last month's reading carried forward.`
        : early?.sensorYear
          ? `Not used for levels: an early look at ${monthYear(early.month)} put the sensors ${m(early.sensorYear.maeM)} off, against ${m(early.sensorYear.carryMaeM)} for last month's reading carried forward.`
          : "Not used for levels until they are tested.",
    detail: `They stand in different wells from the monthly readings, and the gap between the two moves with the season. ${sensors.nextTest ? `The next same-month test is ${monthYear(sensors.nextTest)}, when its hand-read wells are published. ` : ""}They are shown only once they beat carrying last month forward in two such tests.`,
  });
  return out;
}

export const trackEntry = (id: TrackId) => trackRecord().find(e => e.id === id) ?? null;
