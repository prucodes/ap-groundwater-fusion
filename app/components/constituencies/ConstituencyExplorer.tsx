"use client";

import { useMemo, useState } from "react";
import { METRICS, metricColor, metricLegend, metricText, type ConstituencyRow, type MetricKey } from "../../lib/constituencies";
import styles from "./Constituencies.module.css";

type SortKey = "ac" | "pc" | "mandals" | "stressShare" | "medianDepthM" | "sinceMayM" | "droughtShare" | "rainPct";

const COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "ac", label: "Constituency" },
  { key: "pc", label: "Parliament" },
  { key: "mandals", label: "Mandals" },
  { key: "stressShare", label: "GW stress" },
  { key: "medianDepthM", label: "Depth" },
  { key: "sinceMayM", label: "Since May" },
  { key: "droughtShare", label: "Drought" },
  { key: "rainPct", label: "Rain" },
];

/** The constituency map, its measure switch, the selected constituency, and the
 *  sortable table: one state, so a click in either selects in both. */
export function ConstituencyExplorer({ rows, width, height, districts }: { rows: ConstituencyRow[]; width: number; height: number; districts: string[] }) {
  const [metric, setMetric] = useState<MetricKey>("stressShare");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "stressShare", desc: true });
  const shown = hover ?? selected;
  const row = rows.find(r => r.ac === shown) ?? null;

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = a[sort.key], y = b[sort.key];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      const order = typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number);
      return sort.desc ? -order : order;
    });
    return out;
  }, [rows, sort]);

  const meta = METRICS[metric];
  return (
    <div className={styles.explorer}>
      <div className={styles.toolbar} role="group" aria-label="Map measure">
        {(Object.keys(METRICS) as MetricKey[]).map(key => (
          <button key={key} type="button" aria-pressed={metric === key} className={metric === key ? styles.chipOn : styles.chip}
            onClick={() => setMetric(key)}>{METRICS[key].label}</button>
        ))}
      </div>
      <div className={styles.mapGrid}>
        <figure className={styles.mapFigure}>
          <svg viewBox={`0 0 ${width} ${height}`} className={styles.map} role="img" data-testid="constituency-map"
            aria-label={`Assembly constituencies coloured by ${meta.label.toLowerCase()}`}>
            {rows.map(r => r.path ? (
              <path key={r.ac} d={r.path} fill={metricColor(metric, r[metric])} fillRule="evenodd"
                className={r.ac === selected ? styles.acSelected : styles.ac}
                tabIndex={0} role="button" aria-label={`${r.ac}: ${metricText(metric, r[metric])}`}
                onMouseEnter={() => setHover(r.ac)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(r.ac)} onBlur={() => setHover(null)}
                onClick={() => setSelected(s => (s === r.ac ? null : r.ac))}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(s => (s === r.ac ? null : r.ac)); } }} />
            ) : null)}
            <g className={styles.districtLines} aria-hidden="true">
              {districts.map((d, i) => <path key={i} d={d} />)}
            </g>
            {row?.label ? (
              <g className={styles.mapLabel} aria-hidden="true" transform={`translate(${row.label[0]} ${row.label[1]})`}>
                <circle r={4} />
                <text y={-10} textAnchor="middle">{row.ac}</text>
              </g>
            ) : null}
          </svg>
          <figcaption className={styles.legend}>
            <strong>{meta.label}</strong> <span>{meta.unit}</span>
            <ul>{metricLegend(metric).map(item => <li key={item.label}><i style={{ background: item.color }} />{item.label}</li>)}</ul>
          </figcaption>
        </figure>
        <aside className={styles.panel} aria-live="polite" data-testid="constituency-panel">
          {row ? (
            <>
              <span className={styles.panelKicker}>{row.pc} parliamentary constituency</span>
              <h3>{row.ac}</h3>
              <p className={styles.panelDistricts}>{row.districts}</p>
              <dl className={styles.facts}>
                <div><dt>Groundwater in stress</dt><dd>{`${row.stress} of ${row.assessed} mandals`}</dd></div>
                <div><dt>Median depth</dt><dd>{row.medianDepthM === null ? "—" : `${row.medianDepthM.toFixed(1)} m`}</dd></div>
                <div><dt>State wells since May</dt><dd>{metricText("sinceMayM", row.sinceMayM)}</dd></div>
                <div><dt>Drought manual</dt><dd>{`${row.droughtActive} moderate or severe · ${row.droughtSevere} severe`}</dd></div>
                <div><dt>Gauge rain</dt><dd>{metricText("rainPct", row.rainPct)}</dd></div>
                <div><dt>State stations</dt><dd>{row.stations}</dd></div>
              </dl>
              {row.mandals ? (
                <p className={styles.panelMandals}><strong>{`${row.mandals} mandals: `}</strong>{row.mandalNames}</p>
              ) : (
                <p className={styles.panelMandals}>No mandal of its own on this map: the city is drawn as one mandal, counted in the seat its centre falls in.</p>
              )}
              <p className={styles.panelNote}>
                {`${row.outline === "official" ? `Outline: the State's own${row.officialKm2 ? `, ${row.officialKm2} km²` : ""}` : row.outline === "mandals" ? "Outline: the union of its mandals" : "No outline"}`}
                {row.placedByLocation ? ` · placed by location: ${row.placedByLocation}` : ""}
              </p>
            </>
          ) : (
            <p className={styles.panelEmpty}>Point at or select a constituency to see its mandals and figures.</p>
          )}
        </aside>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table} data-testid="constituency-table">
          <thead>
            <tr>{COLUMNS.map(c => (
              <th key={c.key} aria-sort={sort.key === c.key ? (sort.desc ? "descending" : "ascending") : "none"}>
                <button type="button" onClick={() => setSort(s => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.key !== "ac" && c.key !== "pc" }))}>
                  {c.label}{sort.key === c.key ? (sort.desc ? " ▼" : " ▲") : ""}
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.ac} className={r.ac === selected ? styles.rowOn : undefined} onClick={() => setSelected(r.ac)}>
                <td><strong>{r.ac}</strong></td>
                <td>{r.pc}</td>
                <td>{r.mandals}</td>
                <td><span className={styles.cell} style={{ background: metricColor("stressShare", r.stressShare) }} />{metricText("stressShare", r.stressShare)}</td>
                <td>{r.medianDepthM === null ? "—" : `${r.medianDepthM.toFixed(1)} m`}</td>
                <td><span className={styles.cell} style={{ background: metricColor("sinceMayM", r.sinceMayM) }} />{metricText("sinceMayM", r.sinceMayM)}</td>
                <td><span className={styles.cell} style={{ background: metricColor("droughtShare", r.droughtShare) }} />{metricText("droughtShare", r.droughtShare)}</td>
                <td><span className={styles.cell} style={{ background: metricColor("rainPct", r.rainPct) }} />{metricText("rainPct", r.rainPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
