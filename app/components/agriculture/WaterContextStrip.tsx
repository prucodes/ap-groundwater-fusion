import type { AgricultureEvidence } from "../../lib/agriculture";
import type { RainCategory } from "../../lib/data";
import { IconArrowRight, IconCloudRain, IconDroplet, IconWaves } from "../icons";
import { day, driest, monthSpan, placeName, signed, stamp, thousands } from "./waterContextFormat";
import styles from "./WaterContextStrip.module.css";

const RAIN_BANDS: Array<{ key: RainCategory; label: string; color: string }> = [
  { key: "noRain", label: "No rain", color: "#7a2e27" },
  { key: "scanty", label: "Scanty", color: "#b64c42" },
  { key: "deficient", label: "Deficient", color: "#ce982b" },
  { key: "normal", label: "Normal", color: "#5e9c89" },
  { key: "excess", label: "Excess", color: "#2789af" },
];

/** Rainfall, soil moisture and reservoir storage: dated context beside the
 * groundwater, each with its source, its date and whether it is measured. */
export function WaterContextStrip({ evidence }: { evidence: AgricultureEvidence }) {
  const { soil, rain, reservoirs } = evidence.water;
  const satellite = evidence.rainfall;
  const short = rain ? rain.categories.deficient + rain.categories.scanty + rain.categories.noRain : 0;
  return <div className={styles.strip} role="group" aria-label="Rainfall, soil moisture and reservoir context">
    <article className={styles.card} data-testid="context-rainfall">
      <header><IconCloudRain /><span>Gauge rainfall</span><em>Measured</em></header>
      {rain ? <>
        <strong className={styles.figure} data-tone={(rain.deviationPct ?? 0) <= -20 ? "short" : "ok"}>{signed(rain.deviationPct)}<small>against normal</small></strong>
        <p className={styles.line}>{day(rain.start)} to {day(rain.end)} · {thousands(rain.gauges)} gauges · area-weighted</p>
        <div className={styles.bands} role="img" aria-label={RAIN_BANDS.map(band => `${band.label} ${rain.categories[band.key]}`).join(", ")}>
          {RAIN_BANDS.map(band => rain.categories[band.key] ? <i key={band.key} style={{ flexGrow: rain.categories[band.key], background: band.color }} /> : null)}
        </div>
        <ul className={styles.bandKey} aria-hidden="true">
          {RAIN_BANDS.filter(band => rain.categories[band.key]).map(band => <li key={band.key}><i style={{ background: band.color }} />{band.label} {rain.categories[band.key]}</li>)}
        </ul>
        <p className={styles.line}><b>{short}</b> of {rain.mandals} mandals deficient or scanty</p>
        {satellite ? <p className={styles.note}>Satellite estimate ({satellite.product.split(" monthly")[0]}), {monthSpan(satellite.months)}: {satellite.mm.toFixed(0)} mm against {satellite.normalMm.toFixed(0)} mm ({signed(satellite.anomalyPct)}), the {driest(satellite.rankDriest)} of {satellite.ofYears} years. Gauges are the measurement; the satellite record supplies the history since {satellite.firstYear}.</p> : null}
        <a href={rain.url} target="_blank" rel="noreferrer">AP DES gauges via APWRIMS <IconArrowRight /></a>
      </> : <p className={styles.missing}>Gauge rainfall is not available in this build.</p>}
    </article>
    <article className={styles.card} data-testid="context-soil">
      <header><IconDroplet /><span>Soil moisture{soil ? `, ${soil.depthCm} cm` : ""}</span><em>Modelled</em></header>
      {soil ? <>
        <strong className={styles.figure} data-tone={soil.belowOwnMedian > soil.withBaseline / 2 ? "short" : "ok"}>{soil.belowOwnMedian}<small>of {soil.withBaseline} mandals below their usual {day(soil.asOf, false)} level</small></strong>
        <p className={styles.line}><b>{soil.driestOnRecord}</b> at their driest for the date since {soil.baselineYears?.[0] ?? "the record began"} · median mandal {soil.medianPct}% of capacity</p>
        <p className={styles.note}>NRSC VIC land-surface model, as published on APWRIMS for {day(soil.asOf)}{soil.asOfNote ? ` (${soil.asOfNote})` : ""}. Plant-available water as a share of what the soil holds: modelled, not measured in a field.</p>
        <a href={soil.url} target="_blank" rel="noreferrer">NRSC model via APWRIMS <IconArrowRight /></a>
      </> : <p className={styles.missing}>Soil moisture is not available in this build.</p>}
    </article>
    <article className={styles.card} data-testid="context-reservoirs">
      <header><IconWaves /><span>Reservoir storage</span><em>Measured</em></header>
      {reservoirs ? <>
        <strong className={styles.figure} data-tone={(reservoirs.state.storagePct ?? 0) < (reservoirs.state.lastYearPct ?? 0) - 10 ? "short" : "ok"}>{reservoirs.state.storagePct}%<small>of capacity · {reservoirs.state.lastYearPct}% a year ago</small></strong>
        <ul className={styles.basins} aria-label="Storage by river basin, now and a year ago">
          {reservoirs.byBasin.map(basin => <li key={basin.basin}>
            <span>{placeName(basin.basin)}</span>
            <span className={styles.track} aria-hidden="true"><i style={{ width: `${Math.min(100, basin.storagePct ?? 0)}%` }} /><b style={{ left: `${Math.min(100, basin.lastYearPct ?? 0)}%` }} /></span>
            <em>{basin.storagePct}%<small> / {basin.lastYearPct}%</small></em>
          </li>)}
        </ul>
        <p className={styles.note}>{reservoirs.state.count} major and medium reservoirs, {reservoirs.state.storageTmc.toFixed(0)} of {reservoirs.state.capacityTmc.toFixed(0)} TMC, latest reading {stamp(reservoirs.asOf)}. Bar: now; tick: a year ago.{reservoirs.staleCount ? ` ${reservoirs.staleCount} had not reported for 3 days or more.` : ""}</p>
        {reservoirs.topCanalReleases.length ? <details className={styles.releases}>
          <summary>Largest canal releases now</summary>
          <ol>{reservoirs.topCanalReleases.map(release => <li key={`${release.reservoir}:${release.outlet}`}><span>{placeName(release.reservoir)} <IconArrowRight /> {release.outlet}</span><b>{thousands(release.cusecs)} cusecs</b></li>)}</ol>
          <p>Measured where water leaves the reservoir. Which mandals a canal reaches, and how much arrives, needs the canal command-area map, which is not public.</p>
        </details> : null}
        <a href={reservoirs.url} target="_blank" rel="noreferrer">Water Resources Dept via APWRIMS <IconArrowRight /></a>
      </> : <p className={styles.missing}>Reservoir storage is not available in this build.</p>}
    </article>
  </div>;
}

/** One mandal's season context, for the detail rail and the map card. */
export function mandalContext(row: { soil: AgricultureEvidence["mandals"][number]["soil"]; rain: AgricultureEvidence["mandals"][number]["rain"] }, evidence: AgricultureEvidence) {
  const soil = evidence.water.soil, rain = evidence.water.rain;
  return {
    rain: row.rain ? `${row.rain.actualMm.toFixed(0)} mm, ${signed(row.rain.deviationPct, 0)} vs normal` : rain ? "No unique gauge record" : "Not available",
    soil: row.soil ? `${row.soil.pct.toFixed(0)}%${row.soil.median !== null ? ` · usual ${row.soil.median.toFixed(0)}%` : ""}` : soil ? "No unique model record" : "Not available",
    soilRank: row.soil?.rankDriest && row.soil.ofYears ? `${driest(row.soil.rankDriest)} of ${row.soil.ofYears} years` : null,
    rainLabel: rain ? `Gauge rain, ${day(rain.start, false)} to ${day(rain.end, false)}` : "Gauge rain",
    soilLabel: soil ? `Soil moisture ${soil.depthCm} cm, ${day(soil.asOf, false)}` : "Soil moisture",
  };
}
