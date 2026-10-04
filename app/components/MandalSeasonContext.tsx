import Link from "next/link";
import { AGREEMENT_RULES, GEC_CATEGORIES, VCI_CLASSES } from "../lib/agriculture";
import { agricultureEvidence } from "../lib/agricultureServer";
import { waterContext } from "../lib/waterContext";
import { day, driest, placeName, signed } from "./agriculture/waterContextFormat";
import { IconArrowRight, IconCloudRain } from "./icons";
import styles from "./MandalSeasonContext.module.css";

const CATEGORY: Record<string, string> = { excess: "Excess", normal: "Normal", deficient: "Deficient", scanty: "Scanty", noRain: "No rain" };

/** The weekly vegetation index as a small line, with the drought manual's 40 and 60 lines. */
function VciSparkline({ weeks }: { weeks: Array<number | null> }) {
  const W = 220, H = 52, n = weeks.length;
  const x = (i: number) => 4 + (i * (W - 8)) / Math.max(1, n - 1);
  const y = (v: number) => H - 4 - (v / 100) * (H - 8);
  const segments: string[][] = [[]];
  weeks.forEach((value, i) => { if (value === null) segments.push([]); else segments[segments.length - 1].push(`${x(i).toFixed(1)},${y(value).toFixed(1)}`); });
  const last = [...weeks].reverse().find(v => v !== null) ?? null;
  return <svg viewBox={`0 0 ${W} ${H}`} className={styles.spark} role="img" aria-label={`Weekly vegetation index over ${n} weeks, latest ${last ?? "unknown"}.`}>
    <rect x={4} y={y(40)} width={W - 8} height={y(0) - y(40)} fill="#b64c42" opacity=".08" />
    <rect x={4} y={y(60)} width={W - 8} height={y(40) - y(60)} fill="#ce982b" opacity=".08" />
    <line x1={4} x2={W - 4} y1={y(40)} y2={y(40)} stroke="#b64c42" strokeDasharray="3 3" opacity=".5" />
    <line x1={4} x2={W - 4} y1={y(60)} y2={y(60)} stroke="#5e9c89" strokeDasharray="3 3" opacity=".5" />
    {segments.filter(seg => seg.length > 1).map((seg, i) => <polyline key={i} points={seg.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />)}
    {last !== null ? <circle cx={x(weeks.lastIndexOf(last))} cy={y(last)} r="3" fill="currentColor" /> : null}
  </svg>;
}

/** This season beside the groundwater record: the same per-mandal gauge rain,
 * soil moisture and three-source agreement the Agriculture page shows. Server
 * rendered, so only this mandal's figures reach the page. */
export function MandalSeasonContext({ mandalId }: { mandalId: string }) {
  const evidence = agricultureEvidence();
  const matches = evidence.mandals.filter(row => row.id === mandalId);
  const row = matches.length === 1 ? matches[0] : null;
  const soilSection = waterContext.soilMoisture, rainSection = waterContext.rainfall, store = waterContext.reservoirs;
  if (!row || (!soilSection && !rainSection)) return null;
  const soilRows = soilSection?.mandals.filter(m => m.boundaryIndex === row.index) ?? [];
  const rainRows = rainSection?.mandals.filter(m => m.boundaryIndex === row.index) ?? [];
  const soil = soilRows.length === 1 ? soilRows[0] : null;
  const rain = rainRows.length === 1 ? rainRows[0] : null;
  const head = soilSection ? soilSection.depthsCm.indexOf(soilSection.headlineDepthCm) : -1;
  const district = row.district.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const reservoirs = (store?.reservoirs ?? []).filter(r => (r.district ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") === district).slice(0, 3);
  const a = row.agreement;
  const tests: Array<[string, boolean | null]> = [["Groundwater shortfall flagged", a.groundwater], ["Gauge rain 20% or more below normal", a.rain], ["Soil among the driest quarter of years for the date", a.soil]];

  return <section className="card" aria-labelledby="mandal-season-title">
    <div className="cardHead">
      <div className="cardTitle" id="mandal-season-title"><span className="titleIcon"><IconCloudRain /></span>This season<span className="cardSub" style={{ marginLeft: 6 }}>gauge rain, soil moisture and storage</span></div>
      <span className="cardSub">APWRIMS · research use</span>
    </div>
    <div className={styles.grid}>
      <div className={styles.block}>
        <span className={styles.label}>Gauge rain, {rainSection ? `${day(rainSection.window.start, false)} to ${day(rainSection.window.end)}` : "not available"}</span>
        {rain ? <>
          <strong className={styles.figure} data-tone={rain.deviationPct <= -20 ? "short" : undefined}>{signed(rain.deviationPct, 0)}<small> against normal</small></strong>
          <p>{rain.actualMm.toFixed(0)} mm against a normal of {rain.normalMm.toFixed(0)} mm · {rain.category ? CATEGORY[rain.category] : "uncategorised"} · {rain.rainyDays ?? "?"} rainy days · {rain.gauges ?? "?"} gauges</p>
          {rain.lastMonth.actualMm !== null && rain.lastMonth.normalMm ? <p className={styles.note}>Last month: {rain.lastMonth.actualMm.toFixed(0)} mm against {rain.lastMonth.normalMm.toFixed(0)} mm.</p> : null}
        </> : <p className={styles.note}>No unique gauge record for this boundary.</p>}
        <p className={styles.source}>Measured: AP DES mandal rain gauges via APWRIMS.</p>
      </div>
      <div className={styles.block}>
        <span className={styles.label}>Soil moisture, {soilSection ? day(soilSection.asOf) : "not available"}</span>
        {soil && soilSection ? <>
          <strong className={styles.figure}>{soil.pct[head].toFixed(0)}%<small> at {soilSection.headlineDepthCm} cm{soil.baseline ? ` · usual ${soil.baseline.median.toFixed(0)}%` : ""}</small></strong>
          <ul className={styles.depths} aria-label="Soil moisture by depth">
            {soilSection.depthsCm.map((depth, index) => <li key={depth}><span>{depth} cm</span><span className={styles.track}><i style={{ width: `${Math.min(100, soil.pct[index])}%` }} /></span><b>{soil.pct[index].toFixed(0)}%</b></li>)}
          </ul>
          <p className={styles.note}>{soil.baseline ? `${driest(soil.baseline.rankDriest)} of ${soil.baseline.ofYears} years for this date (range ${soil.baseline.min.toFixed(0)} to ${soil.baseline.max.toFixed(0)}%).` : "Too few earlier years to call anything usual."}{soil.weekAgoPct !== null ? ` A week earlier: ${soil.weekAgoPct.toFixed(0)}%.` : ""}</p>
        </> : <p className={styles.note}>No unique model record for this boundary.</p>}
        <p className={styles.source}>Modelled: NRSC VIC land-surface model via APWRIMS; plant-available water as a share of what the soil holds.</p>
      </div>
      <div className={styles.block}>
        <span className={styles.label}>Signals pointing to stress</span>
        <strong className={styles.figure} data-tone={a.stressed === 3 ? "short" : undefined}>{a.stressed}<small> of {a.known} usable</small></strong>
        <ul className={styles.tests}>
          {tests.map(([name, value]) => <li key={name} data-state={value === null ? "unknown" : value ? "stress" : "clear"}>{name}<small>{value === null ? "no usable value" : value ? "yes" : "no"}</small></li>)}
        </ul>
        <p className={styles.source} title={`${AGREEMENT_RULES.groundwater}. ${AGREEMENT_RULES.rain}. ${AGREEMENT_RULES.soil}.`}>A count of stated tests, not a score. The soil model is driven by rainfall, so those two are not independent.</p>
      </div>
      {row.vegetation && evidence.field?.vegetation ? <div className={styles.block} data-testid="mandal-vegetation">
        <span className={styles.label}>Crop vegetation, {day(evidence.field.vegetation.averaged[0]?.approxStart, false)} to {day(evidence.field.vegetation.averaged[evidence.field.vegetation.averaged.length - 1]?.approxEnd)}</span>
        <strong className={styles.figure} data-tone={row.vegetation.cls === "severe" ? "short" : undefined}>{row.vegetation.vci.toFixed(0)}<small> · {VCI_CLASSES[row.vegetation.cls].label.toLowerCase()}</small></strong>
        {row.vegetation.weeks?.length ? <div className={styles.sparkWrap} style={{ color: VCI_CLASSES[row.vegetation.cls].color }}><VciSparkline weeks={row.vegetation.weeks} /></div> : null}
        <p className={styles.note}>Weekly since {day(evidence.field.vegetation.weeks[0]?.approxStart, false)}; dashed lines at 40 and 60, the drought manual&rsquo;s class limits.{row.vegetation.croplandPct !== null ? ` Cropland is about ${row.vegetation.croplandPct}% of this mandal's land.` : ""}{row.vegetation.fewFields ? " Few fields here, so the plain all-vegetation value is shown." : ""}</p>
        <p className={styles.source}>Satellite index: NOAA STAR VHP, 4 km weekly, weighted to cropland (ESA WorldCover 2021). Plant vigour against the same weeks in other years, not yield.</p>
      </div> : null}
      {row.assessment && evidence.field?.assessment ? <div className={styles.block} data-testid="mandal-assessment">
        <span className={styles.label}>Groundwater assessment {evidence.field.assessment.year}</span>
        <strong className={styles.figure} data-tone={["critical", "over_exploited"].includes(row.assessment.cat) ? "short" : undefined} style={{ color: GEC_CATEGORIES[row.assessment.cat].color }}>{GEC_CATEGORIES[row.assessment.cat].label}<small> · {row.assessment.stagePct?.toFixed(0) ?? "?"}% of the extractable groundwater drawn</small></strong>
        {row.assessment.extractionHam != null && row.assessment.resourceHam != null ? <ul className={styles.depths} aria-label="Groundwater drawn by use">
          {([["Irrigation", row.assessment.irrigationHam], ["Domestic", row.assessment.domesticHam], ["Industry", row.assessment.industryHam]] as Array<[string, number | null]>).filter(([, value]) => value).map(([name, value]) => <li key={name}><span>{name}</span><span className={styles.track}><i style={{ width: `${Math.min(100, ((value ?? 0) / row.assessment!.resourceHam!) * 100)}%` }} /></span><b>{(value ?? 0) / 100 < 0.05 ? "<0.1" : ((value ?? 0) / 100).toFixed(1)}</b></li>)}
        </ul> : null}
        <p className={styles.note}>{row.assessment.extractionHam != null && row.assessment.resourceHam != null ? `${(row.assessment.extractionHam / 100).toFixed(1)} of ${(row.assessment.resourceHam / 100).toFixed(1)} million m³ a year (bars: share of the extractable resource, figures in million m³).` : ""}{row.assessment.prev ? ` ${evidence.field.assessment.previousYear}: ${GEC_CATEGORIES[row.assessment.prev.cat].label}, ${row.assessment.prev.stagePct?.toFixed(0) ?? "?"}%.` : ""}{row.assessment.others?.length ? ` Also assessed here: ${row.assessment.others.map(o => `${placeName(o.unit)} (${GEC_CATEGORIES[o.cat].label})`).join(", ")}.` : ""}</p>
        <p className={styles.source}>Official: CGWB and the AP State Ground Water Department, GEC-2015 method, via INGRES; unit {placeName(row.assessment.unit)}.</p>
      </div> : null}
      {reservoirs.length ? <div className={`${styles.block} ${styles.wide}`}>
        <span className={styles.label}>Reservoirs in {placeName(row.district)}{store?.asOf ? `, ${day(store.asOf)}` : ""}</span>
        <ul className={styles.reservoirs}>
          {reservoirs.map(r => <li key={r.name}><span>{placeName(r.name)}</span><b>{r.storagePct ?? "?"}%</b><small>{r.lastYearPct ?? "?"}% a year ago</small></li>)}
        </ul>
        <p className={styles.source}>Storage at the dam, measured. Whether its canals reach this mandal needs the command-area map, which is not public.</p>
      </div> : null}
    </div>
    <Link className="linkAction" href="/agriculture#agriculture-watch">Compare across the state <IconArrowRight /></Link>
  </section>;
}
