import Link from "next/link";
import { AGREEMENT_RULES } from "../lib/agriculture";
import { agricultureEvidence } from "../lib/agricultureServer";
import { waterContext } from "../lib/waterContext";
import { day, driest, placeName, signed } from "./agriculture/waterContextFormat";
import { IconArrowRight, IconCloudRain } from "./icons";
import styles from "./MandalSeasonContext.module.css";

const CATEGORY: Record<string, string> = { excess: "Excess", normal: "Normal", deficient: "Deficient", scanty: "Scanty", noRain: "No rain" };

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
        </> : <p className={styles.note}>No unique gauge record for this prototype boundary.</p>}
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
        </> : <p className={styles.note}>No unique model record for this prototype boundary.</p>}
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
