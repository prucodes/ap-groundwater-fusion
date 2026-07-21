import Link from "next/link";
import type { JoinedMandal } from "./types";
import { modelEstimateDisplay } from "./displaySemantics";
import styles from "./living-water-table.module.css";

function periodLabel(period: string | null | undefined): string {
  if (!period) return "Not supplied";
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function valueLabel(value: number | null | undefined): string {
  return value === null || value === undefined ? "Not available" : `${value.toFixed(2)} m bgl`;
}

export function SelectedMandalPanel({
  feature,
}: {
  feature: JoinedMandal | null;
}) {
  if (!feature) {
    return (
      <section className={styles.selectedPanel} aria-labelledby="selection-title">
        <div className={styles.eyebrow}>Mandal detail</div>
        <h2 id="selection-title">Select a boundary</h2>
        <p>
          Hover for a factual preview, or click a mandal to keep its measured and
          modelled fields visible here.
        </p>
        <div className={styles.emptySelection}>
          <span aria-hidden="true">⌁</span>
          Selection is also available from the keyboard control above the map.
        </div>
      </section>
    );
  }

  const { record } = feature;
  const coverage = record.identity.coverageStatus.replaceAll("_", " ");
  const observation = record.observation;
  const nowcast = record.nowcast;
  const estimateDisplay = modelEstimateDisplay(record);
  return (
    <section
      className={styles.selectedPanel}
      aria-labelledby="selection-title"
      aria-live="polite"
    >
      <div className={styles.panelHeading}>
        <div>
          <div className={styles.eyebrow}>Selected mandal</div>
          <h2 id="selection-title">{record.identity.mandalName}</h2>
          <p>{record.identity.districtName} District</p>
        </div>
        <span className={styles.coverageBadge}>{coverage}</span>
      </div>

      {observation ? (
        <div className={styles.detailGroup}>
          <h3>Current measured status</h3>
          <span className={styles.detailBasis}>Measured history</span>
          <strong className={styles.primaryValue}>
            {valueLabel(observation.latestMeasuredValue)}
          </strong>
          <dl className={styles.detailGrid}>
            <div>
              <dt>Latest measured aggregate</dt>
              <dd>{valueLabel(observation.latestMeasuredValue)}</dd>
            </div>
            <div>
              <dt>Observation period</dt>
              <dd>{periodLabel(observation.observationPeriod)}</dd>
            </div>
            <div>
              <dt>Observation records</dt>
              <dd>{observation.observationRecordCount.toLocaleString("en-IN")}</dd>
            </div>
            <div>
              <dt>Observation months</dt>
              <dd>{observation.uniqueObservationMonthCount.toLocaleString("en-IN")}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className={styles.noDataCallout}>
          No measured groundwater value is available for this prototype boundary.
        </div>
      )}

      {nowcast && estimateDisplay ? (
        <div className={styles.detailGroup}>
          <h3>Model comparison</h3>
          <span className={styles.detailBasis}>{estimateDisplay.label}</span>
          <strong className={styles.comparisonValue}>{valueLabel(nowcast.value)}</strong>
          <p className={styles.comparisonNote}>{estimateDisplay.explanation}</p>
          <dl className={styles.detailGrid}>
            <div>
              <dt>Model target period</dt>
              <dd>{periodLabel(nowcast.targetPeriod)}</dd>
            </div>
            <div>
              <dt>Model version</dt>
              <dd>{nowcast.modelVersion}</dd>
            </div>
            <div className={styles.fullDetail}>
              <dt>P10–P90 model quantile range</dt>
              <dd>
                {nowcast.lower.toFixed(2)}–{nowcast.upper.toFixed(2)} m bgl
              </dd>
            </div>
            <div className={styles.fullDetail}>
              <dt>Interval type</dt>
              <dd>{nowcast.intervalType.replaceAll("_", " ")}</dd>
            </div>
            {estimateDisplay.absoluteDifferenceM !== null ? (
              <>
                <div>
                  <dt>Absolute observed–model difference</dt>
                  <dd>{estimateDisplay.absoluteDifferenceM.toFixed(2)} m</dd>
                </div>
                <div>
                  <dt>Observed aggregate inside model range</dt>
                  <dd>
                    {estimateDisplay.observationInsideInterval ? "Yes" : "No"}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </div>
      ) : (
        <div className={styles.noDataCallout}>
          {record.identity.coverageStatus === "measured_only"
            ? "Measured-only record: no model estimate or model interval is published."
            : "No measured value, model estimate, model interval or forecast is published for this boundary."}
        </div>
      )}

      <div className={styles.detailGroup}>
        <h3>Quality & provenance</h3>
        <dl className={styles.detailGrid}>
          <div>
            <dt>Quality class</dt>
            <dd>{record.quality.confidenceClass.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Boundary status</dt>
            <dd>{record.identity.boundaryStatus}</dd>
          </div>
          <div className={styles.fullDetail}>
            <dt>Boundary source</dt>
            <dd>{record.identity.boundarySource.replaceAll("_", " ")}</dd>
          </div>
          <div className={styles.fullDetail}>
            <dt>Data/model status</dt>
            <dd>
              {record.identity.coverageStatus === "modelled"
                ? "Measured aggregate with held-out model comparison"
                : coverage}
            </dd>
          </div>
        </dl>
      </div>

      <p className={styles.prototypeNote}>
        Prototype boundary and research data. This view does not replace
        official field measurements or APWRIMS outputs.
      </p>

      <Link className={styles.detailLink} href={`/mandals/${record.identity.mandalId}`}>
        Open existing mandal detail <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
