import { CREATOR_CREDIT } from "./creator";
import { MAP_VIEW, monsoonWatch } from "./data";
import { mondayOf } from "./week";
import { CATEGORY_META, shortDate } from "./drought";
import { droughtSummary } from "./droughtSummary";
import { facts, type Fact } from "./facts";
import { sensors } from "./sensors";
import { lakhs, summerOutlook } from "./summer";
import { changes, delta, format, sortedItems } from "./weeklyChanges";

/* The week as a one-minute film. Every scene is one figure the site already shows, taken
   from the same files and written out the same way, with its source and its date. Nothing
   is worked out here that a page does not already print: a scene whose figure is missing
   is left out rather than filled in. Server code only; the page hands the result to the
   player, and scripts/render-weekly-film.mjs records the same player to MP4. */

export type FilmTone = "bad" | "warn" | "water" | "plain";

type Words = {
  /** Small line above the figure. */
  eyebrow: string;
  /** The figure as the site prints it. */
  big: string;
  /** The number inside `big`, so it can count up to it; `big` itself is what the last frame shows. */
  count: { to: number; digits: number; prefix: string; suffix: string } | null;
  tone: FilmTone;
  headline: string;
  /** Short source and date, shown at the foot of the frame. */
  foot: string;
  /** The full sentence, source and date, for the page's transcript. */
  text: string; source: string; asOf: string;
};

export type FilmScene = Words & { seconds: number } & (
  | { kind: "depth"; yearAgoM: number; todayM: number; gap: string }
  | { kind: "sensors"; dots: number[]; top: Array<{ place: string; district: string; fell: string; x: number; y: number }> }
  | { kind: "changes"; worse: number; better: number; rows: Array<{ label: string; before: string; after: string; delta: string | null; direction: string }> }
  | { kind: "bars"; pairs: Array<{ title: string; unit: string; items: Array<{ label: string; value: number; text: string; tone: "now" | "then" }> }> }
  | { kind: "drought"; keys: string; colors: Record<string, string>; legend: Array<{ label: string; colors: string[] }>; note: string | null }
  | { kind: "season"; trajectory: Array<{ year: number; current: boolean; points: Array<{ month: number; changeM: number }> }>; year: number }
  | { kind: "summer"; keys: string; colors: Record<string, string>; legend: Array<{ label: string; colors: string[] }>; note: string | null }
);

export type WeeklyFilm = {
  week: string; weekLabel: string; title: string; kicker: string; caveat: string;
  map: { width: number; height: number };
  scenes: FilmScene[];
  close: { line: string; site: string; credit: string; sources: string };
  openSeconds: number; closeSeconds: number;
};

const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${FULL_MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const SITE = "prucodes.github.io/ap-groundwater-fusion";
const MAX_LEVEL_M = 100, MAX_CHANGE_M = 50;

/** The number a printed figure counts up to: "6.1 m" is 6.1 with one decimal and " m" after it. */
function counting(big: string): Words["count"] {
  const found = big.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
  if (!found) return null;
  return { prefix: found[1], to: Number(found[2]), digits: found[2].includes(".") ? found[2].split(".")[1].length : 0, suffix: found[3] };
}

const words = (w: Omit<Words, "count">): Words => ({ ...w, count: counting(w.big) });
const fromFact = (f: Fact, eyebrow: string, foot: string, tone: FilmTone = f.tone): Words =>
  words({ eyebrow, big: f.big, tone, headline: f.headline, foot, text: f.text, source: f.source, asOf: f.asOf });

export function weeklyFilm(): WeeklyFilm {
  // Named by the Monday of its week, so a mid-week rebuild does not relabel the week.
  const week = mondayOf(changes.generatedAt);
  const all = facts(), fact = (id: string) => all.find(f => f.id === id);
  const scenes: FilmScene[] = [];

  // 1. The median sensor, today against the same sensors a year ago.
  const s = sensors.state, read = sensors.latestReading.slice(0, 10);
  const sensorFoot = `APWRIMS groundwater telemetry · ${shortDate(read, true)}`;
  scenes.push({
    kind: "depth", seconds: 8, yearAgoM: s.medianYearAgoM, todayM: s.medianM,
    gap: `${Math.abs(s.medianM - s.medianYearAgoM).toFixed(1)} m ${s.medianM >= s.medianYearAgoM ? "deeper" : "shallower"} than a year ago`,
    ...words({
      eyebrow: "The State's sensors today", big: `${s.medianM.toFixed(1)} m`, tone: "bad",
      headline: `below ground at the median sensor. The same sensors a year ago: ${s.medianYearAgoM.toFixed(1)} m.`, foot: sensorFoot,
      text: `The median of the State's automatic water-level sensors reads ${s.medianM.toFixed(1)} m below ground, against ${s.medianYearAgoM.toFixed(1)} m for the same sensors a year ago.`,
      source: "APWRIMS groundwater telemetry, each sensor against itself", asOf: longDate(read),
    }),
  });

  // 2. Every reporting sensor where it stands, deepest fallen first.
  const today = fact("sensors-today");
  if (today) {
    const live = sensors.stations.filter(st => st[7] !== null && st[7] <= sensors.activeHours && st[6] !== null);
    const fall = (st: (typeof live)[number]) => st[5] - (st[6] as number);
    const ordered = [...live].sort((a, b) => fall(b) - fall(a));
    // As This Week lists them: one row per village, readings that look like a dry well or a faulty sensor left out.
    const top = ordered.filter(st => st[5] <= MAX_LEVEL_M && Math.abs(fall(st)) <= MAX_CHANGE_M)
      .filter((st, i, list) => list.findIndex(other => other[4] === st[4] && other[3] === st[3]) === i).slice(0, 3);
    scenes.push({
      kind: "sensors", seconds: 9,
      dots: ordered.flatMap(st => { const [x, y] = MAP_VIEW.project(st[2], st[1]); return [Math.round(x), Math.round(y), Math.round(fall(st) * 10) / 10]; }),
      top: top.map(st => { const [x, y] = MAP_VIEW.project(st[2], st[1]); return { place: st[4], district: st[3].replace(" (d)", ""), fell: `${fall(st).toFixed(1)} m`, x: Math.round(x), y: Math.round(y) }; }),
      ...fromFact(today, "Sensor by sensor", sensorFoot),
    });
  }

  // 3. What moved since the previous weekly refresh, worse first, as This Week orders it.
  const moved = sortedItems().filter(item => item.direction === "worse" || item.direction === "better" || item.direction === "moved");
  if (moved.length && changes.comparedWith.committedAt) {
    const since = shortDate(changes.comparedWith.committedAt, true);
    // Both sides of the week in five rows: the first three that read worse, then what read better.
    const lead = moved.filter(item => item.direction === "worse").slice(0, 3);
    const shown = [...lead, ...moved.filter(item => !lead.includes(item))].slice(0, 5);
    const label = (item: (typeof moved)[number]) => item.label.replace(/ \(.*\)$/, "");
    scenes.push({
      kind: "changes", seconds: 10, worse: changes.counts.worse, better: changes.counts.better,
      rows: shown.map(item => ({ label: label(item), before: format(item.before, item.unit), after: format(item.after, item.unit), delta: delta(item), direction: item.direction as string })),
      ...words({
        eyebrow: `Since the refresh of ${since}`, big: `${changes.counts.worse}`, tone: "bad",
        headline: `headline figures read worse, ${changes.counts.better} better`, foot: `Each source against its previous published snapshot · ${shortDate(week, true)}`,
        text: `Since the previous weekly refresh (${since}), ${changes.counts.worse} headline figures read worse and ${changes.counts.better} better. Among them: ${shown.map(item => `${label(item)}, ${format(item.before, item.unit)} to ${format(item.after, item.unit)}`).join("; ")}.`,
        source: "Each source against its previous published snapshot; the date ranges differ by source", asOf: longDate(week),
      }),
    });
  }

  // 4. Rain and reservoirs, each against its own yardstick.
  const rain = fact("rain-short"), store = fact("reservoirs");
  const pairs = [rain, store].flatMap(f => (f && f.visual.kind === "bars" ? [{
    title: f.id === "rain-short" ? "Rain since 1 June" : "Reservoir storage", unit: f.visual.unit,
    items: f.visual.items.map(item => ({ label: item.label, value: item.value, text: `${Math.round(item.value)}%`, tone: item.tone })),
  }] : []));
  if (rain && pairs.length) scenes.push({
    kind: "bars", seconds: 8, pairs,
    ...words({
      eyebrow: "Rain and reservoirs", big: rain.big, tone: "warn",
      headline: `${rain.headline}${store ? `. Reservoirs are ${store.big} full; a year ago, ${Math.round((store.visual.kind === "bars" ? store.visual.items[0].value : 0))}%.` : ""}`,
      foot: `State gauges and reservoirs, via APWRIMS · ${rain.asOf}`,
      text: `${rain.text}${store ? ` ${store.text}` : ""}`, source: `${rain.source}${store ? `; ${store.source}` : ""}`, asOf: store ? `${rain.asOf}; reservoirs ${store.asOf}` : rain.asOf,
    }),
  });

  // 5. The drought manual's reading, mandal by mandal.
  const counts = droughtSummary.state.counts, severe = counts.severe ?? 0, moderate = counts.moderate ?? 0;
  const between = (counts["moderate|severe"] ?? 0) + (counts["normal|moderate"] ?? 0);
  const CODE: Record<string, string> = { severe: "s", "moderate|severe": "t", moderate: "m", "normal|moderate": "o" };
  const droughtAsOf = droughtSummary.season.asOf;
  const { worse, better } = changes.drought;
  scenes.push({
    kind: "drought", seconds: 8,
    keys: droughtSummary.categories.map(category => CODE[category] ?? "n").join(""),
    colors: Object.fromEntries(Object.entries(CODE).map(([category, code]) => [code, CATEGORY_META[category as keyof typeof CATEGORY_META].color])),
    legend: [
      { label: "Severe", colors: [CATEGORY_META.severe.color] }, { label: "Moderate", colors: [CATEGORY_META.moderate.color] },
      ...(between ? [{ label: "Between two readings", colors: [CATEGORY_META["moderate|severe"].color, CATEGORY_META["normal|moderate"].color] }] : []),
    ],
    note: worse.length || better.length ? `Against a week of rain earlier: ${worse.length} read worse, ${better.length} better.` : null,
    ...words({
      eyebrow: "The drought manual's indicators", big: `${severe}`, tone: "bad",
      headline: `mandals read severe; ${moderate} moderate, of ${droughtSummary.state.assessed} assessed`, foot: `National drought manual's indicators (Drought Watch) · ${shortDate(droughtAsOf, true)}`,
      text: `On the national drought manual's indicators, ${severe} mandals read severe and ${moderate} moderate, of ${droughtSummary.state.assessed} assessed. A screening reading, not a declaration.`,
      source: "The national drought manual's indicators, as Drought Watch computes them from public data", asOf: longDate(droughtAsOf),
    }),
  });

  // 6. What the monsoon did to the water table: every past season rose, this one did not.
  const deeper = fact("deeper-than-may");
  if (deeper && monsoonWatch.trajectory?.length) scenes.push({
    kind: "season", seconds: 8, year: monsoonWatch.season.year,
    trajectory: monsoonWatch.trajectory.map(t => ({ year: t.year, current: t.current, points: t.points.map(p => ({ month: p.month, changeM: p.changeM })) })),
    ...fromFact(deeper, "After the monsoon", `APWRIMS monthly readings · ${deeper.asOf}`),
  });

  // 7. Where next May is heading.
  const o = summerOutlook, may = `${FULL_MONTHS[Number(o.targetMay.slice(5, 7)) - 1]} ${o.targetMay.slice(0, 4)}`;
  const anchor = `${FULL_MONTHS[Number(o.anchor.slice(5, 7)) - 1]} ${o.anchor.slice(0, 4)}`;
  scenes.push({
    kind: "summer", seconds: 8,
    keys: o.mandals.map(row => (row && row.tier === "beyond" ? (row.typical >= o.deepM ? "x" : "s") : "n")).join(""),
    colors: { x: "#c2503c", s: "#e3a595" },
    legend: [{ label: `Past its record, deeper than ${o.deepM} m`, colors: ["#c2503c"] }, { label: "Past its record, shallower", colors: ["#e3a595"] }],
    note: o.people ? `${o.summary.beyondDeep} of them more than ${o.deepM} m down, home to about ${lakhs(o.people.beyondDeep)} people.` : null,
    ...words({
      eyebrow: `By ${may}`, big: `${o.summary.beyond}`, tone: "bad",
      headline: "mandals are projected past their deepest May on record, on a typical winter", foot: `Projection from APWRIMS monthly readings · ${anchor}`,
      text: `By ${may}, the water table in ${o.summary.beyond} mandals is projected past its deepest May on record on a typical winter, ${o.summary.beyondDeep} of them more than ${o.deepM} m down${o.people ? `, home to about ${lakhs(o.people.beyondDeep)} people` : ""}.`,
      source: `APWRIMS monthly groundwater readings${o.people ? "; WorldPop 2020" : ""}`, asOf: anchor,
    }),
  });

  return {
    week, weekLabel: longDate(week), title: `Week of ${longDate(week)}`, kicker: "Andhra Pradesh · Water this week",
    caveat: "Prototype built from public sources. A screening view for where to look, not a declaration or an order.",
    map: { width: MAP_VIEW.width, height: MAP_VIEW.height },
    scenes, openSeconds: 5.5, closeSeconds: 5.5,
    close: {
      line: "Every figure is on the site, with its source and its date.", site: SITE, credit: `AP Water Intelligence · ${CREATOR_CREDIT}`,
      sources: "APWRIMS · the national drought manual's indicators · State rain gauges and reservoirs · WorldPop",
    },
  };
}

/** Seconds the whole film runs. */
export const filmSeconds = (film: WeeklyFilm) => film.openSeconds + film.scenes.reduce((sum, scene) => sum + scene.seconds, 0) + film.closeSeconds;
