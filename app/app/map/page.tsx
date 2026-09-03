"use client";

import { useEffect, useRef, useState } from "react";
import { HeaderHero } from "../../components/HeaderHero";
import { MandalStatusMap } from "../../components/MandalStatusMap";
import { DistrictMap, districtLayerMeta } from "../../components/DistrictMap";
import { MapLegend } from "../../components/MapLegend";
import { StatusSummaryCard } from "../../components/StatusSummaryCard";
import { StatusLegend } from "../../components/StatusLegend";
import { SelectedMandalPanel } from "../../components/SelectedMandalPanel";
import { IconGlobe, IconGrid, IconInfo, IconMap } from "../../components/icons";
import {
  latestObservationPeriod,
  districtGeometry,
  formatNumber,
  formatPeriod,
  mandalByMapKey,
  mandalHeat,
  mandals,
  mapGeometry,
  selectedMandal,
  statusMeta,
  titleCase,
} from "../../lib/data";
import type { DistrictLayerKey, MandalHeatLayerKey } from "../../lib/types";

const LAYERS: { key: DistrictLayerKey; label: string }[] = [
  { key: "water_balance_mm", label: "Water Balance" },
  { key: "gw_percentile", label: "Groundwater %ile" },
  { key: "rainfall_mm", label: "Rainfall" },
];

type MandalView = "status" | MandalHeatLayerKey;
const MANDAL_VIEWS: { key: MandalView; label: string }[] = [
  { key: "status", label: "Fusion status" },
  { key: "water_balance_mm", label: "Water Balance" },
  { key: "rainfall_mm", label: "Rainfall" },
];

function legendGradient(layer: string) {
  return layer === "water_balance_mm"
    ? "linear-gradient(90deg, #c65a46, #e7cf86, #4f9268)"
    : "linear-gradient(90deg, #e6f1f8, #0e6f95)";
}

export default function MapPage() {
  const [level, setLevel] = useState<"mandal" | "district">("mandal");
  const [layer, setLayer] = useState<DistrictLayerKey>("water_balance_mm");
  const [mandalView, setMandalView] = useState<MandalView>("status");
  const [selectedId, setSelectedId] = useState(mandals[0]?.id);
  const current = selectedMandal(selectedId);
  const meta = districtLayerMeta(layer);

  // Where the selected-mandal panel sits. Above the breakpoint it is a rail
  // beside the map and a selection is visible immediately; below it, the rail
  // stacks under everything in the main column, so a tap on the map looked like
  // it did nothing at all. Bring the panel to the user instead.
  const panelRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 1080px)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    panelRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }, [selectedId]);

  // Priority list — most-stressed first, capped (rendering all ~640 was slow).
  // Explicit boundary coverage — how many of the prototype polygons resolve to data.
  const totalBoundaries = mapGeometry.mandals.length;
  const mappedBoundaries = mapGeometry.mandals.filter((g) => mandalByMapKey(g.d, g.m)).length;

  const SEV: Record<string, number> = { Stress: 0, Verify: 1, Watch: 2, "Low Confidence": 3, Normal: 4 };
  const topMandals = [...mandals]
    .sort((a, b) => (SEV[a.status_bucket] ?? 5) - (SEV[b.status_bucket] ?? 5) || (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0))
    .slice(0, 12);

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Groundwater Status Map"
        subtitle={
          <>
            Switch between <strong>mandal fusion status</strong> (APWRIMS sensors + NASA) and a{" "}
            <strong>statewide district heat-map</strong> of real satellite layers.
          </>
        }
        showChips={false}
        variant="compact"
      />

      <div className="mapWorkspace">
      <section className="card mapCard">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconMap />
                </span>
                {level === "mandal" ? "Andhra Pradesh — Mandal Fusion Status" : "Andhra Pradesh — District Heat-Map"}
                {latestObservationPeriod ? (
                  <span className="dataAsOf">
                    Latest observation period {formatPeriod(latestObservationPeriod)}
                  </span>
                ) : null}
              </div>
              <div className="segmented">
                <button
                  className={`segBtn ${level === "mandal" ? "active" : ""}`}
                  onClick={() => setLevel("mandal")}
                  type="button"
                >
                  <IconMap /> Mandal
                </button>
                <button
                  className={`segBtn ${level === "district" ? "active" : ""}`}
                  onClick={() => setLevel("district")}
                  type="button"
                >
                  <IconGrid /> District
                </button>
              </div>
            </div>

            <div className="layerBar">
              <span className="layerBarLabel">{level === "mandal" ? "View" : "Layer"}</span>
              {(level === "mandal" ? MANDAL_VIEWS : LAYERS).map((l) => {
                const active = level === "mandal" ? mandalView === l.key : layer === l.key;
                return (
                  <button
                    key={l.key}
                    type="button"
                    className={`layerChip ${active ? "active" : ""}`}
                    onClick={() => (level === "mandal" ? setMandalView(l.key as MandalView) : setLayer(l.key as DistrictLayerKey))}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>

            {level === "mandal" ? (
              <>
                <MandalStatusMap
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  layer={mandalView === "status" ? null : mandalView}
                />
                {mandalView === "status" ? (
                  <>
                    <MapLegend />
                    <div className="mapHint">
                      Coverage: <strong>{mappedBoundaries}</strong> of {totalBoundaries} prototype mandal
                      boundaries have a fused record; {totalBoundaries - mappedBoundaries} have no usable APWRIMS
                      series yet (shown grey).
                    </div>
                  </>
                ) : (
                  <div className="choroLegend">
                    <div className="choroHead">
                      <span>
                        {mandalView === "rainfall_mm" ? "Rainfall (CHIRPS)" : "Water Balance"}{" "}
                        <span className="choroUnit">({mandalView === "rainfall_mm" ? "mm" : "mm/yr"})</span>
                      </span>
                      <span className="choroPeriod">
                        {mandalView === "rainfall_mm" ? formatPeriod(mandalHeat.rainfall_period) : mandalHeat.balance_year} · {mandalHeat.count} mandals
                      </span>
                    </div>
                    <div className="choroBar" style={{ background: legendGradient(mandalView) }} />
                    <div className="choroScale">
                      <span>{mandalView === "water_balance_mm" ? "Deficit" : "Low"} · {formatNumber(mandalHeat.layers[mandalView].min)}</span>
                      <span>{mandalView === "water_balance_mm" ? "Surplus" : "High"} · {formatNumber(mandalHeat.layers[mandalView].max)}</span>
                    </div>
                    <div className="mapHint">
                      <IconInfo style={{ width: 13, height: 13 }} /> Per-mandal zonal means of real satellite layers. GRACE
                      is shown only at district level (sub-pixel at mandal scale).
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <DistrictMap layer={layer} height={540} />
                <div className="choroLegend">
                  <div className="choroHead">
                    <span>
                      {meta.label} <span className="choroUnit">({meta.unit})</span>
                    </span>
                    <span className="choroPeriod">{meta.period}</span>
                  </div>
                  <div className="choroBar" style={{ background: legendGradient(layer) }} />
                  <div className="choroScale">
                    <span>{layer === "water_balance_mm" ? "Deficit" : "Low"} · {formatNumber(meta.min)}</span>
                    <span>{layer === "water_balance_mm" ? "Surplus" : "High"} · {formatNumber(meta.max)}</span>
                  </div>
                  <div className="mapHint">
                    <IconInfo style={{ width: 13, height: 13 }} /> District zonal means of real satellite/model
                    layers over {districtGeometry.district_count} AP districts — regional context, not groundwater depth.
                  </div>
                </div>
              </>
            )}

            <details className="legendKey">
              <summary>What do these levels mean?</summary>
              <StatusLegend />
            </details>
      </section>

      <aside className="mapRail">
        <div ref={panelRef} style={{ scrollMarginTop: 68 }}>
          <SelectedMandalPanel mandal={current} />
        </div>
      </aside>
      </div>

      <div className="mapLower">
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle"><span className="titleIcon"><IconGlobe /></span>Status Distribution</div>
          </div>
          <StatusSummaryCard />
        </section>

        <section className="card">
        <div className="cardHead">
          <div className="cardTitle">Priority Mandals</div>
          <span className="cardSub">top 12 · most stressed</span>
        </div>
        <div className="readinessList readinessGrid">
          {topMandals.map((m) => {
            const sm = statusMeta(m.status_bucket);
            const active = m.id === selectedId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedId(m.id)}
                className="readinessItem"
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: active ? sm.color : "var(--line)",
                  background: active ? "rgba(18,181,203,0.05)" : "var(--card)",
                }}
              >
                <span className="readyIcon" style={{ background: `${sm.color}22`, color: sm.color }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: sm.color }} />
                </span>
                <div className="readyBody">
                  <div className="readyLabel">{titleCase(m.mandal_name)}</div>
                  <div className="readyMeta">
                    {titleCase(m.district_name)} · est {formatNumber(m.estimate_mbgl)} m
                  </div>
                </div>
                <span className="readyTag" style={{ background: `${sm.color}1f`, color: sm.color }}>
                  {sm.label}
                </span>
              </button>
            );
          })}
        </div>
        </section>
      </div>
    </div>
  );
}
