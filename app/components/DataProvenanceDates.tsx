import { datasetManifest, formatPeriod } from "../lib/data";

export function DataProvenanceDates({ compact = false }: { compact?: boolean }) {
  const periods = datasetManifest.periods;
  const items = [
    ["Observation period", formatPeriod(periods.latestObservationPeriod) || "not supplied"],
    ["Model target", formatPeriod(periods.modelTargetPeriodRange.end) || "not supplied"],
    ["GRACE-DA fetch", periods.graceFetchDate || "not supplied"],
    ["GRACE-DA valid month", formatPeriod(periods.graceValidPeriod) || "not supplied"],
    ["Rainfall valid period", formatPeriod(periods.rainfallValidPeriod) || "not supplied"],
    ["ET reference period", formatPeriod(periods.etValidPeriod) || "not supplied"],
  ];
  if (compact) {
    return (
      <span className="muted">
        Observation {items[0][1]} · model target {items[1][1]} · GRACE fetch {items[2][1]}
      </span>
    );
  }
  return (
    <div className="provRibbon" aria-label="Source-specific data dates">
      {items.map(([label, value], index) => (
        <span key={label} style={{ display: "contents" }}>
          {index > 0 ? <span className="provRibbonDot" /> : null}
          <span className="provRibbonItem">
            <strong>{label}:</strong> {value}
          </span>
        </span>
      ))}
    </div>
  );
}
