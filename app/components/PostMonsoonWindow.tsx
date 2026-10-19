import { monsoonWatch } from "../lib/data";
import styles from "./PostMonsoonWindow.module.css";

/* Where this season stands in the window the official assessment actually uses.
 *
 * GEC compares pre-monsoon (May) with post-monsoon (November). The site is at
 * September, so this does not close the window or guess at it: it places this
 * September against every past September on the same measure, and shows what the
 * remaining stretch has done in those years. The last readings decide.
 */

const W = 720, PAD = 34, LANE_A = 44, LANE_B = 104, H = 140;

export function PostMonsoonWindow() {
  const rows = monsoonWatch.trajectory
    .map(row => {
      const points = new Map(row.points.map(point => [point.month, point.changeM]));
      return { year: row.year, current: row.current, sep: points.get(9) ?? null, nov: points.get(11) ?? null };
    })
    .filter(row => row.sep !== null);
  const now = rows.find(row => row.current);
  const past = rows.filter(row => !row.current);
  if (!now || past.length < 4) return null;

  const closed = past.filter(row => row.nov !== null) as Array<{ year: number; sep: number; nov: number }>;
  const rose = closed.filter(row => row.nov < row.sep).length;
  const values = [...rows.map(r => r.sep as number), ...closed.map(r => r.nov)];
  const low = Math.min(...values, 0) - 0.3, high = Math.max(...values, 0) + 0.3;
  const x = (value: number) => PAD + ((value - low) / (high - low)) * (W - PAD * 2);
  const deeperThanAll = past.every(row => (row.sep as number) < (now.sep as number));

  return (
    <div className={styles.wrap}>
      <div className={styles.lede}>
        <span className={styles.figure}>{now.sep! > 0 ? "+" : ""}{now.sep!.toFixed(2)} m</span>
        <p>
          is where the median mandal stands against its own May{deeperThanAll ? <>, and <b>no season since {past[0].year} has been on this side of zero in September</b></> : null}.
          The official assessment closes its window in November.
        </p>
      </div>

      <div className={styles.plotHead}>
        <span>Each season at September, and where it ended in November</span>
        <span>metres from May</span>
      </div>
      <svg className={styles.plot} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Median change from May at September for each season since ${past[0].year}, and the November value where the season has closed`}>
        <line className={styles.zero} x1={x(0)} x2={x(0)} y1={20} y2={H - 26} />
        <text className={styles.tick} x={x(0)} y={14} textAnchor="middle">May level</text>
        <text className={styles.lane} x={4} y={LANE_A + 4}>Sept</text>
        <text className={styles.lane} x={4} y={LANE_B + 4}>Nov</text>
        <line className={styles.axis} x1={PAD} x2={W - PAD} y1={LANE_A} y2={LANE_A} />
        <line className={styles.axis} x1={PAD} x2={W - PAD} y1={LANE_B} y2={LANE_B} />
        {rows.map(row => (
          <g key={`s${row.year}`}>
            <circle className={row.current ? styles.now : styles.dot} cx={x(row.sep as number)} cy={LANE_A} r={row.current ? 6 : 4} />
            {row.current ? <text className={styles.yr} x={x(row.sep as number)} y={LANE_A - 10} textAnchor="middle">{row.year}</text> : null}
          </g>
        ))}
        {closed.map(row => <circle key={`n${row.year}`} className={styles.dot} cx={x(row.nov)} cy={LANE_B} r={4} />)}
        <text className={styles.tick} x={PAD} y={H - 10}>table higher than May</text>
        <text className={styles.tick} x={W - PAD} y={H - 10} textAnchor="end">table deeper than May</text>
      </svg>

      <p className={styles.note}>
        What the last stretch has done: in <b>{rose} of {closed.length}</b> closed seasons the table rose further
        between September and November; in {closed.length - rose} it fell back. The range is{" "}
        {Math.min(...closed.map(r => r.nov - r.sep)).toFixed(2)} m to +{Math.max(...closed.map(r => r.nov - r.sep)).toFixed(2)} m,
        so November has gone both ways and <b>nothing here is projected into it</b>.
      </p>
      <p className={styles.method}>
        Median change from the same mandals&rsquo; own May reading, on one fixed set of mandals a season, so the
        lines can be read against each other. The Dynamic Ground Water Resources assessment compares pre-monsoon
        with post-monsoon; this window closes when the November readings arrive.
      </p>
    </div>
  );
}
