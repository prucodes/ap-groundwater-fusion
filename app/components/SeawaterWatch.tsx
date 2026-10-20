import { seawaterWatch, titleCase } from "../lib/data";
import styles from "./SeawaterWatch.module.css";

/* Where the water table stands below sea level, set against the official map.
 *
 * Ground elevation minus depth to water is the head above sea level, and a negative
 * head reverses the seaward gradient, which is what lets seawater move inland. This
 * only became answerable once the terrain cache was rebuilt from a DEM.
 *
 * It is a check on the assessment rather than a replacement for it. The department
 * already classes units as `salinity`, and that classification and this head agree
 * closely enough to be worth trusting, which makes the places they disagree the
 * useful part. Nothing here measures chloride, so the disagreements are a list to
 * verify in the field and never a finding of intrusion.
 */

export function SeawaterWatch() {
  const data = seawaterWatch;
  if (!data || !data.scored) return null;
  const peak = Math.max(...data.bands.map(b => b.salinityPct ?? 0), 1);

  return (
    <div className={styles.wrap}>
      <div className={styles.heads}>
        <div className={styles.head} data-tone="watch">
          <b>{data.watch.length}</b>
          <span>mandals whose water table sits <strong>below sea level</strong> on shallow wells, which the assessment has not classed salinity</span>
        </div>
        <div className={styles.head} data-tone="sea">
          <b>{data.medianHeadSalinityM?.toFixed(1)} m</b>
          <span>median head above sea level across the {data.salinityUnits} units already classed <strong>salinity</strong>, against {data.medianHeadOtherM?.toFixed(0)} m everywhere else</span>
        </div>
        <div className={styles.head}>
          <b>{data.belowSeaLevel}</b>
          <span>of {data.scored} mandals stand at or below sea level on {data.observationPeriod}&rsquo;s measured depth</span>
        </div>
      </div>

      <div>
        <div className={styles.listHead}>Share the assessment calls salinity, by head above sea level</div>
        <div className={styles.bands}>
          {data.bands.map(band => (
            <div className={styles.band} key={band.band}>
              <div className={styles.label}>{band.band}</div>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${100 * (band.salinityPct ?? 0) / peak}%` }} />
              </div>
              <div className={styles.count}><b>{band.salinityPct}%</b> of {band.mandals}</div>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.note}>
        The two readings are independent: the assessment is a balance of volumes the department
        computes, and the head is a satellite elevation minus a measured depth. <b>They agree.</b>{" "}
        That is what makes the mandals below worth a look, and it is also why the {data.confirmed.length}{" "}
        shallow mandals below sea level that are <b>already classed salinity</b> are left off the list.
      </p>

      <div>
        <div className={styles.listHead}>Below sea level, shallow wells, not yet classed salinity</div>
        <div className={styles.rows}>
          {data.watch.map(row => (
            <div className={styles.row} key={`${row.district}|${row.mandal}`}>
              <div className={styles.place}>
                <strong>{titleCase(row.mandal)}</strong>
                <span>{titleCase(row.district)} · ground {row.groundM} m, lower tenth {row.groundP10M} m</span>
              </div>
              <div className={styles.head2}>{row.headM.toFixed(1)} m</div>
              <div className={styles.depth}>water at {row.depthM} m</div>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.method}>
        {data.caveat} {data.setAsideDeepWells.length} further mandals read below sea level and are
        set aside here, because a mandal-mean depth past {data.deepWellThresholdM} m is describing a
        confined aquifer or an inland water table rather than the shallow one intrusion reaches.
        Ground elevation is a zonal mean from {data.elevationSource}; categories come from the{" "}
        {data.classificationSource}.
      </p>
    </div>
  );
}
