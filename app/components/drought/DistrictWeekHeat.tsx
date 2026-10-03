"use client";

import { useState } from "react";
import { place, shortDate, type DroughtWeek } from "../../lib/drought";
import styles from "./Drought.module.css";

export type HeatRow = { district: string; mandals: number; trigger1: number; dry: number[]; known: number[] };

function shade(share: number) {
  // Pale water to deep rust as more of the district's mandals had a dry week.
  const stops = [[232, 242, 246], [242, 210, 155], [227, 154, 59], [198, 90, 70], [122, 46, 39]];
  const t = Math.max(0, Math.min(1, share)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const [r, g, b] = stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f));
  return `rgb(${r},${g},${b})`;
}

/** Each district's season week by week: the share of its mandals with under half the week's normal rain. */
export function DistrictWeekHeat({ rows, weeks }: { rows: HeatRow[]; weeks: DroughtWeek[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  return (
    <div className={styles.chartCard}>
      <h3>The dry weeks, district by district</h3>
      <p>Each cell is one week: the darker, the more of the district&rsquo;s mandals got under half the week&rsquo;s normal rain. The first week precedes the monsoon&rsquo;s normal onset and is not counted. Right: mandals with Trigger 1 set.</p>
      <div className={styles.heat} style={{ ["--weeks" as string]: weeks.length }} onMouseLeave={() => setTip(null)}>
        <div className={`${styles.heatRow} ${styles.heatAxis}`}>
          <span />
          {weeks.map((week, i) => <span key={week.end}>{i % 4 === 0 ? shortDate(week.start) : ""}</span>)}
          <span>T1</span>
        </div>
        {rows.map(row => (
          <div key={row.district} className={styles.heatRow}>
            <span title={place(row.district)}>{place(row.district)}</span>
            {row.dry.map((count, i) => {
              const share = row.known[i] ? count / row.known[i] : 0;
              return (
                <i key={i} style={{ background: row.known[i] ? shade(share) : "var(--field)", opacity: weeks[i]?.counted === false ? .5 : 1 }}
                  onMouseMove={event => setTip({ x: event.clientX + 12, y: event.clientY + 12,
                    text: `${place(row.district)}, ${shortDate(weeks[i].start)}–${shortDate(weeks[i].end)}: ${count} of ${row.known[i]} mandals under half of normal` })} />
              );
            })}
            <b>{row.trigger1}</b>
          </div>
        ))}
      </div>
      {tip ? <div className={styles.heatTip} style={{ left: tip.x, top: tip.y }}>{tip.text}</div> : null}
    </div>
  );
}
