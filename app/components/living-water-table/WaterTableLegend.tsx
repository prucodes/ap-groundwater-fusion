import { useEffect, useRef, useState } from "react";
import { COVERAGE_STYLES, DEPTH_CATEGORIES, depthRangeLabel } from "./encoding";
import styles from "./living-water-table.module.css";

export function WaterTableLegend() {
  const [expanded, setExpanded] = useState(true);
  const manuallyChanged = useRef(false);

  useEffect(() => {
    const constrainedHeight = window.matchMedia("(max-height: 820px)");
    const applyViewportDefault = () => {
      if (!manuallyChanged.current) setExpanded(!constrainedHeight.matches);
    };
    applyViewportDefault();
    constrainedHeight.addEventListener("change", applyViewportDefault);
    return () =>
      constrainedHeight.removeEventListener("change", applyViewportDefault);
  }, []);

  return (
    <section
      className={`${styles.legend} ${expanded ? "" : styles.legendCollapsed}`}
      aria-labelledby="water-table-legend-title"
    >
      <div className={styles.legendHeader}>
        <div>
          <div className={styles.eyebrow}>Visual encoding</div>
          <h2 id="water-table-legend-title">Depth to water</h2>
        </div>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls="water-table-legend-content"
          onClick={() => {
            manuallyChanged.current = true;
            setExpanded((current) => !current);
          }}
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      </div>
      {expanded ? (
        <div id="water-table-legend-content">
          <p>Held-out model estimates · metres below ground level</p>
          <h3>Depth categories</h3>
          <div className={styles.legendRows}>
            {DEPTH_CATEGORIES.map((category) => (
              <div className={styles.legendRow} key={category.key}>
                <span
                  className={styles.legendSwatch}
                  style={{ background: category.color }}
                  aria-hidden="true"
                />
                <span>{category.label}</span>
                <small>
                  {depthRangeLabel(category.minInclusive, category.maxExclusive)}
                </small>
              </div>
            ))}
          </div>
          <div className={styles.legendDivider} />
          <h3>Coverage status</h3>
          {(["measured_only", "boundary_only", "no_data", "excluded"] as const).map(
            (key) => (
              <div className={styles.legendRow} key={key}>
                <span
                  className={`${styles.legendSwatch} ${styles.coverageSwatch}`}
                  style={{ background: COVERAGE_STYLES[key].color }}
                  aria-hidden="true"
                />
                <span>{COVERAGE_STYLES[key].label}</span>
              </div>
            ),
          )}
          <p className={styles.legendNote}>
            Larger metres below ground means a deeper water level. It does not
            mean greater groundwater volume.
          </p>
        </div>
      ) : null}
    </section>
  );
}
