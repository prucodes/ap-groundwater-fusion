"use client";

import { useState } from "react";
import Link from "next/link";
import { HeaderHero } from "./HeaderHero";
import { KpiCard } from "./KpiCard";
import { LiveMap } from "./LiveMap";
import { MapLegend } from "./MapLegend";
import { StatusSummaryCard } from "./StatusSummaryCard";
import { SatelliteSignalCards } from "./SatelliteSignalCards";
import { SelectedMandalPanel } from "./SelectedMandalPanel";
import { SourceReadinessPanel } from "./SourceReadinessPanel";
import { MandalTable } from "./MandalTable";
import { CountUp } from "./CountUp";
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
} from "./icons";
import { dashboardSummary, datasetManifest, districts, formatNumber, mandalHeat, mandals, modelCard, monsoonWatch, selectedMandal, titleCase, verifyMandals, wetnessLabel } from "../lib/data";
import type { MandalHeatLayerKey } from "../lib/types";
import { waterSummary } from "../lib/waterSummary";
import { droughtSummary } from "../lib/droughtSummary";
import { stateSummary } from "../lib/stateSummary";
import { officialStatusLine } from "../lib/data";
import { WATER_LAYER_META, isWaterLayer, waterLayerGradient, type WaterMandalLayer } from "../lib/waterMandals";
import { brief } from "../lib/pageBriefs";
import { groundwaterStressNow } from "../lib/pageNow";

/** Counts the server works out from the full water context, which never reaches the browser. */
export type OverviewAgreement = { agreeAll: number; allKnown: number; agreeTwo: number };

const signedPct = (value: number | null | undefined) =>
  value === null || value === undefined ? "n/a" : `${value > 0 ? "+" : value < 0 ? "\u2212" : ""}${Math.abs(value).toFixed(1)}%`;
const shortDay = (iso: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${Number(match[3])} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(match[2]) - 1]}` : "—";
};

/** The summer outlook's headline, worked out on the server (the outlook file stays out of the browser). */
export type OverviewSummer = { beyond: number; beyondDeep: number; deepM: number; peopleDeep: string | null };

export function OverviewCockpit({ agreement, summer }: { agreement: OverviewAgreement | null; summer?: OverviewSummer | null }) {
  const s = dashboardSummary.summary;
  const [selectedId, setSelectedId] = useState(mandals[0]?.id);
  const [mapView, setMapView] = useState<"status" | MandalHeatLayerKey | WaterMandalLayer>("status");
  const season = waterSummary;
  const rainShort = season.rain ? season.rain.categories.deficient + season.rain.categories.scanty + season.rain.categories.noRain : 0;
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
        title="Andhra Pradesh water this week"
        brief={brief("/", groundwaterStressNow())}
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

      {/* Four lines first: what moved in the ground, the rain, the manual and the
          summer ahead, one figure each. The full set of numbers waits below. */}
      <section className="overviewHeadlines" aria-label="This week in four lines">
        <Link className="headlineCard" href="/map/">
          <span className="headlineKicker"><IconDroplet /> Groundwater</span>
          <strong>{stateSummary.state?.currentM != null ? <>{stateSummary.state.currentM.toFixed(1)}<small>m below ground</small></> : "No reading"}</strong>
          <span className="headlineText">
            The State&rsquo;s wells on average{stateSummary.state?.vsYearAgoM != null ? `, ${Math.abs(stateSummary.state.vsYearAgoM).toFixed(1)} m ${stateSummary.state.vsYearAgoM > 0 ? "deeper" : "shallower"} than a year ago` : ""}.
          </span>
          <span className="headlineGo">Mandal Map <IconArrowRight /></span>
        </Link>
        <Link className="headlineCard" href="/monsoon/">
          <span className="headlineKicker"><IconCloudRain /> Monsoon</span>
          <strong>{formatNumber(watch.recharge.fallingPct)}%<small>of mandal series lower than in May</small></strong>
          <span className="headlineText">
            {watch.rainfall ? `Rain ${Math.abs(watch.rainfall.anomalyPct).toFixed(0)}% ${watch.rainfall.anomalyPct < 0 ? "below" : "above"} normal, the ${watch.rainfall.rankDriest === 1 ? "driest" : `${watch.rainfall.rankDriest}${watch.rainfall.rankDriest === 2 ? "nd" : watch.rainfall.rankDriest === 3 ? "rd" : "th"} driest`} of ${watch.rainfall.ofYears} years.` : "The season's recharge, mandal by mandal."}
            {seasonFailing ? ` More than any past season, which ranged ${formatNumber(priorFallingLow)} to ${formatNumber(priorFallingHigh)}%.` : ""}
          </span>
          <span className="headlineGo">Monsoon Watch <IconArrowRight /></span>
        </Link>
        <Link className="headlineCard" href="/drought/">
          <span className="headlineKicker"><IconShield /> Drought manual</span>
          <strong>{droughtSummary.state.trigger1}<small>mandals meet the rainfall trigger</small></strong>
          <span className="headlineText">
            {droughtSummary.state.counts.severe} read severe and {droughtSummary.state.counts.moderate} moderate on impact. Evidence for the manual, not a declaration.
          </span>
          <span className="headlineGo">Drought Watch <IconArrowRight /></span>
        </Link>
        {summer ? (
          <Link className="headlineCard" href="/summer/">
            <span className="headlineKicker"><IconWaves /> Next summer</span>
            <strong>{summer.beyond}<small>mandals heading past their deepest May</small></strong>
            <span className="headlineText">
              {summer.beyondDeep} of them more than {summer.deepM} m down{summer.peopleDeep ? `, home to about ${summer.peopleDeep}` : ""}. A projection from past winters.
            </span>
            <span className="headlineGo">Summer Outlook <IconArrowRight /></span>
          </Link>
        ) : null}
      </section>

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
                { k: "gauge_rain_dev", label: "Gauge rain" },
                { k: "soil_pct", label: "Soil" },
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
          ) : isWaterLayer(mapView) ? (
            <div className="choroLegend">
              <div className="choroHead">
                <span>
                  {WATER_LAYER_META[mapView].label} <span className="choroUnit">({WATER_LAYER_META[mapView].unit})</span>
                </span>
                <Link className="linkAction" href="/map">Full map <IconArrowRight /></Link>
              </div>
              <div className="choroBar" style={{ background: waterLayerGradient(mapView) }} />
              <div className="choroScale">
                <span>{WATER_LAYER_META[mapView].low} · {WATER_LAYER_META[mapView].min}%</span>
                <span>{WATER_LAYER_META[mapView].period}</span>
                <span>{WATER_LAYER_META[mapView].high} · {mapView === "gauge_rain_dev" ? "+" : ""}{WATER_LAYER_META[mapView].max}%</span>
              </div>
            </div>
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

      {/* The season beside the groundwater: measured gauges, modelled soil and
          measured storage, each dated by its own source. Context only. */}
      {season.rain || season.soil || season.reservoirs ? (
        <section className="monsoonStrip seasonStrip" aria-label="This water year so far">
          <div className="monsoonStripIntro">
            <span className="validationEyebrow">This water year so far</span>
            <span>
              The state&rsquo;s rain gauges, modelled soil moisture and reservoir storage, from APWRIMS, each with its own date.
              Context beside the groundwater record: none of it changes a groundwater status.
            </span>
          </div>
          {season.rain ? (
            <div className="monsoonStripCell">
              <span>Gauge rain vs normal</span>
              <strong>{signedPct(season.rain.deviationPct)}</strong>
              <em>{shortDay(season.rain.start)} to {shortDay(season.rain.end)} · {rainShort} of {season.rain.mandals} mandals deficient or worse</em>
            </div>
          ) : null}
          {season.soil ? (
            <div className="monsoonStripCell">
              <span>Soil moisture, {season.soil.depthCm} cm</span>
              <strong>{season.soil.belowOwnMedian} / {season.soil.withBaseline}</strong>
              <em>mandals below their usual {shortDay(season.soil.asOf)} level · modelled</em>
            </div>
          ) : null}
          {season.reservoirs ? (
            <div className="monsoonStripCell">
              <span>Reservoir storage</span>
              <strong>{formatNumber(season.reservoirs.storagePct)}%</strong>
              <em>of capacity · {formatNumber(season.reservoirs.lastYearPct)}% a year ago</em>
            </div>
          ) : null}
          {agreement ? (
            <div className="monsoonStripCell">
              <span>Three signals agree</span>
              <strong>{agreement.agreeAll}</strong>
              <em>mandals where groundwater, gauge rain and soil all point to stress</em>
            </div>
          ) : null}
          <div className="monsoonStripCell">
            <span>Drought manual, step 1</span>
            <strong>{droughtSummary.state.trigger1}</strong>
            <em>
              mandals with a dry spell · {droughtSummary.state.counts.severe} severe, {droughtSummary.state.counts.moderate} moderate on impact ·{" "}
              <Link href="/drought">Drought Watch</Link>
            </em>
          </div>
          {stateSummary.state?.currentM !== null && stateSummary.state ? (
            <div className="monsoonStripCell" data-testid="state-network-cell">
              <span>State wells, early Sep</span>
              <strong>{`${stateSummary.state.currentM?.toFixed(1)} m`}</strong>
              <em>
                {`below ground on average · ${stateSummary.state.sinceMayM !== null ? `${stateSummary.state.sinceMayM.toFixed(1)} m deeper than May` : ""} · `}
                {`${stateSummary.state.vsYearAgoM !== null ? `${stateSummary.state.vsYearAgoM.toFixed(1)} m deeper than a year ago` : ""} · ${stateSummary.state.stationsTotal.toLocaleString("en-US")} stations (AWARE)`}
              </em>
            </div>
          ) : null}
          <Link className="validationLink" href="/agriculture#agriculture-watch">
            Open the water watch <IconArrowRight />
          </Link>
        </section>
      ) : null}

      {/* Every number the cockpit carries, for the reader who wants them: the
          model's own figures, its accuracy by depth, and the map's side rail. */}
      <details className="overviewMore">
        <summary><span>All figures and model accuracy</span><strong>{formatNumber(temporalEval.model.maeM)} m average error</strong><span>Model nowcasts, coverage and accuracy by depth</span></summary>
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
          <MandalTable rows={verifyMandals()} limit={30} selectedId={selectedId} onSelect={setSelectedId} />
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
        {officialStatusLine}
      </div>
    </div>
  );
}
