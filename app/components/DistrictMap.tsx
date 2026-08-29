"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { GeoJsonObject } from "geojson";
import type { GeoJSON, Map as LeafletMap, PathOptions, TileLayer } from "leaflet";
import { districtGeometry, districtLayerColor, formatNumber, formatPeriod, titleCase } from "../lib/data";
import type { DistrictFeature, DistrictLayerKey } from "../lib/types";

// CARTO began stamping "API KEY REQUIRED" into its keyless basemap tiles, so the
// watermark appeared over every map without any change on our side. OpenStreetMap's
// standard tiles need no key. There is no dark variant, so dark mode is a CSS
// filter over the same tiles (see .leaflet-tile-pane in globals.css).
const BASEMAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const BASEMAP_ATTRIBUTION = "&copy; OpenStreetMap contributors";

function isDark() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

function tooltipHtml(p: DistrictFeature) {
  const bal = p.water_balance_mm;
  const balColor = p.water_balance_status === "Surplus" ? "#5e9b6b" : p.water_balance_status === "Deficit" ? "#c65a46" : "#1f8a8a";
  return (
    `<span class="tipHead"><b>${titleCase(p.d)}</b><span class="tipPill" style="color:#2a6f97;background:#2a6f9722">${p.mandal_count} mandals</span></span>` +
    `<span class="tipDist">District zonal mean · satellite/model</span>` +
    `<span class="tipRow"><i>NASA Groundwater %ile</i><b>${p.gw_percentile ?? "—"}</b></span>` +
    `<span class="tipRow"><i>Rainfall (CHIRPS)</i><b>${p.rainfall_mm ?? "—"} mm</b></span>` +
    `<span class="tipRow"><i>Actual ET (annual)</i><b>${p.annual_et_mm ?? "—"} mm</b></span>` +
    (bal !== null
      ? `<span class="tipRow"><i>Water balance</i><b style="color:${balColor}">${p.water_balance_status} (${bal > 0 ? "+" : ""}${bal} mm)</b></span>`
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
    let tile: TileLayer | null = null;

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
      tile = L.tileLayer(BASEMAP_URL, {
        attribution: BASEMAP_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

      const styleFor = (feat?: { properties?: DistrictFeature }): PathOptions => {
        const p = feat?.properties as DistrictFeature;
        const co = colorRef.current;
        if (co && p && co[p.d]) {
          return { weight: 1, color: "#ffffff", fillColor: co[p.d], fillOpacity: 0.85 };
        }
        const sc = scenarioRef.current;
        if (sc && p) {
          const v = sc[p.d] ?? null;
          return { weight: 1, color: "#ffffff", fillColor: districtLayerColor("water_balance_mm", v), fillOpacity: 0.86 };
        }
        const value = p ? (p[layerRef.current] as number | null) : null;
        return { weight: 1, color: "#ffffff", fillColor: districtLayerColor(layerRef.current, value), fillOpacity: 0.82 };
      };

      const geo: GeoJSON = L.geoJSON(fc as GeoJsonObject, {
        style: styleFor,
        onEachFeature: (feat, lyr) => {
          const p = feat.properties as DistrictFeature;
          lyr.bindTooltip(tooltipHtml(p), { sticky: true, className: "liveTip", direction: "top", opacity: 1 });
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

      // Dark mode is a CSS filter over the tile pane now, so there is no theme
      // observer here any more — the tile URL never changes.
    })();

    return () => {
      cancelled = true;
      geoRef.current = null;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, []);

  // Recolor on layer change, scenario update, or colour override without re-initialising the map.
  const scenarioSig = scenarioValues ? Object.values(scenarioValues).join(",") : "";
  const colorSig = colorOverride ? Object.values(colorOverride).join(",") : "";
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    geo.eachLayer((lyr) => {
      const path = lyr as unknown as { feature?: { properties?: DistrictFeature }; setStyle: (s: PathOptions) => void };
      const p = path.feature?.properties;
      if (colorOverride && p && colorOverride[p.d]) {
        path.setStyle({ fillColor: colorOverride[p.d], fillOpacity: 0.85, weight: 1, color: "#ffffff" });
        return;
      }
      if (scenarioValues && p) {
        const v = scenarioValues[p.d] ?? null;
        path.setStyle({ fillColor: districtLayerColor("water_balance_mm", v), fillOpacity: 0.86, weight: 1, color: "#ffffff" });
        return;
      }
      const value = p ? (p[layer] as number | null) : null;
      path.setStyle({ fillColor: districtLayerColor(layer, value), fillOpacity: 0.82, weight: 1, color: "#ffffff" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, scenarioSig, colorSig]);

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
