"use client";

import { useMemo, useState } from "react";
import { CATEGORY_META, CATEGORY_ORDER, IMPACT_META, place, signed, signedPct, type DroughtDistrict } from "../../lib/drought";
import styles from "./Drought.module.css";

type SortKey = "severity" | "trigger" | "rain" | "vci" | "pasm" | "gwdi";

const worse = (d: DroughtDistrict) => d.counts.severe * 3 + d.counts["moderate|severe"] * 2 + d.counts.moderate;

function tone(value: number | null, severe: number, moderate: number, lowerIsWorse = true) {
  if (value === null) return { background: "var(--field)", color: "var(--muted)" };
  const bad = lowerIsWorse ? value < severe : value > severe;
  const warn = lowerIsWorse ? value < moderate : value > moderate;
  return bad ? { background: "rgba(178,58,46,.14)", color: "#b23a2e" } : warn ? { background: "rgba(227,154,59,.16)", color: "#9a5b0c" } : { background: "rgba(94,155,107,.14)", color: "#2f6a3d" };
}

/** Every district through the manual: how many mandals reach each outcome, and the median of each indicator. */
export function DistrictMatrix({ districts }: { districts: DroughtDistrict[] }) {
  const [sort, setSort] = useState<SortKey>("severity");
  const rows = useMemo(() => {
    const out = [...districts];
    const by: Record<SortKey, (d: DroughtDistrict) => number> = {
      severity: d => -(worse(d) / Math.max(1, d.assessed)),
      trigger: d => -(d.trigger1 / Math.max(1, d.assessed)),
      rain: d => d.medianRainDev ?? 999,
      vci: d => d.medianVci ?? 999,
      pasm: d => d.medianPasm ?? 999,
      gwdi: d => d.medianGwdi ?? 999,
    };
    return out.sort((a, b) => by[sort](a) - by[sort](b) || a.district.localeCompare(b.district));
  }, [districts, sort]);
  const head = (key: SortKey, label: string) => (
    <th aria-sort={sort === key ? "ascending" : undefined}><button type="button" onClick={() => setSort(key)}>{label}{sort === key ? " ▾" : ""}</button></th>
  );
  return (
    <div className={styles.tableWrap}>
      <table className={styles.matrix} data-testid="drought-district-matrix">
        <thead>
          <tr>
            <th>District</th>
            {head("trigger", "Trigger 1")}
            {head("severity", "Outcome by mandal")}
            {head("rain", "Rain vs normal")}
            {head("vci", "VCI")}
            {head("pasm", "PASM")}
            {head("gwdi", "GWDI")}
            <th>Area sown</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.district}>
              <td className={styles.district}>{place(d.district)}<small>{d.mandals} mandals · {d.assessed} assessed</small></td>
              <td className={styles.num}>{d.trigger1}<small style={{ color: "var(--muted)", fontWeight: 400 }}> / {d.assessed}</small></td>
              <td>
                <div className={styles.stack} role="img" aria-label={CATEGORY_ORDER.filter(key => d.counts[key]).map(key => `${CATEGORY_META[key].label} ${d.counts[key]}`).join(", ")}>
                  {CATEGORY_ORDER.map(key => d.counts[key] ? <i key={key} style={{ width: `${(100 * d.counts[key]) / Math.max(1, d.mandals)}%`, background: CATEGORY_META[key].color }} /> : null)}
                </div>
                <small style={{ fontSize: 10.5, color: "var(--muted)" }}>
                  {d.counts.severe ? `${d.counts.severe} severe · ` : ""}{d.counts["moderate|severe"] ? `${d.counts["moderate|severe"]} mod–sev · ` : ""}{d.counts.moderate} moderate
                </small>
              </td>
              <td><span className={styles.cellTag} style={tone(d.medianRainDev, -60, -20)}>{signedPct(d.medianRainDev)}</span></td>
              <td><span className={styles.cellTag} style={tone(d.medianVci, 40, 60)}>{d.medianVci === null ? "—" : d.medianVci.toFixed(0)}</span></td>
              <td><span className={styles.cellTag} style={tone(d.medianPasm, 51, 76)}>{d.medianPasm === null ? "—" : `${d.medianPasm.toFixed(0)}%`}</span></td>
              <td><span className={styles.cellTag} style={tone(d.medianGwdi, -0.45, -0.30)}>{signed(d.medianGwdi)}</span></td>
              <td>{d.sown ? <span className={styles.cellTag} style={{ background: `${IMPACT_META[d.sown.cls].color}22`, color: IMPACT_META[d.sown.cls].color }}>{d.sown.pctOfNormal}% · reported</span> : <span style={{ color: "var(--muted)", fontSize: 11 }}>not shared</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
