"use client";

import { PercentileBar, WetnessTag } from "../../components/Signals";
import { StatusBadge } from "../../components/Badges";
import { ExportCsvButton, PrintButton } from "../../components/ExportButtons";
import { IconDroplet, IconLeaf, IconWaves, IconShield, IconInfo } from "../../components/icons";
import {
  balanceMeta,
  dashboardSummary,
  datasetManifest,
  districts,
  formatNumber,
  graceDistrictCount,
  mandals,
  monsoonWatch,
  prototypeNotice,
  titleCase,
  verifyMandals,
  wetnessLabel,
} from "../../lib/data";
import { waterSummary } from "../../lib/waterSummary";
import { PageBriefBand } from "../../components/PageBrief";
import { brief } from "../../lib/pageBriefs";
import Link from "next/link";

const pct = (value: number | null | undefined) =>
  value === null || value === undefined ? "n/a" : `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${Math.abs(value).toFixed(1)}%`;

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
          `${s.deficit_mandals} prototype units carry the low climate-balance category (TerraClimate ${s.balance_year}); this is not measured aquifer depletion.`,
        ]
      : []),
    // This water year, beside the groundwater: dated, sourced, and context only.
    ...(waterSummary.rain
      ? [`Rain gauges, ${waterSummary.rain.start} to ${waterSummary.rain.end}: ${pct(waterSummary.rain.deviationPct)} against the department's normal (area-weighted); ${waterSummary.rain.categories.deficient + waterSummary.rain.categories.scanty + waterSummary.rain.categories.noRain} of ${waterSummary.rain.mandals} mandals deficient or worse.`]
      : []),
    ...(monsoonWatch.rainfall
      ? [`Satellite rainfall (${monsoonWatch.rainfall.product.split(" monthly")[0]}), months ${monsoonWatch.rainfall.months} of ${monsoonWatch.season.year}: ${pct(monsoonWatch.rainfall.anomalyPct)} against normal, rank ${monsoonWatch.rainfall.rankDriest} driest of ${monsoonWatch.rainfall.ofYears} years.`]
      : []),
    ...(waterSummary.soil
      ? [`Modelled soil moisture at ${waterSummary.soil.depthCm} cm sits below its usual level for ${waterSummary.soil.asOf ?? "the date"} in ${waterSummary.soil.belowOwnMedian} of ${waterSummary.soil.withBaseline} mandals (NRSC model via APWRIMS).`]
      : []),
    ...(waterSummary.reservoirs
      ? [`Reservoirs hold ${formatNumber(waterSummary.reservoirs.storagePct)}% of capacity against ${formatNumber(waterSummary.reservoirs.lastYearPct)}% a year ago (${waterSummary.reservoirs.count} major and medium; measured at the dam, not deliveries).`]
      : []),
    ...(yoyMedian !== null
      ? [
          `${yoyDeeper} of ${yoy.length} mandals (${Math.round((100 * yoyDeeper) / yoy.length)}%) read deeper than the same month a year earlier — median change ${yoyMedian > 0 ? "+" : ""}${formatNumber(yoyMedian)} m.`,
        ]
      : []),
  ];

  return (
    <div className="pageWrap snapshot">
      <div className="printHide"><PageBriefBand brief={brief("/snapshot", <Link href="/digest/">Open this week&rsquo;s digest →</Link>)} /></div>
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
            <div className="snapSub">Executive Snapshot · real APWRIMS readings (2014-2026) + GRACE-DA / NASA percentile signals + this water year's gauges, soil moisture and reservoirs</div>
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
          <div className="snapRegisterCol">
          <div className="tableWrap snapRegister">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>District</th>
                  <th>Mandal</th>
                  <th>Historical median (m bgl)</th>
                  <th>Modelled nowcast (m)</th>
                  <th>Coverage</th>
                  <th title="Year-on-year change: + deeper/worse (red), − recovering (green)">YoY</th>
                  <th>NASA GW %ile</th>
                  <th>Root-Zone</th>
                  <th>Surface</th>
                  <th>Water Balance</th>
                  <th>Own-history wetness</th>
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
          <p className="snapRegisterNote printHide">
            All {mandals.length} mandals are listed above — the frame scrolls so the sheet stays readable on
            screen. Printing or saving to PDF releases it and lays out every row, with the column headings
            repeated on each page.
          </p>
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
              <p>Identify records for verification and compare dated context. Not an allocation plan, drought declaration or released AWARE advisory.</p>
            </div>
          </aside>
        </div>

        <div className="snapFoot">
          <IconInfo />
          <span>{prototypeNotice} Observations through {datasetManifest.periods.latestObservationPeriod}; model targets {datasetManifest.periods.modelTargetPeriodRange.start} to {datasetManifest.periods.modelTargetPeriodRange.end}; GRACE-DA fetched {s.sample_fetch_date} (valid period not supplied). Depth is m below ground; NASA columns are percentiles, not depth. Climate balance uses {datasetManifest.periods.etValidPeriod} reference data. Not live telemetry.</span>
        </div>
      </section>
    </div>
  );
}
