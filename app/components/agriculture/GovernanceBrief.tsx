"use client";

import { useState } from "react";
import { type AgricultureDistrict, type AgricultureEvidence, WATER_SIGNALS } from "../../lib/agriculture";
import { IconArrowRight, IconDownload, IconShield } from "../icons";
import styles from "./GovernanceBrief.module.css";

const name = (value: string) => /[a-z]/.test(value) ? value : value.split(" ").map(word => word === "NTR" || word.includes(".") ? word : word[0] + word.slice(1).toLowerCase()).join(" ");
const share = (part: number, total: number) => total ? `${Math.round(part / total * 100)}%` : "Unavailable";

export function GovernanceBrief({ evidence, onInspect }: { evidence: AgricultureEvidence; onInspect: (district: string, signal: "flagged" | "unavailable") => void }) {
  const [mode, setMode] = useState<"flagged" | "unavailable">("flagged");
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = [...evidence.districts].sort((a, b) => mode === "flagged"
    ? b.flagged - a.flagged || a.name.localeCompare(b.name)
    : (b.total - b.compared) - (a.total - a.compared) || a.name.localeCompare(b.name));
  const district = sorted.find(row => row.name === selected) ?? sorted[0];
  if (!district) return null;
  const visible = sorted.slice(0, 6);
  const top = sorted.slice(0, 3);
  const concentration = top.reduce((sum, row) => sum + (mode === "flagged" ? row.flagged : row.total - row.compared), 0);
  const total = mode === "flagged" ? evidence.counts.flagged : evidence.counts.unresolved;
  const missing = district.total - district.compared;
  const leads = evidence.mandals.filter(row => row.district === district.name && (mode === "flagged" ? row.signal === "short" || row.signal === "severe" : row.signal === "unavailable"))
    .sort((a, b) => (b.shortfallM ?? 0) - (a.shortfallM ?? 0) || a.mandal.localeCompare(b.mandal));

  function downloadBrief(row: AgricultureDistrict) {
    const text = [
      `AP AGRICULTURE / DRAFT EVIDENCE REVIEW / ${name(row.name)}`,
      `Observation window: ${evidence.startPeriod} to ${evidence.period}. Snapshot built: ${evidence.generatedAt}.`,
      "Research prototype. Not live telemetry. Not an issued advisory or assigned action.",
      "",
      `Coverage: ${row.compared}/${row.total} prototype boundary units compared; ${row.total - row.compared} unresolved.`,
      `Provisional seasonal flags: ${row.flagged}/${row.compared} compared units; ${row.severe} larger shortfalls.`,
      "Groundwater flags are not planted area, crop loss, drought declarations or water available for allocation.",
      "",
      "PROPOSED VERIFICATION",
      "Groundwater team: validate the seasonal baseline and current well readings.",
      "Agriculture team: confirm crop, sowing date, stage, area and irrigation source using approved records.",
      "Water Resources team: verify usable supply and delivery windows for the relevant command area.",
      "Owner: not assigned. Deadline: not set. Departmental approval: pending.",
      "",
      `RECORDS FOR ${mode === "flagged" ? "FLAG REVIEW" : "SOURCE RECONCILIATION"}`,
      ...leads.map(item => `${name(item.mandal)} | ${WATER_SIGNALS[item.signal].label} | depth ${item.depthM === null ? "unavailable" : `${item.depthM.toFixed(2)} m bgl`} | shortfall ${item.shortfallM === null ? "unavailable" : `${item.shortfallM.toFixed(2)} m`} | ${item.reason ?? item.sourceStatus}`),
      "",
      "RELEASE GATES",
      "Seasonal baseline review pending: source-history eligibility filters omit valid observations.",
      "Official geography, source-use authorisation and crop/supply joins pending. No crop-loss ranking.",
      "Scenario crop-water inputs and AI illustrations are excluded from this evidence brief.",
      "Primary groundwater source: https://apwrims.ap.gov.in/mis/groundwater/levels",
      "Crop-booking context: https://ap.nic.in/en/publication/presentation-of-state-centre/",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `ap-draft-review-${row.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${evidence.period}.txt`;
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  return <section id="agriculture-brief" className={styles.brief} aria-labelledby="agriculture-brief-title">
    <header className={styles.heading}><div><span className={styles.eyebrow}>01 / District review brief</span><h2 id="agriculture-brief-title">Where should the next field review begin?</h2></div><span className={styles.release}><IconShield />Provisional evidence · approval pending</span></header>
    <div className={styles.insight}><strong>{concentration}<small> / {total}</small></strong><p>{mode === "flagged" ? "flagged boundary units" : "unresolved boundary units"} are in <b>{top.map(d => name(d.name)).join(", ")}</b>.<span>{mode === "flagged" ? "A concentration of groundwater flags, not a ranking of crop damage." : "Missing evidence is a verification gap, never a low-risk finding."}</span></p></div>
    <div className={styles.layout}>
      <div className={styles.comparison}>
        <div className={styles.toolbar}><div role="group" aria-label="District review lens"><button type="button" aria-pressed={mode === "flagged"} onClick={() => { setMode("flagged"); setSelected(null); }}>Shortfall flags</button><button type="button" aria-pressed={mode === "unavailable"} onClick={() => { setMode("unavailable"); setSelected(null); }}>Coverage gaps</button></div><span>Top 6 by count</span></div>
        <div className={styles.legend}><span><i style={{ background: WATER_SIGNALS.severe.color }} />Larger shortfall</span><span><i style={{ background: WATER_SIGNALS.short.color }} />Flagged</span><span><i style={{ background: WATER_SIGNALS.normal.color }} />Not flagged</span><span><i className={styles.missing} />Unresolved</span></div>
        <div className={styles.axis}><span>Share of prototype boundaries</span><span>100%</span></div>
        <div className={styles.rows}>
          {visible.map((row, index) => <button type="button" key={row.name} aria-label={`Review ${name(row.name)}`} aria-pressed={row.name === district.name} className={styles.row} onClick={() => setSelected(row.name)}>
            <span className={styles.rank}>{String(index + 1).padStart(2, "0")}</span><span className={styles.rowMain}><span className={styles.rowLabel}><strong>{name(row.name)}</strong><small>{mode === "flagged" ? `${row.flagged} / ${row.compared} compared` : `${row.total - row.compared} / ${row.total} unresolved`}</small></span><span className={styles.track} aria-hidden="true"><i style={{ width: `${row.severe / row.total * 100}%`, background: WATER_SIGNALS.severe.color }} /><i style={{ width: `${(row.flagged - row.severe) / row.total * 100}%`, background: WATER_SIGNALS.short.color }} /><i style={{ width: `${(row.compared - row.flagged) / row.total * 100}%`, background: WATER_SIGNALS.normal.color }} /><i className={styles.missing} style={{ width: `${(row.total - row.compared) / row.total * 100}%` }} /></span></span><IconArrowRight />
          </button>)}
        </div>
        <p className={styles.chartNote}>Counts use unique, reconciled prototype boundaries. Bar width is not land area. Unresolved units remain outside the compared denominator.</p>
      </div>
      <div className={styles.dossier} aria-label="District review evidence" aria-live="polite">
        <div className={styles.dossierHead}><span className={styles.eyebrow}>District / {evidence.period}</span><select aria-label="Brief district" value={district.name} onChange={event => setSelected(event.target.value)}>{evidence.districts.slice().sort((a, b) => a.name.localeCompare(b.name)).map(row => <option value={row.name} key={row.name}>{name(row.name)}</option>)}</select><h3>{name(district.name)}</h3></div>
        <div className={styles.figures}><div><strong>{share(district.flagged, district.compared)}</strong><span>flagged / compared</span><small>{district.flagged} of {district.compared} units</small></div><div><strong>{share(district.compared, district.total)}</strong><span>evidence coverage</span><small>{missing} unresolved of {district.total}</small></div></div>
        <div className={styles.records}><span>{mode === "flagged" ? "Examples for flag review" : "Examples for source reconciliation"}</span><p>{leads.length ? leads.slice(0, 3).map(row => name(row.mandal)).join(" · ") : "No records in this category."}</p></div>
        <ol className={styles.actions}><li><span>01</span><div><strong>Validate the water signal</strong><p>Groundwater team · baseline and current well readings.</p></div></li><li><span>02</span><div><strong>Establish crop exposure</strong><p>Agriculture team · crop, stage, sown area and irrigation source.</p></div></li><li><span>03</span><div><strong>Check available supply</strong><p>Water Resources team · delivery windows and usable storage.</p></div></li></ol>
        <p className={styles.gate}>Proposed checks only. No owner assigned or action issued. Crop exposure and allocable water remain unknown.</p>
        <div className={styles.commands}><button type="button" disabled={!leads.length} onClick={() => onInspect(district.name, mode)}>Review {leads.length} records <IconArrowRight /></button><button type="button" aria-label="Download draft district brief" title="Download draft district brief" onClick={() => downloadBrief(district)}><IconDownload /></button></div>
      </div>
    </div>
  </section>;
}
