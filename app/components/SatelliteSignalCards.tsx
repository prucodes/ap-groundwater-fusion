import { dashboardSummary, formatNumber, formatPeriod } from "../lib/data";
import { WetnessTag } from "./Signals";
import { IconCloudRain, IconDroplet, IconLeaf, IconWaves } from "./icons";

const cells = [
  {
    key: "avg_groundwater_percentile" as const,
    name: "Groundwater Percentile",
    cls: "gw",
    icon: <IconDroplet />,
    range: "min 91.59 — max 100.0",
    color: "#12b5cb",
  },
  {
    key: "avg_rootzone_percentile" as const,
    name: "Root-Zone Percentile",
    cls: "root",
    icon: <IconLeaf />,
    range: "min 72.25 — max 98.09",
    color: "#5e9b6b",
  },
  {
    key: "avg_surface_percentile" as const,
    name: "Surface Percentile",
    cls: "surface",
    icon: <IconWaves />,
    range: "min 63.26 — max 100.0",
    color: "#3f86d6",
  },
];

export function SatelliteSignalCards() {
  const s = dashboardSummary.summary;
  const rain = s.avg_rainfall_mm;
  const rainAvailable = rain !== null && rain !== undefined;
  return (
    <div className="signalGrid">
      {cells.map((c) => {
        const v = (s[c.key] as number | null) ?? 0;
        return (
          <div className="signalCell" key={c.key}>
            <span className={`signalIcon ${c.cls}`}>{c.icon}</span>
            <div className="signalName">{c.name}</div>
            <div className="signalValue">{formatNumber(s[c.key])}</div>
            <div className="signalMeter">
              <span className="signalMeterFill" style={{ width: `${v}%`, background: c.color }} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <WetnessTag value={v} />
            </div>
            <div className="signalRange">{c.range}</div>
          </div>
        );
      })}
      {rainAvailable && (
        <div className="signalCell">
          <span className="signalIcon rain">
            <IconCloudRain />
          </span>
          <div className="signalName">Rainfall (recharge)</div>
          <div className="signalValue">
            {formatNumber(rain)}
            <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}> mm</span>
          </div>
          <div className="signalMeter">
            <span className="signalMeterFill" style={{ width: `${Math.min(100, (rain ?? 0))}%`, background: "#3f86d6" }} />
          </div>
          <div style={{ marginBottom: 6, fontSize: 10.5, fontWeight: 600, color: "var(--sig-surface)" }}>
            CHIRPS · {formatPeriod(s.rainfall_period) || "recent"}
          </div>
          <div className="signalRange">monthly avg · supply signal</div>
        </div>
      )}
    </div>
  );
}
