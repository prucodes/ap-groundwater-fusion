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
import { dashboardSummary, datasetManifest, districts, formatNumber, mandalHeat, mandals, selectedMandal, verifyMandals } from "../lib/data";
import type { MandalHeatLayerKey } from "../lib/types";

export default function OverviewPage() {
  const s = dashboardSummary.summary;
  const [selectedId, setSelectedId] = useState(mandals[0]?.id);
  const [mapView, setMapView] = useState<"status" | MandalHeatLayerKey>("status");
  const current = selectedMandal(selectedId);
  const verifyCount = verifyMandals().length;
  const verifyPct = Math.round((verifyCount / datasetManifest.counts.modelledRecordCount) * 100);

  return (
    <div className="pageWrap">
      <HeaderHero />

      <div className="kpiRow stagger">
        <KpiCard
          icon={<IconLayers />}
          label="Modelled Mandals"
          value={<CountUp value={datasetManifest.counts.modelledRecordCount} />}
          foot={`Across ${districts.length} districts`}
          accent="var(--teal)"
        />
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
          foot="district/regional model-assimilated context (0–100)"
          accent="var(--cyan)"
        />
        {s.avg_water_balance_mm !== null && s.avg_water_balance_mm !== undefined && (
          <KpiCard
            icon={<IconCloudRain />}
            label="Mandals in Water Deficit"
            value={<CountUp value={s.deficit_mandals} />}
            foot={`Annual balance · TerraClimate ${s.balance_year}`}
            footAccent
            accent="var(--rust)"
          />
        )}
        <KpiCard
          icon={<IconShield />}
          label="Coverage Foundation"
          value={<span style={{ fontSize: 22 }}>{datasetManifest.counts.boundaryFeatureCount} boundaries</span>}
          foot={`${datasetManifest.counts.measuredOnlyCount} measured-only · ${datasetManifest.counts.boundaryOnlyCount} boundary-only`}
          accent="var(--amber)"
        />
      </div>

      <div className="overviewGrid">
        <section className="card mapCard">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon">
                <IconMap />
              </span>
              Mandal Status Map — Andhra Pradesh
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
            height={420}
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
        </section>

        <div className="contentGrid">
          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconGlobe />
                </span>
                Mandal Status Summary
              </div>
            </div>
            <StatusSummaryCard />
          </section>

          <section className="card">
            <div className="cardHead">
              <div className="cardTitle">
                <span className="titleIcon">
                  <IconWaves />
                </span>
                Satellite Signal Summary
              </div>
              <span className="cardSub">NASA/NDMC GRACE-DA</span>
            </div>
            <SatelliteSignalCards />
          </section>
        </div>

        <SelectedMandalPanel mandal={current} />
      </div>

      <div className="overviewLower">
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon">
                <IconActivity />
              </span>
              Top Mandals to Verify
              <span className="cardSub" style={{ marginLeft: 6 }}>
                Mismatch / Low Confidence
              </span>
            </div>
            <Link className="linkAction" href="/watchlist">
              View full watchlist <IconArrowRight />
            </Link>
          </div>
          <MandalTable rows={mandals} limit={8} selectedId={selectedId} onSelect={setSelectedId} />
        </section>

        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon">
                <IconShield />
              </span>
              Data Source Readiness
            </div>
            <Link className="linkAction" href="/readiness">
              Details <IconArrowRight />
            </Link>
          </div>
          <SourceReadinessPanel compact />
        </section>
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
