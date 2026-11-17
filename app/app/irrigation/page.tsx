// Rendered on-demand: this page builds district maps from the large geometry
// datasets; on-demand SSR keeps it out of the build-time static generation pass.
export const dynamic = "force-dynamic";

import type { CSSProperties } from "react";
import { HeaderHero } from "../../components/HeaderHero";
import { DistrictChoropleth } from "../../components/DistrictChoropleth";
import { RankList } from "../../components/RankList";
import { IconArrowRight, IconCheck, IconMap, IconShield } from "../../components/icons";
import { formatNumber } from "../../lib/data";
import { IrrigationExports } from "../../components/IrrigationExports";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { ACTION_META, AWARE_FIELD_MAP, awarePayload, districtAdvisories, type IrrigationAction } from "../../lib/irrigation";
import { brief } from "../../lib/pageBriefs";
import shared from "../rabi/Rabi.module.css";

/* A preview of the monitoring categories the State's AWARE system could take: every district
   placed comparatively as monitor, review its history, or verify in the field, with the draft
   export beside it. Nothing here is sent to AWARE, and none of it authorizes pumping,
   restrictions or orders. The page leads with the count and where the field checks are. */

const ORDER: IrrigationAction[] = ["Field verify", "Review", "Monitor"];

export default function IrrigationPage() {
  const advisories = districtAdvisories();
  const counts: Record<IrrigationAction, number> = { Monitor: 0, Review: 0, "Field verify": 0 };
  advisories.forEach((a) => { counts[a.action]++; });
  const verifyCount = advisories.filter((a) => a.verifyFirst).length;
  const deepening = advisories.filter(a => a.outlook === "deepening").length;
  const payload = awarePayload().slice(0, 3);
  const advisoryColors = Object.fromEntries(advisories.map((a) => [a.id, ACTION_META[a.action].color]));
  // The bar is read against the worst district, not against an absolute ceiling:
  // the whole point of the score is that it is comparative.
  const maxScore = Math.max(1, ...advisories.map((a) => a.priorityScore));
  // Two kinds of first: districts whose readings are too few or inconsistent to rank (verify before anything
  // else, sized by the mandals to visit), and the ranked districts furthest above the statewide norm.
  const verifyFirst = advisories.filter(a => a.verifyFirst).sort((a, b) => b.verifyMandals - a.verifyMandals);
  const mostVisits = Math.max(1, ...verifyFirst.map(a => a.verifyMandals));
  const aboveNorm = advisories.filter(a => !a.verifyFirst && a.priorityScore > 0).sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 5);

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero
        title="Groundwater Monitoring & AWARE Preview"
        brief={brief("/irrigation", <>{counts["Field verify"]} districts flagged to verify in the field and {counts.Review} for review; none of it authorizes pumping, restrictions or orders.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={shared.hero} aria-label="Monitoring categories in figures" data-testid="aware-summary">
        <div className={shared.heroText}>
          <span className={shared.kicker}>A preview for AWARE · comparative, not a clearance</span>
          <h2><b>{counts["Field verify"]} districts</b> to verify in the field, <b>{counts.Review}</b> to review their measured history, and <b>{counts.Monitor}</b> to keep monitoring. A district below the line is not safe, only nearer the middle.</h2>
          <p>Placed by how far each sits above the statewide figure for stressed mandals, deepening trend and this season&rsquo;s measured recharge. Rain, soil, reservoirs and GRACE are context only and never set a category. Nothing on this page is sent to AWARE.</p>
        </div>
        <ul className={shared.tiles}>
          {ORDER.map(k => <li key={k}><span>{ACTION_META[k].label}</span><b data-tone={k === "Field verify" ? "bad" : undefined}>{counts[k]}<small> of {advisories.length}</small></b><em>{ACTION_META[k].gloss}</em></li>)}
          <li><span>Deepening indicator</span><b data-tone={deepening > advisories.length / 2 ? "bad" : undefined}>{deepening}<small> of {advisories.length}</small></b><em>statewide median measured change {formatNumber(advisories[0]?.stateMedianTrend)} m a year</em></li>
        </ul>
      </section>

      <IrrigationExports />
      <WatchEvidenceStatus />

      <section className={shared.block} aria-labelledby="aware-where">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconMap /> Monitor · review · verify</span>
          <h2 id="aware-where">Where to look first</h2>
          <p>{verifyCount > 0 ? <><b>{verifyCount}</b> districts are flagged to verify first: too few or inconsistent readings to rank them on the record alone. </> : null}Seasonal source-series counts and their baseline remain provisional; a category is not an approved intervention tier.</p>
        </header>
        <div className={shared.soilGrid}>
          <div>
            <DistrictChoropleth layer="water_balance_mm" colorOverride={advisoryColors} overrideLabel={Object.fromEntries(advisories.map(a => [a.id, ACTION_META[a.action].label]))} testId="aware-district-map" label="Districts coloured by monitoring category: monitor, review history or field verify" />
            <div className="mixLegend" style={{ marginTop: 12 }}>
              {ORDER.map(k => <span key={k} className="mixKey"><span className="mixDot" style={{ background: ACTION_META[k].color }} />{ACTION_META[k].label} · <b>{counts[k]}</b></span>)}
            </div>
          </div>
          <div className={shared.soilSide}>
            {verifyFirst.length ? <RankList title="Verify first" rows={verifyFirst.map(a => ({ name: a.district, value: a.verifyMandals ? `${a.verifyMandals} mandals` : "no readings", share: (100 * a.verifyMandals) / mostVisits, color: ACTION_META["Field verify"].color,
              note: "too few or inconsistent readings to rank" }))} /> : null}
            {aboveNorm.length ? <RankList title="Furthest above the statewide norm" rows={aboveNorm.map(a => ({ name: a.district, value: a.priorityScore.toFixed(1), share: (100 * a.priorityScore) / maxScore, color: ACTION_META[a.action].color,
              note: `${ACTION_META[a.action].label}${a.outlook === "deepening" ? " · deepening" : ""}` }))}
              foot="Priority is how far a district sits above the statewide norm, read against the district furthest above it: a ranking, not a measure of harm." /> : null}
          </div>
        </div>
      </section>

      <details className="foldMore">
        <summary><span>All {advisories.length} districts, with the reason for each</span><span>Category, priority, direction, basis and this season</span></summary>
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr><th>District</th><th>Advisory</th><th title="How far above the statewide norm on stressed mandals, deepening trend and this season's recharge">Priority</th><th title="Measured year-on-year direction. Every district is deepening at present; the figure beside it is this district's median mandal.">Outlook</th><th>Basis</th><th>GW %ile</th><th>Balance</th><th title="AP DES gauge rain against normal since 1 June, and district reservoir storage against a year ago (APWRIMS). Context only: it does not move the category.">This season</th><th>Why</th></tr>
            </thead>
            <tbody>
              {advisories.map((a) => {
                const m = ACTION_META[a.action];
                return (
                  <tr key={a.district}>
                    <td className="cellStrong">
                      {a.district}
                      {a.verifyFirst ? (
                        <span className="verifyPill">verify first</span>
                      ) : a.verifyMandals > 0 ? (
                        <span className="verifyCountPill">{a.verifyMandals} to verify</span>
                      ) : null}
                    </td>
                    <td><span className="wetTag toneText" style={{ "--tone": m.color, background: `${m.color}1f` } as CSSProperties}>{m.label}</span></td>
                    <td className="cellPct">
                      <span className="priorityBar" aria-hidden="true">
                        <span
                          className="priorityBarFill"
                          style={{ width: `${Math.min(100, (a.priorityScore / maxScore) * 100)}%`, background: m.color }}
                        />
                      </span>
                      <small style={{ opacity: 0.75 }}>{a.priorityScore.toFixed(1)}</small>
                    </td>
                    <td style={{ color: a.outlook === "deepening" ? "var(--rust)" : a.outlook === "recovering" ? "var(--green)" : "var(--muted)", fontWeight: 600, fontSize: 12 }}>
                      {a.outlook === "deepening" ? "↓ deepening" : a.outlook === "recovering" ? "↑ recovering" : "→ stable"}
                      {a.trend !== null ? <small style={{ opacity: 0.7 }}> {a.trend > 0 ? "+" : ""}{a.trend}</small> : null}
                    </td>
                    <td>
                      <span className={`basisTag ${a.hasSensor ? "full" : "satonly"}`}>
                        {a.hasSensor ? "groundwater history + context" : "context only"}
                      </span>
                    </td>
                    <td className="cellPct">{a.gw ?? "–"}</td>
                    <td className="cellPct" style={{ color: a.balanceStatus === "Deficit" ? "#c65a46" : "var(--text)" }}>
                      {a.balance !== null ? `${a.balance > 0 ? "+" : ""}${formatNumber(a.balance)} mm` : "–"}
                    </td>
                    <td className="cellPct" style={{ whiteSpace: "nowrap" }}>
                      {a.season?.rainDeviationPct !== null && a.season?.rainDeviationPct !== undefined
                        ? <span style={{ color: a.season.rainDeviationPct <= -20 ? "#c65a46" : "var(--text)" }}>{a.season.rainDeviationPct > 0 ? "+" : ""}{formatNumber(a.season.rainDeviationPct)}% rain</span>
                        : "–"}
                      {a.season?.reservoirStoragePct !== null && a.season?.reservoirStoragePct !== undefined
                        ? <small style={{ display: "block", opacity: 0.75 }}>dams {formatNumber(a.season.reservoirStoragePct)}% · {formatNumber(a.season.reservoirLastYearPct)}% last yr</small>
                        : null}
                    </td>
                    <td className="cellMuted">
                      <span className="advisoryWhy" title={a.reason}>
                        {a.reason}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="cardNote">Prototype monitoring categories from groundwater depth and measured trend. GRACE-DA and climate balance are context only and cannot produce a pumping recommendation; context-only areas are marked to verify in the field. This unreleased preview needs the official AWARE schema and official APWRIMS and field verification before any operational use.</p>
      </details>

      <details className="foldMore">
        <summary><span>The AWARE bridge</span><span>How the fields map, and the draft payload for the first three districts</span></summary>
        <p className="cardNote"><span className="awareStatus pending"><span className="awareStatusDot" /> Unreleased preview · official schema required</span></p>
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

        <p className="cardNote"><strong>Draft payload only.</strong> Operational integration also needs authorized feeds, an approved schema, baseline validation, departmental sign-off, access controls, delivery receipts and failure handling. Nothing on this page is sent to AWARE.</p>
      </details>
    </div>
  );
}
