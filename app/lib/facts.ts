import tankFill from "../data/tank_fill.json";
import { arnab } from "./arnab";
import { mapGeometry, monsoonWatch } from "./data";
import { summerOutlook, lakhs } from "./summer";
import { summerPriority } from "./summerPriority";
import { waterContext } from "./waterContext";

/* Andhra Pradesh's season told in numbers, in order: what the monsoon brought,
   what reached the ground, what the cyclones changed, and what that means for
   summer. Each figure is one sentence with a picture of itself, built from the
   same files as the pages at every refresh, with where it comes from, the date it
   is as of, and the page that explains it. Server code only. */

export type FactVisual =
  | { kind: "bars"; items: Array<{ label: string; value: number; tone: "now" | "then" }>; unit: string }
  | { kind: "waffle"; pct: number; tone: "bad" | "warn" | "water" }
  | { kind: "map"; keys: string[]; tone: "bad" | "warn" | "water"; label: string };

export type Fact = {
  id: string; chapter: string; big: string; headline: string; text: string; visual: FactVisual;
  tone: "bad" | "warn" | "water"; source: string; asOf: string; href: string;
};

export const CHAPTERS: Array<{ title: string; lede: string }> = [
  { title: "The monsoon fell short", lede: "Less rain than normal: the reservoirs and village tanks went into winter emptier than usual." },
  { title: "The ground did not fill", lede: "A monsoon usually lifts the water table. This one left almost half the State lower than in May." },
  { title: "Two cyclones, mostly on the coast", lede: "Arnab and Murasu brought a lot of water in two weeks, but not where the water table had room for it." },
  { title: "So summer starts early", lede: "Some mandals are already deeper than any May on record, and the dry months have not begun." },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const n = (v: number) => Math.round(v).toLocaleString("en-IN");
const APWRIMS = "APWRIMS monthly groundwater readings (Ground Water and Water Audit Department piezometers)";

/** One key per mandal outline: "y" where the test holds, "n" elsewhere. */
const mapOf = (hit: (index: number) => boolean) => mapGeometry.mandals.map((_, i) => (hit(i) ? "y" : "n"));

export function facts(): Fact[] {
  const out: Fact[] = [];
  const [monsoon, ground, cyclones, summer] = CHAPTERS.map(c => c.title);

  // 1. The monsoon fell short
  const rain = waterContext.rainfall;
  const deviation = rain?.state?.deviationPct ?? null, gauges = rain?.state?.gauges ?? null;
  if (rain && deviation !== null && gauges !== null) out.push({
    id: "rain-short", chapter: monsoon, tone: "warn", big: `${Math.abs(deviation)}%`, href: "/monsoon/",
    headline: `${deviation < 0 ? "less" : "more"} rain than normal since 1 June`,
    text: `Rain since 1 June is ${Math.abs(deviation)}% ${deviation < 0 ? "below" : "above"} normal across the State's ${n(gauges)} gauges.`,
    visual: { kind: "bars", unit: "% of normal", items: [{ label: "Normal", value: 100, tone: "then" }, { label: "This year", value: Math.round(100 + deviation), tone: "now" }] },
    source: "AP Directorate of Economics and Statistics rain gauges, via APWRIMS", asOf: day(rain.window.end),
  });
  const store = waterContext.reservoirs?.state, storeAsOf = waterContext.reservoirs?.asOf ?? null;
  if (store && storeAsOf && store.lastYearPct !== null && store.storagePct !== null) out.push({
    id: "reservoirs", chapter: monsoon, tone: "warn", big: `${Math.round(store.storagePct)}%`, href: "/rabi/",
    headline: `is how full the State's reservoirs are, against ${Math.round(store.lastYearPct)}% a year ago`,
    text: `The State's ${store.count} reservoirs hold ${store.storagePct}% of capacity, against ${store.lastYearPct}% a year ago.`,
    visual: { kind: "bars", unit: "% of capacity", items: [{ label: "A year ago", value: store.lastYearPct, tone: "then" }, { label: "Now", value: store.storagePct, tone: "now" }] },
    source: "State reservoir telemetry, via APWRIMS", asOf: day(storeAsOf),
  });

  if (tankFill.wetHaUsual) out.push({
    id: "village-tanks", chapter: monsoon, tone: "water", big: `${n(tankFill.wetHaNow / 100)} km²`, href: "/rabi/",
    headline: `of village tank beds held water going into rabi, against a usual ${n(tankFill.wetHaUsual / 100)} km²`,
    text: `Village tank beds going into rabi held water over ${n(tankFill.wetHaNow / 100)} km², against a usual ${n(tankFill.wetHaUsual / 100)} km² for mid-September to mid-October.`,
    visual: { kind: "bars", unit: "km² of water", items: [{ label: "Usual", value: Math.round(tankFill.wetHaUsual / 100), tone: "then" }, { label: "This year", value: Math.round(tankFill.wetHaNow / 100), tone: "now" }] },
    source: "Sentinel-2 (ESA) over JRC Global Surface Water tank beds", asOf: day(tankFill.window[1]),
  });
  // 2. The ground did not fill
  const r = monsoonWatch.recharge, season = monsoonWatch.season;
  out.push({
    id: "deeper-than-may", chapter: ground, tone: "bad", big: `${Math.round(r.fallingPct)}%`, href: "/monsoon/",
    headline: `of mandals were lower in ${MONTHS[Number(season.latestMonth.slice(5, 7)) - 1]} than in May`,
    text: `${r.fallingPct}% of mandals had a water table deeper in ${month(season.latestMonth)} than in May, after a monsoon that usually raises it.`,
    visual: { kind: "waffle", pct: r.fallingPct, tone: "bad" },
    source: APWRIMS, asOf: month(season.latestMonth),
  });
  const b = monsoonWatch.banked;
  if (b) out.push({
    id: "rain-banked", chapter: ground, tone: "water", big: `${b.medianSharePct}%`, href: "/monsoon/",
    headline: "of the monsoon's rain reached the groundwater, in the median mandal",
    text: `Of the ${season.year} monsoon's rain, the median mandal stored ${b.medianSharePct}% in its groundwater, by the water-table fluctuation method the official assessment uses.`,
    visual: { kind: "waffle", pct: b.medianSharePct, tone: "water" },
    source: `${APWRIMS}; State rain gauges`, asOf: month(season.latestMonth),
  });

  // 3. Two cyclones, mostly on the coast
  const tg = arnab.together;
  if (tg) {
    out.push({
      id: "cyclones-rain", chapter: cyclones, tone: "water", big: `${n(tg.state.rainTmc)} TMC`, href: "/cyclones/",
      headline: `of rain in ${tg.rainWindow.days} days, ${Math.abs(tg.state.rainTmc / tg.state.normalTmc - 2) < 0.05 ? "twice" : `${(tg.state.rainTmc / tg.state.normalTmc).toFixed(1)} times`} the normal for those days`,
      text: `Cyclones Arnab and Murasu brought ${n(tg.state.rainTmc)} TMC of rain to Andhra Pradesh between ${day(tg.rainWindow.from)} and ${day(tg.rainWindow.to)}, against a normal ${n(tg.state.normalTmc)} TMC for those days.`,
      visual: { kind: "bars", unit: "TMC", items: [{ label: "Normal for the days", value: Math.round(tg.state.normalTmc), tone: "then" }, { label: "The two storms", value: Math.round(tg.state.rainTmc), tone: "now" }] },
      source: "State rain gauges, via APWRIMS", asOf: day(tg.rainWindow.to),
    });
    const missed = new Set(tg.map.filter(row => row[4] !== null && row[4] > arnab.deepM && row[3] < tg.stillDryMm).map(row => row[0]));
    out.push({
      id: "cyclones-missed", chapter: cyclones, tone: "warn", big: `${tg.state.deepStillDry}`, href: "/cyclones/",
      headline: `of ${tg.state.deepMandals} deep-water-table mandals got under ${tg.stillDryMm} mm from both storms`,
      text: `Cyclones Arnab and Murasu brought ${n(tg.state.rainTmc)} TMC in ${tg.rainWindow.days} days, yet ${tg.state.deepStillDry} of the ${tg.state.deepMandals} mandals with a water table deeper than ${arnab.deepM} m got under ${tg.stillDryMm} mm.`,
      visual: { kind: "map", keys: mapOf(i => missed.has(i)), tone: "warn", label: `Deep-water-table mandals the cyclones missed: ${missed.size}` },
      source: "State rain gauges, via APWRIMS", asOf: day(tg.rainWindow.to),
    });
  }


  // 4. So summer starts early
  const o = summerOutlook;
  const already = new Set(o.mandals.flatMap((row, i) => (row && row.anchor > row.deepestMay ? [i] : [])));
  out.push({
    id: "already-past-record", chapter: summer, tone: "bad", big: `${already.size}`, href: "/summer/",
    headline: `mandals were already deeper than any May on record, in ${MONTHS[Number(o.anchor.slice(5, 7)) - 1]}`,
    text: `${already.size} mandals were already deeper than any May on record in the ${month(o.anchor)} reading, before the dry months began.`,
    visual: { kind: "map", keys: mapOf(i => already.has(i)), tone: "bad", label: `Mandals already past their deepest May: ${already.size}` },
    source: APWRIMS, asOf: month(o.anchor),
  });
  if (o.people) out.push({
    id: "summer-beyond-record", chapter: summer, tone: "bad", big: lakhs(o.people.beyondDeep), href: "/summer/",
    headline: `people live in the ${o.summary.beyondDeep} mandals heading past their record and more than ${o.deepM} m down`,
    text: `${o.summary.beyondDeep} mandals, home to about ${lakhs(o.people.beyondDeep)} people, are heading past their deepest May on record and more than ${o.deepM} m down on a typical winter.`,
    visual: { kind: "map", keys: o.mandals.map(row => (row && row.tier === "beyond" && row.typical >= o.deepM ? "y" : "n")), tone: "bad", label: `Mandals heading past their record, deeper than ${o.deepM} m: ${o.summary.beyondDeep}` },
    source: `${APWRIMS}; WorldPop 2020`, asOf: month(o.anchor),
  });
  const first = new Set(summerPriority.mandals.filter(x => x.band === "first").map(x => x.index));
  out.push({
    id: "plan-first", chapter: summer, tone: "bad", big: `${first.size}`, href: "/summer/#summer-priority",
    headline: "mandals to plan summer drinking water for first",
    text: `${first.size} mandals are first in line for summer drinking-water planning: heading past their deepest May on record, with the season's other signs agreeing.`,
    visual: { kind: "map", keys: mapOf(i => first.has(i)), tone: "bad", label: `Mandals to plan for first: ${first.size}` },
    source: `${APWRIMS}; State rain gauges; Sentinel-2; Jal Jeevan Mission`, asOf: day(summerPriority.generatedAt),
  });
  const quality = summerPriority.rules.stateAboveLimitPct;
  if (quality !== null) out.push({
    id: "sources-fail-tests", chapter: summer, tone: "warn", big: `${quality}%`, href: "/summer/",
    headline: "of drinking-water sources tested are above a chemical limit",
    text: `${quality}% of the drinking-water sources tested in Andhra Pradesh test above a chemical limit.`,
    visual: { kind: "waffle", pct: quality, tone: "warn" },
    source: "Jal Jeevan Mission water quality testing", asOf: day(summerPriority.generatedAt),
  });
  return out;
}
