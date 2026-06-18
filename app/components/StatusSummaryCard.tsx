import { statusDistribution, statusMeta } from "../lib/data";
import { StatusDonut } from "./charts";

export function StatusSummaryCard() {
  const dist = statusDistribution();
  const order = ["Normal", "Watch", "Stress", "Verify", "Low Confidence", "Insufficient Data"];
  const total = Object.values(dist).reduce((a, b) => a + b, 0);
  const slices = order.map((k) => ({
    label: k,
    value: dist[k] ?? 0,
    color: statusMeta(k).color,
  }));

  return (
    <div className="donutWrap">
      <StatusDonut slices={slices} total={total} />
      <div className="legend">
        {order.map((k) => {
          const v = dist[k] ?? 0;
          const pct = total ? Math.round((v / total) * 100) : 0;
          return (
            <div className="legendRow" key={k}>
              <span className="legendSwatch" style={{ background: statusMeta(k).color }} />
              <span className="legendName">{k}</span>
              <span className="legendCount">{v}</span>
              <span className="legendPct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
