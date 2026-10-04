import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { ThemeToggle } from "../../components/ThemeToggle";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { datasetManifest } from "../../lib/data";
import styles from "../../components/governance/Governance.module.css";
import { brief } from "../../lib/pageBriefs";

export default function SettingsPage() {
  return <div className="pageWrap">
    <HeaderHero title="Workspace & Data Policy" brief={brief("/settings")} showChips={false} variant="compact" />
    <section className={styles.section}><div className={styles.heading}><div><span className={styles.eyebrow}>This browser</span><h2>Appearance</h2><p>Display preference is stored locally. Source data and assessments are unchanged.</p></div><ThemeToggle /></div></section>
    <section className={styles.section}><div className={styles.heading}><div><span className={styles.eyebrow}>Published dataset</span><h2>Snapshot, not streaming telemetry.</h2><p>Build {datasetManifest.generatedAt.slice(0, 10)} / contract {datasetManifest.dataContractVersion}. Source refreshes are published by the pipeline, not by reloading a page.</p></div></div><DataProvenanceDates /></section>
    <div className={styles.gates}>
      <section className={styles.gate}><h3>Read-only evidence</h3><p>This workspace does not change source observations, book crop acreage, issue restrictions or send orders to field teams.</p></section>
      <section className={styles.gate}><h3>No operational dispatch</h3><p>AWARE JSON is a draft payload. Source credentials, refresh schedules and government destinations are not configurable from this page.</p></section>
      <section className={styles.gate}><h3>Traceable exports</h3><p>Exports retain research caveats. The model pack includes input hashes, coverage counts and source periods.</p></section>
    </div>
    <div className={styles.toolbar}><Link href="/readiness" className="linkAction">Source and release gates</Link><Link href="/reports" className="linkAction">Evidence downloads</Link></div>
  </div>;
}
