import { seawaterWatch, titleCase } from "../lib/data";
import styles from "./SeawaterWatch.module.css";

/* Area-average elevation–depth screening, not measured hydraulic head. */

export function SeawaterWatch() {
  const data = seawaterWatch;
  if (!data || !data.scored) return null;
  const peak = Math.max(...data.bands.map(b => b.salinityPct ?? 0), 1);

  return (
    <div className={styles.wrap}>
      <div className={styles.heads}>
        <div className={styles.head} data-tone="watch">
          <b>{data.watch.length}</b>
          <span>mandals with a <strong>non-positive elevation–depth proxy</strong> and depth ≤ {data.deepWellThresholdM} m, not classed salinity</span>
        </div>
        <div className={styles.head} data-tone="sea">
          <b>{data.medianHeadSalinityM?.toFixed(1)} m</b>
          <span>median elevation–depth proxy across the {data.salinityUnits} units already classed <strong>salinity</strong>, against {data.medianHeadOtherM?.toFixed(0)} m everywhere else</span>
        </div>
        <div className={styles.head}>
          <b>{data.belowSeaLevel}</b>
          <span>of {data.scored} mandals have a non-positive proxy using {data.observationPeriod}&rsquo;s measured depth</span>
        </div>
      </div>

      <div>
        <div className={styles.listHead}>Official salinity share by elevation–depth proxy</div>
        <div className={styles.bands}>
          {data.bands.map(band => (
            <div className={styles.band} key={band.band}>
              <div className={styles.label}>{band.band === "at or below sea level" ? "≤ 0 m proxy" : `${band.band} proxy`}</div>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${100 * (band.salinityPct ?? 0) / peak}%` }} />
              </div>
              <div className={styles.count}><b>{band.salinityPct}%</b> of {band.mandals}</div>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.note}>
        This compares an official salinity category with area-average terrain elevation minus a
        mandal-average depth. <b>The elevation is not surveyed at the wells.</b> Agreement between
        these summaries does not validate hydraulic head or diagnose seawater intrusion.
        {" "}{data.confirmed.length} flagged mandals already classed salinity are listed separately in the data.
      </p>

      <div>
        <div className={styles.listHead}>Non-positive proxy, depth ≤ {data.deepWellThresholdM} m, not classed salinity</div>
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
        {data.caveat} {data.setAsideDeepWells.length} further mandals have non-positive proxies and are
        set aside by the project’s {data.deepWellThresholdM} m precautionary depth cutoff.
        Depth alone does not establish confinement, well type or hydraulic connection to the sea.
        Ground elevation is a zonal mean from {data.elevationSource}; categories come from the{" "}
        {data.classificationSource}.
      </p>
    </div>
  );
}
