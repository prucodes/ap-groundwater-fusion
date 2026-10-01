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
import { dashboardSummary, datasetManifest, districts, formatNumber, mandalHeat, mandals, modelCard, monsoonWatch, selectedMandal, titleCase, verifyMandals, wetnessLabel } from "../lib/data";
import type { MandalHeatLayerKey } from "../lib/types";

export default function OverviewPage() {
  const s = dashboardSummary.summary;
  const [selectedId, setSelectedId] = useState(mandals[0]?.id);
  const [mapView, setMapView] = useState<"status" | MandalHeatLayerKey>("status");
  const current = selectedMandal(selectedId);
  const verifyCount = verifyMandals().length;
  const verifyPct = Math.round((verifyCount / Math.max(1, mandals.length)) * 100);
  const modelledRows = mandals.filter((m) => m.estimate_mbgl !== null && m.estimate_mbgl !== undefined);
  const modelledDepths = modelledRows.map((m) => m.estimate_mbgl as number).sort((a, b) => a - b);
  const medianModelledDepth = modelledDepths.length ? (modelledDepths[Math.floor((modelledDepths.length - 1) / 2)] + modelledDepths[Math.floor(modelledDepths.length / 2)]) / 2 : null;
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
  const medianBandWidth = bandWidths.length ? (bandWidths[Math.floor((bandWidths.length - 1) / 2)] + bandWidths[Math.floor(bandWidths.length / 2)]) / 2 : null;
  // Readings that land outside the model's own P10–P90 band. A fixed metre
  // threshold could not scale with how uncertain the model says it is.
  const outsideBandCount = mandals.filter((m) => m.obs_outside_band === true).length;
  const temporalEval = modelCard.evaluations.temporalNowcast;
  const intervalEval = modelCard.evaluations.intervalEvaluation;
  const baselineLiftPct = Math.round(((temporalEval.baseline.maeM - temporalEval.model.maeM) / temporalEval.baseline.maeM) * 100);
  // Whether the season that refills the aquifer is working. Measured from the
  // readings themselves, so it stands apart from everything the model says.
  const watch = monsoonWatch;
  const priorSeasons = watch.seasons.filter((s) => s.year !== watch.season.year);
  const priorFallingLow = Math.min(...priorSeasons.map((s) => s.fallingPct));
  const priorFallingHigh = Math.max(...priorSeasons.map((s) => s.fallingPct));
  // Only an exception gets the front page, and only once there are enough past
  // seasons for "outside every season on record" to mean anything.
  const seasonFailing = priorSeasons.length >= 3 && watch.recharge.fallingPct > priorFallingHigh;

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
            <Link className="heroAction heroActionLead" href="/districts">
              <span className="heroActionLabel">District Review</span>
              <span className="heroActionSub">Depth, direction and evidence coverage</span>
            </Link>
            <Link className="heroAction" href="/agriculture">
              <span className="heroActionLabel">Agriculture &amp; Water</span>
              <span className="heroActionSub">Crop context and district verification</span>
            </Link>
          </>
        }
      />

      <div className="sourceMiniBar">
        <span>
          <strong>Research evidence mode.</strong> Source authorization, official identities, method approval and field validation remain pending.
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
          foot={`m below ground / targets ${datasetManifest.periods.modelTargetPeriodRange.start} to ${datasetManifest.periods.modelTargetPeriodRange.end}`}
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
          label="Outside the Model Band"
          value={<CountUp value={outsideBandCount} />}
          foot="reading outside its own P10–P90 · verify before use"
          footAccent
          accent="var(--cyan)"
        />
      </div>

      <details className="overviewEvaluation">
      <summary><span>Model evaluation &amp; uncertainty</span><strong>{formatNumber(temporalEval.model.maeM)} m MAE</strong><span>Temporal holdout / not a field replacement</span></summary>
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
      <div className="depthBandStrip">
        <div className="depthBandIntro"><span className="validationEyebrow">Accuracy by depth</span><span>Error by depth band versus carrying the last reading forward.</span></div>
        {temporalEval.depthBands.map(band => <div className="depthBandCell" key={band.band}><span>{band.band}</span><strong>{formatNumber(band.maeM)} m</strong><em>vs {formatNumber(band.lastReadingMaeM)} m baseline</em></div>)}
      </div>
      </details>

      {/* The nowcast answers "how deep"; this answers "is the season refilling
          it". Only raised to the front page when this season is outside the
          range of every season it can be compared with. */}
      {seasonFailing ? (
        <div className="monsoonStrip">
          <div className="monsoonStripIntro">
            <span className="validationEyebrow">Monsoon watch</span>
            <span>
              {watch.enso?.state === "el_nino" ? (
                <>
                  The published ONI indicates <strong>{watch.enso.strength} El Niño conditions</strong>.
                  More monitored source series are deeper than May than in the available comparison seasons.
                </>
              ) : (
                <>
                  More monitored source series are deeper than May than in the available comparison seasons.
                </>
              )}
            </span>
          </div>
          <div className="monsoonStripCell">
            <span>Lower than May</span>
            <strong>{formatNumber(watch.recharge.fallingPct)}%</strong>
            <em>
              source-series share / prior {formatNumber(priorFallingLow)}–{formatNumber(priorFallingHigh)}%
            </em>
          </div>
          {watch.rainfall ? (
            <div className="monsoonStripCell">
              <span>Rain vs normal</span>
              <strong>{formatNumber(watch.rainfall.anomalyPct)}%</strong>
              <em>
                dryness rank {watch.rainfall.rankDriest} of{" "}
                {watch.rainfall.ofYears}
              </em>
            </div>
          ) : null}
          {watch.enso ? (
            <div className="monsoonStripCell">
              <span>Ocean state</span>
              <strong>
                {watch.enso.oniC > 0 ? "+" : ""}
                {watch.enso.oniC.toFixed(2)} °C
              </strong>
              <em>{watch.enso.state === "el_nino" ? "El Niño" : watch.enso.state === "la_nina" ? "La Niña" : "Neutral"}, {watch.enso.strength}</em>
            </div>
          ) : null}
          <div className="monsoonStripCell">
            <span>Provisional series flags</span>
            <strong>{watch.recharge.flaggedShort}</strong>
            <em>baseline review pending</em>
          </div>
          <Link className="validationLink" href="/monsoon">
            Open monsoon watch <IconArrowRight />
          </Link>
        </div>
      ) : null}

      {/* One statewide average hides the thing a reader actually needs: the
          error where THEIR water sits. Shown against the rule the model has to
          beat, so the comparison cannot be read as flattering. */}
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
              value={s.avg_groundwater_percentile === null ? "No data" : <CountUp value={s.avg_groundwater_percentile} decimals={0} />}
              foot={`${wetnessLabel(s.avg_groundwater_percentile)} for this time of year · district scale`}
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
                depth / measured decline
              </span>
            </div>
            <Link className="linkAction" href="/watchlist">
              View full watchlist <IconArrowRight />
            </Link>
          </div>
          <MandalTable rows={verifyMandals()} limit={8} selectedId={selectedId} onSelect={setSelectedId} />
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
