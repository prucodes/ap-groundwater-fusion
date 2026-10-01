import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { datasetManifest, monsoonWatch } from "../lib/data";
import styles from "./WatchEvidenceStatus.module.css";

function month(value: string) {
  return new Date(`${value}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function WatchEvidenceStatus() {
  const w = monsoonWatch;
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
    <div className={styles.summary}><span className={styles.tag}>RESEARCH SNAPSHOT</span><strong>Real source inputs. Not live telemetry.</strong><span>Groundwater through {month(w.season.latestMonth)}</span></div>
    <p className={styles.pending}><strong>Baseline review pending.</strong> Seasonal flags are provisional, not operational advisories.{check ? ` ${check.flagDifferences} source-series flags change with an unfiltered history baseline.` : ""}</p>
    <details>
      <summary>Source dates, verification and governance readiness</summary>
      <div className={styles.sources}>
        <div><span>GROUNDWATER</span><strong>APWRIMS monthly series</strong><p>{month(w.season.latestMonth)} observations. Retained research history; source-use authorization pending.</p><a href="https://apwrims.ap.gov.in/mis/groundwater/levels" target="_blank" rel="noreferrer">APWRIMS source</a></div>
        <div><span>RAINFALL</span><strong>CHIRPS v2 estimates</strong><p>{w.rainfall ? `${w.rainfall.months} / ${w.season.year}` : "Period unavailable"} monthly satellite-and-gauge product. Equal-weight mandal means, not field gauges or an official state rainfall total.</p><a href="https://data.chc.ucsb.edu/products/CHIRPS-2.0/global_monthly/tifs/" target="_blank" rel="noreferrer">Publisher catalogue</a></div>
        <div><span>PACIFIC CONTEXT</span><strong>NOAA ONI</strong><p>{w.enso?.season} {w.enso?.asOf.slice(0, 4)}: {w.enso?.oniC.toFixed(2)} °C. Three-month index, not a mandal forecast. Film and ocean maps have separate snapshot dates.</p><a href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml" target="_blank" rel="noreferrer">Current NOAA advisory</a></div>
        <div><span>CROP &amp; SUPPLY</span><strong>Not connected</strong><p>Crop, area, stage, canal deliveries and usable storage are missing. The crop-water lab uses reference coefficients and user-set assumptions.</p><a href="https://ap.nic.in/en/publication/presentation-of-state-centre/" target="_blank" rel="noreferrer">NIC e-Panta context</a></div>
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
