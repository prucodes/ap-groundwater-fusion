"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { GeoJsonObject } from "geojson";
import type { GeoJSON, Map as LeafletMap, PathOptions } from "leaflet";
import { districtGeometry, districtLayerColor, formatNumber, formatPeriod, titleCase } from "../lib/data";
import type { DistrictFeature, DistrictLayerKey } from "../lib/types";
import { addVectorBasemap } from "./vectorBasemap";
import { applyMapTooltipStyle } from "../lib/mapTooltip";

// The basemap is vector, in the platform's palette, with names above the data (vectorBasemap.ts).

function isDark() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

/** District borders: white lines on the light map, softened on the dark one, where solid
 *  white outlined every district in glare. Matches the mandal map's dark edges. */
const edgeColor = () => (isDark() ? "rgba(255,255,255,0.45)" : "#ffffff");

function fillFor(p: DistrictFeature | undefined, layer: DistrictLayerKey, scenario?: Record<string, number | null>, override?: Record<string, string>) {
  if (p && override?.[p.d]) return override[p.d];
  if (p && scenario) return districtLayerColor("water_balance_mm", scenario[p.d] ?? null, isDark());
  return districtLayerColor(layer, p ? p[layer] as number | null : null, isDark());
}

function tooltipHtml(p: DistrictFeature, layer: DistrictLayerKey, scenario?: Record<string, number | null>, override?: Record<string, string>) {
  const bal = p.water_balance_mm;
  const row = (key: DistrictLayerKey | "annual_et_mm", label: string, value: string) => `<span class="tipRow${!scenario && !override?.[p.d] && layer === key ? " tipActive" : ""}"><i>${label}</i><b>${value}</b></span>`;
  return (
    `<span class="tipHead"><b>${titleCase(p.d)}</b><span class="tipPill" style="color:#2a6f97;background:#2a6f9722">${p.mandal_count} mandals</span></span>` +
    `<span class="tipDist">District zonal mean · satellite/model</span>` +
    (scenario ? `<span class="tipRow tipActive"><i>Scenario balance</i><b>${scenario[p.d] ?? "Unavailable"}${scenario[p.d] == null ? "" : " mm"}</b></span>` : "") +
    row("gw_percentile", "NASA Groundwater %ile", `${p.gw_percentile ?? "—"}`) +
    row("rainfall_mm", "Rainfall (CHIRPS)", `${p.rainfall_mm ?? "—"} mm`) +
    row("annual_et_mm", "Actual ET (annual)", `${p.annual_et_mm ?? "—"} mm`) +
    (bal !== null
      ? row("water_balance_mm", "Water balance", `${p.water_balance_status} (${bal > 0 ? "+" : ""}${bal} mm)`)
      : "") +
    `<span class="tipFoot">Regional context — not groundwater depth</span>`
  );
}

export function DistrictMap({
  layer,
  height = 560,
  scenarioValues,
  colorOverride,
}: {
  layer: DistrictLayerKey;
  height?: number;
  /** When set, override colouring with these per-district water-balance values (modeled scenario). */
  scenarioValues?: Record<string, number | null>;
  /** When set, fill each district with the given hex colour (e.g. advisory categories). */
  colorOverride?: Record<string, string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoRef = useRef<GeoJSON | null>(null);
  const layerRef = useRef<DistrictLayerKey>(layer);
  layerRef.current = layer;
  const scenarioRef = useRef<Record<string, number | null> | undefined>(scenarioValues);
  scenarioRef.current = scenarioValues;
  const colorRef = useRef<Record<string, string> | undefined>(colorOverride);
  colorRef.current = colorOverride;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let stopBasemap: (() => void) | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const features = districtGeometry.districts.map((d) => ({
        type: "Feature" as const,
        properties: d,
        geometry: { type: "MultiPolygon" as const, coordinates: d.rings.map((ring) => [ring]) },
      }));
      const fc = { type: "FeatureCollection" as const, features };

      const dark = isDark();
      map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false, zoomSnap: 0.25, maxBoundsViscosity: 1 });
      mapRef.current = map;
      addVectorBasemap(L, map, { cancelled: () => cancelled }).then((stop) => { stopBasemap = stop; });

      const styleFor = (feat?: { properties?: DistrictFeature }): PathOptions => {
        const p = feat?.properties as DistrictFeature;
        return { weight: 1, color: edgeColor(), fillColor: fillFor(p, layerRef.current, scenarioRef.current, colorRef.current),
          fillOpacity: colorRef.current?.[p?.d] ? 0.85 : scenarioRef.current ? 0.86 : 0.82 };
      };

      const geo: GeoJSON = L.geoJSON(fc as GeoJsonObject, {
        style: styleFor,
        onEachFeature: (feat, lyr) => {
          const p = feat.properties as DistrictFeature;
          lyr.bindTooltip(() => tooltipHtml(p, layerRef.current, scenarioRef.current, colorRef.current), { sticky: true, className: "liveTip", direction: "auto", opacity: 1 });
          lyr.on("tooltipopen", () => applyMapTooltipStyle(lyr.getTooltip()?.getElement(), fillFor(p, layerRef.current, scenarioRef.current, colorRef.current)));
          const path = lyr as unknown as { setStyle: (s: PathOptions) => void };
          lyr.on("mouseover", () => path.setStyle({ weight: 2.4, fillOpacity: 0.95 }));
          lyr.on("mouseout", () => path.setStyle({ weight: 1, fillOpacity: 0.82 }));
        },
      }).addTo(map);
      geoRef.current = geo;

      const fit = () => {
        try {
          const bounds = geo.getBounds();
          map!.fitBounds(bounds, { padding: [14, 14] });
          // Keep the view on Andhra Pradesh. pad() is a fraction of the span,
          // so this is a little slack for centring edge districts — 0.6 was
          // enough to pan almost entirely off the state.
          map!.setMaxBounds(bounds.pad(0.12));
          map!.setMinZoom(map!.getZoom() - 0.5);
        } catch {
          map!.setView([15.9, 79.7], 6);
        }
      };
      fit();
      setTimeout(() => { map?.invalidateSize(); fit(); }, 60);
      setTimeout(() => map?.invalidateSize(), 300);

      // The basemap follows the theme itself (vectorBasemap.ts).
    })();

    return () => {
      cancelled = true;
      stopBasemap?.();
      geoRef.current = null;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recolor on layer change, scenario update, or colour override without re-initialising the map.
  const [theme, setTheme] = useState<string | undefined>(undefined);
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme);
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  const scenarioSig = scenarioValues ? Object.values(scenarioValues).join(",") : "";
  const colorSig = colorOverride ? Object.values(colorOverride).join(",") : "";
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    geo.eachLayer((lyr) => {
      const path = lyr as unknown as { feature?: { properties?: DistrictFeature }; setStyle: (s: PathOptions) => void };
      const p = path.feature?.properties;
      const fill = fillFor(p, layer, scenarioValues, colorOverride);
      if (p) lyr.setTooltipContent(tooltipHtml(p, layer, scenarioValues, colorOverride));
      applyMapTooltipStyle(lyr.getTooltip()?.getElement(), fill);
      if (colorOverride && p && colorOverride[p.d]) {
        path.setStyle({ fillColor: fill, fillOpacity: 0.85, weight: 1, color: edgeColor() });
        return;
      }
      if (scenarioValues && p) {
        path.setStyle({ fillColor: fill, fillOpacity: 0.86, weight: 1, color: edgeColor() });
        return;
      }
      path.setStyle({ fillColor: fill, fillOpacity: 0.82, weight: 1, color: edgeColor() });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, scenarioSig, colorSig, theme]);

  return (
    <div className="liveMapWrap" style={{ height }}>
      <div ref={containerRef} className="liveMap" style={{ height }} />
    </div>
  );
}

export function districtLayerMeta(layer: DistrictLayerKey) {
  return {
    ...districtGeometry.layers[layer],
    period: layer === "rainfall_mm" ? formatPeriod(districtGeometry.rainfall_period) : layer === "water_balance_mm" ? districtGeometry.balance_year : "near-real-time",
    fmtMin: formatNumber(districtGeometry.layers[layer].min),
    fmtMax: formatNumber(districtGeometry.layers[layer].max),
  };
}
