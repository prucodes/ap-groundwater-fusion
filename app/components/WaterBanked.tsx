import { formatNumber, monsoonWatch } from "../lib/data";
import styles from "./WaterBanked.module.css";

/* What the season put into the ground, estimated.
 *
 * The rest of the page measures the water table in metres. A department works in
 * volumes, by the method its own assessment uses: a rise times the specific yield
 * times the area. This says what arrived and what share of the rain it represents,
 * and shows the distribution beside it, because the statewide share hides the fact
 * that more than half the mandals kept nothing at all. It is net of pumping, and a
 * mandal whose table fell counts as zero rather than negative.
 */

const BINS = 10;          // 0-10%, 10-20% ... 90-100%
const OVER = BINS;        // one more column for the mandals that beat their rain
const W = 720, H = 132, PAD = 22;

export function WaterBanked() {
  const banked = monsoonWatch.banked;
  if (!banked || banked.sharePct === null) return null;

  const counts = new Array(BINS + 1).fill(0);
  for (const row of monsoonWatch.mandals) {
    if (row.bankedSharePct === null) continue;
    counts[row.bankedSharePct >= 100 ? OVER : Math.min(BINS - 1, Math.floor(row.bankedSharePct / 10))] += 1;
  }
  const peak = Math.max(...counts, 1);
  const step = (W - PAD * 2) / (BINS + 1);
  const floor = H - 26;

  return (
    <div className={styles.wrap}>
      <div className={styles.lede}>
        <span className={styles.headline}>{banked.sharePct}%</span>
        <p>of the rain that fell on Andhra Pradesh this season is estimated to still be in the ground.</p>
      </div>

      <div className={styles.ribbon}>
        <div className={styles.kept} style={{ width: `${Math.min(100, Math.max(banked.sharePct, 0.6))}%` }} />
      </div>
      <div className={styles.ribbonLabels}>
        <span><b>{formatNumber(banked.bankedMm3)} Mm³</b> stayed</span>
        <span><b>{formatNumber(banked.rainMm3)} Mm³</b> fell</span>
      </div>

      <div className={styles.histWrap}>
        <div className={styles.histHead}>
          <span>Every mandal, by the share of its rain it kept</span>
          <span>{banked.mandals} mandals</span>
        </div>
        <svg className={styles.hist} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Distribution of the share of rain kept: the median mandal kept ${banked.medianSharePct}%, and ${banked.aboveRain} kept more than their rain.`}>
          <line x1={PAD} x2={W - PAD} y1={floor} y2={floor} />
          {counts.map((count, index) => {
            // A floor of three pixels, so six mandals in the last column are still a column.
            const height = count ? Math.max(3, (count / peak) * (floor - 18)) : 0;
            return <rect key={index} className={index === OVER ? styles.over : undefined}
              x={PAD + index * step + 3} y={floor - height} width={step - 6} height={height} rx="2" />;
          })}
          <text x={PAD} y={H - 8}>0%</text>
          <text x={PAD + BINS / 2 * step} y={H - 8} textAnchor="middle">50%</text>
          <text x={PAD + (OVER + 0.5) * step} y={H - 8} textAnchor="middle">100%+</text>
        </svg>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}><b>{monsoonWatch.mandals.filter(row => row.bankedSharePct !== null && (row.riseM ?? 0) > 0).length}</b><span>mandals where the table rose at all, of {banked.mandals}</span></div>
        <div className={styles.stat}><b>{banked.medianSharePct}%</b><span>kept by the median mandal</span></div>
        <div className={styles.stat}><b>{banked.aboveRain}</b><span>kept more than their rain</span></div>
      </div>

      <p className={styles.note}>
        A mandal cannot keep more rain than fell on it. Where it appears to, water arrived from
        somewhere else, <b>a canal, irrigation return flow or flow from upslope</b>, or the estimate is
        off: rain after September, or a specific yield that does not fit. <b>This cannot tell which.</b>
      </p>
      <p className={styles.method}>
        {banked.method} Shares are left out below {banked.shareFloorMm} mm of season rain, where the ratio is
        governed by its denominator rather than by recharge; {banked.thinRain} mandals fall under that floor and
        keep their volume without a share.
      </p>
    </div>
  );
}
