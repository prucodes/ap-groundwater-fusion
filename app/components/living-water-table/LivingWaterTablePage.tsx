"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { modelEstimateDisplay } from "./displaySemantics";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { SelectedMandalPanel } from "./SelectedMandalPanel";
import { WaterTableLegend } from "./WaterTableLegend";
import { WebGLFallback } from "./WebGLFallback";
import { livingWaterTableData } from "./useLivingWaterTableData";
import { useDeviceQuality } from "./useDeviceQuality";
import type {
  CameraCommand,
  DistrictAggregate,
  HoverState,
  JoinedMandal,
  MapGranularity,
  QualityChoice,
  ScenePerformance,
} from "./types";
import styles from "./living-water-table.module.css";

const LivingWaterTableScene = dynamic(
  () =>
    import("./LivingWaterTableScene").then(
      (module) => module.LivingWaterTableScene,
    ),
  {
    ssr: false,
    loading: () => (
      <div className={styles.loadingState}>
        <span />
        Preparing the interactive 3D scene…
      </div>
    ),
  },
);

function isQuality(value: string | null): value is QualityChoice {
  return value === "auto" || value === "standard" || value === "reduced";
}

function periodLabel(period: string | null): string {
  if (!period) return "Not supplied";
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context =
      canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function HoverTooltip({
  hover,
  feature,
}: {
  hover: HoverState;
  feature: JoinedMandal | null;
}) {
  if (!hover || !feature) return null;
  const record = feature.record;
  const estimateDisplay = modelEstimateDisplay(record);
  const value = record.observation
    ? `${record.observation.latestMeasuredValue.toFixed(2)} m bgl measured · ${periodLabel(
        record.observation.observationPeriod,
      )}`
    : record.nowcast
      ? `${record.nowcast.value.toFixed(2)} m bgl ${estimateDisplay?.label.toLowerCase() ?? "model estimate"} · ${periodLabel(
          record.nowcast.targetPeriod,
        )}`
      : "No groundwater value";
  return (
    <div
      className={styles.tooltip}
      style={{
        left: Math.min(hover.x + 16, 620),
        top: Math.max(hover.y - 8, 12),
      }}
      role="status"
    >
      <strong>{record.identity.mandalName}</strong>
      <span>{record.identity.districtName} District</span>
      <em>{record.identity.coverageStatus.replaceAll("_", " ")}</em>
      <small>{value}</small>
    </div>
  );
}

function DistrictHoverTooltip({
  hover,
}: {
  hover: { aggregate: DistrictAggregate; x: number; y: number } | null;
}) {
  if (!hover) return null;
  const { aggregate } = hover;
  const depth =
    aggregate.meanDepthMeters !== null
      ? `${aggregate.meanDepthMeters.toFixed(2)} m bgl mean depth`
      : "No modelled depth";
  return (
    <div
      className={styles.tooltip}
      style={{
        left: Math.min(hover.x + 16, 620),
        top: Math.max(hover.y - 8, 12),
      }}
      role="status"
    >
      <strong>{aggregate.name}</strong>
      <span>District aggregate</span>
      <em>
        {aggregate.coveredCount}/{aggregate.mandalCount} mandals valued
      </em>
      <small>{depth}</small>
    </div>
  );
}

function StateInsights({
  quality,
  scenePerformance,
}: {
  quality: "standard" | "reduced";
  scenePerformance: ScenePerformance | null;
}) {
  const { manifest, diagnostics } = livingWaterTableData;
  return (
    <section className={styles.insightPanel} aria-labelledby="state-insights-title">
      <div className={styles.eyebrow}>Andhra Pradesh insights</div>
      <h2 id="state-insights-title">State coverage</h2>
      <div className={styles.insightGrid}>
        <div>
          <span>Held-out model estimates</span>
          <strong>{manifest.counts.modelledRecordCount.toLocaleString("en-IN")}</strong>
          <small>{periodLabel(manifest.periods.modelTargetPeriodRange.end)}</small>
        </div>
        <div>
          <span>Measured only</span>
          <strong>{manifest.counts.measuredOnlyCount.toLocaleString("en-IN")}</strong>
          <small>No model band</small>
        </div>
        <div>
          <span>Boundary only</span>
          <strong>{manifest.counts.boundaryOnlyCount.toLocaleString("en-IN")}</strong>
          <small>Neutral display</small>
        </div>
        <div>
          <span>Join coverage</span>
          <strong>{diagnostics.joinedCount}/{diagnostics.geometryCount}</strong>
          <small>Stable boundary IDs</small>
        </div>
      </div>
      <div className={styles.qualityReadout}>
        <span>Active visual quality</span>
        <strong>{quality}</strong>
      </div>
      {scenePerformance ? (
        <div className={styles.performanceReadout}>
          <span>
            {scenePerformance.drawCalls ?? "—"} draw calls ·{" "}
            {scenePerformance.surfaceVertexCount.toLocaleString("en-IN")} surface vertices
          </span>
          <span>
            Initial scene {scenePerformance.initialLoadMs ?? "—"} ms ·{" "}
            {scenePerformance.geometries ?? "—"} GPU geometries
          </span>
        </div>
      ) : null}
    </section>
  );
}

export function LivingWaterTablePage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    joined,
    diagnostics,
    mapGeometry,
    districtGeometry,
    districtAggregates,
    manifest,
    modelCard,
  } = livingWaterTableData;
  const recordsById = useMemo(
    () =>
      new Map(
        joined.map((feature) => [
          feature.record.identity.mandalId,
          feature,
        ]),
      ),
    [joined],
  );
  const selectedQuery = searchParams.get("mandal");
  const selectedFeature = selectedQuery
    ? recordsById.get(selectedQuery) ?? null
    : null;
  const qualityQuery = searchParams.get("quality");
  const qualityChoice: QualityChoice = isQuality(qualityQuery)
    ? qualityQuery
    : "auto";
  const { resolved: resolvedQuality, reducedMotion, autoReason } =
    useDeviceQuality(qualityChoice);
  const [webGLAvailable, setWebGLAvailable] = useState<boolean | null>(null);
  const [sceneFailure, setSceneFailure] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverState>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({
    type: "reset",
    sequence: 0,
  });
  const [scenePerformance, setScenePerformance] =
    useState<ScenePerformance | null>(null);
  const loadStartedAt = useRef(0);
  const view2D = searchParams.get("view") === "2d";
  // Flat is the default (subtle analytical read); ?surface=relief opts into depth extrusion.
  const relief = searchParams.get("surface") === "relief";
  const granularity: MapGranularity =
    searchParams.get("granularity") === "district" ? "district" : "mandal";
  const [districtHover, setDistrictHover] = useState<{
    aggregate: DistrictAggregate;
    x: number;
    y: number;
  } | null>(null);

  useLayoutEffect(() => {
    const priorScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    return () => {
      window.history.scrollRestoration = priorScrollRestoration;
    };
  }, []);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) next.delete(key);
        else next.set(key, value);
      });
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    loadStartedAt.current =
      typeof performance === "undefined" ? Date.now() : performance.now();
    setWebGLAvailable(supportsWebGL());
  }, []);

  // Clear stale tooltips when switching mandal/district granularity.
  useEffect(() => {
    setHover(null);
    setDistrictHover(null);
  }, [granularity]);

  useEffect(() => {
    if (selectedQuery && !recordsById.has(selectedQuery)) {
      updateQuery({ mandal: null });
    }
  }, [recordsById, selectedQuery, updateQuery]);

  const sortedFeatures = useMemo(
    () =>
      [...joined].sort((a, b) =>
        `${a.record.identity.mandalName}|${a.record.identity.districtName}`.localeCompare(
          `${b.record.identity.mandalName}|${b.record.identity.districtName}`,
        ),
      ),
    [joined],
  );
  const hoverFeature = hover ? recordsById.get(hover.mandalId) ?? null : null;
  const fallbackReason =
    sceneFailure ??
    (view2D
      ? "The 2D view was selected for this session."
      : "Interactive WebGL is unavailable on this device or browser.");
  const showFallback = view2D || webGLAvailable === false || Boolean(sceneFailure);
  const noGroundwaterDisplayCount =
    manifest.counts.boundaryOnlyCount +
    manifest.counts.noDataCount;

  const selectMandal = (mandalId: string | null) =>
    updateQuery({ mandal: mandalId });
  const issueCameraCommand = (type: CameraCommand["type"]) =>
    setCameraCommand((current) => ({
      type,
      sequence: current.sequence + 1,
    }));
  const onHover = (
    feature: JoinedMandal | null,
    position?: { x: number; y: number },
  ) => {
    setHover(
      feature && position
        ? {
            mandalId: feature.record.identity.mandalId,
            x: position.x,
            y: position.y,
          }
        : null,
    );
  };
  const onDistrictHover = (
    aggregate: DistrictAggregate | null,
    position?: { x: number; y: number },
  ) => {
    setDistrictHover(
      aggregate && position
        ? { aggregate, x: position.x, y: position.y }
        : null,
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.breadcrumb}>
            Andhra Pradesh Groundwater Assessment <span aria-hidden="true">/</span>{" "}
            Living Water Table
          </div>
          <div className={styles.titleRow}>
            <h1>Living Water Table — Andhra Pradesh</h1>
            <span className={styles.experimentalBadge}>Experimental</span>
          </div>
          <p>
            A restrained 3D analytical view of V2 measured groundwater status,
            held-out model comparisons and explicit no-data boundaries.
          </p>
        </div>
        <div className={styles.headerControls}>
          <label>
            Visual quality
            <select
              aria-label="Visual quality"
              value={qualityChoice}
              onChange={(event) =>
                updateQuery({ quality: event.target.value })
              }
            >
              <option value="auto">Auto</option>
              <option value="standard">Standard</option>
              <option value="reduced">Reduced</option>
            </select>
          </label>
          <button
            type="button"
            aria-pressed={granularity === "district"}
            onClick={() =>
              updateQuery({
                granularity: granularity === "district" ? null : "district",
              })
            }
          >
            {granularity === "district" ? "Mandal view" : "District view"}
          </button>
          <button
            type="button"
            aria-pressed={relief}
            onClick={() => updateQuery({ surface: relief ? null : "relief" })}
          >
            {relief ? "Flat view" : "Relief view"}
          </button>
          <button
            type="button"
            onClick={() => updateQuery({ view: view2D ? null : "2d" })}
          >
            {view2D ? "Enable 3D" : "Use 2D fallback"}
          </button>
        </div>
      </header>

      <section className={styles.summaryStrip} aria-label="Dataset coverage summary">
        <div>
          <span>Boundary features</span>
          <strong>{manifest.counts.boundaryFeatureCount.toLocaleString("en-IN")}</strong>
          <small>Prototype geometry</small>
        </div>
        <div>
          <span>Modelled records</span>
          <strong>{manifest.counts.modelledRecordCount.toLocaleString("en-IN")}</strong>
          <small>Held-out model estimates</small>
        </div>
        <div>
          <span>Measured only</span>
          <strong>{manifest.counts.measuredOnlyCount.toLocaleString("en-IN")}</strong>
          <small>No model interval</small>
        </div>
        <div>
          <span>Boundary/no data</span>
          <strong>{noGroundwaterDisplayCount.toLocaleString("en-IN")}</strong>
          <small>No substituted value</small>
        </div>
        <div>
          <span>Model target</span>
          <strong>{periodLabel(manifest.periods.modelTargetPeriodRange.end)}</strong>
          <small>{manifest.periods.modelTargetPeriodRange.latestTargetCount} records</small>
        </div>
      </section>

      <section className={styles.accessBar} aria-label="Keyboard mandal selection">
        <label htmlFor="living-water-table-mandal-select">
          Keyboard mandal selection
        </label>
        <select
          id="living-water-table-mandal-select"
          value={selectedFeature?.record.identity.mandalId ?? ""}
          onChange={(event) => selectMandal(event.target.value || null)}
        >
          <option value="">Select a mandal…</option>
          {sortedFeatures.map((feature) => (
            <option
              value={feature.record.identity.mandalId}
              key={feature.record.identity.mandalId}
            >
              {feature.record.identity.mandalName} —{" "}
              {feature.record.identity.districtName} (
              {feature.record.identity.coverageStatus.replaceAll("_", " ")})
            </option>
          ))}
        </select>
        <span>
          {qualityChoice === "auto"
            ? `Auto · Using ${resolvedQuality[0].toUpperCase()}${resolvedQuality.slice(1)}`
            : `${resolvedQuality[0].toUpperCase()}${resolvedQuality.slice(1)} selected`}
          {reducedMotion ? " · reduced motion respected" : ""}
        </span>
      </section>

      <div className={styles.mainGrid}>
        <section className={styles.stage} aria-label="Groundwater map stage">
          <div className={styles.stageTopline}>
            <div>
              <strong>Andhra Pradesh groundwater depth</strong>
              <span>
                {granularity === "district"
                  ? "District surface · aggregated depth"
                  : "Mandal surface · district outlines"}
              </span>
            </div>
            <span className={styles.contractTag}>V2 contract · 2.0.0</span>
          </div>
          <div
            className={`${styles.canvasHost} ${hover ? styles.canvasHover : ""}`}
            data-testid="living-water-table-stage"
          >
            {webGLAvailable === null && !view2D ? (
              <div className={styles.loadingState}>
                <span />
                Checking 3D capability and V2 joins…
              </div>
            ) : showFallback ? (
              <WebGLFallback
                joined={joined}
                bbox={mapGeometry.bbox}
                selectedMandalId={
                  selectedFeature?.record.identity.mandalId ?? null
                }
                reason={fallbackReason}
                onSelect={selectMandal}
                onRetry3D={() => {
                  setSceneFailure(null);
                  setWebGLAvailable(supportsWebGL());
                  updateQuery({ view: null });
                }}
              />
            ) : (
              <SceneErrorBoundary
                onError={setSceneFailure}
                fallback={(message) => (
                  <WebGLFallback
                    joined={joined}
                    bbox={mapGeometry.bbox}
                    selectedMandalId={
                      selectedFeature?.record.identity.mandalId ?? null
                    }
                    reason={`3D scene error: ${message}`}
                    onSelect={selectMandal}
                    onRetry3D={() => setSceneFailure(null)}
                  />
                )}
              >
                <LivingWaterTableScene
                  joined={joined}
                  districtGeometry={districtGeometry}
                  districtAggregates={districtAggregates}
                  bbox={mapGeometry.bbox}
                  quality={resolvedQuality}
                  relief={relief}
                  granularity={granularity}
                  selectedMandalId={
                    selectedFeature?.record.identity.mandalId ?? null
                  }
                  cameraCommand={cameraCommand}
                  onHover={onHover}
                  onDistrictHover={onDistrictHover}
                  onSelect={selectMandal}
                  onContextLost={() =>
                    setSceneFailure(
                      "The browser reported a lost WebGL context. The 2D fallback is active.",
                    )
                  }
                  loadStartedAt={loadStartedAt.current}
                  onSceneReady={setScenePerformance}
                />
              </SceneErrorBoundary>
            )}

            {!showFallback && webGLAvailable ? <WaterTableLegend /> : null}
            {!showFallback && webGLAvailable ? (
              <div className={styles.sceneControls} aria-label="3D camera controls">
                <button
                  type="button"
                  onClick={() => issueCameraCommand("zoom_in")}
                  aria-label="Zoom in"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => issueCameraCommand("zoom_out")}
                  aria-label="Zoom out"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => issueCameraCommand("reset")}
                >
                  Reset view
                </button>
              </div>
            ) : null}
            {!showFallback && webGLAvailable ? (
              <div className={styles.interactionGuide}>
                <span><b aria-hidden="true">↻</b> Drag to rotate</span>
                <span><b aria-hidden="true">⌁</b> Scroll to zoom</span>
                <span><b aria-hidden="true">◎</b> Click a mandal</span>
                <button
                  type="button"
                  onClick={() => issueCameraCommand("reset")}
                  aria-label="Reset 3D view"
                >
                  <b aria-hidden="true">↺</b> Reset view
                </button>
              </div>
            ) : null}
            <HoverTooltip hover={hover} feature={hoverFeature} />
            <DistrictHoverTooltip hover={districtHover} />
            <div className={styles.periodRail}>
              <span>Measured history: through {periodLabel(manifest.periods.latestObservationPeriod)}</span>
              <strong>
                Model target: {periodLabel(manifest.periods.modelTargetPeriodRange.end)}
              </strong>
              <span>No released forecast used</span>
            </div>
          </div>
        </section>

        <aside className={styles.rightRail}>
          <SelectedMandalPanel feature={selectedFeature} />
          <StateInsights
            quality={resolvedQuality}
            scenePerformance={scenePerformance}
          />
        </aside>
      </div>

      <section className={styles.disclosure}>
        <div>
          <strong>What this view means</strong>
          <p>
            Colours represent held-out model estimates of depth to water in
            metres below ground level only where the V2 record contains that
            output. A valid same-period measured aggregate remains the primary
            status in the detail panel. Measured-only and no-data boundaries
            remain explicitly separate. In relief view, column height encodes
            the displayed depth-to-water estimate (taller columns mean the water
            table sits deeper); flat view uses a uniform height. District view
            rolls mandal depth up to district level (mean of valued mandals).
            Height never encodes groundwater volume or subsurface geology.
          </p>
        </div>
        <div>
          <strong>Scientific boundary</strong>
          <p>
            GRACE-DA is regional model-assimilated context, not direct
            mandal-level groundwater-depth measurement. This analytical
            prototype does not replace official field measurements or APWRIMS
            outputs.
          </p>
        </div>
      </section>

      <details className={styles.diagnostics}>
        <summary>Data, join and rendering diagnostics</summary>
        <div>
          <span>Joined {diagnostics.joinedCount}/{diagnostics.geometryCount}</span>
          <span>Unmatched geometry {diagnostics.unmatchedGeometryCount}</span>
          <span>Unmatched records {diagnostics.unmatchedRecordCount}</span>
          <span>Duplicate IDs {diagnostics.duplicateBoundaryIdCount}</span>
          <span>Invalid coordinate rings {diagnostics.invalidCoordinateCount}</span>
          <span>
            Manifest reconciliation {diagnostics.manifestCountMatches ? "passed" : "failed"}
          </span>
          <span>
            Interval type: {modelCard.evaluations.intervalEvaluation.intervalType}
          </span>
          <span>
            Auto quality basis: {autoReason}
          </span>
        </div>
      </details>
    </div>
  );
}
