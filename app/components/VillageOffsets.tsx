import { villageOffsets } from "../lib/data";
import styles from "./VillageOffsets.module.css";

/* Whether a level can be given per village, which the department asked directly.
 *
 * Not at the mandal model's accuracy, and the reason is not resolution: the
 * published record is already averaged to mandal, so nothing below that scale has
 * ever been trained or tested. What a well does carry is its gap from the mandal,
 * and most of that gap stays with the place, so a few readings measure it.
 *
 * The curve is the honest version of that claim, scored in calendar order on each
 * later reading rather than on a long-run average: three readings at a dug well
 * roughly halve the error, and the well's own season-to-season scatter sets a floor
 * that more readings do not lower. Predicting the gap from position, depth and type
 * does no better than ignoring it, which is why the ask is measurement.
 */
const W = 300, H = 132, L = 30, R = 10, T = 18, B = 24;

export function VillageOffsets() {
  const data = villageOffsets;
  if (!data?.dugWell || !data.boreWell) return null;
  const dug = data.dugWell, bore = data.boreWell;
  const steps = dug.forwardDose.map(d => d.readings);
  const base = dug.forwardBaselineM;
  const peak = Math.max(...[...dug.forwardDose, ...bore.forwardDose].map(d => d.residualErrorM), base ?? 0, .1);
  const x = (i: number) => L + (W - L - R) * (steps[i] - steps[0]) / Math.max(steps[steps.length - 1] - steps[0], 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / peak);
  const three = dug.forwardDose.find(d => d.readings === 3);
  const line = (rows: typeof dug.forwardDose) =>
    rows.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.residualErrorM).toFixed(1)}`).join("");
  const temporal = data.splitHalf.status === "validated" && data.splitHalf.protocol === "chronological-month-v2";
  const cut = base && three ? Math.round(100 * (1 - three.residualErrorM / base)) : null;

  return (
    <div className={styles.wrap} data-testid="village-offset-evidence">
      <div className={styles.heads}>
        <div className={styles.head}>
          <b>{three?.residualErrorM.toFixed(2) ?? "—"} m</b>
          <span>error on a later reading after <strong>three readings</strong> at a dug well{base ? <>, against {base.toFixed(2)} m with the mandal figure alone</> : null} ({three?.wells ?? 0} wells)</span>
        </div>
        <div className={styles.head}>
          <b>{temporal ? data.splitHalf.pastPredictsFutureR : "Pending"}</b>
          <span>how well a well&rsquo;s earlier gap from its mandal predicts its later gap (correlation, {data.splitHalf.wellsScored} wells)</span>
        </div>
        <div className={styles.head}>
          <b>{data.coverage.villages}</b>
          <span>villages with a measurable gap across {data.coverage.mandals} mandals, from {data.source.apWells.toLocaleString("en-IN")} wells read {data.source.period}</span>
        </div>
      </div>

      <div className={styles.twocol}>
        <div>
          <div className={styles.listHead}>What each reading at a well buys</div>
          <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img"
            aria-label="Error on later readings against the number of readings taken at the well, for dug wells and bore wells, with the mandal figure alone for dug wells">
            <line className={styles.gl} x1={L} x2={W - R} y1={H - B} y2={H - B} />
            <line className={styles.gl} x1={L} x2={L} y1={T} y2={H - B} />
            {base && <g><line x1={L} x2={W - R} y1={y(base)} y2={y(base)} stroke="#1f8a8a" strokeWidth="1" strokeDasharray="3 2" /><text className={styles.lab} x={W - R} y={y(base) - 4} textAnchor="end">dug well, mandal figure alone</text></g>}
            {[0, peak / 2, peak].map(n => <text key={n} className={styles.lab} x={L - 4} y={y(n) + 2} textAnchor="end">{n.toFixed(1)} m</text>)}
            {[{name: "Bore well", color: "#c2412d", rows: bore.forwardDose}, {name: "Dug well", color: "#1f8a8a", rows: dug.forwardDose}].map(s => <g key={s.name}>
              <path d={line(s.rows)} fill="none" stroke={s.color} strokeWidth="1.8" strokeLinejoin="round" />
              {s.rows.map((d, i) => <circle key={d.readings} cx={x(i)} cy={y(d.residualErrorM)} r="2.2" fill={s.color} />)}
              {s.rows[0] && <text className={styles.val} x={x(0) + 4} y={y(s.rows[0].residualErrorM) - 5} fill={s.color}>{s.name}</text>}
            </g>)}
            {steps.map((n, i) => <text key={n} className={styles.lab} x={x(i)} y={H - B + 12} textAnchor="middle">{n}</text>)}
            <text className={styles.lab} x={(L + W) / 2} y={H - 4} textAnchor="middle">readings taken at the well</text>
          </svg>
          <p className={styles.method}>Every point scores the same wells on the same later readings, in date order. This is the error in the well&rsquo;s gap from its mandal; the mandal estimate&rsquo;s own error comes on top.</p>
        </div>
        <div>
          <div className={styles.listHead}>Can the gap be predicted instead of measured?</div>
          <div className={styles.rows}>
            <div className={styles.row}><div className={styles.what}>Use the mandal figure alone<span>no gap assumed, same wells</span></div><div className={styles.num}>{data.staticCovariateNull.mandalMeanMaeM} m</div></div>
            <div className={styles.row}><div className={styles.what}>Predict the gap<span>from position, well depth and type, whole mandals held out</span></div><div className={styles.num}>{data.staticCovariateNull.predictedOffsetMaeM} m</div></div>
          </div>
          <p className={styles.note} style={{ marginTop: 10 }}>{data.staticCovariateNull.predictedOffsetMaeM >= data.staticCovariateNull.mandalMeanMaeM ? <><b>Predicting does no better than ignoring the gap</b> (R&sup2; {data.staticCovariateNull.predictedOffsetR2}), so it has to be measured. That is what sets the ask.</> : <>Predicting the gap improves on ignoring it (R&sup2; {data.staticCovariateNull.predictedOffsetR2}).</>}</p>
          <p className={styles.note} style={{ marginTop: 10 }}><b>What this means for a pilot.</b> {cut !== null ? <>Three readings at a dug well cut the error there by about {cut}%. </> : null}A well speaks for its own spot rather than a whole village, and the mandal&rsquo;s other wells have to keep reading for the gap to stay useful.</p>
        </div>
      </div>
      <p className={styles.method}>Each gap is measured against other wells of the same type in that mandal and month. {data.caveat.charAt(0).toUpperCase() + data.caveat.slice(1)}. The median village sits {data.spread.medianVillageSpreadM} m from its mandal mean, and the mandal figure is a poor guide (villages spread over 2 m) in {data.spread.proxyPoor} of {data.coverage.mandalsWithSpread} scored mandals.</p>
    </div>
  );
}
