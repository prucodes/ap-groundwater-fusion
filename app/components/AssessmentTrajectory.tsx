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
          <span>mandals assessed <strong>safe</strong> whose May water table has been deepening over the decade</span>
        </div>
        <div className={styles.head} data-tone="good">
          <b>{data.recovering.length}</b>
          <span>assessed <strong>semi-critical or worse</strong> whose May water table has been rising over the same years</span>
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
        The measure&rsquo;s own year-to-year movement is larger than most units&rsquo; distance to a threshold, so a
        one-year extrapolation would be noise wearing a number. These are places to look at, not forecasts.
      </p>
      <p className={styles.method}>
        {data.rule}{" "}
        A slope through a mandal&rsquo;s own May readings makes a drought year one point in a line rather than the
        whole signal: the record&rsquo;s own year-on-year difference, which compares this September with last,
        puts most of the safe category in decline and so only restates that this season was bad. A trend is
        the overall direction, not every year moving the same way.
      </p>
    </div>
  );
}
