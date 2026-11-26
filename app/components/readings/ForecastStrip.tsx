import type { CSSProperties } from "react";
import type { PathPoint } from "../../lib/readingsDay";
import { nextMonth } from "../../lib/readingsDay";
import styles from "./ForecastStrip.module.css";

/* One forecast month on one line (Readings Day): from the month the forecasts started, the
   median mandal's measured move month by month (solid), and where the forecasts said it would
   be by their month (dashed, open ring). Before the month is read, the line stops at the latest
   reading and the forecast's month waits; once read, the line reaches it and the gap is the
   miss. The lines are an SVG that stretches to the frame; dots and words are HTML placed by
   percentage, so they stay round and keep their size when a phone makes the frame taller, where
   the words move under the chart as a two-line readout. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const name = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
/** Under a metre keep centimetres, as the page does. */
const mv = (v: number) => `${Math.abs(v).toFixed(Math.abs(v) < 1 ? 2 : 1)} m`;
const way = (v: number) => (v > 0 ? "deeper" : "nearer the surface");

/** Plot units: the frame keeps this shape on a wide screen; the edges leave room for the words. */
const W = 720, H = 240, LEFT = 56, RIGHT = 56, TOP = 50, BOTTOM = 50;

export function ForecastStrip({ origin, target, path, expectedM, landsBy, forecasts }: {
  origin: string; target: string;
  /** Months after the origin, as the ledger reads them; the target appears once it is measured. */
  path: PathPoint[];
  expectedM: number;
  /** When the target month's readings usually land (shown while it waits). */
  landsBy: string;
  forecasts: number;
}) {
  const months: string[] = [];
  for (let m = origin; m <= target; m = nextMonth(m)) months.push(m);
  const at = new Map(path.map(p => [p.month, p.changeM]));
  const measured: Array<[string, number]> = [[origin, 0], ...months.slice(1).filter(m => at.has(m)).map(m => [m, at.get(m)!] as [string, number])];
  const last = measured[measured.length - 1];
  const judged = at.has(target);
  const values = [0, expectedM, ...measured.map(p => p[1])];
  const span = Math.max(0.5, Math.max(...values) - Math.min(...values));
  // Nearer the surface is up: the most negative change sits at the top.
  const lo = Math.min(...values) - span * 0.12, hi = Math.max(...values) + span * 0.12;
  const x = (m: string) => LEFT + (months.indexOf(m) * (W - LEFT - RIGHT)) / Math.max(1, months.length - 1);
  const y = (v: number) => TOP + ((v - lo) / (hi - lo)) * (H - TOP - BOTTOM);
  const place = (px: number, py: number): CSSProperties => ({ left: `${(100 * px) / W}%`, top: `${(100 * py) / H}%` });
  const soFar = judged ? `Measured: ${mv(at.get(target)!)} ${way(at.get(target)!)}` : `By ${name(last[0])}: ${mv(last[1])} ${way(last[1])}`;
  const label = `${forecasts} forecasts for ${name(target)}, made from ${name(origin)} readings: they expected the median mandal ${mv(expectedM)} ${way(expectedM)} than in ${name(origin)}. `
    + (judged ? `It moved ${mv(at.get(target)!)} ${way(at.get(target)!)}.` : `By ${name(last[0])} it had moved ${mv(last[1])} ${way(last[1])}; ${name(target)}'s readings usually land in the first week of ${name(landsBy)}.`);

  return (
    <figure className={styles.strip} data-testid="readings-strip" data-judged={judged ? "" : undefined} data-draw aria-label={label}>
      <div className={styles.stage}>
        {!judged ? <span className={styles.waiting} style={{ left: `${(100 * (x(target) - 34)) / W}%`, width: `${(100 * 68) / W}%`, top: `${(100 * (TOP - 18)) / H}%`, bottom: `${(100 * (BOTTOM - 2)) / H}%` }} aria-hidden="true" /> : null}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {months.map(m => <line key={m} className={styles.column} x1={x(m)} x2={x(m)} y1={TOP - 18} y2={H - BOTTOM} />)}
          <line className={styles.zero} x1={LEFT - 30} x2={W - RIGHT + 30} y1={y(0)} y2={y(0)} />
          <line className={styles.forecast} x1={x(origin)} y1={y(0)} x2={x(target)} y2={y(expectedM)} />
          <polyline className={styles.measured} points={measured.map(([m, v]) => `${x(m)},${y(v)}`).join(" ")} />
          {judged ? <line className={styles.gap} x1={x(target)} x2={x(target)} y1={y(expectedM)} y2={y(at.get(target)!)} /> : null}
        </svg>
        {measured.map(([m, v]) => <span key={m} className={styles.dot} style={place(x(m), y(v))} aria-hidden="true" />)}
        <span className={styles.ring} style={place(x(target), y(expectedM))} aria-hidden="true" />
        <span className={`${styles.word} ${styles.zeroWord}`} style={place(LEFT - 30, y(0))}>{name(origin)}&rsquo;s level, where the forecasts start</span>
        <span className={`${styles.word} ${styles.forecastWord}`} style={place(x(target) - (judged ? 14 : 42), y(expectedM))}>
          <b>Forecast for {name(target)}</b>{mv(expectedM)} {way(expectedM)}
        </span>
        {judged
          ? <span className={`${styles.word} ${styles.measuredWord}`} style={place(x(target) + 8, y(at.get(target)!))}><b>Measured</b>{mv(at.get(target)!)} {way(at.get(target)!)}</span>
          : <span className={`${styles.word} ${styles.soFarWord}`} style={place(x(last[0]) + 12, y(last[1]))}><b>By {name(last[0])}</b>{mv(last[1])} {way(last[1])}</span>}
        {months.map(m => (
          <span key={m} className={`${styles.word} ${styles.month}`} style={place(x(m), H - BOTTOM + 10)} data-target={m === target ? "" : undefined}>
            <span className={styles.long}>{name(m)}</span><span className={styles.short}>{name(m).slice(0, 3)}</span>
            {m === target && !judged ? <small>readings due early {name(landsBy)}</small> : null}
          </span>
        ))}
      </div>
      <p className={styles.readout}>
        <span className={styles.readSoFar}>{soFar}</span>
        <span className={styles.readForecast}>Forecast for {name(target)}: {mv(expectedM)} {way(expectedM)}</span>
        {!judged ? <span className={styles.readDue}>{name(target)}&rsquo;s readings are due early {name(landsBy)}</span> : null}
      </p>
      <figcaption className={styles.key}>
        <span><i />Measured: the median mandal&rsquo;s move since {name(origin)}</span>
        <span><i className={styles.keyForecast} />What the {forecasts} forecasts expected</span>
      </figcaption>
    </figure>
  );
}
