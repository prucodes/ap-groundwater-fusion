import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { IconArrowRight } from "../../components/icons";
import { ReportDownloads } from "../../components/ReportDownloads";
import styles from "../../components/governance/Governance.module.css";

export default function ReportsPage() {
  return <div className="pageWrap">
    <HeaderHero title="Briefings & Evidence Packs" subtitle="Dated, traceable material for review meetings. Screen views and downloads are research outputs, not signed advisories or live feeds." showChips={false} variant="compact" />
    <DataProvenanceDates />
    <section className={styles.section}>
      <div className={styles.heading}><div><span className={styles.eyebrow}>Choose the decision</span><h2>From a question to its evidence.</h2></div></div>
      <div className={styles.links}>
        <Link className={styles.link} href="/snapshot"><IconArrowRight /><strong>State review</strong><p>Printable groundwater summary, source periods and a complete mandal register.</p></Link>
        <Link className={styles.link} href="/agriculture#agriculture-brief"><IconArrowRight /><strong>Agriculture review</strong><p>District evidence, unresolved coverage and proposed verification steps. Crop and supply feeds remain pending.</p></Link>
        <Link className={styles.link} href="/monsoon"><IconArrowRight /><strong>Seasonal review</strong><p>Satellite and gauge rainfall, reservoir storage, observed groundwater change and ENSO context. Seasonal flags remain provisional.</p></Link>
      </div>
    </section>
    <section className={styles.section} aria-labelledby="downloads-title">
      <div className={styles.heading}><div><span className={styles.eyebrow}>Snapshot exports</span><h2 id="downloads-title">Take the audit trail with the numbers.</h2><p>Generated from the loaded dataset. An export does not refresh the underlying sources.</p></div></div>
      <ReportDownloads />
    </section>
    <details className="rawTable"><summary>Earlier pipeline reports / archive, not current evidence</summary>
      <p className={styles.note}>These early-phase reports retain their original scope and may contain seed inputs or superseded methods. Use the evidence pack above for the current data contract and evaluation.</p>
      <ul>{["phase1c_nasa_sampling_summary", "phase1c_fusion_summary", "phase1d_public_measured_data_summary", "phase1d_public_vs_satellite_fusion_summary"].map(name => <li key={name}><a className="linkAction" href={`https://github.com/prucodes/ap-groundwater-fusion/blob/main/reports/${name}.md`} target="_blank" rel="noreferrer">{name.replaceAll("_", " ")}</a></li>)}</ul>
    </details>
  </div>;
}
