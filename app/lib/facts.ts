import tankFill from "../data/tank_fill.json";
import { arnab } from "./arnab";
import { monsoonWatch } from "./data";
import { summerOutlook, lakhs } from "./summer";
import { summerPriority } from "./summerPriority";
import { waterContext } from "./waterContext";

/* Andhra Pradesh groundwater in numbers: one sentence each, built from the same
   files as the pages at every refresh, so a quote never goes stale. Each carries
   where it comes from, the date it is as of, and the page that explains it.
   Server code only. */

export type Fact = { id: string; theme: string; text: string; source: string; asOf: string; href: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const n = (v: number) => Math.round(v).toLocaleString("en-IN");

export function facts(): Fact[] {
  const out: Fact[] = [];
  const o = summerOutlook, rows = o.mandals.filter((r): r is NonNullable<typeof r> => r !== null);
  const APWRIMS = "APWRIMS monthly groundwater readings (Ground Water and Water Audit Department piezometers)";

  const already = rows.filter(r => r.anchor > r.deepestMay).length;
  out.push({ id: "already-past-record", theme: "Groundwater", href: "/summer/",
    text: `${already} mandals were already deeper than any May on record in the ${month(o.anchor)} reading, before the dry months began.`,
    source: APWRIMS, asOf: month(o.anchor) });
  if (o.people) out.push({ id: "summer-beyond-record", theme: "Groundwater", href: "/summer/",
    text: `${o.summary.beyondDeep} mandals, home to about ${lakhs(o.people.beyondDeep)} people, are heading past their deepest May on record and more than ${o.deepM} m down on a typical winter.`,
    source: `${APWRIMS}; WorldPop 2020`, asOf: month(o.anchor) });

  const r = monsoonWatch.recharge, season = monsoonWatch.season;
  out.push({ id: "deeper-than-may", theme: "Groundwater", href: "/monsoon/",
    text: `${r.fallingPct}% of mandals had a water table deeper in ${month(season.latestMonth)} than in May, after a monsoon that usually raises it.`,
    source: APWRIMS, asOf: month(season.latestMonth) });
  const b = monsoonWatch.banked;
  if (b) out.push({ id: "rain-banked", theme: "Groundwater", href: "/monsoon/",
    text: `Of the ${monsoonWatch.season.year} monsoon's rain, the median mandal stored ${b.medianSharePct}% in its groundwater, by the water-table fluctuation method the official assessment uses.`,
    source: `${APWRIMS}; State rain gauges`, asOf: month(season.latestMonth) });

  const first = summerPriority.mandals.filter(x => x.band === "first").length;
  out.push({ id: "plan-first", theme: "Drinking water", href: "/summer/#summer-priority",
    text: `${first} mandals are first in line for summer drinking-water planning: heading past their deepest May on record, with the season's other signs agreeing.`,
    source: `${APWRIMS}; State rain gauges; Sentinel-2; Jal Jeevan Mission`, asOf: day(summerPriority.generatedAt) });
  const quality = summerPriority.rules.stateAboveLimitPct;
  if (quality !== null) out.push({ id: "sources-fail-tests", theme: "Drinking water", href: "/summer/",
    text: `${quality}% of the drinking-water sources tested in Andhra Pradesh test above a chemical limit.`,
    source: "Jal Jeevan Mission water quality testing", asOf: day(summerPriority.generatedAt) });

  const rain = waterContext.rainfall;
  const deviation = rain?.state?.deviationPct ?? null, gauges = rain?.state?.gauges ?? null;
  if (rain && deviation !== null && gauges !== null) out.push({ id: "rain-short", theme: "Rain and storage", href: "/monsoon/",
    text: `Rain since 1 June is ${Math.abs(deviation)}% ${deviation < 0 ? "below" : "above"} normal across the State's ${n(gauges)} gauges.`,
    source: "AP Directorate of Economics and Statistics rain gauges, via APWRIMS", asOf: day(rain.window.end) });
  const store = waterContext.reservoirs?.state;
  const storeAsOf = waterContext.reservoirs?.asOf ?? null;
  if (store && storeAsOf) out.push({ id: "reservoirs", theme: "Rain and storage", href: "/rabi/",
    text: `The State's ${store.count} reservoirs hold ${store.storagePct}% of capacity, against ${store.lastYearPct}% a year ago.`,
    source: "State reservoir telemetry, via APWRIMS", asOf: day(storeAsOf) });
  if (tankFill.wetHaUsual) out.push({ id: "village-tanks", theme: "Rain and storage", href: "/rabi/",
    text: `Village tank beds going into rabi held water over ${n(tankFill.wetHaNow / 100)} km², against a usual ${n(tankFill.wetHaUsual / 100)} km² for mid-September to mid-October.`,
    source: "Sentinel-2 (ESA) over JRC Global Surface Water tank beds", asOf: day(tankFill.window[1]) });

  const tg = arnab.together;
  if (tg) out.push({ id: "cyclones-missed", theme: "Cyclones", href: "/cyclones/",
    text: `Cyclones Arnab and Murasu brought ${n(tg.state.rainTmc)} TMC in ${tg.rainWindow.days} days, yet ${tg.state.deepStillDry} of the ${tg.state.deepMandals} mandals with a water table deeper than ${arnab.deepM} m got under ${tg.stillDryMm} mm.`,
    source: "State rain gauges, via APWRIMS", asOf: day(tg.rainWindow.to) });

  return out;
}
