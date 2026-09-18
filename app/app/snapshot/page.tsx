"use client";

import { PercentileBar, WetnessTag } from "../../components/Signals";
import { StatusBadge } from "../../components/Badges";
import { ExportCsvButton, PrintButton } from "../../components/ExportButtons";
import { IconDroplet, IconLeaf, IconWaves, IconShield, IconInfo } from "../../components/icons";
import {
  balanceMeta,
  dashboardSummary,
  districts,
  formatNumber,
  graceDistrictCount,
  mandals,
  prototypeNotice,
  titleCase,
  verifyMandals,
  wetnessLabel,
} from "../../lib/data";

export default function SnapshotPage() {
  const s = dashboardSummary.summary;
  const verify = verifyMandals().length;
  // Same-month change: the latest reading against the same month a year earlier.
  const yoy = mandals
    .map((m) => m.trend_m_per_yr)
    .filter((v): v is number => v !== null && v !== undefined)
    .sort((a, b) => a - b);
  const yoyDeeper = yoy.filter((v) => v > 0).length;
  const yoyMedian = yoy.length
    ? yoy.length % 2
      ? yoy[(yoy.length - 1) / 2]
      : (yoy[yoy.length / 2 - 1] + yoy[yoy.length / 2]) / 2
    : null;
  const insights = [
    `${mandals.filter((m) => m.status_bucket === "Normal").length} mandals are stable — shallower than 10 m, and no more than 0.3 m deeper than a year earlier.`,
    `${verify} mandals show stress — 20 m or more below ground, or over 1.2 m deeper than a year earlier.`,
    s.avg_groundwater_percentile === null
      ? `No NASA GRACE-DA groundwater reading was available on the latest fetch.`
      : `NASA GRACE-DA groundwater averages percentile ${Math.round(s.avg_groundwater_percentile)} across ${graceDistrictCount} districts — ${wetnessLabel(s.avg_groundwater_percentile).toLowerCase()} for this time of year.`,
    ...(s.avg_water_balance_mm !== null && s.avg_water_balance_mm !== undefined
      ? [
          `${s.deficit_mandals} mandals run an annual water deficit (TerraClimate ${s.balance_year}) — evapotranspiration exceeds rainfall over the year.`,
        ]
      : []),
    ...(yoyMedian !== null
      ? [
          `${yoyDeeper} of ${yoy.length} mandals (${Math.round((100 * yoyDeeper) / yoy.length)}%) read deeper than the same month a year earlier — median change ${yoyMedian > 0 ? "+" : ""}${formatNumber(yoyMedian)} m.`,
        ]
      : []),
  ];

  return (
    <div className="pageWrap snapshot">
      <div className="snapToolbar printHide">
        <div>
          <span className="eyebrow">Executive Snapshot</span>
          <h1 style={{ fontSize: 22, marginTop: 4 }}>Mandal Groundwater Fusion — One-Page Summary</h1>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <ExportCsvButton rows={mandals} filename="ap_groundwater_snapshot.csv" />
          <PrintButton />
        </div>
      </div>

      <section className="card snapSheet">
        {/* sheet header */}
        <div className="snapHeader">
          <div>
            <div className="snapTitle">Andhra Pradesh Groundwater &amp; Soil-Moisture Intelligence</div>
            <div className="snapSub">Executive Snapshot · GRACE-DA / NASA percentile signals + real APWRIMS readings (2014-2026)</div>
          </div>
          <div className="snapBadge">
            <IconShield />
            <span>Prototype<br />Not official</span>
          </div>
        </div>

        {/* KPI strip */}
        <div className="snapKpis">
          <div className="snapKpi"><span className="snapKpiLbl">Mandals</span><span className="snapKpiNum">{s.mandals_analyzed}</span><span className="snapKpiFoot">across {districts.length} districts</span></div>
          <div className="snapKpi"><span className="snapKpiLbl">In Stress</span><span className="snapKpiNum" style={{ color: "var(--st-verify)" }}>{verify}</span><span className="snapKpiFoot">20 m+ deep or 1.2 m+ deeper YoY</span></div>
          <div className="snapKpi"><span className="snapKpiIcon"><IconDroplet /></span><span className="snapKpiLbl">Avg GW %ile</span><span className="snapKpiNum">{formatNumber(s.avg_groundwater_percentile)}</span></div>
          <div className="snapKpi"><span className="snapKpiIcon"><IconLeaf /></span><span className="snapKpiLbl">Avg Root-Zone</span><span className="snapKpiNum">{formatNumber(s.avg_rootzone_percentile)}</span></div>
          <div className="snapKpi"><span className="snapKpiIcon"><IconWaves /></span><span className="snapKpiLbl">Avg Surface</span><span className="snapKpiNum">{formatNumber(s.avg_surface_percentile)}</span></div>
        </div>

        <div className="snapBody">
          {/* table */}
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>District</th>
                  <th>Mandal</th>
                  <th>Median mbgl</th>
                  <th>Modelled nowcast (m)</th>
                  <th>Coverage</th>
                  <th title="Year-on-year change: + deeper/worse (red), − recovering (green)">YoY</th>
                  <th>NASA GW %ile</th>
                  <th>Root-Zone</th>
                  <th>Surface</th>
                  <th>Water Balance</th>
                  <th>Assessment</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mandals.map((m, i) => (
                  <tr key={m.id}>
                    <td><span className="cellRank">{i + 1}</span></td>
                    <td>{titleCase(m.district_name)}</td>
                    <td className="cellStrong">{titleCase(m.mandal_name)}</td>
                    <td>{formatNumber(m.median_groundwater_mbgl)}</td>
                    <td>{formatNumber(m.estimate_mbgl)}</td>
                    <td>{m.coverage_status.replaceAll("_", " ")}</td>
                    <td style={{ color: (m.trend_m_per_yr ?? 0) > 0 ? "var(--rust)" : (m.trend_m_per_yr ?? 0) < 0 ? "var(--green)" : "var(--muted)", fontWeight: 600, fontSize: 11.5 }}>
                      {m.trend_m_per_yr == null ? "—" : `${m.trend_m_per_yr > 0 ? "+" : ""}${formatNumber(m.trend_m_per_yr)}`}
                    </td>
                    <td><PercentileBar value={m.groundwater_percentile} /></td>
                    <td><PercentileBar value={m.rootzone_percentile} /></td>
                    <td><PercentileBar value={m.surface_percentile} /></td>
                    <td>
                      {m.water_balance_status ? (
                        <span style={{ color: balanceMeta(m.water_balance_status).color, fontWeight: 600, fontSize: 11.5 }}>
                          {m.water_balance_status}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td><WetnessTag value={m.measured_wetness_percentile ?? null} /></td>
                    <td><StatusBadge bucket={m.status_bucket} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* insights */}
          <aside className="snapInsights">
            <h3>Key Insights</h3>
            <ul>
              {insights.map((t) => (
                <li key={t}>
                  <span className="insDot" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="snapWhy">
              <strong>Why this matters</strong>
              <p>District moisture watch, irrigation planning support, recharge monitoring, and AWARE-ready groundwater intelligence.</p>
            </div>
          </aside>
        </div>

        <div className="snapFoot">
          <IconInfo />
          <span>{prototypeNotice} Data period: {s.sample_fetch_date} (latest GRACE-DA sample). Values are percentiles (0–100), not groundwater depth.</span>
        </div>
      </section>
    </div>
  );
}
