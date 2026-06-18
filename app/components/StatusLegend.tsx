import { statusMeta } from "../lib/data";

const STATUSES: { bucket: string; def: string; criteria: string }[] = [
  {
    bucket: "Stress",
    def: "Deep or fast-declining water table — act first",
    criteria: "≥15 m below ground & satellite agrees (dry), or fast-falling trend",
  },
  {
    bucket: "Watch",
    def: "Moderate decline, rainfall deficit, or deepening",
    criteria: "6–15 m below ground, monitor signal",
  },
  {
    bucket: "Normal",
    def: "Shallow / stable — routine monitoring",
    criteria: "≤6 m below ground, stable or recovering",
  },
  {
    bucket: "Verify",
    def: "Sensor reading diverges from the model — field-check before acting",
    criteria: "Latest sensor vs model estimate gap ≥ 8 m",
  },
  {
    bucket: "Low Confidence",
    def: "Sparse sensor history — collect more readings",
    criteria: "<2 stations, or no reading in the last 90 days",
  },
];

const SIGNALS: { color: string; label: string; def: string }[] = [
  { color: "#c65a46", label: "Pumping-pressure (verify)", def: "Falling despite a healthy water balance — hypothesis, confirm in field" },
  { color: "#d79b2e", label: "Climate-stress (verify)", def: "Falling alongside a rainfall deficit — climate-stress hypothesis, confirm in field" },
  { color: "#5e9b6b", label: "Stable / recovering", def: "Water table holding or rising" },
];

export function StatusLegend() {
  return (
    <div className="statusLegend">
      <div className="slGroup">
        <div className="slTitle">Status — groundwater stress</div>
        <div className="slItems">
          {STATUSES.map((s) => {
            const m = statusMeta(s.bucket);
            return (
              <div className="slItem" key={s.bucket}>
                <span className="slDot" style={{ background: m.color }} />
                <span className="slLabel">{m.label}</span>
                <span className="slDef">
                  {s.def}
                  <span className="slCriteria">{s.criteria}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="slGroup">
        <div className="slTitle">Signal — why it&apos;s declining</div>
        <div className="slItems">
          {SIGNALS.map((s) => (
            <div className="slItem" key={s.label}>
              <span className="slDot" style={{ background: s.color }} />
              <span className="slLabel">{s.label}</span>
              <span className="slDef">{s.def}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="slNote">
        Grey mandals have no estimate yet (insufficient / unmatched APWRIMS history). Levels are modelled (β) — see Estimated Levels.
      </div>
    </div>
  );
}
