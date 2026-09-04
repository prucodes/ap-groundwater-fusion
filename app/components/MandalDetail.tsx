import Link from "next/link";
import type { MandalGroundwaterView } from "../lib/types";
import {
  agreementMeta,
  depthSeriesFor,
  seasonalCycle,
  dashboardSummary,
  formatNumber,
  formatPeriod,
  observationSeries,
  sampleForMandal,
  statusMeta,
  titleCase,
  wetnessLabel,
} from "../lib/data";
import { MandalSelectorStrip } from "./MandalSelectorStrip";
import { Hydrograph } from "./Hydrograph";
import { MonsoonCycle } from "./MonsoonCycle";
import { ExtractionBadge } from "./ExtractionBadge";
import { WaterBalanceCard } from "./WaterBalanceCard";
import { AgreementTag, ConfidenceBadge, StatusBadge } from "./Badges";
import { PercentileRing, Sparkline } from "./charts";
import { FusionExplanationCard } from "./FusionExplanationCard";
import { LiveMap } from "./LiveMap";
import { ActionOutputPreview } from "./ActionOutputPreview";
import {
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconCloudRain,
  IconChevronLeft,
  IconDroplet,
  IconFlask,
  IconLeaf,
  IconMap,
  IconPin,
  IconSatellite,
  IconShield,
  IconTarget,
  IconWaves,
} from "./icons";

const MAX_DEPTH = 25;



function actionItems(m: MandalGroundwaterView) {
  if (m.sensor_satellite_agreement === "declining_despite_positive_climate_balance") {
    return [
      "Review the measured history and climate-context mismatch",
      "Field-verify the current groundwater level",
      "Review extraction and cropping context without assuming causation",
      "Confirm with official APWRIMS data before operational use",
    ];
  }
  return [
    "Collect an additional field observation before interpretation",
    "Review the APWRIMS-format observation history",
    "Reassess after official APWRIMS export and boundaries arrive",
    "Do not treat as official until APWRIMS/APSAC/RTGS boundaries supplied",
  ];
}

export function MandalDetail({ mandal }: { mandal: MandalGroundwaterView }) {
  const meta = statusMeta(mandal.status_bucket);
  const sample = sampleForMandal(mandal);
  const depthPct = Math.min(100, ((mandal.median_groundwater_mbgl ?? 0) / MAX_DEPTH) * 100);

  const realDepth = (observationSeries[mandal.id]?.observations ?? []).map(
    ({ period, value }) => [period, value] as [string, number],
  );
  const hasRealDepth = realDepth.length >= 6;
  const depthSeries = hasRealDepth
    ? realDepth.map(([, v]) => v)
    : [];
  const depthSpan = hasRealDepth ? `${realDepth[0][0]} – ${realDepth[realDepth.length - 1][0]}` : "";

  // The complete measured record — ~11 years of monthly readings for most
  // mandals — rather than the short preview the sparkline used.
  const fullSeries = depthSeriesFor(mandal);
  const cycle = seasonalCycle(fullSeries);

  const awarePayload = mandal.aware_apwrims_action_preview;

  return (
    <div className="contentGrid" style={{ gap: 16 }}>
      {/* breadcrumb + selector */}
      <div className="crumb">
        <Link href="/">Overview</Link>
        <IconChevronLeft style={{ transform: "rotate(180deg)" }} />
        <Link href="/mandals">Mandal Insights</Link>
        <IconChevronLeft style={{ transform: "rotate(180deg)" }} />
        <span style={{ color: "var(--ink)" }}>{titleCase(mandal.mandal_name)}</span>
      </div>

      <MandalSelectorStrip activeId={mandal.id} />

      {/* header */}
      <section className="card">
        <div className="detailHead">
          <div className="detailTitle">
            <span className="detailPin">
              <IconPin />
            </span>
            <div>
              <h2>{titleCase(mandal.mandal_name)} Mandal</h2>
              <div className="sub">
                {titleCase(mandal.district_name)} District · Mandal ID {mandal.id} ·{" "}
                {mandal.observation_month_count} observation months
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <StatusBadge bucket={mandal.status_bucket} />
            <ConfidenceBadge label={mandal.confidence_label} />
            <ExtractionBadge category={mandal.extraction_category} />
            <Link className="linkAction" href="/map">
              <IconMap /> Back to map
            </Link>
          </div>
        </div>
      </section>

      {/* metric row */}
      <div className="metricRow stagger">
        <div className="metricCard">
          <div className="metricCardLabel">Measured Groundwater (Median)</div>
          <div className="depthGauge">
            <span className="depthGaugeTrack">
              <span className="depthGaugeFill" style={{ height: `${depthPct}%` }} />
            </span>
            <span className="depthGaugeNum">
              {formatNumber(mandal.median_groundwater_mbgl)}
              <small> mbgl</small>
            </span>
          </div>
          <div className="metricSub">Observation period {mandal.latest_observation_period || "—"}</div>
        </div>

        <div className="metricCard">
          <div className="metricCardLabel">Observation Months</div>
          <PercentileRing value={100} color="var(--teal)">
            <span className="v">{mandal.observation_month_count}</span>
          </PercentileRing>
          <div className="metricSub">APWRIMS (AP-GWD)</div>
        </div>

        <div className="metricCard">
          <div className="metricCardLabel">NASA GW Percentile</div>
          <PercentileRing value={mandal.groundwater_percentile} color="var(--sig-gw)">
            <span className="v">{formatNumber(mandal.groundwater_percentile)}</span>
          </PercentileRing>
          <div className="metricSub wet">{wetnessLabel(mandal.groundwater_percentile)}</div>
        </div>

        <div className="metricCard">
          <div className="metricCardLabel">Root-Zone Moisture</div>
          <PercentileRing value={mandal.rootzone_percentile} color="var(--sig-root)">
            <span className="v">{formatNumber(mandal.rootzone_percentile)}</span>
          </PercentileRing>
          <div className="metricSub wet" style={{ color: "var(--sig-root)" }}>
            {wetnessLabel(mandal.rootzone_percentile)}
          </div>
        </div>

        <div className="metricCard">
          <div className="metricCardLabel">Surface Moisture</div>
          <PercentileRing value={mandal.surface_percentile} color="var(--sig-surface)">
            <span className="v">{formatNumber(mandal.surface_percentile)}</span>
          </PercentileRing>
          <div className="metricSub wet" style={{ color: "var(--sig-surface)" }}>
            {wetnessLabel(mandal.surface_percentile)}
          </div>
        </div>

        <div className="metricCard">
          <div className="metricCardLabel">Overall Agreement</div>
          <div style={{ margin: "10px 0", display: "grid", placeItems: "center" }}>
            <span
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background: agreementMeta(mandal.sensor_satellite_agreement).className === "strong"
                  ? "var(--st-verify-bg)"
                  : "var(--st-watch-bg)",
                color: meta.color,
              }}
            >
              <IconTarget />
            </span>
          </div>
          <div style={{ marginTop: 2 }}>
            <AgreementTag value={mandal.sensor_satellite_agreement} />
          </div>
        </div>

        <div className="metricCard">
          <div className="metricCardLabel">Data Completeness</div>
          <PercentileRing value={mandal.coverage_status === "modelled" ? 100 : mandal.coverage_status === "measured_only" ? 60 : 0} color="var(--amber)">
            <span className="v" style={{ fontSize: 15 }}>
              {mandal.coverage_status === "modelled" ? "V2" : "—"}
            </span>
          </PercentileRing>
          <div className="metricSub">{mandal.confidence_label}</div>
        </div>

        {mandal.rainfall_mm !== null && mandal.rainfall_mm !== undefined && (
          <div className="metricCard">
            <div className="metricCardLabel">Rainfall Context</div>
            <div className="depthGauge">
              <span className="depthGaugeTrack" style={{ background: "linear-gradient(180deg,#d7e8f5,#9cc1de)" }}>
                <span
                  className="depthGaugeFill"
                  style={{ height: `${Math.min(100, mandal.rainfall_mm)}%`, background: "linear-gradient(180deg,#6aa6e6,#3a6fb0)" }}
                />
              </span>
              <span className="depthGaugeNum">
                {formatNumber(mandal.rainfall_mm)}
                <small> mm</small>
              </span>
            </div>
            <div className="metricSub">CHIRPS · {formatPeriod(dashboardSummary.summary.rainfall_period) || "monthly"}</div>
          </div>
        )}
      </div>

      {/* main + rail */}
      <div className="watchlistLayout">
        <div className="contentGrid">
          <div className="contentGrid detailSplit">
            <section className="card">
              <div className="cardHead">
                <div className="cardTitle">
                  <span className="titleIcon">
                    <IconPin />
                  </span>
                  Location &amp; Context
                </div>
              </div>
              <LiveMap mode="single" mandalId={mandal.id} height={220} />
              <div className="mapHint">
                <IconMap style={{ width: 13, height: 13 }} /> Live basemap © OSM © CARTO · public prototype boundary
              </div>
            </section>

          </div>

          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconTarget />
                </span>
                Fusion Explanation
              </div>
            </div>
            <FusionExplanationCard mandal={mandal} />
          </section>

          {mandal.water_balance_mm !== null && mandal.water_balance_mm !== undefined && (
            <section className="card">
              <div className="cardHead">
                <div className="cardTitle">
                  <span className="titleIcon">
                    <IconCloudRain />
                  </span>
                  Aquifer Water Balance
                  <span className="cardSub" style={{ marginLeft: 6 }}>
                    rainfall minus actual ET
                  </span>
                </div>
                <span className="cardSub">TerraClimate {dashboardSummary.summary.balance_year}</span>
              </div>
              <WaterBalanceCard mandal={mandal} year={dashboardSummary.summary.balance_year} />
            </section>
          )}

            <section className="card">
              <div className="cardHead">
                <div className="cardTitle">
                  <span className="titleIcon">
                    <IconDroplet />
                  </span>
                  {hasRealDepth ? "Measured History · APWRIMS-format" : "Measured History Unavailable"}
                </div>
                {hasRealDepth ? <span className="cardSub">{depthSpan}</span> : null}
              </div>
              {fullSeries.length >= 2 ? (
                <Hydrograph
                  series={fullSeries}
                  nowcast={
                    mandal.estimate_mbgl !== null && mandal.estimate_mbgl !== undefined
                      ? {
                          value: mandal.estimate_mbgl,
                          lower: mandal.estimate_band_p10 ?? null,
                          upper: mandal.estimate_band_p90 ?? null,
                          period: mandal.latest_observation_period,
                        }
                      : null
                  }
                />
              ) : (
                <Sparkline
                  area
                  series={[{ name: "Depth mbgl", color: "#c65a46", points: depthSeries }]}
                  height={130}
                />
              )}
              <div className="sideCaveat" style={{ marginTop: 8 }}>
                {hasRealDepth
                  ? `APWRIMS-format monthly observations (m below ground). The dashed extension is the modelled nowcast — ${formatNumber(mandal.estimate_mbgl)} m, P10–P90 ${formatNumber(mandal.estimate_band_p10)}–${formatNumber(mandal.estimate_band_p90)} m — not a measurement.`
                  : "No measured history is available. No history has been substituted or synthesized."}
              </div>
            </section>
            <section className="card">
              <div className="cardHead">
                <div className="cardTitle">
                  <span className="cardIcon"><IconCloudRain /></span>
                  Monsoon Cycle · Recharge by Year
                </div>
                <span className="cardSub">pre-monsoon May vs post-monsoon November</span>
              </div>
              <MonsoonCycle cycle={cycle} />
              <div className="sideCaveat" style={{ marginTop: 10 }}>
                Derived from the measured APWRIMS-format history, not modelled. Years without both a
                May and a November reading are omitted rather than interpolated.
              </div>
            </section>
          <div className="contentGrid detailPair">
            <section className="card">
              <div className="cardHead">
                <div className="cardTitle">
                  <span className="titleIcon">
                    <IconShield />
                  </span>
                  Data Quality &amp; Freshness
                </div>
              </div>
              <div className="kvRow">
                <span className="k">Observation records</span>
                <span className="v">{mandal.observation_record_count}</span>
              </div>
              <div className="kvRow">
                <span className="k">Latest observation period</span>
                <span className="v">{mandal.latest_observation_period || "—"}</span>
              </div>
              <div className="kvRow">
                <span className="k">Satellite sample</span>
                <span className="v">{sample?.satellite_sample_date_or_fetch_date || "—"}</span>
              </div>
              <div className="kvRow">
                <span className="k">Measured label</span>
                <span className="v">APWRIMS (AP-GWD)</span>
              </div>
              <div className="kvRow">
                <span className="k">Boundary</span>
                <span className="v">public_prototype</span>
              </div>
              <div className="sideCaveat" style={{ marginTop: 8 }}>
                {mandal.data_quality_notes}
              </div>
            </section>
          </div>
        </div>

        {/* right rail */}
        <div className="contentGrid detailRail">
          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconLeaf />
                </span>
                Data Sources
              </div>
            </div>
            <div className="readinessList">
              <div className="readinessItem">
                <span className="readyIcon manual">
                  <IconFlask />
                </span>
                <div className="readyBody">
                  <div className="readyLabel">Measured Input · APWRIMS</div>
                  <div className="readyMeta">APWRIMS mandal reading (2014-2026)</div>
                </div>
              </div>
              <div className="readinessItem">
                <span className="readyIcon available">
                  <IconSatellite />
                </span>
                <div className="readyBody">
                  <div className="readyLabel">NASA Satellite-Model (GRACE-DA)</div>
                  <div className="readyMeta">Real percentiles 0–100 · {sample?.satellite_sample_date_or_fetch_date || "—"}</div>
                </div>
              </div>
              {mandal.rainfall_mm !== null && mandal.rainfall_mm !== undefined && (
                <div className="readinessItem">
                  <span className="readyIcon available">
                    <IconCloudRain />
                  </span>
                  <div className="readyBody">
                    <div className="readyLabel">CHIRPS Rainfall Context</div>
                    <div className="readyMeta">Monthly areal average · not direct measured recharge</div>
                  </div>
                </div>
              )}
              <div className="readinessItem">
                <span className="readyIcon pending">
                  <IconMap />
                </span>
                <div className="readyBody">
                  <div className="readyLabel">Boundary Source</div>
                  <div className="readyMeta">public_prototype · official APWRIMS boundary pending</div>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconCheck />
                </span>
                Recommended Action
              </div>
            </div>
            <div className="actionList">
              {actionItems(mandal).map((a) => (
                <div className="actionItem" key={a}>
                  <span className="check">
                    <IconCheck />
                  </span>
                  {a}
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconCalendar />
                </span>
                Action Output
              </div>
            </div>
            <ActionOutputPreview payload={awarePayload} />
          </section>
        </div>
      </div>

      <div className="footNote">
        <strong>Prototype Insight</strong>
        <span className="dotsep" />
        APWRIMS reading + real NASA satellite-model percentile
        <span className="dotsep" />
        Not official until APWRIMS export &amp; official boundaries
        <Link className="linkAction" href="/watchlist" style={{ marginLeft: "auto" }}>
          Go to watchlist <IconArrowRight />
        </Link>
      </div>
    </div>
  );
}
