"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeaderHero } from "../../components/HeaderHero";
import { StatusBadge } from "../../components/Badges";
import { PercentileBar } from "../../components/Signals";
import { ExportCsvButton } from "../../components/ExportButtons";
import { IconActivity, IconCheck, IconDroplet, IconGrid, IconLayers, IconMap } from "../../components/icons";
import { balanceMeta, districtRollups, formatNumber, mandals, statusMeta, titleCase } from "../../lib/data";
import { AiBrief } from "../../components/AiBrief";
import { DistrictMap } from "../../components/DistrictMap";

export default function DistrictsPage() {
  const router = useRouter();
  const rollups = districtRollups();
  const [selected, setSelected] = useState(rollups[0]?.district_name);
  const current = rollups.find((r) => r.district_name === selected) ?? rollups[0];

  // colour every district by its worst stress status for the map
  const stressColors: Record<string, string> = {};
  for (const r of rollups) stressColors[r.district_name] = statusMeta(r.worst_bucket).color;
  // govt-style levels table: deepest / most-stressed first
  const levelRows = [...rollups].sort((a, b) => (b.avg_estimate_mbgl ?? 0) - (a.avg_estimate_mbgl ?? 0));

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Districts — Groundwater Levels & Stress"
        subtitle={
          <>All 28 districts, estimated groundwater <strong>level in metres</strong> (modelled β, calibrated to APWRIMS) with year-on-year change and stress. Select a district to drill down.</>
        }
        showChips={false}
      />

      <div className="overviewGrid">
        <section className="card mapCard">
          <div className="cardHead">
            <div className="cardTitle"><span className="titleIcon"><IconMap /></span>District Stress Map</div>
            <span className="cardSub">coloured by worst mandal status</span>
          </div>
          <DistrictMap layer="gw_percentile" height={420} colorOverride={stressColors} />
        </section>

        <section className="card">
          <div className="cardHead">
            <div className="cardTitle"><span className="titleIcon"><IconDroplet /></span>District Levels — as on May 2026 (β)</div>
            <span className="cardSub">m below ground</span>
          </div>
          <div className="tableWrap" style={{ maxHeight: 420, overflowY: "auto" }}>
            <table className="dataTable">
              <thead>
                <tr><th>District</th><th className="num">Est. Level</th><th className="num">YoY</th><th className="num">Stress</th><th>Status</th></tr>
              </thead>
              <tbody>
                {levelRows.map((r) => {
                  const t = r.avg_trend_m_per_yr ?? 0;
                  const tcol = t > 0.1 ? "var(--rust)" : t < -0.1 ? "var(--green)" : "var(--muted)";
                  return (
                    <tr key={r.district_name} onClick={() => setSelected(r.district_name)} style={{ cursor: "pointer" }}>
                      <td className="cellStrong">{titleCase(r.district_name)}</td>
                      <td className="num"><strong>{formatNumber(r.avg_estimate_mbgl)}</strong> m</td>
                      <td className="num" style={{ color: tcol, whiteSpace: "nowrap" }}>
                        {t > 0.1 ? "↓" : t < -0.1 ? "↑" : "≈"} {formatNumber(Math.abs(t))}
                      </td>
                      <td className="num" style={{ color: r.stress_count ? "var(--rust)" : "var(--muted)" }}>{r.stress_count}</td>
                      <td><StatusBadge bucket={r.worst_bucket} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconActivity /></span>
            AI Briefing &amp; Q&amp;A
            <span className="cardSub" style={{ marginLeft: 6 }}>grounded in the fused data</span>
          </div>
        </div>
        <AiBrief district={selected} onDistrictChange={setSelected} />
      </section>

      <div className="reportGrid">
        {rollups.map((r) => {
          const meta = statusMeta(r.worst_bucket);
          const active = r.district_name === selected;
          return (
            <button
              key={r.district_name}
              className="card reportCard districtCard"
              style={{ textAlign: "left", cursor: "pointer", borderColor: active ? meta.color : undefined }}
              onClick={() => setSelected(r.district_name)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="reportIcon" style={{ color: meta.color, background: `${meta.color}1f` }}>
                  <IconGrid />
                </span>
                <StatusBadge bucket={r.worst_bucket} />
              </div>
              <h4 style={{ marginBottom: 6 }}>{titleCase(r.district_name)}</h4>
              <span className="basisTag full" style={{ alignSelf: "flex-start", marginBottom: 8 }}>
                sat + sensor
              </span>
              <div className="districtStats">
                <div>
                  <span className="dStatNum">{r.mandal_count}</span>
                  <span className="dStatLbl">mandals</span>
                </div>
                <div>
                  <span className="dStatNum" style={{ color: r.stress_count ? "var(--rust)" : "var(--ink)" }}>
                    {r.stress_count}
                  </span>
                  <span className="dStatLbl">in stress</span>
                </div>
                <div>
                  <span className="dStatNum">{formatNumber(r.avg_estimate_mbgl)}<small> m</small></span>
                  <span className="dStatLbl">avg level</span>
                </div>
                {r.avg_water_balance_mm !== null && (
                  <div>
                    <span
                      className="dStatNum"
                      style={{ color: r.deficit_count > 0 ? "var(--st-verify)" : "var(--st-normal)" }}
                    >
                      {r.avg_water_balance_mm > 0 ? "+" : ""}
                      {formatNumber(r.avg_water_balance_mm)}
                    </span>
                    <span className="dStatLbl">avg balance mm</span>
                  </div>
                )}
              </div>
              <div style={{ marginTop: 4 }}>
                <PercentileBar value={r.avg_groundwater_percentile} />
              </div>
            </button>
          );
        })}
      </div>

      {current && (
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon">
                <IconLayers />
              </span>
              {titleCase(current.district_name)} District · {current.seed_count} of {current.mandal_count} mandals modelled
            </div>
            <ExportCsvButton
              rows={current.mandals}
              filename={`ap_${current.district_name.toLowerCase()}_mandals.csv`}
            />
          </div>

          <div className="kpiRow" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
            <div className="kpiCard" style={{ ["--accent" as string]: "var(--teal)" }}>
              <div className="kpiTop"><span className="kpiIcon"><IconLayers /></span><span className="kpiLabel">Mandals</span></div>
              <div className="kpiValue">{current.mandal_count}</div>
            </div>
            <div className="kpiCard" style={{ ["--accent" as string]: "var(--rust)" }}>
              <div className="kpiTop"><span className="kpiIcon"><IconActivity /></span><span className="kpiLabel">In Stress</span></div>
              <div className="kpiValue">{current.stress_count}</div>
            </div>
            <div className="kpiCard" style={{ ["--accent" as string]: "var(--green)" }}>
              <div className="kpiTop"><span className="kpiIcon"><IconCheck /></span><span className="kpiLabel">Stable</span></div>
              <div className="kpiValue">{current.normal_count}</div>
            </div>
            <div className="kpiCard" style={{ ["--accent" as string]: "var(--cyan)" }}>
              <div className="kpiTop"><span className="kpiIcon"><IconDroplet /></span><span className="kpiLabel">Avg Level (m)</span></div>
              <div className="kpiValue">{formatNumber(current.avg_estimate_mbgl)}</div>
            </div>
          </div>

          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>Mandal</th>
                  <th>Measured (median)</th>
                  <th>Est. Level β</th>
                  <th>Vs Normal</th>
                  <th>Root-Zone</th>
                  <th>Water Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {current.mandals.map((m) => (
                  <tr key={m.id} onClick={() => router.push(`/mandals/${m.id}`)}>
                    <td className="cellStrong">{titleCase(m.mandal_name)}</td>
                    <td>{formatNumber(m.median_groundwater_mbgl)} <small style={{ color: "var(--muted-2)" }}>mbgl</small></td>
                    <td><strong>{formatNumber(m.estimate_mbgl)}</strong> <small style={{ color: "var(--muted-2)" }}>m</small></td>
                    <td><PercentileBar value={m.groundwater_percentile} /></td>
                    <td><PercentileBar value={m.rootzone_percentile} /></td>
                    <td>
                      {m.water_balance_status ? (
                        <span style={{ color: balanceMeta(m.water_balance_status).color, fontWeight: 600, fontSize: 11.5 }}>
                          {m.water_balance_status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td><StatusBadge bucket={m.status_bucket} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="footNote">
        <strong>Prototype roll-up</strong>
        <span className="dotsep" />
        Aggregated from real APWRIMS readings (2014-2026) + NASA satellite-model percentiles
        <span className="dotsep" />
        Not official until APWRIMS export &amp; official boundaries
      </div>
    </div>
  );
}
