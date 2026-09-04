"use client";

import { useState } from "react";
import Link from "next/link";
import { HeaderHero } from "../components/HeaderHero";
import { KpiCard } from "../components/KpiCard";
import { LiveMap } from "../components/LiveMap";
import { MapLegend } from "../components/MapLegend";
import { StatusSummaryCard } from "../components/StatusSummaryCard";
import { SatelliteSignalCards } from "../components/SatelliteSignalCards";
import { SelectedMandalPanel } from "../components/SelectedMandalPanel";
import { SourceReadinessPanel } from "../components/SourceReadinessPanel";
import { MandalTable } from "../components/MandalTable";
import { CountUp } from "../components/CountUp";
import {
  IconActivity,
  IconArrowRight,
  IconCloudRain,
  IconDroplet,
  IconGlobe,
  IconLayers,
  IconMap,
  IconShield,
  IconWaves,
} from "../components/icons";
import { dashboardSummary, datasetManifest, districts, formatNumber, mandalHeat, mandals, modelCard, selectedMandal, titleCase, verifyMandals } from "../lib/data";
import type { MandalHeatLayerKey } from "../lib/types";

export default function OverviewPage() {
  const s = dashboardSummary.summary;
  const [selectedId, setSelectedId] = useState(mandals[0]?.id);
  const [mapView, setMapView] = useState<"status" | MandalHeatLayerKey>("status");
  const current = selectedMandal(selectedId);
  const verifyCount = verifyMandals().length;
  const verifyPct = Math.round((verifyCount / datasetManifest.counts.modelledRecordCount) * 100);
  const modelledRows = mandals.filter((m) => m.estimate_mbgl !== null && m.estimate_mbgl !== undefined);
  const modelledDepths = modelledRows.map((m) => m.estimate_mbgl as number).sort((a, b) => a - b);
  const medianModelledDepth = modelledDepths[Math.floor(modelledDepths.length / 2)] ?? null;
  const deepestNowcast = [...modelledRows].sort((a, b) => (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0))[0];
  const bandWidths = modelledRows
    .map((m) =>
      m.estimate_band_p10 !== null &&
      m.estimate_band_p10 !== undefined &&
      m.estimate_band_p90 !== null &&
      m.estimate_band_p90 !== undefined
        ? m.estimate_band_p90 - m.estimate_band_p10
        : null,
    )
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const medianBandWidth = bandWidths[Math.floor(bandWidths.length / 2)] ?? null;
  const modelGapCount = mandals.filter((m) => (m.obs_model_gap_m ?? 0) >= 2).length;
  const temporalEval = modelCard.evaluations.temporalNowcast;
  const intervalEval = modelCard.evaluations.intervalEvaluation;
  const baselineLiftPct = Math.round(((temporalEval.baseline.maeM - temporalEval.model.maeM) / temporalEval.baseline.maeM) * 100);

  return (
    <div className="pageWrap">
      <HeaderHero
        title="AP Groundwater Verification Cockpit"
        subtitle={
          <>
            Find the mandals that need review first, inspect why they were flagged, and trace every displayed signal to
            APWRIMS-format readings, GRACE-DA context, climate balance, and boundary coverage.
          </>
        }
        showBanner={false}
        showChips={false}
        variant="compact"
        actions={
          <>
            <Link className="heroAction heroActionLead" href="/crystal">
              <span className="heroActionLabel">Crystal Water Table</span>
              <span className="heroActionSub">Cinematic 3D · 632 mandals, 2014&ndash;2027</span>
            </Link>
            <Link className="heroAction" href="/living-water-table">
              <span className="heroActionLabel">Living Water Table</span>
              <span className="heroActionSub">Analytical 3D surface</span>
            </Link>
          </>
        }
      />

      <div className="sourceMiniBar">
        <span>
          <strong>Prototype evidence mode.</strong> Not official until official APWRIMS export and official mandal
          boundaries are supplied.
        </span>
        <span className="sourceMiniMeta">
          {datasetManifest.counts.modelledRecordCount} modelled · {datasetManifest.counts.boundaryFeatureCount} boundaries · GRACE fetch{" "}
          {s.sample_fetch_date}
        </span>
      </div>

      <div className="modelValueRow stagger">
        <KpiCard
          icon={<IconDroplet />}
          label="Median Modelled Nowcast"
          value={<>{medianModelledDepth !== null ? formatNumber(medianModelledDepth) : "—"}<span className="unit">m</span></>}
          foot="metres below ground · current target period"
          accent="var(--teal)"
        />
        <KpiCard
          icon={<IconActivity />}
          label="Deepest Modelled Mandal"
          value={<>{deepestNowcast?.estimate_mbgl !== null && deepestNowcast?.estimate_mbgl !== undefined ? formatNumber(deepestNowcast.estimate_mbgl) : "—"}<span className="unit">m</span></>}
          foot={deepestNowcast ? `${titleCase(deepestNowcast.mandal_name)} · ${titleCase(deepestNowcast.district_name)}` : "No modelled row"}
          footAccent
          accent="var(--rust)"
        />
        <KpiCard
          icon={<IconShield />}
          label="Median Model Band"
          value={<>{medianBandWidth !== null ? formatNumber(medianBandWidth) : "—"}<span className="unit">m</span></>}
          foot="typical P10–P90 width, not guaranteed confidence"
          accent="var(--amber)"
        />
        <KpiCard
          icon={<IconLayers />}
          label="Measured–Model Gap"
          value={<CountUp value={modelGapCount} />}
          foot="mandals with ≥2 m gap · verify before use"
          footAccent
          accent="var(--cyan)"
        />
      </div>

      <div className="modelValidationStrip">
        <div className="modelValidationIntro">
          <span className="validationEyebrow">How accurate is β?</span>
          <strong>Validated temporal nowcast / gap-fill, not a replacement for field sensors.</strong>
          <span>
            Evaluation holds out recent APWRIMS-format mandal-months ({temporalEval.evaluationPeriod.start}–
            {temporalEval.evaluationPeriod.end}) and compares the calculated level against observed depth.
          </span>
        </div>
        <div className="validationMetric">
          <span>MAE</span>
          <strong>{formatNumber(temporalEval.model.maeM)} m</strong>
          <em>average absolute error</em>
        </div>
        <div className="validationMetric">
          <span>vs baseline</span>
          <strong>{baselineLiftPct}% better</strong>
          <em>previous-year same-month</em>
        </div>
        <div className="validationMetric">
          <span>P10–P90</span>
          <strong>{formatNumber(intervalEval.empiricalCoveragePct)}%</strong>
          <em>actual holdout coverage</em>
        </div>
        <Link className="validationLink" href="/estimates">
          Open model card <IconArrowRight />
        </Link>
      </div>

      <div className="overviewCockpit">
        <div className="overviewMapColumn">
        <section className="card mapCard overviewMapLead">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon">
                <IconMap />
              </span>
              Statewide mandal status
              <span className="cardSub" style={{ marginLeft: 6 }}>
                click a mandal for evidence
              </span>
            </div>
            <div className="segmented">
              {([
                { k: "status", label: "Status" },
                { k: "water_balance_mm", label: "Balance" },
                { k: "rainfall_mm", label: "Rainfall" },
              ] as const).map((v) => (
                <button
                  key={v.k}
                  type="button"
                  className={`segBtn ${mapView === v.k ? "active" : ""}`}
                  onClick={() => setMapView(v.k)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <LiveMap
            mode="status"
            selectedId={selectedId}
            onSelect={setSelectedId}
            height={500}
            heatLayer={mapView === "status" ? null : mapView}
          />
          {mapView === "status" ? (
            <MapLegend />
          ) : (
            <div className="choroLegend">
              <div className="choroHead">
                <span>
                  {mapView === "rainfall_mm" ? "Rainfall (CHIRPS)" : "Water Balance"}{" "}
                  <span className="choroUnit">({mapView === "rainfall_mm" ? "mm" : "mm/yr"})</span>
                </span>
                <Link className="linkAction" href="/map">Full map <IconArrowRight /></Link>
              </div>
              <div
                className="choroBar"
                style={{
                  background:
                    mapView === "water_balance_mm"
                      ? "linear-gradient(90deg,#c65a46,#e7cf86,#4f9268)"
                      : "linear-gradient(90deg,#e6f1f8,#0e6f95)",
                }}
              />
              <div className="choroScale">
                <span>{mapView === "water_balance_mm" ? "Deficit" : "Low"} · {formatNumber(mandalHeat.layers[mapView].min)}</span>
                <span>{mapView === "water_balance_mm" ? "Surplus" : "High"} · {formatNumber(mandalHeat.layers[mapView].max)}</span>
              </div>
            </div>
          )}

          <div className="overviewKpiRail stagger">
            <KpiCard
              icon={<IconActivity />}
              label="Priority · Stress"
              value={<CountUp value={verifyCount} />}
              foot={`${verifyPct}% monitoring stress · review first`}
              footAccent
              accent="var(--rust)"
            />
            <KpiCard
              icon={<IconDroplet />}
              label="Regional GRACE-DA Wetness"
              value={<CountUp value={s.avg_groundwater_percentile ?? 0} decimals={0} />}
              foot="district/regional model-assimilated context"
              accent="var(--cyan)"
            />
            <KpiCard
              icon={<IconLayers />}
              label="Modelled Mandals"
              value={<CountUp value={datasetManifest.counts.modelledRecordCount} />}
              foot={`Across ${districts.length} districts`}
              accent="var(--teal)"
            />
            {s.avg_water_balance_mm !== null && s.avg_water_balance_mm !== undefined && (
              <KpiCard
                icon={<IconCloudRain />}
                label="Water Deficit"
                value={<CountUp value={s.deficit_mandals} />}
                foot={`TerraClimate ${s.balance_year}`}
                footAccent
                accent="var(--rust)"
              />
            )}
            <KpiCard
              icon={<IconShield />}
              label="Coverage"
              value={<span style={{ fontSize: 20 }}>{datasetManifest.counts.boundaryFeatureCount}</span>}
              foot={`${datasetManifest.counts.measuredOnlyCount} measured-only · ${datasetManifest.counts.boundaryOnlyCount} boundary-only`}
              accent="var(--amber)"
            />
          </div>
        </section>

          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconGlobe />
                </span>
                Status Summary
              </div>
              <Link className="linkAction" href="/watchlist">
                Watchlist <IconArrowRight />
              </Link>
            </div>
            <StatusSummaryCard />
          </section>
        </div>

        <aside className="overviewSideStack">
          <SelectedMandalPanel mandal={current} />
        </aside>
      </div>

      <div className="overviewSupportGrid">
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon">
                <IconActivity />
              </span>
              Top Mandals to Verify
              <span className="cardSub" style={{ marginLeft: 6 }}>
                mismatch / low confidence
              </span>
            </div>
            <Link className="linkAction" href="/watchlist">
              View full watchlist <IconArrowRight />
            </Link>
          </div>
          <MandalTable rows={mandals} limit={8} selectedId={selectedId} onSelect={setSelectedId} />
        </section>

        <div className="contentGrid">
          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconWaves />
                </span>
                Satellite Signal
              </div>
              <span className="cardSub">NASA/NDMC GRACE-DA</span>
            </div>
            <SatelliteSignalCards />
          </section>

          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconShield />
                </span>
                Data Readiness
              </div>
              <Link className="linkAction" href="/readiness">
                Details <IconArrowRight />
              </Link>
            </div>
            <SourceReadinessPanel compact />
          </section>
        </div>
      </div>

      <div className="footNote">
        <strong>Prototype View</strong>
        <span className="dotsep" />
        Built for Andhra Pradesh
        <span className="dotsep" />
        Not for official use without official APWRIMS export &amp; official mandal boundaries
      </div>
    </div>
  );
}
