import type { Metadata } from "next";
import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import droughtJson from "../../data/drought_watch.json";
import cardJson from "../../data/model_card.json";
import watchJson from "../../data/monsoon_watch.json";
import { basePath, datasetManifest, mapGeometry } from "../../lib/data";
import { summerOutlook } from "../../lib/summer";
import styles from "./Brief.module.css";

export const metadata: Metadata = {
  title: "Project brief",
  description: "The platform's data sources and groundwater model in six A4 pages, rebuilt from each week's data.",
};

/* The six-page brief: what the platform is, its sources, its model, this week's
   maps and the open questions. Every figure and map is read from the published
   data at build time; the deploy prints this page to brief/ap-water-intelligence-brief.pdf
   (scripts/print-brief.mjs), which also writes the 3D renders and site
   screenshots the page shows. */

const BRIEF_PDF = "ap-water-intelligence-brief.pdf";

type Band = { band: string; sampleCount: number; maeM: number; lastReadingMaeM: number };
type Card = {
  evaluations: {
    temporalNowcast: { sampleCount: number; model: { maeM: number }; lastReadingBaseline: { maeM: number; skillPct: number }; depthBands: Band[]; intervalEvaluation: { sampleCount: number; empiricalCoveragePct: number; meanWidthM: number } };
    rollingOriginNowcast: { sampleCount: number; maeM: number; lastReadingMaeM: number; skillVsLastReadingPct: number };
    directForecast: { horizons: Array<{ horizonMonths: number; rollingOrigin?: { sampleCount: number; maeM: number; baselines: { noChange: { maeM: number } } } }> };
    spatialEstimation: { rowCount: number; reportedMetric: { maeM: number } };
  };
};
type Watch = { generatedAt: string; recharge: { mandals: number; fallingPct: number }; rainfall: { anomalyPct: number } | null; mandals: Array<{ boundaryIndex: number | null; status: "severe" | "short" | "normal" }> };
type Drought = { state: { assessed: number; counts: Record<string, number> }; mandals: Array<{ i: number; category: string }> };
type Latest = { v: number; u?: number; r?: number } | null;

const card = cardJson as unknown as Card;
const watch = watchJson as unknown as Watch;
const drought = droughtJson as unknown as Drought;

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

/* ---------- static exhibits ---------- */
function Pipeline() {
  const box = { fill: "#fff", stroke: "#d4dce8" };
  return (
    <svg className={styles.pipe} viewBox="0 0 720 300" role="img" aria-label="How the parts fit together">
      <defs><marker id="brief-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#7d93ab" /></marker></defs>
      <g fontFamily="var(--font-sans)" fontSize="10.5">
        <rect x="0" y="0" width="228" height="64" rx="9" {...box} /><rect x="246" y="0" width="228" height="64" rx="9" {...box} /><rect x="492" y="0" width="228" height="64" rx="9" {...box} />
        <g fill="#0d2138" fontWeight="600" fontSize="11.5"><text x="14" y="22">Groundwater, measured</text><text x="260" y="22">Rain and climate</text><text x="506" y="22">Land, crops and people</text></g>
        <g fill="#667085"><text x="14" y="39">APWRIMS piezometers, monthly</text><text x="14" y="53">CGWB via INGRES · GRACE-DA</text><text x="260" y="39">CHIRPS v3 · NASA POWER</text><text x="260" y="53">NOAA ENSO · ECMWF · TerraClimate</text><text x="506" y="39">NOAA VHP · Sentinel-2</text><text x="506" y="53">WorldCereal · SoilGrids · WorldPop</text></g>
        <g stroke="#7d93ab" strokeWidth="1.3" fill="none"><path d="M114 64V86" markerEnd="url(#brief-arrow)" /><path d="M360 64V86" markerEnd="url(#brief-arrow)" /><path d="M606 64V86" markerEnd="url(#brief-arrow)" /></g>
        <rect x="0" y="90" width="720" height="62" rx="9" fill="#0b2a4d" />
        <text x="16" y="112" fill="#fff" fontWeight="600" fontSize="11.5">Weekly pipeline · every Monday, automated</text>
        <text x="16" y="128" fill="#bcd2e6">Fetch every source, join it to 670 mandal outlines, compare each mandal with its own past</text>
        <text x="16" y="143" fill="#ffd38a">Gate: about 430 data tests and a data-contract check; nothing publishes if one fails</text>
        <g stroke="#7d93ab" strokeWidth="1.3" fill="none"><path d="M180 152V174" markerEnd="url(#brief-arrow)" /><path d="M540 152V174" markerEnd="url(#brief-arrow)" /></g>
        <rect x="0" y="178" width="352" height="66" rx="9" {...box} /><rect x="368" y="178" width="352" height="66" rx="9" {...box} />
        <rect x="0" y="178" width="352" height="4" rx="2" fill="#1f8a8a" /><rect x="368" y="178" width="352" height="4" rx="2" fill="#d79b2e" />
        <g fill="#0d2138" fontWeight="600" fontSize="11.5"><text x="14" y="200">Groundwater model</text><text x="382" y="200">Rule-based analyses</text></g>
        <g fill="#667085"><text x="14" y="217">Boosted trees on the monthly change · 19 inputs</text><text x="14" y="232">Median + conformal 80% band · now and 3 months ahead</text><text x="382" y="217">Drought manual · recharge watch · summer outlook</text><text x="382" y="232">Crop water check · each mandal against its own past</text></g>
        <g stroke="#7d93ab" strokeWidth="1.3" fill="none"><path d="M180 244V262" markerEnd="url(#brief-arrow)" /><path d="M540 244V262" markerEnd="url(#brief-arrow)" /></g>
        <rect x="0" y="266" width="720" height="34" rx="9" fill="#1f8a8a" />
        <text x="16" y="287" fill="#fff" fontWeight="600" fontSize="11">Published: the site, maps, 3D views, district and constituency briefs, a weekly PDF</text>
      </g>
    </svg>
  );
}

function ErrorByDepth({ bands }: { bands: Band[] }) {
  const peak = Math.max(...bands.map(b => b.lastReadingMaeM));
  const bottom = 34 + bands.length * 40;
  return (
    <svg viewBox={`0 0 320 ${bottom + 6}`} className={styles.chart} role="img" aria-label="Average error by depth band, the model against the last reading carried forward">
      <rect x="76" y="6" width="10" height="10" rx="2" fill="#1f8a8a" /><text x="91" y="15" className={styles.cl}>Model</text>
      <rect x="132" y="6" width="10" height="10" rx="2" fill="#c9d3de" /><text x="147" y="15" className={styles.cl}>Last reading carried forward</text>
      <line x1="76" x2="76" y1="28" y2={bottom} stroke="#9aa9ba" />
      {bands.map((b, i) => {
        const y = 34 + i * 40, wl = 196 * b.lastReadingMaeM / peak, wm = 196 * b.maeM / peak;
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

const ICON: Record<string, ReactNode> = {
  drop: <svg viewBox="0 0 24 24"><path d="M12 3c3.5 4.2 6 7.6 6 10.8A6 6 0 0 1 6 13.8C6 10.6 8.5 7.2 12 3z" /></svg>,
  cloud: <svg viewBox="0 0 24 24"><path d="M7 16a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6 1.5A3.3 3.3 0 0 1 17 16z" /><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" /></svg>,
  leaf: <svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" /><path d="M5 19l8-8" /></svg>,
  scale: <svg viewBox="0 0 24 24"><path d="M12 4v16M5 8h14M5 8l-3 6a3 3 0 0 0 6 0zM19 8l-3 6a3 3 0 0 0 6 0z" /></svg>,
  clock: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>,
  check: <svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" /></svg>,
};

type SourceRow = [string, string, string, string, ReactNode];
const WATER: SourceRow[] = [
  ["APWRIMS", "AP Water Resources Information & Management System", "Depth to water below ground per mandal, from state piezometers, 2014 to date", "mandal · monthly", <><b>The measured series</b> the model learns from and every page reports</>],
  ["APWRIMS context feeds", "AP DES gauges · NRSC soil moisture · reservoirs", "Mandal rain gauges, modelled soil moisture, reservoir storage and canal releases", "mandal · daily to weekly", "Drought triggers, the crop check, reservoir context"],
  ["CGWB assessment via INGRES", "hosted by IIT Hyderabad", "2024 Dynamic Ground Water Resource Assessment: stage of extraction and category", "unit · annual", "The official safe → over-exploited label"],
  ["CGWB station levels", "via India-WRIS", "Central network well readings", "station · seasonal", "Cross-network comparison"],
  ["NASA GRACE-DA", "GRACE gravimetry assimilated in a land model", "Groundwater storage percentile", "coarse grid · weekly", "Regional storage context only"],
  ["AP Data Lake", "AI Living Labs, access-controlled", "The State's official groundwater snapshot and mandal outlines", "mandal · on request", "Official boundaries; well-count check"],
];
const CLIMATE: SourceRow[] = [
  ["CHIRPS v3.0", "UC Santa Barbara Climate Hazards Center", "Satellite-and-gauge rainfall, 1981 to date", "0.05° · monthly", <><b>The model&rsquo;s rainfall input</b>, anomalies, SPI</>],
  ["NASA POWER", "MERRA-2 reanalysis", "Rainfall", "≈55 km · monthly", "Fallback where CHIRPS is missing"],
  ["TerraClimate", "University of Idaho", "Actual evapotranspiration, water balance", "≈4 km · monthly", "Rain-minus-ET context (not recharge)"],
  ["NOAA CPC", "Oceanic Niño Index, ENSO outlook", "El Niño state and official outlook", "index · monthly", "El Niño context and composites"],
  ["NOAA ERSST v5 · GHCN-CAMS", "with NOAAGlobalTemp", "Sea-surface and air temperature", "2° / 0.5° · monthly", "Pacific panel, temperature record"],
  ["ECMWF open forecast", "via Open-Meteo", "Reference ET and rain, 7 to 10 days ahead", "0.25° · daily", "The weekly crop water check"],
];
const LAND: SourceRow[] = [
  ["NOAA STAR VHP", "Vegetation Health Product", "Vegetation Condition Index", "4 km · weekly", "Crop stress; the crop check's track record"],
  ["Sentinel-2 L2A", "ESA Copernicus via Element 84, AWS", "Red and near-infrared reflectance, cloud mask", "10 m (read at 160 m) · 5 days", "Field-scale NDVI change to score the crop check"],
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
  return <div className={styles.pfoot}><span><b>AP Water Intelligence</b> · data sources and model · prucodes.github.io/ap-groundwater-fusion</span><span className={styles.mono}>{n} / 6</span></div>;
}

export default function BriefPage() {
  const t = card.evaluations.temporalNowcast;
  const roll = card.evaluations.rollingOriginNowcast;
  const h3 = card.evaluations.directForecast.horizons.find(h => h.horizonMonths === 3)?.rollingOrigin;
  const spatial = card.evaluations.spatialEstimation;
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
  const summerClasses = new Map<number, string>();
  summer.mandals.forEach((row, i) => {
    if (!row) return;
    const deep = (row.tier === "beyond" ? row.typical : row.dry) >= summer.deepM;
    summerClasses.set(i, row.tier === "beyond" ? (deep ? "xd" : "xs") : row.tier);
  });
  const refreshed = day((datasetManifest as { generatedAt?: string }).generatedAt ?? watch.generatedAt);
  const pct = (a: number, b: number) => Math.round(100 * (b - a) / b);

  return (
    <div className="pageWrap">
      <div className={styles.viewer}>
        <div className={styles.toolbar}>
          <p>The six-page brief on the platform&rsquo;s sources and model, rebuilt from this week&rsquo;s data.</p>
          <a className={styles.download} href={`${basePath}/brief/${BRIEF_PDF}`} download="AP-Water-Intelligence-brief.pdf" data-testid="brief-pdf">Download PDF</a>
        </div>
        <div className={styles.scroller}>

          <section className={`${styles.page} ${styles.cover}`} data-testid="brief-sheet">
            <div className={styles.orbit} /><div className={`${styles.orbit} ${styles.o2}`} />
            <div className={styles.eyebrow}>Andhra Pradesh · Groundwater intelligence</div>
            <h1>AP Water <b>Intelligence</b></h1>
            <p className={styles.sub}>Data sources and the groundwater model</p>
            <p className={styles.meta}>A technical note for review · figures from the weekly refresh of {refreshed}</p>
            <div className={styles.hero3d}><img src="./cover3d.jpg" alt="3D relief of Andhra Pradesh's mandals" /></div>
            <p className={styles.caption}>Depth to water in {latestMonth}, each mandal against its own usual {latestMonth}, as the platform&rsquo;s 3D view draws it: blue shallower than usual, slate about usual, amber deeper, red deeper than any {latestMonth} on record.</p>
            <div className={styles.kpis}>
              <div className={styles.kpi}><b>{mapGeometry.mandals.length}</b><span>mandals mapped, each compared with its own history</span></div>
              <div className={styles.kpi}><b>18</b><span>public and official data sources, combined every week</span></div>
              <div className={styles.kpi}><b>{roll.maeM.toFixed(2)} m</b><span>average nowcast error; {roll.skillVsLastReadingPct.toFixed(0)}% better than the last reading</span></div>
              <div className={styles.kpi}><b>Mon</b><span>automated refresh; publishes only if about 430 tests pass</span></div>
            </div>
            <div className={styles.inside}><div className={`${styles.ihead} ${styles.mono}`}>Inside</div>
              <div><b>01</b><span>What it is</span><small>the question, three rules, the pipeline</small></div>
              <div><b>02</b><span>Data sources</span><small>18 sources, what each gives and does</small></div>
              <div><b>03</b><span>The model</span><small>method, tests, release rule</small></div>
              <div><b>04</b><span>This week</span><small>four maps of {mapGeometry.mandals.length} mandals</small></div>
              <div><b>05</b><span>Open questions</span><small>limits, and where review helps</small></div>
            </div>
            <div className={styles.foot}><span>prucodes.github.io/ap-groundwater-fusion</span><span>Prototype · not an official measurement</span></div>
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
                  <figure key={key}><img src={`./site-${key}.jpg`} alt="" /><figcaption>{label}</figcaption></figure>
                ))}
              </div>
            </div>
            <Foot n={2} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="02 · Data sources" title="One measured series, seventeen supporting ones" lede={<>Only the first row is what the model predicts; the rest are inputs, cross-checks or context, each <b>joined to the same {mapGeometry.mandals.length} mandal outlines</b> before use.</>} />
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
                <div className={styles.step}><i>02</i><b>Learner</b><span>scikit-learn HistGradientBoosting: the median plus the 10th and 90th percentiles under quantile loss</span></div>
                <div className={styles.step}><i>03</i><b>Blend</b><span>Pulled toward the last reading by a weight set per depth band on a held-out year (2023)</span></div>
                <div className={styles.step}><i>04</i><b>Band</b><span>10th to 90th percentile range widened per aquifer and season by split-conformal calibration</span></div>
                <div className={styles.step}><i>05</i><b>No leakage</b><span>Each mandal&rsquo;s latest reading is held out before its own estimate; inputs use only what was known then</span></div>
              </div>
              <div className={styles.sec}>How it is tested</div>
              <table className={styles.res}><thead><tr><th>Test</th><th>Months</th><th>Model</th><th>Baseline</th><th>Gain</th></tr></thead><tbody>
                <tr><td>Nowcast, held out (trained to Dec 2023), Jan 2024 to Sep 2026</td><td className={styles.num}>{t.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{t.model.maeM.toFixed(2)} m</td><td className={styles.num}>{t.lastReadingBaseline.maeM.toFixed(2)} m last</td><td className={`${styles.num} ${styles.gain}`}>{t.lastReadingBaseline.skillPct.toFixed(0)}%</td></tr>
                <tr><td>Nowcast, retrained every month</td><td className={styles.num}>{roll.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{roll.maeM.toFixed(2)} m</td><td className={styles.num}>{roll.lastReadingMaeM.toFixed(2)} m last</td><td className={`${styles.num} ${styles.gain}`}>{roll.skillVsLastReadingPct.toFixed(0)}%</td></tr>
                {h3 ? <tr><td>Forecast 3 months ahead, rolling origins</td><td className={styles.num}>{h3.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{h3.maeM.toFixed(2)} m</td><td className={styles.num}>{h3.baselines.noChange.maeM.toFixed(2)} m no change</td><td className={`${styles.num} ${styles.gain}`}>{pct(h3.maeM, h3.baselines.noChange.maeM)}%</td></tr> : null}
                <tr><td>80% band coverage</td><td className={styles.num}>{interval.sampleCount.toLocaleString("en-US")}</td><td className={styles.num}>{interval.empiricalCoveragePct.toFixed(1)}%</td><td className={styles.num}>80% nominal</td><td className={styles.num}>±{(interval.meanWidthM / 2).toFixed(1)} m</td></tr>
                <tr><td>Ungauged mandal (whole mandal held out)</td><td className={styles.num}>{spatial.rowCount.toLocaleString("en-US")}</td><td className={styles.num}>{spatial.reportedMetric.maeM.toFixed(1)} m</td><td className={styles.num}>state average</td><td className={`${styles.num} ${styles.no}`}>not released</td></tr>
              </tbody></table>
              <div className={styles.twocol} style={{ marginTop: "4mm" }}>
                <div className={styles.chartcard}><h3>Error grows with depth; the model wins in every band</h3><p>Average absolute error on held-out months</p><ErrorByDepth bands={t.depthBands} /></div>
                <div className={styles.stack}>
                  <div className={`${styles.note} ${styles.teal}`}><b>Release rule.</b> A horizon is published only if it beats both no-change and same-month-last-year by at least 5% under rolling-origin validation, with no leakage and consistent results by terrain. Three months passes; one, six and twelve do not yet, so they are not shown.</div>
                  <div className={styles.note}><b>Tried and rejected, on evidence.</b> The El Niño index made it worse. Rain over official outlines: no gain (1.797 vs 1.800 m). NASA near-real-time rain read twice as wet as CHIRPS and raised error 0.62 → 0.96 m. A month whose satellite rain is unpublished is estimated without it and says so (0.89 → 1.04 m).</div>
                </div>
              </div>
            </div>
            <Foot n={4} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="04 · What it shows this week" title={`Four readings of the same ${mapGeometry.mandals.length} mandals`} lede="Each map is drawn from this week's published data. Each compares a mandal with its own history, and each method carries a backtest or a rule from an official manual." />
            <div className={styles.body}>
              <div className={styles.maps}>
                <div className={styles.mapcard}><div className={styles.k}>Water Depth 3D</div><h3>{latestMonth} against its usual {latestMonth}</h3><div className={styles.big}>{(latestCounts.get("deep") ?? 0) + (latestCounts.get("rec") ?? 0)}<small>mandals deeper than usual; {latestCounts.get("rec") ?? 0} deepest on record</small></div><p className={styles.how}>Latest reading against the median of the same mandal&rsquo;s earlier {latestMonth}s; within 1 m counts as usual.</p><MandalMap classes={latest.classes} colours={NOW_COL} /><Legend counts={latestCounts} items={[["shal", "Shallower than usual", NOW_COL.shal], ["near", "Within 1 m", NOW_COL.near], ["deep", "Deeper than usual", NOW_COL.deep], ["rec", "Deepest on record", NOW_COL.rec]]} /></div>
                <div className={styles.mapcard}><div className={styles.k}>Monsoon Watch</div><h3>Did this monsoon recharge the ground?</h3><div className={styles.big}>{watch.recharge.fallingPct}%<small>of {watch.recharge.mandals} mandal series lower than in May</small></div><p className={styles.how}>May-to-now change against the same mandal&rsquo;s median over ten seasons; flagged when 1 m short and twice its own spread.{watch.rainfall ? ` Rain ${Math.abs(watch.rainfall.anomalyPct)}% ${watch.rainfall.anomalyPct < 0 ? "below" : "above"} normal.` : ""}</p><MandalMap classes={monsoon} colours={MON_COL} /><Legend counts={tally(monsoon)} items={[["normal", "Normal", MON_COL.normal], ["short", "Short", MON_COL.short], ["severe", "Severe shortfall", MON_COL.severe]]} /></div>
                <div className={styles.mapcard}><div className={styles.k}>Drought Watch</div><h3>What the national drought manual says</h3><div className={styles.big}>{drought.state.counts.severe ?? 0} · {drought.state.counts.moderate ?? 0}<small>severe · moderate, of {drought.state.assessed} assessed</small></div><p className={styles.how}>The Manual for Drought Management 2020: rain deficit and dry spells, then impact on vegetation, soil, groundwater and reservoirs. It reads the manual; it does not declare.</p><MandalMap classes={droughtClasses} colours={DRO_COL} /><Legend counts={tally(droughtClasses)} items={[["severe", "Severe", DRO_COL.severe], ["moderate|severe", "Moderate to severe", DRO_COL["moderate|severe"]], ["moderate", "Moderate", DRO_COL.moderate], ["normal", "Normal", DRO_COL.normal], ["noTrigger", "No trigger", DRO_COL.noTrigger]]} /></div>
                <div className={styles.mapcard}><div className={styles.k}>Summer Outlook</div><h3>Where May {summer.targetMay.slice(0, 4)} may break the record</h3><div className={styles.big}>{summer.summary.beyond}<small>mandals past their deepest May in a typical winter</small></div><p className={styles.how}>Latest reading plus the mandal&rsquo;s own past winter drawdowns, against its deepest May.{summer.backtest?.pastRecordPct?.beyond ? ` Backtest: past “beyond” calls came true 1 in ${Math.round(100 / summer.backtest.pastRecordPct.beyond)}, against 1 in ${Math.round(100 / summer.backtest.baseRatePct)} overall.` : ""}</p><MandalMap classes={summerClasses} colours={SUM_COL} /><Legend counts={tally(summerClasses)} items={[["xd", `Beyond record, ${summer.deepM} m+`, SUM_COL.xd], ["xs", "Beyond, under 10 m", SUM_COL.xs], ["dry", "Only in a dry winter", SUM_COL.dry], ["within", "Within its record", SUM_COL.within]]} /></div>
              </div>
            </div>
            <Foot n={5} />
          </section>

          <section className={styles.page} data-testid="brief-sheet">
            <Band num="05 · Limits and open questions" title="Where a hydrogeologist's view would help most" lede="The model knows depth well and storage, aquifers and pumping poorly. These are the questions we would most value a review on." />
            <div className={styles.body}>
              <div className={styles.banner}><img src="./outlook3d.jpg" alt="May outlook in 3D" /><div className={styles.cap}><b>May {summer.targetMay.slice(0, 4)} in a dry winter</b>, from the 3D view: glowing rims mark each mandal&rsquo;s deepest May on record where the projected water falls below it.</div></div>
              <div className={styles.sec}>Known limits</div>
              <div className={styles.limits}>
                <div className={styles.lim}><b>Aquifer properties are coarse.</b> Aquifer type is a district proxy; for 259 of 688 series the measured specific yield disagrees with the label.</div>
                <div className={styles.lim}><b>Depth is not storage.</b> A metre lost in hard rock holds far less water than in the delta; volumes are under review.</div>
                <div className={styles.lim}><b>Pumping is unobserved.</b> Extraction enters only through the official stage-of-extraction figure.</div>
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
                <div><b>Groundwater</b> apwrims.ap.gov.in · ingres.iith.ac.in · indiawris.gov.in · nasagrace.unl.edu</div>
                <div><b>Rain</b> data.chc.ucsb.edu/products/CHIRPS/v3.0 · power.larc.nasa.gov · climatologylab.org/terraclimate</div>
                <div><b>Climate</b> cpc.ncep.noaa.gov (ONI) · psl.noaa.gov (ERSST v5) · open-meteo.com (ECMWF open data)</div>
                <div><b>Land</b> star.nesdis.noaa.gov (VHP) · earth-search.aws.element84.com (Sentinel-2) · esa-worldcereal.org · esa-worldcover.org · soilgrids.org · worldpop.org</div>
                <div><b>Methods</b> Manual for Drought Management 2020 · FAO-56 (Allen et al., 1998) · scikit-learn</div>
              </div>
            </div>
            <Foot n={6} />
          </section>

        </div>
      </div>
    </div>
  );
}
