"use client";

import { useState } from "react";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { DataProvenanceDates } from "../../components/DataProvenanceDates";
import { ExportCsvButton } from "../../components/ExportButtons";
import { IconChevronLeft, IconChevronRight } from "../../components/icons";
import { computeAlerts, MAX_ALERT_SCORE, severityCounts, type Severity } from "../../lib/alerts";
import { districts, formatNumber, formatPeriod, groundwaterRecords, titleCase } from "../../lib/data";
import styles from "../../components/governance/Governance.module.css";

type Filter = Severity | "unscored" | "all";
const alerts = computeAlerts();
const counts = severityCounts(alerts);
const modelTargets = new Map(groundwaterRecords.map(r => [r.identity.mandalId, r.nowcast?.targetPeriod]));
const groups: { key: Filter; title: string; detail: string; count: number }[] = [
  { key: "Critical", title: "Priority 1", detail: "Score 6-7 / field review", count: counts.Critical },
  { key: "High", title: "Priority 2", detail: "Score 4-5 / history review", count: counts.High },
  { key: "Watch", title: "Watch", detail: "Score 1-3 / monitoring", count: counts.Watch },
  { key: "Normal", title: "No score trigger", detail: "Not a safety certification", count: counts.Normal },
  { key: "unscored", title: "Not assessed", detail: "Missing usable depth", count: alerts.filter(a => a.state !== "scored").length },
];
const PAGE_SIZE = 12;

export default function AlertsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [district, setDistrict] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = alerts.filter(a => (district === "all" || a.mandal.district_name === district)
    && `${a.mandal.mandal_name} ${a.mandal.district_name}`.toLowerCase().includes(query.toLowerCase().trim())
    && (filter === "all" || (filter === "unscored" ? a.state !== "scored" : a.state === "scored" && a.severity === filter)));
  const start = page * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  return <div className="pageWrap">
    <HeaderHero title="Groundwater Review Queue" subtitle="A transparent order for evidence review, not an official early warning. Depth and measured trend determine the score; missing data is kept outside the ranking." showChips={false} variant="compact" />
    <DataProvenanceDates />
    <section className={styles.section} aria-label="Review priorities">
      <div className={styles.heading}><div><span className={styles.eyebrow}>Triage / not a drought declaration</span><h2>Where should verification start?</h2><p>Prototype thresholds. Review the period, model uncertainty and source history before field action.</p></div><Link href="/readiness" className="linkAction">Release gates</Link></div>
      <div className={styles.tabs}>{groups.map(group => <button className={styles.tab} key={group.key} aria-pressed={filter === group.key} onClick={() => { setFilter(filter === group.key ? "all" : group.key); setPage(0); }}><strong>{group.count}</strong><span>{group.title}</span><small>{group.detail}</small></button>)}</div>
      <div className={styles.toolbar}>
        <label>Search mandal<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Mandal or district" /></label>
        <label>District<select value={district} onChange={e => { setDistrict(e.target.value); setPage(0); }}><option value="all">All districts</option>{districts.map(d => <option key={d} value={d}>{titleCase(d)}</option>)}</select></label>
        <button className="resetBtn" onClick={() => { setFilter("all"); setDistrict("all"); setQuery(""); setPage(0); }}>Reset filters</button>
        <ExportCsvButton rows={filtered.map(a => a.mandal)} filename="ap_review_evidence.csv" />
      </div>
      <div className={styles.queue} aria-label="Review results">{rows.map(a => <article key={a.mandal.id} className={styles.queueRow}>
        <div className={styles.queueRank}>{a.state === "scored" ? a.score : "--"}<small>{a.state === "scored" ? `of ${MAX_ALERT_SCORE}` : "unscored"}</small></div>
        <div><h3><Link href={`/mandals/${a.mandal.id}`}>{titleCase(a.mandal.mandal_name)}</Link></h3><p>{titleCase(a.mandal.district_name)} / {a.leadAction}</p>
          <div className={styles.factors}>{a.factors.map(f => <span key={f.label}>{f.label} <b>+{f.weight}</b></span>)}</div>
          {a.diagnostics.length > 0 && <p>{a.diagnostics.join(" ")}</p>}
        </div>
        <div className={styles.queueValue}><strong>{formatNumber(a.mandal.estimate_mbgl ?? a.mandal.display_mbgl)} m</strong><small>{a.state !== "scored" ? "No usable depth" : a.mandal.estimate_mbgl != null ? "Modelled scoring basis" : "Measured scoring basis"}</small>{a.mandal.estimate_mbgl != null && <small>Model target {formatPeriod(modelTargets.get(a.mandal.id)) || "not supplied"}</small>}<small>Observation {formatPeriod(a.mandal.latest_observation_period) || "not supplied"}</small></div>
      </article>)}</div>
      {!rows.length && <p className={styles.note}>No records match these filters.</p>}
      <div className={styles.paging}><span aria-live="polite">{filtered.length ? `${start + 1}-${Math.min(start + PAGE_SIZE, filtered.length)}` : "0"} of {filtered.length} records</span><div><button aria-label="Previous review page" title="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><IconChevronLeft /></button><button aria-label="Next review page" title="Next page" disabled={start + PAGE_SIZE >= filtered.length} onClick={() => setPage(page + 1)}><IconChevronRight /></button></div></div>
    </section>
    <details className="rawTable"><summary>Scoring rules and limits</summary><p className={styles.note}>Depth: at least 15 m adds 3; 10 to under 15 m adds 1. Measured YoY deepening: over 1.2 m adds 3; over 0.3 to 1.2 m adds 1. Decline despite positive climate balance adds 1 context-review point. Maximum 7. Limited completeness does not increase severity. Missing depth is not scored. Neither a high nor a zero score establishes drought, water availability or a pumping instruction.</p></details>
  </div>;
}
