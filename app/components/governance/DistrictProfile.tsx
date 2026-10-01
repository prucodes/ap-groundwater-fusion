"use client";

import Link from "next/link";
import { formatNumber, titleCase, type DistrictRollup } from "../../lib/data";
import styles from "./Governance.module.css";

export function DistrictProfile({ rows, selected, onSelect }: {
  rows: DistrictRollup[]; selected: string; onSelect: (district: string) => void;
}) {
  const points = rows.filter(row => row.avg_estimate_mbgl !== null && row.avg_trend_m_per_yr !== null);
  const maxDepth = Math.max(10, Math.ceil(Math.max(...points.map(row => row.avg_estimate_mbgl!), 0) / 5) * 5);
  const minTrend = Math.min(0, Math.floor(Math.min(...points.map(row => row.avg_trend_m_per_yr!), 0)));
  const maxTrend = Math.max(1, Math.ceil(Math.max(...points.map(row => row.avg_trend_m_per_yr!), 0)));
  const x = (depth: number) => 62 + depth / maxDepth * 470;
  const y = (trend: number) => 286 - (trend - minTrend) / (maxTrend - minTrend) * 235;
  const current = rows.find(row => row.district_name === selected);
  return <div>
    <svg className={styles.chart} viewBox="0 0 575 344" aria-label="District profile: modelled depth versus measured year-on-year change">
      <text x="62" y="22">MEASURED YoY CHANGE / m</text>
      {[0, 1, 2, 3, 4].map(i => {
        const depth = maxDepth * i / 4;
        const trend = minTrend + (maxTrend - minTrend) * i / 4;
        return <g key={i}>
          <line x1={x(depth)} x2={x(depth)} y1="42" y2="286" stroke="var(--line)" />
          <line x1="62" x2="532" y1={y(trend)} y2={y(trend)} stroke="var(--line)" />
          <text x={x(depth)} y="306" textAnchor="middle">{depth.toFixed(1)}</text>
          <text x="50" y={y(trend) + 4} textAnchor="end">{trend > 0 ? "+" : ""}{trend.toFixed(1)}</text>
        </g>;
      })}
      <line x1="62" x2="532" y1={y(0)} y2={y(0)} stroke="var(--muted)" strokeDasharray="4 5" />
      <text x="532" y="333" textAnchor="end">MEAN MODELLED DEPTH / m bgl</text>
      {points.map(row => {
        const active = selected === row.district_name;
        const color = row.avg_trend_m_per_yr! > .3 ? "var(--rust)" : "var(--teal)";
        return <g key={row.district_name} className={styles.point} role="button" tabIndex={0}
          aria-label={`${titleCase(row.district_name)}: ${row.avg_estimate_mbgl} m modelled depth, ${row.avg_trend_m_per_yr} m year-on-year change`}
          aria-pressed={active} onClick={() => onSelect(row.district_name)} onPointerEnter={event => { if (event.pointerType === "mouse") onSelect(row.district_name); }}
          onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(row.district_name); } }}>
          {active && <circle cx={x(row.avg_estimate_mbgl!)} cy={y(row.avg_trend_m_per_yr!)} r="15" fill="none" stroke={color} strokeWidth="1" />}
          <circle cx={x(row.avg_estimate_mbgl!)} cy={y(row.avg_trend_m_per_yr!)} r={active ? 8 : 6} fill={color} opacity={active ? 1 : .68} stroke="var(--card)" strokeWidth="2" />
        </g>;
      })}
    </svg>
    <div className={styles.selectedReadout} aria-live="polite">
      <div><strong>{current ? titleCase(current.district_name) : "No district selected"}</strong>
        <span>{current ? `${current.stress_count} stress flags / ${current.mandals.length} prototype units. ${current.mandals.filter(row => row.estimate_mbgl != null).length} modelled; ${current.mandals.filter(row => row.trend_m_per_yr != null).length} with YoY comparisons.` : "No comparable data."}</span>
      </div>
      {current && <Link href={`/watchlist?district=${encodeURIComponent(current.district_name)}`}>Review mandals</Link>}
    </div>
    <p className={styles.note}>Equal-weight mandal means; available periods may differ. Positive YoY means deeper water. Dot position is not a drought declaration or an area-weighted district estimate.</p>
  </div>;
}
