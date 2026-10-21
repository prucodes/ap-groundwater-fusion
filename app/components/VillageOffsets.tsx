import { villageOffsets } from "../lib/data";
import styles from "./VillageOffsets.module.css";

/* Whether a level can be given per village, which the department asked directly.
 *
 * Not at the mandal model's accuracy, and the reason is not resolution: the
 * published record is already averaged to mandal, so nothing below that scale has
 * ever been trained or tested. What makes it reachable is that a village's
 * distance from its mandal is a fixed property of the place rather than scatter,
 * so a handful of readings pin it and the mandal network carries the movement.
 *
 * The card leads with the number that decides the question -- three readings at a
 * dug well land under the mandal model's own error -- and keeps the null result
 * beside it, because "measuring beats modelling" is what turns this into a
 * measurement programme rather than more modelling.
 */

const W = 300, H = 132, L = 30, R = 10, T = 18, B = 24;

export function VillageOffsets() {
  const data = villageOffsets;
  if (!data?.dugWell || !data.boreWell) return null;
  const dug = data.dugWell, bore = data.boreWell;
  const steps = dug.dose.map(d => d.readings);
  const peak = Math.max(...bore.dose.map(d => d.residualErrorM));
  const x = (i: number) => L + (W - L - R) * i / Math.max(steps.length - 1, 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / peak);
  const three = dug.dose.find(d => d.readings === 3)?.residualErrorM ?? null;
  const line = (rows: typeof dug.dose) =>
    rows.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.residualErrorM).toFixed(1)}`).join("");

  return (
    <div className={styles.wrap}>
      <div className={styles.heads}>
        <div className={styles.head} data-tone="go">
          <b>{three?.toFixed(2)} m</b>
          <span>village error after <strong>three readings</strong> at a private dug well, under the {data.staticCovariateNull ? "" : ""}mandal model&rsquo;s own error</span>
        </div>
        <div className={styles.head}>
          <b>{data.persistence.persistentSharePct}%</b>
          <span>of a village&rsquo;s distance from its mandal is fixed to the place, not month-to-month scatter (r&nbsp;{data.splitHalf.pastPredictsFutureR})</span>
        </div>
        <div className={styles.head}>
          <b>{data.coverage.villages}</b>
          <span>villages across {data.coverage.mandals} mandals already have a computable offset, from {data.source.apWells.toLocaleString("en-IN")} wells read {data.source.period}</span>
        </div>
      </div>

      <div className={styles.twocol}>
        <div>
          <div className={styles.listHead}>What each reading at a village buys</div>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img"
            aria-label={`Village error against readings taken: a dug well reaches ${three} metres on three readings, a bore well far later`}>
            <line className={styles.gl} x1={L} x2={W - R} y1={H - B} y2={H - B} />
            <line className={styles.gl} x1={L} x2={L} y1={T} y2={H - B} />
            <line className={styles.ref} x1={L} x2={W - R} y1={y(1.02)} y2={y(1.02)} />
            <line className={styles.ref} x1={W - R - 12} x2={W - R} y1="5" y2="5" />
            <text className={styles.lab} x={W - R - 15} y="7.5" textAnchor="end">the mandal model&rsquo;s own error</text>
            <path d={line(bore.dose)} fill="none" stroke="#c2412d" strokeWidth="1.6" strokeLinejoin="round" />
            <path d={line(dug.dose)} fill="none" stroke="#1f8a8a" strokeWidth="1.8" strokeLinejoin="round" />
            {dug.dose.map((d, i) => <circle key={d.readings} cx={x(i)} cy={y(d.residualErrorM)} r="2.2" fill="#1f8a8a" />)}
            <text className={styles.val} x={x(0) + 4} y={y(bore.dose[0].residualErrorM) - 5} fill="#c2412d">Bore well</text>
            <text className={styles.val} x={x(0) + 4} y={y(dug.dose[0].residualErrorM) - 5} fill="#1f8a8a">Dug well</text>
            {steps.map((n, i) => <text key={n} className={styles.lab} x={x(i)} y={H - B + 12} textAnchor="middle">{n}</text>)}
            <text className={styles.lab} x={(L + W) / 2} y={H - 4} textAnchor="middle">readings taken at the village</text>
          </svg>
        </div>

        <div>
          <div className={styles.listHead}>Measuring against modelling</div>
          <div className={styles.rows}>
            <div className={styles.row}>
              <div className={styles.what}>The mandal figure handed to a village<span>no reading taken there</span></div>
              <div className={styles.num}>{data.splitHalf.mandalMeanAppliedMaeM} m</div>
            </div>
            <div className={styles.row}>
              <div className={styles.what}>Predicting its offset instead<span>position, well depth and type, whole mandals held out</span></div>
              <div className={styles.num}>{data.staticCovariateNull.predictedOffsetMaeM} m</div>
            </div>
            <div className={styles.row}>
              <div className={styles.what}>One actual reading<span>at the village itself</span></div>
              <div className={styles.num} data-good="true">{dug.dose[0].residualErrorM} m</div>
            </div>
          </div>
          <p className={styles.note} style={{ marginTop: 10 }}>
            Predicting a village&rsquo;s offset returns an R&sup2; of{" "}
            {data.staticCovariateNull.predictedOffsetR2}, <b>worse than using the mandal figure</b>.
            One reading beats the best model, so this is a measurement question rather than
            a modelling one.
          </p>
        </div>
      </div>

      <p className={styles.method}>
        Each well&rsquo;s leave-one-out distance from the other wells of its type in its mandal,
        averaged over its record. {data.caveat}, so budget more readings than the curve shows. The mandal
        figure stands in poorly for its villages in {data.spread.proxyPoor} of the{" "}
        {data.coverage.mandalsWithSpread} mandals where that can be checked, the median village
        sitting {data.spread.medianVillageSpreadM} m from its mandal&rsquo;s mean.
      </p>
    </div>
  );
}
