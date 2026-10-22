import { seawaterWatch, titleCase } from "../lib/data";
import styles from "./SeawaterWatch.module.css";

/* Where the water table stands below sea level, set against the official map.
 *
 * Ground elevation minus depth to water estimates the head above sea level, and a
 * negative head reverses the seaward gradient, which is what lets seawater move
 * inland. Both terms are mandal averages: the elevation is a DEM zonal mean, not
 * surveyed at the wells, so this ranks places rather than measuring them.
 *
 * It is a check on the assessment rather than a replacement for it. The department
 * already classes units as `salinity`, and the share it classes so climbs steadily
 * as this estimate falls, which makes the places they disagree the useful part.
 * Nothing here measures chloride, so the disagreements are a list to verify in the
 * field and never a finding of intrusion.
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
          <span>median height of the water table above sea level across the {data.salinityUnits} units already classed <strong>salinity</strong>, against {data.medianHeadOtherM?.toFixed(0)} m everywhere else</span>
        </div>
        <div className={styles.head}>
          <b>{data.belowSeaLevel}</b>
          <span>of {data.scored} mandals stand at or below sea level on {data.observationPeriod}&rsquo;s measured depth</span>
        </div>
      </div>

      <div>
        <div className={styles.listHead}>Share the assessment calls salinity, by height of the water table above sea level</div>
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
        The two come from independent sources: the assessment is a balance of volumes the department
        computes, and this is satellite ground height minus a measured depth. <b>They agree</b>: the
        share classed salinity climbs from {data.bands[data.bands.length - 1]?.salinityPct}% where the water table
        stands {data.bands[data.bands.length - 1]?.band} to {data.bands[0]?.salinityPct}% where it is {data.bands[0]?.band}. Both
        are mandal averages, so this ranks places to check rather than proving intrusion. The{" "}
        {data.confirmed.length} below sea level that are <b>already classed salinity</b> are left off the list.
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
        set aside as a precaution: past {data.deepWellThresholdM} m, a mandal-average depth is likely
        describing a deeper aquifer than the shallow one seawater reaches.
        Ground elevation is a zonal mean from {data.elevationSource}; categories come from the{" "}
        {data.classificationSource}.
      </p>
    </div>
  );
}
