import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { datasetManifest, monsoonWatch } from "../lib/data";
import { waterSummary } from "../lib/waterSummary";
import { day, signed } from "./agriculture/waterContextFormat";
import styles from "./WatchEvidenceStatus.module.css";

function month(value: string) {
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function WatchEvidenceStatus() {
  const w = monsoonWatch;
  const rain = waterSummary.rain, soil = waterSummary.soil, store = waterSummary.reservoirs;
  let check: { date: string; matched: number; total: number; baselineDifferences: number; flagDifferences: number } | null = null;
  try {
    const receipt = JSON.parse(readFileSync(path.resolve(process.cwd(), "../reports/watch-source-audit.json"), "utf8"));
    const hash = createHash("sha256").update(readFileSync(path.resolve(process.cwd(), "data/monsoon_watch.json"))).digest("hex");
    if (receipt.snapshotHash === hash && receipt.onlineCheckedAt) {
      const probes = receipt.online?.groundwater?.probes ?? [];
      check = { date: receipt.onlineCheckedAt.slice(0, 10), matched: probes.filter((p: { snapshotMatches?: boolean }) => p.snapshotMatches).length, total: probes.length, baselineDifferences: receipt.unfilteredHistoryComparison.mismatches.length, flagDifferences: receipt.unfilteredHistoryComparison.mismatches.filter((r: { statusMatches: boolean }) => !r.statusMatches).length };
    }
  } catch { /* An absent or outdated receipt is not a successful verification. */ }
  return <section className={styles.evidence} aria-label="Evidence status and release gates">
    <details>
      <summary>
        <span className={styles.tag}>RESEARCH SNAPSHOT</span>
        <strong>Real source inputs. Not live telemetry.</strong>
        <span className={styles.pendingTag}><strong>Baseline review pending.</strong> Seasonal flags are provisional.</span>
        <span className={styles.through}>Groundwater through {month(w.season.latestMonth)}</span>
        <span className={styles.open}>Sources, checks and release gates</span>
      </summary>
      <p className={styles.pending}>Seasonal flags are provisional, not operational advisories.{check ? ` ${check.flagDifferences} source-series flags change with an unfiltered history baseline.` : ""}</p>
      <div className={styles.sources}>
        <div><span>GROUNDWATER</span><strong>APWRIMS monthly series</strong><p>{month(w.season.latestMonth)} observations. Retained research history; source-use authorization pending.</p><a href="https://apwrims.ap.gov.in/mis/groundwater/levels" target="_blank" rel="noreferrer">APWRIMS source</a></div>
        <div><span>RAINFALL</span><strong>{w.rainfall ? w.rainfall.product.split(" monthly")[0] : "CHIRPS"} estimates and AP gauges</strong><p>{w.rainfall ? `${w.rainfall.months} / ${w.season.year}` : "Period unavailable"} monthly satellite-and-gauge product, equal-weight mandal means, for the history since {w.rainfall?.firstYear ?? 1981}.{rain ? ` AP DES mandal gauges to ${day(rain.end)}: ${signed(rain.deviationPct)} against the department's normal, area-weighted.` : " Not an official state rainfall total."}</p><a href={w.rainfall?.source ?? "https://data.chc.ucsb.edu/products/CHIRPS/v3.0/"} target="_blank" rel="noreferrer">Publisher catalogue</a></div>
        <div><span>PACIFIC CONTEXT</span><strong>NOAA ONI</strong><p>{w.enso?.season} {w.enso?.asOf.slice(0, 4)}: {w.enso?.oniC.toFixed(2)} °C. Three-month index, not a mandal forecast. Film and ocean maps have separate snapshot dates.</p><a href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml" target="_blank" rel="noreferrer">Current NOAA advisory</a></div>
        <div><span>SOIL, STORAGE &amp; CROPS</span><strong>{soil || store ? "Partly connected" : "Not connected"}</strong><p>{soil ? `Modelled soil moisture (NRSC, via APWRIMS) for ${day(soil.asOf)}. ` : ""}{store ? `Reservoir storage ${store.storagePct}% of capacity at ${day(store.asOf)}, measured at the headworks. ` : ""}Not connected: crop, sown area, stage and canal delivery to fields. The crop-water lab uses reference coefficients and user-set assumptions.</p><a href="https://ap.nic.in/en/publication/presentation-of-state-centre/" target="_blank" rel="noreferrer">NIC e-Panta context</a></div>
      </div>
      <p className={styles.receipt}>Snapshot built {w.generatedAt.slice(0, 10)}. Groundwater fetch receipt: {datasetManifest.refreshStatus?.apwrims?.fetchDate ?? "not recorded in the published manifest"}.
        {check ? ` Public portal check ${check.date}: ${check.matched}/${check.total} sampled series matched. This does not verify every mandal.` : " No current source-verification receipt available for this snapshot."}</p>
      <div className={styles.gates}>
        <div><strong>Useful now</strong><p>Briefings, historical comparison and selecting records for field verification. Groundwater flags are not crop-loss or drought declarations.</p></div>
        <div><strong>Baseline review required</strong><p>Seasonal comparisons inherit model-history eligibility filters. {check ? `${check.baselineDifferences} source-series comparisons change when unfiltered valid history is used. ` : "Some usable observations are omitted. "}Departmental baseline approval and a versioned data/film refresh are required.</p></div>
        <div><strong>Operational release pending</strong><p>Authorised feeds, official location IDs, validated thresholds, crop/supply joins, a named approving officer and an auditable action log. No allocation or farmer advisory is issued here.</p></div>
      </div>
    </details>
  </section>;
}
