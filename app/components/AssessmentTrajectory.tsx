import { assessmentTrajectory, titleCase } from "../lib/data";
import styles from "./AssessmentTrajectory.module.css";

/* The official category against twelve years of measured pre-monsoon depth.
 *
 * Not a projection of the next assessment. Between its own two years the median
 * unit moved 4.5 stage points while fifty moved more than twenty, so the measure's
 * year-to-year movement exceeds most units' distance to a threshold. What is worth
 * saying is where a category and the decade point different ways.
 */

const LABEL: Record<string, string> = {
  safe: "Safe", semi_critical: "Semi-critical", critical: "Critical",
  over_exploited: "Over-exploited", salinity: "Salinity",
};
const ORDER = ["safe", "semi_critical", "critical", "over_exploited", "salinity"];
const STRESSED = new Set(["semi_critical", "critical", "over_exploited"]);

export function AssessmentTrajectory() {
  const data = assessmentTrajectory;
  if (!data || !data.mandalsScored) return null;
  const move = data.officialMovement;
  const biggest = move.examples[0] ?? null;

  return (
    <div className={styles.wrap}>
      <div className={styles.heads}>
        <div className={styles.head} data-tone="watch">
          <b>{data.review.length}</b>
          <span>mandals assessed <strong>safe</strong> with a deepening trend in available May readings</span>
        </div>
        <div className={styles.head} data-tone="good">
          <b>{data.recovering.length}</b>
          <span>assessed <strong>semi-critical or worse</strong> with a shallowing trend in available May readings</span>
        </div>
        <div className={styles.head}>
          <b>{move.changedCategory}</b>
          <span>of {move.units} units changed category between {data.previousYear} and {data.assessmentYear}</span>
        </div>
      </div>

      <table className={styles.matrix}>
        <thead>
          <tr><th>Official category</th><th>Table falling</th><th>Steady</th><th>Table rising</th></tr>
        </thead>
        <tbody>
          {ORDER.filter(key => data.counts[key]).map(key => {
            const row = data.counts[key];
            return (
              <tr key={key}>
                <td>{LABEL[key] ?? titleCase(key)}</td>
                <td data-flag={key === "safe" && row.deepening ? "watch" : undefined}>{row.deepening}</td>
                <td>{row.steady}</td>
                <td data-flag={STRESSED.has(key) && row.rising ? "good" : undefined}>{row.rising}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div>
        <div className={styles.listHead}>Assessed safe, falling fastest</div>
        <div className={styles.rows}>
          {data.review.slice(0, 8).map(row => (
            <div className={styles.row} key={`${row.district}-${row.mandal}`}>
              <div className={styles.place}>
                <strong>{titleCase(row.mandal)}</strong>
                <span>{titleCase(row.district)} · {row.years} pre-monsoons, {row.firstYear}–{row.lastYear}</span>
              </div>
              <div className={styles.drift}>+{row.driftMPerYear.toFixed(2)} m/yr</div>
              <div className={styles.stage}>{row.stagePct === null ? "—" : `${row.stagePct.toFixed(0)}% drawn`}</div>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.note}>
        <b>Nothing here is projected forward.</b>{" "}
        Between {data.previousYear} and {data.assessmentYear} the median unit moved {move.medianSwingPct} stage
        points, but <b>{move.overTwentyPoints} moved more than twenty</b> and {move.overFortyPoints} more than
        forty{biggest ? <> — {titleCase(biggest.unit)} went from {biggest.fromPct}% to {biggest.toPct}%</> : null}.
        These historical category changes do not establish a reliable one-year forecast. The lists are prompts for review.
      </p>
      <p className={styles.method}>
        {data.rule}{" "}
        Category and trend describe different quantities and periods. A slope does not mean the table moved the same way every year; monitoring changes and outlying years can affect it.
      </p>
    </div>
  );
}
