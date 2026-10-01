import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { IconClock } from "../../components/icons";
import { datasetManifest, formatPeriod } from "../../lib/data";
import styles from "../../components/governance/Governance.module.css";

const gates = [
  ["01 / Authority", "Authorized source access", "Written source-use approval, a verified ingestion contract and retained refresh receipts. Public portal access alone does not confer operational authority."],
  ["02 / Identity", "Official administrative crosswalk", "Official boundary polygons, district and mandal identifiers, and resolution of ambiguous or unmatched source series."],
  ["03 / Validation", "Approved methods & field checks", "Independent field corroboration, cohort-specific error limits and approval of the seasonal baseline. Model performance is not a certification."],
  ["04 / Agriculture", "Crop and supply evidence", "Authorized e-Panta aggregates, crop stage, irrigated area, reservoir releases and command-area delivery records. No crop-loss or allocation claims yet."],
  ["05 / Operations", "Accountable review workflow", "Named departmental reviewers, action records, escalation rules, security review and service monitoring before dispatch."],
  ["06 / Release", "AWARE acceptance", "Agreed schema, access controls, test environment, error handling and approval. Current payloads are unreleased drafts."],
];

export default function ReadinessPage() {
  const { counts: c, periods: p, refreshStatus: r } = datasetManifest;
  const sources = [
    { name: "APWRIMS-format history", type: "Recorded depth / m bgl", period: formatPeriod(p.latestObservationPeriod), fetch: r?.apwrims.fetchDate, link: "https://apwrims.ap.gov.in/mis/groundwater/levels", detail: `${c.historySeriesCount} history series in the published dataset. ${r?.apwrims.status === "retained_local_input" ? "Retained local input; a full-source fetch receipt is not supplied." : "See the refresh receipt for scope."} Authorization pending.` },
    { name: "NASA / NDMC GRACE-DA", type: "Satellite-model / percentile", period: formatPeriod(p.graceValidPeriod) || "Valid period not supplied", fetch: p.graceFetchDate, link: "https://nasagrace.unl.edu/", detail: "Regional assimilated-model context, not measured depth. A recent download does not establish the raster's observation period." },
    { name: "CHIRPS rainfall", type: "Satellite-gauge / mm", period: formatPeriod(p.rainfallValidPeriod), fetch: r?.rainfall.fetchDate, link: "https://www.chc.ucsb.edu/data/chirps", detail: `${c.rainfallContextCoverage} prototype polygons have climate context. Rainfall is not measured recharge or a well reading.` },
    { name: "TerraClimate", type: "Modelled climate / mm", period: formatPeriod(p.etValidPeriod), fetch: r?.evapotranspiration.fetchDate, link: "https://www.climatologylab.org/terraclimate.html", detail: "Annual reference context, not current telemetry. Rain minus actual ET excludes pumping and does not establish aquifer recharge." },
  ];
  return <div className="pageWrap">
    <HeaderHero title="Evidence & Release Readiness" subtitle="A dated research dataset, not a live government service. Available evidence and operational approval are separate questions." showChips={false} variant="compact" />
    <section className={styles.section} aria-labelledby="coverage-title">
      <div className={styles.heading}><div><span className={styles.eyebrow}>Published evidence / {datasetManifest.generatedAt.slice(0, 10)}</span><h2 id="coverage-title">Coverage without false certainty.</h2><p>Counts refer to this prototype geography, not a certified census of AP administrative units.</p></div><Link className="linkAction" href="/reports">Export evidence pack</Link></div>
      <div className={styles.metrics}>
        <div className={styles.metric}><strong>{c.modelledRecordCount}</strong><span>Modelled units</span><small>Nowcast, not a field reading</small></div>
        <div className={styles.metric}><strong>{c.measuredOnlyCount}</strong><span>Measured-only units</span><small>No released nowcast</small></div>
        <div className={styles.metric}><strong>{c.boundaryOnlyCount + c.noDataCount}</strong><span>Groundwater gaps</span><small>Not classified as healthy</small></div>
        <div className={styles.metric}><strong>{c.boundaryFeatureCount}</strong><span>Prototype boundaries</span><small>Official crosswalk pending</small></div>
      </div>
      <div className={styles.coverage} aria-label={`${c.modelledRecordCount} modelled, ${c.measuredOnlyCount} measured only, ${c.boundaryOnlyCount + c.noDataCount} gaps`}>
        <span style={{ flex: c.modelledRecordCount, background: "var(--teal)" }} /><span style={{ flex: c.measuredOnlyCount, background: "var(--amber)" }} /><span style={{ flex: c.boundaryOnlyCount + c.noDataCount, background: "var(--muted-2)" }} />
      </div>
      <div className={styles.legend}><span><i style={{ background: "var(--teal)" }} />Modelled</span><span><i style={{ background: "var(--amber)" }} />Measured only</span><span><i style={{ background: "var(--muted-2)" }} />Groundwater gap</span></div>
      <p className={styles.note}>Model targets span {formatPeriod(p.modelTargetPeriodRange.start)} to {formatPeriod(p.modelTargetPeriodRange.end)}; {p.modelTargetPeriodRange.latestTargetCount} target the latest month. No future forecast horizon is released.</p>
    </section>
    <WatchEvidenceStatus />
    <section className={styles.section} aria-labelledby="ledger-title">
      <div className={styles.heading}><div><span className={styles.eyebrow}>Source ledger</span><h2 id="ledger-title">Four sources. Different clocks.</h2><p>Valid period describes the data; fetch date describes the download. Neither is a live-feed guarantee.</p></div></div>
      <div className={styles.ledger}>{sources.map(source => <article className={styles.source} key={source.name}>
        <div><strong><a href={source.link} target="_blank" rel="noreferrer">{source.name}</a></strong><small>{source.type}</small></div>
        <div><small>Valid / reference period</small><strong>{source.period}</strong></div>
        <div><small>Recorded fetch</small><strong>{source.fetch || "Not supplied"}</strong></div>
        <p>{source.detail}</p>
      </article>)}</div>
    </section>
    <section className={styles.section} aria-labelledby="gates-title">
      <div className={styles.heading}><div><span className={styles.eyebrow}>Operational release gates</span><h2 id="gates-title">What must happen before official use.</h2><p>No completion percentage: each gate needs its own evidence and acceptance.</p></div></div>
      <div className={styles.gates}>{gates.map(([step, title, detail]) => <article key={title} className={styles.gate}><span className={styles.eyebrow}>{step}</span><h3>{title}</h3><span className={styles.pending}><IconClock /> Pending acceptance</span><p>{detail}</p></article>)}</div>
    </section>
  </div>;
}
