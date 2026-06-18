"use client";

import { useRouter } from "next/navigation";
import { HeaderHero } from "../../components/HeaderHero";
import { IconActivity, IconAlert, IconArrowRight, IconCheck, IconInfo, IconShield } from "../../components/icons";
import { computeAlerts, MAX_ALERT_SCORE, SEVERITY_META, severityCounts, type Severity } from "../../lib/alerts";
import { formatNumber, titleCase } from "../../lib/data";

const SUMMARY: { sev: Severity; icon: React.ReactNode; meta: string }[] = [
  { sev: "Critical", icon: <IconAlert />, meta: "act now" },
  { sev: "High", icon: <IconActivity />, meta: "schedule review" },
  { sev: "Watch", icon: <IconShield />, meta: "monitor" },
  { sev: "Normal", icon: <IconCheck />, meta: "within range" },
];

export default function AlertsPage() {
  const router = useRouter();
  const alerts = computeAlerts();
  const counts = severityCounts();
  const actionable = alerts.filter((a) => a.severity !== "Normal");

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Early-Warning Console"
        subtitle={
          <>
            Transparent severity ranking where independent risk signals coincide — deep readings, sensor–satellite
            disagreement, water deficit and low confidence. Auditable, not a black box.
          </>
        }
        showChips={false}
      />

      <div className="summaryRow stagger">
        {SUMMARY.map((s) => {
          const meta = SEVERITY_META[s.sev];
          return (
            <div className={`summaryCard ${s.sev === "Critical" ? "accent" : ""}`} key={s.sev}>
              <span className="summaryIcon" style={{ background: `${meta.color}1f`, color: meta.color }}>
                {s.icon}
              </span>
              <div className="summaryNum" style={{ color: s.sev === "Normal" ? undefined : meta.color }}>
                {counts[s.sev]}
              </div>
              <div className="summaryLbl">{meta.label}</div>
              <div className="summaryMeta">{s.meta}</div>
            </div>
          );
        })}
      </div>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon">
              <IconAlert />
            </span>
            Prioritised Alerts
            <span className="cardSub" style={{ marginLeft: 6 }}>
              {actionable.length} mandals need attention
            </span>
          </div>
        </div>

        <div className="alertConsole">
          {actionable.map((a) => {
            const meta = SEVERITY_META[a.severity];
            return (
              <button
                key={a.mandal.id}
                className="alertCard"
                style={{ ["--sev" as string]: meta.color }}
                onClick={() => router.push(`/mandals/${a.mandal.id}`)}
              >
                <div className="alertCardLeft">
                  <span className="alertSev" style={{ color: meta.color, background: `${meta.color}1f` }}>
                    {meta.label}
                  </span>
                  <div className="alertScoreRing">
                    <span className="alertScoreNum">{a.score}</span>
                    <span className="alertScoreMax">/{MAX_ALERT_SCORE}</span>
                  </div>
                </div>

                <div className="alertCardMain">
                  <div className="alertCardTitle">
                    {titleCase(a.mandal.mandal_name)}
                    <span className="alertCardDistrict">{titleCase(a.mandal.district_name)} District</span>
                  </div>
                  <div className="alertFactors">
                    {a.factors.map((f) => (
                      <span className="alertFactor" key={f.label}>
                        {f.label}
                        <span className="alertFactorW">+{f.weight}</span>
                      </span>
                    ))}
                  </div>
                  <div className="alertAction">
                    <IconArrowRight /> {a.leadAction}
                  </div>
                </div>

                <div className="alertCardStats">
                  <div>
                    <span className="acsNum">{formatNumber(a.mandal.median_groundwater_mbgl)}</span>
                    <span className="acsLbl">mbgl (APWRIMS)</span>
                  </div>
                  <div>
                    <span className="acsNum">{formatNumber(a.mandal.groundwater_percentile)}</span>
                    <span className="acsLbl">NASA %ile</span>
                  </div>
                  <div>
                    <span className="acsNum" style={{ color: meta.color }}>
                      {a.mandal.water_balance_mm !== null ? `${a.mandal.water_balance_mm > 0 ? "+" : ""}${formatNumber(a.mandal.water_balance_mm)}` : "—"}
                    </span>
                    <span className="acsLbl">balance mm</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="fusionNote" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>
            <strong>How severity is scored:</strong> deep groundwater (+3), sensor–satellite disagreement (+2), annual
            water deficit (+2), moderately deep / partial agreement / tight balance / low confidence (+1 each).
            Critical ≥ 6, High 4–5, Watch 1–3. Prototype triage over APWRIMS + real satellite signals — confirm with
            official APWRIMS data before action.
          </span>
        </div>
      </section>
    </div>
  );
}
