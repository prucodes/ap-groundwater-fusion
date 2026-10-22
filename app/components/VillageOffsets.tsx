import { villageOffsets } from "../lib/data";
import styles from "./VillageOffsets.module.css";

/** Well-offset evidence: future errors use calendar order and observed peer wells.
 * These are not end-to-end village depth forecasts or representative village means. */
const W = 300, H = 132, L = 30, R = 10, T = 18, B = 24;

export function VillageOffsets() {
  const data = villageOffsets;
  if (!data?.dugWell || !data.boreWell) return null;
  const dug = data.dugWell, bore = data.boreWell;
  const steps = dug.forwardDose.map(d => d.readings);
  const peak = Math.max(...[...dug.forwardDose, ...bore.forwardDose].map(d => d.residualErrorM), .1);
  const x = (i: number) => L + (W - L - R) * (steps[i] - steps[0]) / Math.max(steps[steps.length - 1] - steps[0], 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / peak);
  const three = dug.forwardDose.find(d => d.readings === 3);
  const line = (rows: typeof dug.forwardDose) =>
    rows.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.residualErrorM).toFixed(1)}`).join("");
  const temporal = data.splitHalf.status === "validated" && data.splitHalf.protocol === "chronological-month-v2";

  return (
    <div className={styles.wrap} data-testid="village-offset-evidence">
      <div className={styles.heads}>
        <div className={styles.head}>
          <b>{three?.residualErrorM.toFixed(2) ?? "—"} m</b>
          <span>later-reading offset error after <strong>three early readings</strong> at a dug well; {three?.wells ?? 0} wells, with observed peer levels</span>
        </div>
        <div className={styles.head}>
          <b>{temporal ? data.splitHalf.pastPredictsFutureR : "Pending"}</b>
          <span>correlation between earlier- and later-half mean well offsets, in calendar order; not monthly-depth accuracy</span>
        </div>
        <div className={styles.head}>
          <b>{data.coverage.villages}</b>
          <span>village/well-type records across {data.coverage.mandals} mandals, from {data.source.apWells.toLocaleString("en-IN")} wells read {data.source.period}</span>
        </div>
      </div>

      <div className={styles.twocol}>
        <div>
          <div className={styles.listHead}>Early readings → later offset error</div>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img"
            aria-label="Mean absolute error of individual future well offsets after calibration on early readings, for dug wells and bore wells">
            <line className={styles.gl} x1={L} x2={W - R} y1={H - B} y2={H - B} />
            <line className={styles.gl} x1={L} x2={L} y1={T} y2={H - B} />
            {[0, peak / 2, peak].map(n => <text key={n} className={styles.lab} x={L - 4} y={y(n) + 2} textAnchor="end">{n.toFixed(1)} m</text>)}
            {[{name: "Bore well", color: "#c2412d", rows: bore.forwardDose}, {name: "Dug well", color: "#1f8a8a", rows: dug.forwardDose}].map(s => <g key={s.name}>
              <path d={line(s.rows)} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" />
              {s.rows.map((d, i) => <circle key={d.readings} cx={x(i)} cy={y(d.residualErrorM)} r="2.2" fill={s.color} />)}
              {s.rows[0] && <text className={styles.val} x={x(0) + 4} y={y(s.rows[0].residualErrorM) - 5} fill={s.color}>{s.name}</text>}
            </g>)}
            {steps.map((n, i) => <text key={n} className={styles.lab} x={x(i)} y={H - B + 12} textAnchor="middle">{n}</text>)}
            <text className={styles.lab} x={(L + W) / 2} y={H - 4} textAnchor="middle">early readings used to estimate the offset</text>
          </svg>
          <p className={styles.method}>Every point uses the same wells and future readings, after the first eight observations. Errors are averaged equally across wells. No mandal-nowcast error is included.</p>
        </div>
        <div>
          <div className={styles.listHead}>Can static inputs predict the offset?</div>
          <div className={styles.rows}>
            <div className={styles.row}><div className={styles.what}>Assume no local offset<span>baseline on the same held-out well cohort</span></div><div className={styles.num}>{data.staticCovariateNull.mandalMeanMaeM} m</div></div>
            <div className={styles.row}><div className={styles.what}>Predict the mean offset<span>position, well depth and type; whole mandals held out</span></div><div className={styles.num}>{data.staticCovariateNull.predictedOffsetMaeM} m</div></div>
          </div>
          <p className={styles.note} style={{ marginTop: 10 }}>The tested static model has R&sup2; {data.staticCovariateNull.predictedOffsetR2}. It {data.staticCovariateNull.predictedOffsetMaeM >= data.staticCovariateNull.mandalMeanMaeM ? "does not improve on" : "improves on"} its baseline. This is a different target and cohort from the future-reading curve.</p>
          <p className={styles.note} style={{ marginTop: 10 }}><b>Useful for designing a measurement pilot.</b> A few readings can help estimate a well&rsquo;s local offset. They do not establish a village-wide level or guarantee future accuracy without continuing peer measurements.</p>
        </div>
      </div>
      <p className={styles.method}>Each offset is measured against other wells of the same type in that mandal and month, excluding the target well. {data.caveat}. The median within-mandal spread of the village/well-type mean offsets is {data.spread.medianVillageSpreadM} m; {data.spread.proxyPoor} of {data.coverage.mandalsWithSpread} scored mandals exceed the project&rsquo;s 2 m spread threshold.</p>
    </div>
  );
}
