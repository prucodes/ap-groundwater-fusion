// Rendered on-demand: this page builds district maps from the large geometry
// datasets; on-demand SSR keeps it out of the build-time static generation pass.
export const dynamic = "force-dynamic";

import { HeaderHero } from "../../components/HeaderHero";
import { DistrictMap } from "../../components/DistrictMap";
import {
  IconArrowRight,
  IconCheck,
  IconDatabase,
  IconDroplet,
  IconInfo,
  IconLeaf,
  IconMap,
  IconShield,
} from "../../components/icons";
import { formatNumber } from "../../lib/data";
import { IrrigationExports } from "../../components/IrrigationExports";
import {
  ACTION_META,
  AWARE_FIELD_MAP,
  awarePayload,
  districtAdvisories,
  type IrrigationAction,
} from "../../lib/irrigation";

export default function IrrigationPage() {
  const advisories = districtAdvisories();
  const counts: Record<IrrigationAction, number> = { Monitor: 0, Review: 0, "Field verify": 0 };
  advisories.forEach((a) => { counts[a.action]++; });
  const verifyCount = advisories.filter((a) => a.verifyFirst).length;
  const payload = awarePayload().slice(0, 3);
  const advisoryColors = Object.fromEntries(advisories.map((a) => [a.id, ACTION_META[a.action].color]));

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Groundwater Monitoring & AWARE Preview"
        subtitle={
          <>
            Prototype district monitoring categories and an unreleased <strong>AWARE</strong> payload preview. No category
            authorizes pumping, restrictions or field orders.
          </>
        }
        showChips={false}
        variant="compact"
      />

      <IrrigationExports />

      <div className="srcStrip">
        <span className="srcLabel">Derived from</span>
        <span className="srcChip"><span className="srcDot" style={{ background: "#12b5cb" }} /> NASA GRACE-DA · storage %ile</span>
        <span className="srcChip"><span className="srcDot" style={{ background: "#5e9b6b" }} /> TerraClimate · water balance</span>
        <span className="srcChip"><span className="srcDot" style={{ background: "#d79b2e" }} /> APWRIMS-format observations</span>
        <span className="srcChip muted">Rule-based triage · prototype</span>
      </div>

      {/* Action summary */}
      <div className="actionSummary">
        {(["Monitor", "Review", "Field verify"] as IrrigationAction[]).map((k) => (
          <div key={k} className="actionCard" style={{ ["--ac" as string]: ACTION_META[k].color }}>
            <div className="actionCardTop">
              <span className="actionDot" />
              <span className="actionCount">{counts[k]}</span>
            </div>
            <div className="actionName">{ACTION_META[k].label}</div>
            <div className="actionGloss">{ACTION_META[k].gloss}</div>
          </div>
        ))}
      </div>

      {/* Monitoring map */}
      <section className="card mapCard">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconMap /></span>District monitoring map</div>
          <span className="cardSub">monitor / review / field verify</span>
        </div>
        <DistrictMap layer="water_balance_mm" height={430} colorOverride={advisoryColors} />
        <div className="mixLegend" style={{ marginTop: 12 }}>
          {(["Monitor", "Review", "Field verify"] as IrrigationAction[]).map((k) => (
            <span key={k} className="mixKey">
              <span className="mixDot" style={{ background: ACTION_META[k].color }} />
              {ACTION_META[k].label} · <b>{counts[k]}</b>
            </span>
          ))}
        </div>
        <div className="fusionNote" style={{ marginTop: 12 }}>
          <IconInfo />
          <span>
            Categories reflect available groundwater depth and measured trend. Climate and GRACE-DA signals remain
            contextual and do not determine an operational groundwater action.
          </span>
        </div>
      </section>

      {/* Advisory table */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconLeaf /></span>District monitoring categories</div>
          <span className="cardSub">{verifyCount > 0 ? `${verifyCount} flagged for field-verify first` : "ranked: conserve → draw"}</span>
        </div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr><th>District</th><th>Advisory</th><th title="Next-season direction from year-on-year trend">Outlook</th><th>Basis</th><th>GW %ile</th><th>Balance</th><th>Why</th></tr>
            </thead>
            <tbody>
              {advisories.map((a) => {
                const m = ACTION_META[a.action];
                return (
                  <tr key={a.district}>
                    <td className="cellStrong">
                      {a.district}
                      {a.verifyFirst && <span className="verifyPill">verify first</span>}
                    </td>
                    <td><span className="wetTag" style={{ color: m.color, background: `${m.color}1f` }}>{m.label}</span></td>
                    <td style={{ color: a.outlook === "deepening" ? "var(--rust)" : a.outlook === "recovering" ? "var(--green)" : "var(--muted)", fontWeight: 600, fontSize: 12 }}>
                      {a.outlook === "deepening" ? "↓ deepening" : a.outlook === "recovering" ? "↑ recovering" : "→ stable"}
                      {a.trend !== null ? <small style={{ opacity: 0.7 }}> {a.trend > 0 ? "+" : ""}{a.trend}</small> : null}
                    </td>
                    <td>
                      <span className={`basisTag ${a.hasSensor ? "full" : "satonly"}`}>
                        {a.hasSensor ? "groundwater history + context" : "context only"}
                      </span>
                    </td>
                    <td className="cellPct">{a.gw ?? "—"}</td>
                    <td className="cellPct" style={{ color: a.balanceStatus === "Deficit" ? "#c65a46" : "var(--text)" }}>
                      {a.balance !== null ? `${a.balance > 0 ? "+" : ""}${formatNumber(a.balance)} mm` : "—"}
                    </td>
                    <td className="cellMuted">{a.reason}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconInfo />
          <span>
            Prototype monitoring classification based on available groundwater depth and measured trend. GRACE-DA and
            climate balance are supporting context only and cannot generate a pumping recommendation. Context-only areas
            are marked for field verification. This unreleased preview requires the official AWARE schema and official
            APWRIMS/field verification before operational use.
          </span>
        </div>
      </section>

      {/* AWARE Bridge */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconDatabase /></span>AWARE Bridge</div>
          <span className="awareStatus pending"><span className="awareStatusDot" /> Unreleased preview · official schema required</span>
        </div>

        <div className="awareSteps">
          <div className="awareStep done"><IconCheck /> Signals fused</div>
          <IconArrowRight />
          <div className="awareStep done"><IconCheck /> Monitoring category generated</div>
          <IconArrowRight />
          <div className="awareStep pending"><IconShield /> Draft payload only</div>
          <IconArrowRight />
          <div className="awareStep pending"><IconShield /> Not released to AWARE</div>
        </div>

        <div className="awareGrid">
          <div>
            <h4 className="awareSub">Field mapping</h4>
            <div className="tableWrap">
              <table className="dataTable compact">
                <thead><tr><th>Our field</th><th>AWARE field</th><th>Note</th></tr></thead>
                <tbody>
                  {AWARE_FIELD_MAP.map((f) => (
                    <tr key={f.ours}>
                      <td><code className="provHash">{f.ours}</code></td>
                      <td><code className="provHash">{f.aware}</code></td>
                      <td className="cellMuted">{f.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h4 className="awareSub">Payload preview <span className="awareSubDim">(first 3 districts)</span></h4>
            <pre className="codeBlock">{JSON.stringify(payload, null, 2)}</pre>
          </div>
        </div>

        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconDroplet />
          <span>
            Everything up to the push is built: the advisory payload is shaped and ready. Going live needs RTGS to provide
            the <strong>AWARE endpoint + exact schema</strong>; we then map the fields above and stream advisories on each
            data refresh. See the AWARE integration note in <strong>Reports</strong>.
          </span>
        </div>
      </section>
    </div>
  );
}
