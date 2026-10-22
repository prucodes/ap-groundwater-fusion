import type { Metadata } from "next";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import droughtJson from "../../data/drought_watch.json";
import cardJson from "../../data/model_card.json";
import watchJson from "../../data/monsoon_watch.json";
import crossNetwork from "../../data/cross_network_check.json";
import drinking from "../../data/drinking_water.json";
import tanks from "../../data/tank_fill.json";
import fieldSignals from "../../data/field_signals_mandals.json";
import waterContext from "../../data/water_context_summary.json";
import cropRecord from "../../data/crop_water_record.json";
import cropScore from "../../data/crop_water_scorecard.json";
import villageJson from "../../data/village_offsets.json";
import { basePath, datasetManifest, mapGeometry } from "../../lib/data";
import { summerOutlook } from "../../lib/summer";
import styles from "./Brief.module.css";

export const metadata: Metadata = {
  title: "Project brief",
  description: "The platform's data sources and groundwater model in nine A4 pages, rebuilt from each week's data.",
};

/* The nine-page brief: what the platform is, its sources, its model, this week's
   maps and the open questions. Every figure and map is read from the published
   data at build time; the deploy prints this page to brief/ap-water-intelligence-brief.pdf
   (scripts/print-brief.mjs), which also writes the 3D renders and site
   screenshots the page shows. */

const BRIEF_PDF = "ap-water-intelligence-brief.pdf";

type Band = { band: string; sampleCount: number; maeM: number; lastReadingMaeM: number };
type Terrain = Record<"alluvial" | "coastal" | "hard_rock", { maeM: number }>;
type FieldSignals = { codes: { vciClass: string[]; category: string[] }; values: Record<string, Array<number | null>>; vegetation: { averaged: Array<{ approxStart: string; approxEnd: string }> } };
type Card = {
  evaluations: {
    temporalNowcast: { sampleCount: number; model: { maeM: number }; lastReadingBaseline: { maeM: number; skillPct: number }; depthBands: Band[]; terrainCohorts: Terrain; intervalEvaluation: { sampleCount: number; empiricalCoveragePct: number; meanWidthM: number } };
    rollingOriginNowcast: { sampleCount: number; maeM: number; lastReadingMaeM: number; skillVsLastReadingPct: number };
    directForecast: { horizons: Array<{ horizonMonths: number; rollingOrigin?: { sampleCount: number; maeM: number; baselines: { noChange: { maeM: number } } } }> };
    spatialEstimation: { rowCount: number; reportedMetric: { maeM: number }; terrainCohortsForReportedMethod: Terrain };
    crossNetworkComparison: { sampleCount: number; maximumDistanceKm: number; biasCgwbMinusApwrimsM: number; correlation: number };
  };
};
type Watch = { generatedAt: string; recharge: { mandals: number; fallingPct: number }; rainfall: { anomalyPct: number } | null; mandals: Array<{ boundaryIndex: number | null; status: "severe" | "short" | "normal" }> };
type Drought = { state: { assessed: number; trigger1: number; trigger1Spi: number; drySpell: number; counts: Record<string, number> }; mandals: Array<{ i: number; category: string }> };
type Latest = { v: number; u?: number; r?: number } | null;
type Dose = { readings: number; residualErrorM: number; wells: number };
type Village = {
  source: { apWells: number; apReadings: number; period: string };
  coverage: { villages: number; villagesPinned: number; mandals: number; mandalsWithSpread: number };
  spread: { medianVillageSpreadM: number; proxyPoor: number; proxyFair: number; proxyPoorThresholdM: number };
  validation: {
    persistence: { wellsScored: number; persistentSharePct: number; betweenWellOffsetSdM: number; withinWellScatterSdM: number };
    splitHalf: { status?: string; protocol?: string; wellsScored: number; pastPredictsFutureR: number; mandalMeanAppliedMaeM: number; withLearnedOffsetMaeM: number; reductionPct: number; byAquifer: Array<{ aquifer: string; wells: number; mandalMeanAppliedMaeM: number; withLearnedOffsetMaeM: number; reductionPct: number }> };
    doseResponse: Dose[]; forwardDoseResponse: Dose[]; forwardBaselineM: number | null;
    staticCovariateNull: { mandalMeanMaeM: number; predictedOffsetMaeM: number; predictedOffsetR2: number; wellsScored: number };
    crossNetworkOffset: { persistentSharePct: number; pastPredictsFutureR: number; withLearnedOffsetMaeM: number; villagesReached: number } | null;
    byWellType: Array<{ wellType: string; wells: number; persistence: { persistentSharePct: number }; splitHalf: { pastPredictsFutureR: number; mandalMeanAppliedMaeM: number; withLearnedOffsetMaeM: number }; doseResponse: Dose[]; forwardDoseResponse: Dose[]; forwardBaselineM: number | null }>;
  };
};

const card = cardJson as unknown as Card;
const watch = watchJson as unknown as Watch;
const drought = droughtJson as unknown as Drought;
const village = villageJson as unknown as Village;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };

/* ---------- maps, drawn from the same outlines the site uses ---------- */
const MAP_W = 520;
function outlines() {
  const pts = mapGeometry.mandals.flatMap(f => f.rings.flat());
  const lons = pts.map(p => p[0]), lats = pts.map(p => p[1]);
  const lo = Math.min(...lons), hiLat = Math.max(...lats), loLat = Math.min(...lats), hiLon = Math.max(...lons);
  const k = Math.cos(((loLat + hiLat) / 2) * Math.PI / 180), s = MAP_W / ((hiLon - lo) * k);
  const paths = mapGeometry.mandals.map(f => f.rings.map(r => "M" + r.map(([x, y]) => `${((x - lo) * k * s).toFixed(1)} ${((hiLat - y) * s).toFixed(1)}`).join("L") + "Z").join(""));
  return { paths, height: (hiLat - loLat) * s };
}
const OUTLINES = outlines();

function MandalMap({ classes, colours }: { classes: Map<number, string>; colours: Record<string, string> }) {
  return (
    <svg viewBox={`-4 -4 ${MAP_W + 8} ${(OUTLINES.height + 8).toFixed(0)}`} className={styles.map} role="img" aria-hidden="true">
      <g stroke="#ffffff" strokeWidth="0.45" strokeLinejoin="round">
        {OUTLINES.paths.map((d, i) => <path key={i} d={d} fill={colours[classes.get(i) ?? "n"] ?? colours.n} />)}
      </g>
    </svg>
  );
}
function Legend({ items, counts }: { items: Array<[string, string, string]>; counts: Map<string, number> }) {
  return <div className={styles.lg}>{items.filter(([key]) => counts.get(key)).map(([key, label, colour]) => <span key={key}><i style={{ background: colour }} />{label} <b>{counts.get(key)}</b></span>)}</div>;
}
const tally = (classes: Map<number, string>) => { const c = new Map<string, number>(); for (const v of classes.values()) c.set(v, (c.get(v) ?? 0) + 1); return c; };

/** The 3D view's latest month against its usual, read from the page the site serves. */
function latestClasses() {
  const html = readFileSync(path.resolve(process.cwd(), "public/water-crystal-3d.html"), "utf8");
  const gw = JSON.parse(/^const GW = (.*);$/m.exec(html)![1]) as { now: { period: string } | null; mandals: Array<{ b: number; c?: Latest }> };
  const tenths = (x: number) => Math.round(x * 10) / 10;
  const classes = new Map<number, string>();
  for (const m of gw.mandals) {
    const c = m.c;
    classes.set(m.b - 1, !c ? "n" : c.u == null ? "new" : c.v > (c.r ?? Infinity) ? "rec" : tenths(c.v - c.u) >= 1 ? "deep" : tenths(c.u - c.v) >= 1 ? "shal" : "near");
  }
  return { classes, period: gw.now?.period ?? null };
}

const NOW_COL = { shal: "#3f9fd0", near: "#a9bccb", deep: "#e7a33e", rec: "#c2412d", new: "#d7dee7", n: "#e3e8ee" };
const MON_COL = { severe: "#c2412d", short: "#e7a33e", normal: "#7fb8a4", n: "#e3e8ee" };
const DRO_COL: Record<string, string> = { severe: "#a8322a", "moderate|severe": "#cf6a35", moderate: "#e7a33e", "normal|moderate": "#e9cf8e", normal: "#8fbfa6", noTrigger: "#cfe3d8", insufficient: "#e3e8ee", n: "#e3e8ee" };
const SUM_COL = { xd: "#a33b2c", xs: "#e7a69a", dry: "#e0a24a", within: "#8fbfa6", n: "#e3e8ee" };

/* Crop condition now, and the official annual assessment: two instruments answering
   different questions, drawn on the same outlines so the difference is visible. */
const VCI_COL: Record<string, string> = { normal: "#2f7d6b", moderate: "#d79b2e", severe: "#b4442e", n: "#e7ecf2" };
const GEC_COL: Record<string, string> = { safe: "#2f7d6b", semi_critical: "#d7c04a", critical: "#d7772e", over_exploited: "#9c2f23", salinity: "#5b7fa6", n: "#e7ecf2" };

/* ---------- static exhibits ---------- */
function Pipeline() {
  const box = { fill: "#fff", stroke: "#d4dce8" };
  return (
    <svg className={styles.pipe} viewBox="0 0 720 300" role="img" aria-label="How the parts fit together">
      <defs><marker id="brief-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7d93ab" /></marker></defs>
      <g fontFamily="var(--font-sans)" fontSize="10.5">
        <rect x="0" y="0" width="228" height="64" rx="9" {...box} /><rect x="246" y="0" width="228" height="64" rx="9" {...box} /><rect x="492" y="0" width="228" height="64" rx="9" {...box} />
        <g fill="#0d2138" fontWeight="600" fontSize="11.5"><text x="14" y="22">Groundwater evidence</text><text x="260" y="22">Rain and climate</text><text x="506" y="22">Land, crops and people</text></g>
        <g fill="#667085"><text x="14" y="39">APWRIMS piezometers, monthly</text><text x="14" y="53">CGWB · GRACE-DA model context</text><text x="260" y="39">CHIRPS v3 · NASA POWER</text><text x="260" y="53">NOAA ENSO · ECMWF · TerraClimate</text><text x="506" y="39">NOAA VHP · Sentinel-2</text><text x="506" y="53">WorldCereal · SoilGrids · WorldPop</text></g>
        <g stroke="#7d93ab" strokeWidth="1.3" fill="none"><path d="M114 64V86" markerEnd="url(#brief-arrow)" /><path d="M360 64V86" markerEnd="url(#brief-arrow)" /><path d="M606 64V86" markerEnd="url(#brief-arrow)" /></g>
        <rect x="0" y="90" width="720" height="62" rx="9" fill="#0b2a4d" />
        <text x="16" y="112" fill="#fff" fontWeight="600" fontSize="11.5">Weekly pipeline · every Monday, automated</text>
        <text x="16" y="128" fill="#bcd2e6">Fetch every source, keep each one&rsquo;s own date, compare each mandal with its own past</text>
        <text x="16" y="143" fill="#ffd38a">Gate: the test suite and a data-contract check run before anything publishes</text>
        <g stroke="#7d93ab" strokeWidth="1.3" fill="none"><path d="M180 152V174" markerEnd="url(#brief-arrow)" /><path d="M540 152V174" markerEnd="url(#brief-arrow)" /></g>
        <rect x="0" y="178" width="352" height="66" rx="9" {...box} /><rect x="368" y="178" width="352" height="66" rx="9" {...box} />
        <rect x="0" y="178" width="352" height="4" rx="2" fill="#1f8a8a" /><rect x="368" y="178" width="352" height="4" rx="2" fill="#d79b2e" />
        <g fill="#0d2138" fontWeight="600" fontSize="11.5"><text x="14" y="200">Groundwater model</text><text x="382" y="200">Rule-based analyses</text></g>
        <g fill="#667085"><text x="14" y="217">Boosted trees on the monthly change · 19 inputs</text><text x="14" y="232">Best estimate + 80% band · now and 3 months ahead</text><text x="382" y="217">Drought manual · recharge watch · summer outlook</text><text x="382" y="232">Crop water check · each mandal against its own past</text></g>
        <g stroke="#7d93ab" strokeWidth="1.3" fill="none"><path d="M180 244V262" markerEnd="url(#brief-arrow)" /><path d="M540 244V262" markerEnd="url(#brief-arrow)" /></g>
        <rect x="0" y="266" width="720" height="34" rx="9" fill="#1f8a8a" />
        <text x="16" y="287" fill="#fff" fontWeight="600" fontSize="11">Published: the site, maps, 3D views, district and constituency briefs, a weekly PDF</text>
      </g>
    </svg>
  );
}

function ErrorByDepth({ bands }: { bands: Band[] }) {
  const peak = Math.max(...bands.map(b => b.lastReadingMaeM));
  const bottom = 34 + bands.length * 34;
  return (
    <svg viewBox={`0 0 320 ${bottom + 6}`} className={styles.chart} role="img" aria-label="Average error by depth band, the model against the last reading carried forward">
      <rect x="76" y="6" width="10" height="10" rx="2" fill="#1f8a8a" /><text x="91" y="15" className={styles.cl}>Model</text>
      <rect x="132" y="6" width="10" height="10" rx="2" fill="#c9d3de" /><text x="147" y="15" className={styles.cl}>Last reading carried forward</text>
      <line x1="76" x2="76" y1="28" y2={bottom} stroke="#9aa9ba" />
      {bands.map((b, i) => {
        const y = 34 + i * 34, wl = 196 * b.lastReadingMaeM / peak, wm = 196 * b.maeM / peak;
        const label = b.band.replace("m+", " m+").replace(/(\d)m$/, "$1 m");
        return (
          <g key={b.band}>
            <text x="0" y={y + 10} className={styles.cb}>{label}</text>
            <text x="0" y={y + 24} className={styles.cs}>{b.sampleCount.toLocaleString("en-US")} months</text>
            <rect x="76" y={y} width={wl.toFixed(1)} height="11" rx="2" fill="#c9d3de" />
            <text x={(80 + wl).toFixed(1)} y={y + 9.5} className={styles.cvq}>{b.lastReadingMaeM.toFixed(2)}</text>
            <rect x="76" y={y + 14} width={wm.toFixed(1)} height="11" rx="2" fill="#1f8a8a" />
            <text x={(80 + wm).toFixed(1)} y={y + 23.5} className={styles.cv}>{b.maeM.toFixed(2)} m</text>
          </g>
        );
      })}
    </svg>
  );
}

/** What each extra reading at a village buys, dug wells against bores. */
function DoseCurve({ series }: { series: Array<{ label: string; colour: string; dose: Dose[]; below?: boolean }> }) {
  const steps = series[0].dose.map(d => d.readings);
  const peak = Math.max(...series.flatMap(s => s.dose.map(d => d.residualErrorM)));
  const W = 320, H = 150, L = 26, R = 6, T = 20, B = 24;
  const x = (i: number) => L + (steps[i] - steps[0]) * (W - L - R) / Math.max(steps[steps.length - 1] - steps[0], 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / peak);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label="Future well-offset error after early calibration readings, for dug wells and bore wells">
      {[0, peak / 2, peak].map(n => <text key={n} x={L - 4} y={y(n) + 2} textAnchor="end" className={styles.cs}>{n.toFixed(1)} m</text>)}
      <line x1={L} x2={L} y1={T - 6} y2={H - B} stroke="#9aa9ba" />
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="#9aa9ba" />
      {steps.map((n, i) => <text key={n} x={x(i)} y={H - B + 11} textAnchor="middle" className={styles.cs}>{n}</text>)}
      <text x={(L + W) / 2} y={H - 2} textAnchor="middle" className={styles.cs}>early calibration readings</text>
      {series.map(s => (
        <g key={s.label}>
          <polyline fill="none" stroke={s.colour} strokeWidth="1.8" strokeLinejoin="round"
            points={s.dose.map((d, i) => `${x(i).toFixed(1)},${y(d.residualErrorM).toFixed(1)}`).join(" ")} />
          {s.dose.map((d, i) => <circle key={d.readings} cx={x(i)} cy={y(d.residualErrorM)} r="2.1" fill={s.colour} />)}
          <text x={x(0) + 4} y={y(s.dose[0].residualErrorM) - 6} className={styles.cv} fill={s.colour}>{s.label}</text>
          <text x={x(s.dose.length - 1)} y={y(s.dose[s.dose.length - 1].residualErrorM) + (s.below ? 13 : -7)} textAnchor="end" className={styles.cv} fill={s.colour}>{s.dose[s.dose.length - 1].residualErrorM.toFixed(2)} m</text>
        </g>
      ))}
    </svg>
  );
}

const ICON: Record<string, ReactNode> = {
  drop: <svg viewBox="0 0 24 24"><path d="M12 3c3.5 4.2 6 7.6 6 10.8A6 6 0 0 1 6 13.8C6 10.6 8.5 7.2 12 3z" /></svg>,
  cloud: <svg viewBox="0 0 24 24"><path d="M7 16a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 16z" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>,
  leaf: <svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" /><path d="M5 19l8-8" /></svg>,
  scale: <svg viewBox="0 0 24 24"><path d="M12 4v16M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z" /></svg>,
  clock: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>,
  check: <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>,
};

type SourceRow = [string, string, string, string, ReactNode];
const WORDS: Record<number, string> = { 17: "seventeen", 18: "eighteen", 19: "nineteen", 20: "twenty", 21: "twenty-one", 22: "twenty-two" };
const WATER: SourceRow[] = [
  ["APWRIMS", "AP Water Resources Information & Management System", "Depth to water below ground per mandal, from state piezometers, 2014 to date", "mandal · monthly", <><b>The measured series</b> the model learns from and every page reports</>],
  ["APWRIMS context feeds", "AP DES gauges · NRSC soil moisture · reservoirs", "Mandal rain gauges, modelled soil moisture, reservoir storage and canal releases", "mandal · daily to weekly", "Drought triggers, the crop check, reservoir context"],
  ["CGWB assessment via INGRES", "hosted by IIT Hyderabad", "2024 Dynamic Ground Water Resource Assessment: stage of extraction and category", "unit · annual", "The official safe → over-exploited label"],
  ["CGWB station levels", "via India Data Portal", "Central network well readings, 2013 to 2023", "station · seasonal", "Checks the forecast on wells it never saw"],
  ["Jal Jeevan Mission IMIS", "Dept. of Drinking Water and Sanitation", "Drinking-water schemes by source; sources tested", "block · weekly", "Who drinks from wells past their record"],
  ["NASA GRACE-DA", "GRACE gravimetry assimilated in a land model", "Groundwater storage percentile", "coarse grid · weekly", "Regional storage context only"],
  ["AP Data Lake", "AI Living Labs, access-controlled", "The State's official groundwater snapshot and mandal outlines", "mandal · on request", "Official boundaries; well-count check"],
];
const CLIMATE: SourceRow[] = [
  ["CHIRPS v3.0", "UC Santa Barbara Climate Hazards Center", "Satellite-and-gauge rainfall, 1981 to date", "0.05° · monthly", <><b>The model&rsquo;s rainfall input</b>, anomalies, SPI</>],
  ["IMD gridded rainfall", "India Meteorological Department", "Observed rainfall (Pai et al. 2014)", "0.25° · yearly release", "Cross-check of CHIRPS; not the input"],
  ["NASA POWER", "MERRA-2 reanalysis", "Rainfall", "≈55 km · monthly", "Fallback where CHIRPS is missing"],
  ["TerraClimate", "University of Idaho", "Actual evapotranspiration, water balance", "≈4 km · monthly", "Rain-minus-ET context (not recharge)"],
  ["NOAA CPC", "Oceanic Niño Index, ENSO outlook", "El Niño state and official outlook", "index · monthly", "El Niño context and composites"],
  ["NOAA ERSST v5 · GHCN-CAMS", "with NOAAGlobalTemp", "Sea-surface and air temperature", "2° / 0.5° · monthly", "Pacific panel, temperature record"],
  ["ECMWF open forecast", "via Open-Meteo", "Reference ET and rain, 7 to 10 days ahead", "0.25° · daily", "The weekly crop water check"],
];
const LAND: SourceRow[] = [
  ["NOAA STAR VHP", "Vegetation Health Product", "Vegetation Condition Index", "4 km · weekly", "Crop stress; the crop check's track record"],
  ["Sentinel-2 L2A", "ESA Copernicus via Element 84, AWS", "Reflectance and scene classification", "10 m (read at 80–160 m) · 5 days", "Crop check's field-scale score; water in tanks"],
  ["JRC Global Surface Water", "EC Joint Research Centre, 1984–2021", "Where water has come and gone", "30 m · static", "Tank beds, apart from lakes and aquaculture"],
  ["ESA WorldCereal 2021", "", "Irrigated versus rainfed cropland", "10 m · one season", "Isolating rainfed fields"],
  ["ESA WorldCover 2021", "", "Land cover and cropland", "10 m · one year", "Cropland mask"],
  ["ISRIC SoilGrids", "", "Soil texture and water capacity", "250 m · static", "Soil water holding in the crop check"],
  ["WorldPop 2020", "UN-adjusted", "Population", "1 km · one year", "People living in mandals at risk"],
];
function SourceTable({ rows }: { rows: SourceRow[] }) {
  return (
    <table className={styles.src}>
      <colgroup><col className={styles.c1} /><col className={styles.c2} /><col className={styles.c3} /><col className={styles.c4} /></colgroup>
      <thead><tr><th>Source</th><th>What it gives</th><th>Resolution · cadence</th><th>Used for</th></tr></thead>
      <tbody>{rows.map(([name, by, gives, res, use]) => <tr key={name}><td>{name}<small>{by}</small></td><td>{gives}</td><td>{res}</td><td>{use}</td></tr>)}</tbody>
    </table>
  );
}

function Band({ num, title, lede }: { num: string; title: string; lede: ReactNode }) {
  return <div className={styles.band}><div className={styles.eyebrow}>{num}</div><h2>{title}</h2><p className={styles.lede}>{lede}</p></div>;
}
function Foot({ n }: { n: number }) {
  return <div className={styles.pfoot}><span><b>AP Water Intelligence</b> · Built by Pruthvi Yannam · prucodes.github.io/ap-groundwater-fusion</span><span className={styles.mono}>{n} / 9</span></div>;
}

type ImdExperiment = { window: { first: string; last: string }; gainPct: number; results: Record<"chirps" | "imd", { maeM: number; rows: number }> };

/** IMD's grid as the model's rain (phase3_levels/experiment_imd_rainfall.py), read at build time. */
function imdExperiment(): ImdExperiment | null {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "..", "reports", "imd_rainfall_experiment.json"), "utf8")) as ImdExperiment;
  } catch {
    return null;
  }
}

export default function BriefPage() {
  const dug = village.validation.byWellType.find(row => row.wellType === "Dug well");
  const bore = village.validation.byWellType.find(row => row.wellType === "Bore well");
  const t = card.evaluations.temporalNowcast;
  const roll = card.evaluations.rollingOriginNowcast;
  const h3 = card.evaluations.directForecast.horizons.find(h => h.horizonMonths === 3)?.rollingOrigin;
  const spatial = card.evaluations.spatialEstimation;
  const cross = card.evaluations.crossNetworkComparison;
  const interval = t.intervalEvaluation;
  const summer = summerOutlook;

  const latest = latestClasses();
  const latestCounts = tally(latest.classes);
  const latestMonth = latest.period ? MONTHS[Number(latest.period.slice(5, 7)) - 1] : "the latest month";
  const rank = { normal: 0, short: 1, severe: 2 } as const;
  const monsoon = new Map<number, string>();
  for (const row of watch.mandals) {
    if (row.boundaryIndex == null) continue;
    const held = monsoon.get(row.boundaryIndex) as keyof typeof rank | undefined;
    if (!held || rank[row.status] > rank[held]) monsoon.set(row.boundaryIndex, row.status);
  }
  const droughtClasses = new Map(drought.mandals.map(m => [m.i, m.category] as [number, string]));
  // The outlines carry their own district and mandal names, so every feature finds its row.
  // Crosswalking through the groundwater series instead placed only 472 of them.
  const signals = fieldSignals as FieldSignals;
  const vciClasses = new Map<number, string>();
  const gecClasses = new Map<number, string>();
  mapGeometry.mandals.forEach((feature, index) => {
    const row = signals.values[`${feature.d}|${feature.m}`.toUpperCase().replace(/_/g, " ")];
    if (!row) return;
    const vc = row[1], gec = row[2];
    if (vc != null && signals.codes.vciClass[vc]) vciClasses.set(index, signals.codes.vciClass[vc]);
    if (gec != null && signals.codes.category[gec]) gecClasses.set(index, signals.codes.category[gec]);
  });
  const vciCounts = tally(vciClasses), gecCounts = tally(gecClasses);
  const irrigated = Object.values(signals.values).map(row => row[4] ?? 0).sort((a, b) => a - b);
  const medianIrrigated = irrigated[Math.floor(irrigated.length / 2)];
  const vciWindow = signals.vegetation.averaged;
  const rain = waterContext.rain;
  const ne = rain.neMonsoon;
  const summerClasses = new Map<number, string>();
  summer.mandals.forEach((row, i) => {
    if (!row) return;
    const deep = (row.tier === "beyond" ? row.typical : row.dry) >= summer.deepM;
    summerClasses.set(i, row.tier === "beyond" ? (deep ? "xd" : "xs") : row.tier);
  });
  const refreshed = day((datasetManifest as { generatedAt?: string }).generatedAt ?? watch.generatedAt);
  const pct = (a: number, b: number) => Math.round(100 * (b - a) / b);
  const imd = imdExperiment();
  const tankYears = tanks.byYear.filter(y => y.medianShare !== null);
  const tankLatest = tankYears[tankYears.length - 1];
  const tankLowest = tankLatest && tankYears.every(y => y.medianShare! >= tankLatest.medianShare!);

  return (
    <div className="pageWrap">
      <div className={styles.viewer}>
        <div className={styles.toolbar}>
          <p>The nine-page brief on the platform&rsquo;s sources and model, rebuilt from this week&rsquo;s data.</p>
          <a className={styles.download} href={`${basePath}/brief/${BRIEF_PDF}`} download="AP-Water-Intelligence-brief.pdf" data-testid="brief-pdf">Download PDF</a>
        </div>
        <div className={styles.scroller}>

          <section className={`${styles.page} ${styles.cover}`} data-testid="brief-sheet">
            <div className={styles.orbit} /><div className={`${styles.orbit} ${styles.o2}`} />
            <div className={styles.eyebrow}>Andhra Pradesh · Groundwater intelligence</div>
            <h1>AP Water <b>Intelligence</b></h1>
            <p className={styles.sub}>Data sources and the groundwater model</p>
            <p className={styles.meta}>A technical note for review · figures from the weekly refresh of {refreshed}</p>
            <div className={styles.hero3d}><img src={`${basePath}/brief/cover3d.jpg`} alt="3D relief of Andhra Pradesh's mandals" /></div>
            <p className={styles.caption}>Depth to water in {latestMonth}, each mandal against its own usual {latestMonth}, as the platform&rsquo;s 3D view draws it: blue shallower than usual, slate about usual, amber deeper, red deeper than any {latestMonth} on record.</p>
            <div className={styles.kpis}>
              <div className={styles.kpi}><b>{mapGeometry.mandals.length}</b><span>mandals mapped, each compared with its own history</span></div>
              <div className={styles.kpi}><b>{WATER.length + CLIMATE.length + LAND.length}</b><span>public and official data sources, combined every week</span></div>
              <div className={styles.kpi}><b>{roll.maeM.toFixed(2)} m</b><span>average nowcast error; {roll.skillVsLastReadingPct.toFixed(0)}% better than the last reading</span></div>
              <div className={styles.kpi}><b>Mon</b><span>automated refresh; publishes only if the tests pass</span></div>
            </div>
            <div className={styles.inside}><div className={`${styles.ihead} ${styles.mono}`}>Inside</div>
              <div><b>01</b><span>What it is</span><small>the question, three rules, the pipeline</small></div>
              <div><b>02</b><span>Data sources</span><small>{WATER.length + CLIMATE.length + LAND.length} sources, what each gives and does</small></div>
              <div><b>03</b><span>The model</span><small>method, tests, release rule</small></div>
              <div><b>04</b><span>This week</span><small>four maps of {mapGeometry.mandals.length} mandals</small></div>
              <div><b>05</b><span>Agriculture</span><small>the crop, the season, the check</small></div>
              <div><b>06</b><span>Open questions</span><small>limits, and where review helps</small></div>
              <div><b>07</b><span>Closing the gap</span><small>six inputs, and what each moves</small></div>
            </div>
            <div className={styles.foot}><span>Built by Pruthvi Yannam</span><span>Prototype · not an official measurement</span></div>
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="01 · What it is" title="Every mandal's water, checked weekly" lede={<>A working prototype for the Chief Minister&rsquo;s office and district officers. Every Monday it reports where groundwater, rain, soil moisture and crops stand in each of Andhra Pradesh&rsquo;s <b>{mapGeometry.mandals.length} mandals</b>, and what is likely next.</>} />
            <div className={styles.body}>
              <p className={styles.para}>The question is local: <b>is this mandal&rsquo;s water table where it usually is for this month, is it heading somewhere it has not been, and do rain, soil and crops agree?</b> Three rules run through the whole platform.</p>
              <div className={styles.cardrow} style={{ marginTop: "4mm" }}>
                <div className={styles.pcard}><div className={styles.ic}>{ICON.scale}</div><h3>Measured and modelled stay apart</h3><p>A piezometer reading is never shown as an estimate, nor an estimate as a reading. Every figure carries its source and date.</p></div>
                <div className={styles.pcard}><div className={styles.ic}>{ICON.clock}</div><h3>Each place against its own past</h3><p>Depth swings with the season and the aquifer, so a mandal is compared with its own readings for the same month, never a statewide threshold.</p></div>
                <div className={styles.pcard}><div className={styles.ic}>{ICON.check}</div><h3>Open inputs, tested weekly</h3><p>Every input is open or public. A scheduled job re-fetches, rebuilds, tests and republishes the site each week.</p></div>
              </div>
              <div className={styles.sec}>How it fits together</div>
              <Pipeline />
              <p className={styles.para} style={{ marginTop: "4mm", fontSize: "8.8pt", color: "#4a5b70" }}>Measured readings pass straight through to the pages. Only the model&rsquo;s estimates and the rule-based calls are derived, and each says so. The site&rsquo;s screens: a weekly overview, Monsoon Watch, Drought Watch, a mandal map, the 3D depth view, Summer and Rabi outlooks, a crop water check, and briefs by district and assembly constituency; a one-page digest is printed each week.</p>
              <div className={styles.sec}>The site itself</div>
              <div className={styles.shots}>
                {([["monsoon", "Monsoon Watch"], ["drought", "Drought Watch"], ["map", "Mandal Map"], ["summer", "Summer Outlook"]] as const).map(([key, label]) => (
                  <figure key={key}><img src={`${basePath}/brief/site-${key}.jpg`} alt="" /><figcaption>{label}</figcaption></figure>
                ))}
              </div>
            </div>
            <Foot n={2} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="02 · Data sources" title={`One measured series, ${WORDS[WATER.length + CLIMATE.length + LAND.length - 1] ?? WATER.length + CLIMATE.length + LAND.length - 1} supporting ones`} lede={<>Only the first row is what the model predicts; the rest are inputs, cross-checks or context, each <b>joined to the same {mapGeometry.mandals.length} mandal outlines</b> before use.</>} />
            <div className={styles.body} style={{ paddingTop: "2mm" }}>
              <div className={styles.grouphead}><div className={styles.ic}>{ICON.drop}</div><h3>Water</h3><span>the measured target and official context</span></div><SourceTable rows={WATER} />
              <div className={styles.grouphead}><div className={styles.ic}>{ICON.cloud}</div><h3>Rain and climate</h3><span>model inputs and climate context</span></div><SourceTable rows={CLIMATE} />
              <div className={styles.grouphead}><div className={styles.ic}>{ICON.leaf}</div><h3>Land, crops and people</h3><span>crop stress, cropland and exposure</span></div><SourceTable rows={LAND} />
              <p className={styles.para} style={{ marginTop: "2mm", fontSize: "7.6pt", color: "#4a5b70", lineHeight: 1.4 }}><b>Rules rather than data:</b> the national <i>Manual for Drought Management 2020</i> (drought triggers), FAO-56 (crop water use), and CGWB&rsquo;s convention of comparing pre-monsoon (May) depths year to year.</p>
            </div>
            <Foot n={3} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="03 · The model" title="This month's depth, with an 80% band" lede={<>Gradient-boosted trees estimate this month&rsquo;s depth and the depth three months ahead. Retrained before every month, it errs by <b>{roll.maeM.toFixed(2)} m</b> on average, {roll.skillVsLastReadingPct.toFixed(0)}% better than carrying the last reading forward, and its 80% band held <b>{interval.empiricalCoveragePct.toFixed(1)}%</b> of readings.</>} />
            <div className={styles.body}>
              <div className={styles.formula}><span className={styles.eq}>d̂<sub>m,t</sub> = d<sub>m,t−1</sub> + w<sub>b</sub> · Δd̂<sub>m,t</sub></span><small>It predicts the month-on-month <b style={{ color: "#fff" }}>change</b> and adds it to the last reading: trees cannot extrapolate depth, but its change is stable. w<sub>b</sub> pulls toward the last reading per depth band (0.30 to 0.80).</small></div>
              <div className={styles.sec}>How it is built</div>
              <div className={styles.steps}>
                <div className={styles.step}><i>01</i><b>19 inputs</b><span>Depth lags of 1 to 12 months, CHIRPS rain over 1, 3 and 12 months, season, location, aquifer type and specific yield (CGWB)</span></div>
                <div className={styles.step}><i>02</i><b>Learner</b><span>scikit-learn HistGradientBoosting: a best estimate, plus 10th and 90th percentile models for the band</span></div>
                <div className={styles.step}><i>03</i><b>Blend</b><span>Pulled toward the last reading by a weight set per depth band on a held-out year (2023)</span></div>
                <div className={styles.step}><i>04</i><b>Band</b><span>10th to 90th percentile range widened per aquifer and season by split-conformal calibration</span></div>
                <div className={styles.step}><i>05</i><b>No leakage</b><span>Each mandal&rsquo;s latest reading is held out before its own estimate; inputs use only what was known then</span></div>
              </div>
              <div className={styles.sec}>How it is tested</div>
              <table className={styles.res}><thead><tr><th>Test</th><th>Months</th><th>Model</th><th>Baseline</th><th>Gain</th></tr></thead><tbody>
                <tr><td>Nowcast, held out (trained to Dec 2023), Jan 2024 to Sep 2026</td><td className={styles.num}>{t.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{t.model.maeM.toFixed(2)} m</td><td className={styles.num}>{t.lastReadingBaseline.maeM.toFixed(2)} m last</td><td className={`${styles.num} ${styles.gain}`}>{t.lastReadingBaseline.skillPct.toFixed(0)}%</td></tr>
                <tr><td>Nowcast, retrained every month</td><td className={styles.num}>{roll.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{roll.maeM.toFixed(2)} m</td><td className={styles.num}>{roll.lastReadingMaeM.toFixed(2)} m last</td><td className={`${styles.num} ${styles.gain}`}>{roll.skillVsLastReadingPct.toFixed(0)}%</td></tr>
                {h3 ? <tr><td>Forecast 3 months ahead, rolling origins</td><td className={styles.num}>{h3.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{h3.maeM.toFixed(2)} m</td><td className={styles.num}>{h3.baselines.noChange.maeM.toFixed(2)} m no change</td><td className={`${styles.num} ${styles.gain}`}>{pct(h3.maeM, h3.baselines.noChange.maeM)}%</td></tr> : null}
                <tr><td>80% band coverage</td><td className={styles.num}>{interval.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{interval.empiricalCoveragePct.toFixed(1)}%</td><td className={styles.num}>80% nominal</td><td className={styles.num}>&plusmn;{(interval.meanWidthM / 2).toFixed(1)} m</td></tr>
                <tr><td>Rise or fall on CGWB&rsquo;s wells, never trained on ({crossNetwork.years[0]}–{String(crossNetwork.years[crossNetwork.years.length - 1]).slice(2)})</td><td className={styles.num}>{crossNetwork.overall.clearMoves.toLocaleString("en-US")}</td><td className={styles.num}>{Math.round(crossNetwork.overall.direction.forecast! * 100)}% right</td><td className={styles.num}>{Math.round(crossNetwork.overall.direction.measured! * 100)}% State wells</td><td className={styles.num}>{Math.round(crossNetwork.overall.bySeason.usual.forecast! * 100)} / {Math.round(crossNetwork.overall.bySeason.broke.forecast! * 100)}%</td></tr>
                {imd ? <tr><td>IMD rain in place of CHIRPS, retrained every month ({imd.window.first.slice(0, 4)}–{imd.window.last.slice(2, 4)})</td><td className={styles.num}>{imd.results.imd.rows.toLocaleString("en-US")}</td><td className={styles.num}>{imd.results.imd.maeM.toFixed(2)} m</td><td className={styles.num}>{imd.results.chirps.maeM.toFixed(2)} m CHIRPS</td><td className={styles.num}>{Math.round(imd.gainPct)}%, a year late</td></tr> : null}
                <tr><td>Ungauged mandal (whole mandal held out)</td><td className={styles.num}>{spatial.rowCount.toLocaleString("en-US")}</td><td className={styles.num}>{spatial.reportedMetric.maeM.toFixed(1)} m</td><td className={styles.num}>state average</td><td className={`${styles.num} ${styles.no}`}>not released</td></tr>
              </tbody></table>
              <div className={styles.twocol} style={{ marginTop: "4mm" }}>
                <div className={styles.chartcard}><h3>{t.depthBands.every(b => b.maeM < b.lastReadingMaeM) ? "Error grows with depth; the model wins in every band" : "Error grows with depth; the model against the last reading"}</h3><p>Average absolute error on held-out months</p><ErrorByDepth bands={t.depthBands} /></div>
                <div className={styles.stack}>
                  <div className={`${styles.note} ${styles.teal}`}><b>Release rule.</b> A horizon is published only if it beats both no-change and same-month-last-year by at least 5% under rolling-origin validation, with no leakage and consistent results by terrain. Three months passes; one, six and twelve do not yet, so they are not shown.</div>
                  <div className={styles.note}><b>Tried and rejected, on evidence.</b> The El Niño index made it worse. Rain over official outlines: no gain (1.797 vs 1.800 m). NASA near-real-time rain read twice as wet as CHIRPS and raised error 0.62 → 0.96 m. A month whose satellite rain is unpublished is estimated without it and says so (0.89 → 1.04 m). The State&rsquo;s seven carried-forward months of 2021 are treated as missing.</div>
                </div>
              </div>
            </div>
            <Foot n={4} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="04 · What it shows this week" title={`Six readings of the same ${mapGeometry.mandals.length} mandals`} lede="Each map and figure is drawn from this week's published data. Each compares a mandal with its own history, and each method carries a backtest or a rule from an official manual." />
            <div className={styles.body}>
              <div className={styles.maps}>
                <div className={styles.mapcard}><div className={styles.k}>Water Depth 3D</div><h3>{latestMonth} against its usual {latestMonth}</h3><div className={styles.big}>{(latestCounts.get("deep") ?? 0) + (latestCounts.get("rec") ?? 0)}<small>mandals deeper than usual; {latestCounts.get("rec") ?? 0} deepest on record</small></div><p className={styles.how}>Against the median of the same mandal&rsquo;s earlier {latestMonth}s; within 1 m is usual.</p><MandalMap classes={latest.classes} colours={NOW_COL} /><Legend counts={latestCounts} items={[["shal", "Shallower than usual", NOW_COL.shal], ["near", "Within 1 m", NOW_COL.near], ["deep", "Deeper than usual", NOW_COL.deep], ["rec", "Deepest on record", NOW_COL.rec]]} /></div>
                <div className={styles.mapcard}><div className={styles.k}>Monsoon Watch</div><h3>Did this monsoon recharge the ground?</h3><div className={styles.big}>{watch.recharge.fallingPct}%<small>of {watch.recharge.mandals} mandal series lower than in May</small></div><p className={styles.how}>May-to-now against the same mandal&rsquo;s median over ten seasons; flagged at 1 m short and twice its own spread.{watch.rainfall ? ` Rain ${Math.abs(watch.rainfall.anomalyPct)}% ${watch.rainfall.anomalyPct < 0 ? "below" : "above"} normal.` : ""}</p><MandalMap classes={monsoon} colours={MON_COL} /><Legend counts={tally(monsoon)} items={[["normal", "Normal", MON_COL.normal], ["short", "Short", MON_COL.short], ["severe", "Severe shortfall", MON_COL.severe]]} /></div>
                <div className={styles.mapcard}><div className={styles.k}>Drought Watch</div><h3>What the national drought manual says</h3><div className={styles.big}>{drought.state.counts.severe ?? 0} · {drought.state.counts.moderate ?? 0}<small>severe · moderate, of {drought.state.assessed} assessed</small></div><p className={styles.how}>Rain deficit and dry spells under the Manual for Drought Management 2020, then impact on vegetation, soil, groundwater and reservoirs. It reads the manual; it does not declare. <b>{drought.state.trigger1} meet Trigger 1 on department gauges, {drought.state.trigger1Spi} on CHIRPS SPI.</b></p><MandalMap classes={droughtClasses} colours={DRO_COL} /><Legend counts={tally(droughtClasses)} items={[["severe", "Severe", DRO_COL.severe], ["moderate|severe", "Moderate to severe", DRO_COL["moderate|severe"]], ["moderate", "Moderate", DRO_COL.moderate], ["normal", "Normal", DRO_COL.normal], ["noTrigger", "No trigger", DRO_COL.noTrigger]]} /></div>
                <div className={styles.mapcard}><div className={styles.k}>Summer Outlook</div><h3>Where May {summer.targetMay.slice(0, 4)} may break the record</h3><div className={styles.big}>{summer.summary.beyond}<small>mandals past their deepest May in a typical winter</small></div><p className={styles.how}>Latest reading plus the mandal&rsquo;s own past winter drawdowns, against its deepest May.{summer.backtest?.pastRecordPct?.beyond ? ` Backtest: past “beyond” calls came true 1 in ${Math.round(100 / summer.backtest.pastRecordPct.beyond)}, against 1 in ${Math.round(100 / summer.backtest.baseRatePct)} overall.` : ""}</p><MandalMap classes={summerClasses} colours={SUM_COL} /><Legend counts={tally(summerClasses)} items={[["xd", `Beyond record, ${summer.deepM} m+`, SUM_COL.xd], ["xs", "Beyond, under 10 m", SUM_COL.xs], ["dry", "Only in a dry winter", SUM_COL.dry], ["within", "Within its record", SUM_COL.within]]} /></div>
              </div>
              <div className={styles.strip}>
                <div><div className={styles.k}>Drinking water · Jal Jeevan Mission</div><div className={styles.big}>{Math.round(drinking.state.groundwaterShare * 100)}%<small>of rural drinking-water schemes draw on groundwater</small></div><p>{drinking.byTier.beyond.sources.toLocaleString("en-IN")} sources sit in the {drinking.byTier.beyond.mandals} mandals heading past their deepest May; {drinking.byTier.beyond.chemical.toLocaleString("en-IN")} tested above a chemical limit.</p></div>
                {tanks.window ? <div><div className={styles.k}>Tanks · Sentinel-2 over JRC tank beds</div><div className={styles.big}>{Math.round((100 * tanks.wetHaNow) / Math.max(tanks.wetHaUsual, 1))}%<small>of their usual water, {day(tanks.window[0]).replace(/ \d{4}$/, "")} to {day(tanks.window[1]).replace(/ \d{4}$/, "")}</small></div><p>{tanks.emptier} of {tanks.scoredMandals} tank mandals emptier than usual{tankLowest ? `; the typical tank bed is ${Math.round(tankLatest.medianShare! * 100)}% wet, the lowest of ${tankYears.length} years` : ""}.</p></div> : null}
              </div>
            </div>
            <Foot n={5} />
          </section>


          <section className={styles.page} data-testid="brief-sheet">
            <Band num="05 · Agriculture and water" title="What the season has done to the crop" lede={<>Groundwater matters here because of what grows above it. <b>{cropRecord.rainfed.mandals} of {cropRecord.rainfed.of} mandals</b> are mostly rainfed, and across the State under a quarter of mapped cropland is irrigated, so for most of Andhra Pradesh the monsoon is the irrigation.</>} />
            <div className={styles.body}>
              <div className={styles.twocol}>
                <div className={styles.mapcard}>
                  <div className={styles.k}>Crop condition · NOAA VHP, weighted to cropland</div>
                  <h3>How the crop has read these four weeks</h3>
                  <div className={styles.big}>{vciCounts.get("severe") ?? 0}<small>mandals severe; {vciCounts.get("moderate") ?? 0} moderate</small></div>
                  <p className={styles.how}>Vegetation Condition Index against each cell&rsquo;s own record, weighted by cropland share, averaged over the four weeks to {day(vciWindow[vciWindow.length - 1].approxEnd)}. Table 3.4 of the drought manual: 60–100 normal, 40–60 moderate, under 40 severe.</p>
                  <MandalMap classes={vciClasses} colours={VCI_COL} />
                  <Legend counts={vciCounts} items={[["normal", "Normal", VCI_COL.normal], ["moderate", "Moderate", VCI_COL.moderate], ["severe", "Severe", VCI_COL.severe]]} />
                </div>
                <div className={styles.mapcard}>
                  <div className={styles.k}>Official assessment · CGWB and the State, via INGRES</div>
                  <h3>What the annual balance says</h3>
                  <div className={styles.big}>{gecCounts.get("safe") ?? 0}<small>mandals safe; {gecCounts.get("over_exploited") ?? 0} over-exploited</small></div>
                  <p className={styles.how}>The 2025–26 Dynamic Ground Water Resources assessment, GEC-2015: a year&rsquo;s recharge against a year&rsquo;s draft. It is not a reading of this week, and the two maps are not in competition.</p>
                  <MandalMap classes={gecClasses} colours={GEC_COL} />
                  <Legend counts={gecCounts} items={[["safe", "Safe", GEC_COL.safe], ["semi_critical", "Semi-critical", GEC_COL.semi_critical], ["critical", "Critical", GEC_COL.critical], ["over_exploited", "Over-exploited", GEC_COL.over_exploited], ["salinity", "Salinity", GEC_COL.salinity]]} />
                </div>
              </div>
              <div className={styles.sec}>The season the crop is standing in</div>
              <div className={styles.figs}>
                <div className={styles.fig}><b>{ne.deviationPct}%</b><span>north-east monsoon so far: {ne.meanActualMm} mm against {ne.meanNormalMm} mm normal, {day(ne.start).replace(/ \d{4}$/, "")} to {day(ne.end)}</span></div>
                <div className={styles.fig}><b>{rain.categories.deficient + rain.categories.scanty}</b><span>of {rain.mandals} mandals deficient or scanty on {rain.gauges.toLocaleString("en-IN")} department gauges since June; {rain.deviationPct}% overall</span></div>
                <div className={styles.fig}><b>{Math.round((100 * tanks.wetHaNow) / Math.max(tanks.wetHaUsual, 1))}%</b><span>of their usual water in {tanks.tankBodies.toLocaleString("en-IN")} tank beds, read by Sentinel-2; {tanks.emptier} mandals emptier than usual, {tanks.fuller} fuller</span></div>
                <div className={styles.fig}><b>{cropRecord.rainfed.stateIrrigatedPct}%</b><span>of mapped cropland detected as irrigated statewide in one rabi season; the median mandal {medianIrrigated.toFixed(0)}%</span></div>
              </div>
              <div className={styles.sec}>The crop water check, and how it is being scored</div>
              <div className={styles.twocol}>
                <p className={styles.para}>Each week the check compares a mandal&rsquo;s rain and reference evapotranspiration, from the ECMWF open forecast, with what its crop would need. <b>Every call is frozen the day it is made</b> and scored three weeks later against the vegetation that followed: Sentinel-2 NDVI over rainfed cropland at {cropRecord.sentinel.resolutionM} m, and the vegetation index. {cropScore.frozen} weeks are on the record, <b>none scored yet</b>; the first verdict falls due on {day(cropScore.nextDue)}.</p>
                <div className={styles.stack}>
                  <div className={styles.note}><b>A negative result, kept on the record.</b> Pooled across mandals the check does not separate vegetation at all: the places called short most often are the chronically dry ones. It is therefore scored within a mandal and season, against that same mandal when it was called comfortable.</div>
                </div>
              </div>
              <div className={`${styles.note} ${styles.teal}`}><b>What is missing, and it is the heart of it.</b> Sown area, crop and stage, and what the canals actually delivered to a field are all held by the State and not released. Until they are, the check runs on FAO-56 reference coefficients and a stated assumption about the crop, not on the mandal&rsquo;s own sown record. That single release would turn a water platform into an agricultural one.</div>
            </div>
            <Foot n={6} />
          </section>
          <section className={styles.page} data-testid="brief-sheet">
            <Band num="06 · Limits and open questions" title="Where a hydrogeologist's view would help most" lede="The model knows depth well and storage, aquifers and pumping poorly. These are the questions we would most value a review on." />
            <div className={styles.body}>
              <div className={styles.banner}><img src={`${basePath}/brief/outlook3d.jpg`} alt="May outlook in 3D" /><div className={styles.cap}><b>May {summer.targetMay.slice(0, 4)} in a dry winter</b>, from the 3D view: glowing rims mark each mandal&rsquo;s deepest May on record where the projected water falls below it.</div></div>
              <div className={styles.sec}>Known limits</div>
              <div className={styles.limits}>
                <div className={styles.lim}><b>Aquifer properties are coarse.</b> Aquifer type is a district proxy; for 259 of 688 series the measured specific yield disagrees with the label.</div>
                <div className={styles.lim}><b>Depth is not storage.</b> A metre lost in hard rock holds far less water than in the delta; volumes are under review.</div>
                <div className={styles.lim}><b>Pumping is unobserved.</b> Extraction enters only through the official stage-of-extraction figure.</div>
                <div className={styles.lim}><b>{mapGeometry.mandals.length} outlines, {datasetManifest.counts.rawSourceSeriesCount} mandals.</b> The State&rsquo;s record lists {datasetManifest.counts.rawSourceSeriesCount}; the public sub-district map predates the latest splits, so {datasetManifest.counts.seriesSharingBoundaryCount} newer town mandals share their former town&rsquo;s outline and {datasetManifest.counts.seriesWithoutBoundaryCount} have none. All are still measured and estimated; only the map is short.</div>
                <div className={styles.lim}><b>Mandal averages.</b> APWRIMS reports a mandal&rsquo;s mean across piezometers; a village&rsquo;s wells can differ.</div>
                <div className={styles.lim}><b>Ungauged mandals are hard.</b> Estimating from neighbours alone errs by {spatial.reportedMetric.maeM.toFixed(1)} m, so it is not released.</div>
                <div className={styles.lim}><b>Data status.</b> Research sample pending authorization; some series await an official location crosswalk.</div>
              </div>
              <div className={styles.sec}>Questions for review</div>
              <div className={styles.qs}>
                <div className={styles.q}>Is there a defensible mandal-level aquifer and specific-yield layer (for example CGWB&rsquo;s NAQUIM mapping) to replace the district proxy?</div>
                <div className={styles.q}>Would a physically based recharge and abstraction component (water-table fluctuation, irrigated area from Sentinel-2) beat the statistical model at six to twelve months, where it does not yet pass?</div>
                <div className={styles.q}>Which public proxy for pumping is most credible in Andhra Pradesh: agricultural power use, irrigated area, or well census counts?</div>
                <div className={styles.q}>Is a 5% gain over persistence and seasonal baselines, under rolling-origin validation, the right bar for releasing a forecast to administrators?</div>
                <div className={styles.q}>Can GRACE-scale storage be usefully downscaled to mandals, or should it stay regional context?</div>
              </div>
              <div className={styles.sec}>Sources</div>
              <div className={styles.links}>
                <div><b>Platform</b> prucodes.github.io/ap-groundwater-fusion · /methodology</div>
                <div><b>Groundwater</b> apwrims.ap.gov.in · ingres.iith.ac.in · indiadataportal.com (CGWB wells) · nasagrace.unl.edu · ejalshakti.gov.in (drinking water)</div>
                <div><b>Rain</b> data.chc.ucsb.edu/products/CHIRPS/v3.0 · imdpune.gov.in (gridded) · power.larc.nasa.gov · climatologylab.org/terraclimate</div>
                <div><b>Climate</b> cpc.ncep.noaa.gov (ONI) · psl.noaa.gov (ERSST v5) · open-meteo.com (ECMWF open data)</div>
                <div><b>Land</b> star.nesdis.noaa.gov (VHP) · earth-search.aws.element84.com (Sentinel-2) · global-surface-water.appspot.com (JRC) · esa-worldcereal.org · esa-worldcover.org · soilgrids.org · worldpop.org</div>
                <div><b>Methods</b> Manual for Drought Management 2020 · FAO-56 (Allen et al., 1998) · scikit-learn</div>
              </div>
            </div>
            <Foot n={7} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="07 · Closing the gap" title="Six inputs to test next" lede={<>In an ordinary season the forecast already calls direction about as often as the two measured networks agree with each other. The misses gather in seasons that break the pattern, when the water table may be set by what is pumped rather than by what fell. <b>Pumping is the one driver the model cannot see</b>, so these are the inputs to test next.</>} />
            <div className={styles.body}>
              <div className={styles.sec}>Candidate inputs; gains require matched validation</div>
              <div className={styles.qs}>
                <div className={styles.q}><b>Station-level DWLR history, with coordinates.</b> An ungauged mandal is interpolated between mandal means today and errs by {spatial.reportedMetric.maeM.toFixed(1)} m, five times the nowcast. Well locations would let it run between wells inside aquifer structure, and let an estimate be made below mandal scale.</div>
                <div className={styles.q}><b>The NAQUIM aquifer framework: boundaries, thickness, specific yield, transmissivity.</b> Aquifer type is a district proxy, contradicted by the measured specific yield in 259 of 688 series. Hard rock is the worst terrain in both tests: {t.terrainCohorts.hard_rock.maeM.toFixed(2)} m against {t.terrainCohorts.coastal.maeM.toFixed(2)} m on the coast for the nowcast, {spatial.terrainCohortsForReportedMethod.hard_rock.maeM.toFixed(1)} m against {spatial.terrainCohortsForReportedMethod.coastal.maeM.toFixed(1)} m when a mandal is ungauged. Real aquifer properties would also make depth-to-storage defensible.</div>
                <div className={styles.q}><b>Agricultural feeder supply hours, and the pump-set census.</b> The annual extraction assessment supplies context, not measured monthly pumping. Supply hours and connected load could provide a pumping proxy, but conversion to volume needs pump efficiency, lift and field checks.</div>
                <div className={styles.q}><b>DWLR telemetry, not only the history.</b> Readings are monthly, so even a perfect estimate is a month behind. Telemetry would make instrumented mandals measured and current rather than modelled, and turn a backtest into continuous validation.</div>
                <div className={styles.q}><b>An authorized APWRIMS export, full history.</b> Training begins June 2015. A longer, quality-controlled record may improve seasonal coverage; any gain must be tested. Source authorization remains a gate on official use.</div>
                <div className={styles.q}><b>Prospective field verification.</b> Record predictions before new measurements arrive, then score depth error, interval coverage and missed stress cases by aquifer. Historical backtests do not replace prospective validation.</div>
              </div>
              <div className={`${styles.note} ${styles.teal}`}><b>Where the misses are.</b> In usual seasons, the forecast&rsquo;s direction agrees with CGWB {Math.round(crossNetwork.overall.bySeason.usual.forecast! * 100)}% of the time; agreement between the two measured networks is {Math.round(crossNetwork.overall.bySeason.usual.measured! * 100)}%. In pattern-breaking seasons those figures are {Math.round(crossNetwork.overall.bySeason.broke.forecast! * 100)}% and {Math.round(crossNetwork.overall.bySeason.broke.measured! * 100)}%. The networks read different wells, so this shows where to look rather than a hard ceiling.</div>
              <div className={styles.sec}>What this project can give back</div>
              <div className={styles.limits}>
                <div className={styles.lim}><b>A systematic gap between the two well networks.</b> Over {cross.sampleCount.toLocaleString("en-US")} readings paired within {cross.maximumDistanceKm} km and the same month, CGWB&rsquo;s wells read {Math.abs(cross.biasCgwbMinusApwrimsM).toFixed(1)} m {cross.biasCgwbMinusApwrimsM < 0 ? "shallower" : "deeper"} than the State&rsquo;s, correlating {cross.correlation.toFixed(2)}.</div>
                <div className={styles.lim}><b>259 series whose aquifer label its own specific yield contradicts</b>, already listed mandal by mandal and ready to hand over.</div>
                <div className={styles.lim}><b>Quality control on the State&rsquo;s own record.</b> The same model that estimates a level also flags a reading inconsistent with that well&rsquo;s history and its neighbours, which is how a drifting recorder or a transcription error is found across a network of this size.</div>
              </div>
              <div className={styles.note}><b>What that would build.</b> With located wells and aquifer properties in place, this same weekly pipeline ({WATER.length + CLIMATE.length + LAND.length} sources, {mapGeometry.mandals.length} mandals, every Monday) could estimate a level where no well stands. It would be published only once it beats the current model on held-out places and dates.</div>

            </div>
            <Foot n={8} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="08 · Below the mandal" title="A village needs a few readings, not a piezometer" lede={<>The department asked whether a level can be given per village at the error the model reaches per mandal. Not as it stands. The reason is not resolution. What is missing is a target: <b>APWRIMS publishes levels already averaged to mandal</b>, so nothing below mandal scale has ever been trained or tested. Measured below on {village.source.apWells.toLocaleString("en-US")} CGWB wells, {village.source.apReadings.toLocaleString("en-US")} readings, {village.source.period}, each well against wells of the same type in its mandal.</>} />
            <div className={styles.body}>
              <div className={styles.figs}>
                <div className={styles.fig}><b>{village.spread.medianVillageSpreadM.toFixed(2)} m</b><span>the median village stands this far from its mandal&rsquo;s mean, more than the whole mandal-level error</span></div>
                <div className={styles.fig}><b>{village.validation.persistence.persistentSharePct.toFixed(0)}%</b><span>of that gap stays with the place rather than moving season to season</span></div>
                <div className={styles.fig}><b>{village.validation.splitHalf.pastPredictsFutureR.toFixed(3)}</b><span>a well&rsquo;s earlier gap against its later one, in date order, {village.validation.splitHalf.wellsScored} wells</span></div>
                <div className={styles.fig}><b>{dug ? dug.forwardDoseResponse.find(d => d.readings === 3)!.residualErrorM.toFixed(2) : "–"} m</b><span>error on a later reading after three readings at a dug well{dug?.forwardBaselineM ? <>, against {dug.forwardBaselineM.toFixed(2)} m on the mandal figure alone</> : null}</span></div>
              </div>

              <div className={styles.note}><b>The accuracy is borrowed from the well.</b> The nowcast errs by {card.evaluations.temporalNowcast.model.maeM.toFixed(2)} m because every mandal has its own history to carry forward. That history alone, with no model, already gives {card.evaluations.temporalNowcast.lastReadingBaseline.maeM.toFixed(2)} m. Take the local sensor away and hold out whole mandals and the error is <b>{card.evaluations.spatialEstimation.reportedMetric.maeM.toFixed(2)} m</b>. A village without a well is that case at a finer scale.</div>

              <div className={styles.twocol}>
                <div className={styles.chartcard}>
                  <h3>What each reading at a well buys</h3>
                  <p>The first readings measure the well&rsquo;s gap from its mandal; every later reading, in date order, tests it. Every point uses the same wells and the same later readings. CGWB reads in January, May, August and November, so four readings is about a year. These wells are read at rest from a fixed point, so private wells will be noisier.</p>
                  {dug && bore && <DoseCurve series={[{ label: "Dug well", colour: "#1f8a8a", dose: dug.forwardDoseResponse, below: true }, { label: "Bore well", colour: "#c2412d", dose: bore.forwardDoseResponse }]} />}
                </div>
                <div>
                  <div className={styles.para}>A village deeper than its mandal tends to stay deeper. Across wells the gap varies by {village.validation.persistence.betweenWellOffsetSdM.toFixed(1)} m, while one well&rsquo;s own gap moves by {village.validation.persistence.withinWellScatterSdM.toFixed(1)} m from season to season. Measured from the first half of each record, it cuts the error on the second half&rsquo;s average from {village.validation.splitHalf.mandalMeanAppliedMaeM.toFixed(2)} m to {village.validation.splitHalf.withLearnedOffsetMaeM.toFixed(2)} m. <b>A single later reading is harder</b>: that season-to-season movement sets a floor near 2 m that more readings do not lower.</div>
                  <table className={styles.res}><thead><tr><th>Readings</th><th>Dug well</th><th>Bore well</th></tr></thead><tbody>
                    {dug?.forwardBaselineM && bore?.forwardBaselineM ? <tr><td>none · mandal figure alone</td><td className={styles.num}>{dug.forwardBaselineM.toFixed(2)} m</td><td className={styles.num}>{bore.forwardBaselineM.toFixed(2)} m</td></tr> : null}
                    {dug && bore && [1, 3, 4, 8].map(n => {
                      const d = dug.forwardDoseResponse.find(x => x.readings === n), b = bore.forwardDoseResponse.find(x => x.readings === n);
                      if (!d || !b) return null;

                      return <tr key={n}><td>{n === 4 ? "4 · a year quarterly" : n === 8 ? "8 · two years" : n}</td><td className={styles.num}>{d.residualErrorM.toFixed(2)} m</td><td className={styles.num}>{b.residualErrorM.toFixed(2)} m</td></tr>;
                    })}
                  </tbody></table>
                </div>
              </div>

              <div className={styles.note}><b>It helps most where the need is greatest.</b> Error on the second half&rsquo;s average, on the mandal figure alone and then with the measured gap: {village.validation.splitHalf.byAquifer.map((row, i, all) => <span key={row.aquifer}><b>{row.aquifer === "hard_rock" ? "hard rock" : row.aquifer}</b> {row.mandalMeanAppliedMaeM.toFixed(2)} &rarr; {row.withLearnedOffsetMaeM.toFixed(2)} m{i < all.length - 1 ? ", " : ". "}</span>)}Hard rock is the worst terrain in every other test on this platform, and the one a measured gap repairs by the most metres.</div>

              <div className={`${styles.note} ${styles.teal}`}><b>Measuring beats modelling, which is what sets the ask.</b> Predicting the gap instead, from position, well depth and type with whole mandals held out, gives {village.validation.staticCovariateNull.predictedOffsetMaeM.toFixed(2)} m at an R&sup2; of {village.validation.staticCovariateNull.predictedOffsetR2.toFixed(2)}, <b>no better than ignoring it</b> at {village.validation.staticCovariateNull.mandalMeanMaeM.toFixed(2)} m. A single measured reading cuts the error on later readings from {village.validation.forwardBaselineM?.toFixed(2)} m to {village.validation.forwardDoseResponse[0]?.residualErrorM.toFixed(2)} m.</div>

              <div className={styles.limits}>
                <div className={styles.lim}><b>Several wells per mandal, not one.</b> Measured against the State network&rsquo;s mandal mean instead of same-type peers, the gap keeps only {village.validation.crossNetworkOffset?.persistentSharePct.toFixed(0)}% of its persistence and leaves {village.validation.crossNetworkOffset?.withLearnedOffsetMaeM.toFixed(1)} m, because the two networks differ in wells, type and place. A pilot needs a handful of one kind per mandal, forming their own reference.</div>
                <div className={styles.lim}><b>Dug wells and bores kept apart</b>, or the aquifer&rsquo;s depth enters what should be the village&rsquo;s position. Dug wells are the steadier kind ({dug?.splitHalf.pastPredictsFutureR.toFixed(2)} against {bore?.splitHalf.pastPredictsFutureR.toFixed(2)}) and the kind a village draws from.</div>
                <div className={styles.lim}><b>A well speaks for its spot</b>, not the whole village. Private wells need a marked measuring point and a reading taken before pumping.</div>
              </div>

              <div className={styles.note}><b>What can be done now.</b> On {village.coverage.villages} villages across {village.coverage.mandals} mandals the gap is computable today, and the mandal figure is a poor village guide in {village.spread.proxyPoor} of the {village.coverage.mandalsWithSpread} mandals where it can be checked, which is itself a way to choose where to measure first. <b>The State&rsquo;s own well-level history would add the rest:</b> the mandal means here are averages of individual wells, so releasing those wells with coordinates gives sub-mandal structure statewide at no modelling cost. A measured pilot is what would then show the error a village figure can actually reach.</div>
            </div>
            <Foot n={9} />
          </section>

        </div>
      </div>
    </div>
  );
}
