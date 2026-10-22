import { fieldQueue, titleCase } from "../lib/data";
import styles from "./FieldQueue.module.css";

/* Where a visit would be worth most.
 *
 * A reading is worth taking where it would settle something and where what it
 * settles matters to people, so this multiplies the rank of three things: how wide
 * the published interval is, how many people live there, and how much irrigated
 * land the mandal holds. Ranks rather than raw values, because metres, people and
 * square kilometres do not multiply into anything meaningful and a raw product
 * would simply rank by population.
 *
 * The labels are deliberately outside the score. Standing below sea level, or
 * having the decade and the assessment disagree, is a separate argument for going
 * — one a reader should weigh rather than have priced in at a weight nobody chose.
 */

const SHOWN = 12;

export function FieldQueue() {
  const data = fieldQueue;
  if (!data || !data.queue.length) return null;
  const rows = data.queue.slice(0, SHOWN);
  const totals = data.totals;

  return (
    <div className={styles.wrap}>
      <div className={styles.heads}>
        <div className={styles.head} data-tone="go">
          <b>{(totals.peopleInTopTwenty / 1e6).toFixed(1)}m</b>
          <span>people live in the first twenty mandals on this list, across {totals.irrigatedKm2InTopTwenty.toLocaleString("en-IN")} km&sup2; of irrigated land</span>
        </div>
        <div className={styles.head}>
          <b>{data.scored}</b>
          <span>mandals ranked on the width of their published interval, their population and their irrigated area</span>
        </div>
        <div className={styles.head}>
          <b>{data.queue.filter(row => row.disagrees || row.belowSeaLevel).length}</b>
          <span>of the top {data.published} already carry a reason of their own: {totals.disagreeInTop} where the decade and the assessment disagree, {totals.belowSeaLevelInTop} with a low elevation–depth proxy (flags can overlap)</span>
        </div>
      </div>

      <div>
        <div className={styles.listHead}>Visit these first</div>
        <div className={styles.rows}>
          {rows.map(row => (
            <div className={styles.row} key={`${row.district}|${row.mandal}`}>
              <div className={styles.rank}>{row.rank}</div>
              <div className={styles.place}>
                <strong>{titleCase(row.mandal)}</strong>
                <span>{titleCase(row.district)}{row.category ? ` · ${row.category.replace(/_/g, " ")}` : ""}</span>
                {(row.belowSeaLevel || row.disagrees) && (
                  <div className={styles.tags}>
                    {row.belowSeaLevel && <span className={styles.tag} data-kind="sea">low elevation–depth proxy</span>}
                    {row.disagrees && <span className={styles.tag} data-kind="gap">{row.disagrees}</span>}
                  </div>
                )}
              </div>
              <div className={styles.parts}>
                {([["band", row.rankParts.uncertainty], ["people", row.rankParts.people],
                   ["irrigated", row.rankParts.irrigated]] as const).map(([label, share]) => (
                  <div className={styles.part} key={label}>
                    <i>{label}</i>
                    <div className={styles.track}><b className={styles.fill} style={{ width: `${Math.round(share * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className={styles.figures}>
                <b>{row.intervalWidthM} m band width</b>
                <span>{(row.people / 1000).toFixed(0)}k people</span>
                <span>{row.irrigatedKm2} km&sup2; irrigated</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.note}>
        The three bars are each mandal&rsquo;s standing among all {data.scored}, so a row that is
        wide on all three is one the model is unsure about, in a populous place, with a lot of
        irrigated land depending on the answer. <b>This is a screening priority, not a validated estimate of what a visit will resolve.</b>
      </p>

      <p className={styles.method}>{data.caveat} {data.populationSource}: {data.populationCaveat}</p>
    </div>
  );
}
