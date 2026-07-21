import { IconArrowRight, IconDroplet, IconFlow, IconSatellite, IconShield, IconTarget } from "./icons";

const nodes = [
  {
    title: "Measured Input · APWRIMS",
    desc: "Real APWRIMS mandal readings (mbgl), 2014-2026.",
    icon: <IconDroplet />,
    bg: "linear-gradient(145deg, #1f8a8a, #146b6b)",
  },
  {
    title: "NASA Satellite-Model Signals",
    desc: "Real NASA/NDMC GRACE-DA percentiles (0–100). Not groundwater depth.",
    icon: <IconSatellite />,
    bg: "linear-gradient(145deg, #16c6dd, #0f8fa8)",
  },
  {
    title: "Fusion Engine",
    desc: "Uses lagged APWRIMS-format history with climate and terrain features to create an eligible current-period nowcast.",
    icon: <IconFlow />,
    bg: "linear-gradient(145deg, #3f86d6, #2a5f9e)",
  },
  {
    title: "Quality & Evaluation Cohort",
    desc: "History length, missing features and model quantile width produce a qualitative completeness class—not an accuracy score.",
    icon: <IconTarget />,
    bg: "linear-gradient(145deg, #5e9b6b, #467553)",
  },
  {
    title: "Monitoring Output",
    desc: "Prototype monitor, review or field-verification categories; no permit or pumping order.",
    icon: <IconShield />,
    bg: "linear-gradient(145deg, #d79b2e, #b07c1f)",
  },
];

export function MethodologyFlow() {
  return (
    <div className="methodFlow">
      {nodes.map((n, i) => (
        <div key={n.title} style={{ display: "contents" }}>
          <div className="methodNode" style={{ background: n.bg }}>
            <div className="mIcon">{n.icon}</div>
            <h4>{n.title}</h4>
            <p>{n.desc}</p>
          </div>
          {i < nodes.length - 1 && (
            <span className="methodArrow">
              <IconArrowRight />
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
