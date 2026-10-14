"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { GeoJsonObject } from "geojson";
import type { GeoJSON, Layer, Map as LeafletMap, PathOptions } from "leaflet";
import {
  districtGeometry,
  mandalByMapKey,
  mandalHeatColor,
  mandalHeatValue,
  mandals,
  mapGeometry,
  statusMeta,
  titleCase,
} from "../lib/data";
import { isWaterLayer, WATER_LAYER_META, waterLayerColor, waterLayerText, type WaterMandalLayer } from "../lib/waterMandals";
import type { MandalHeatLayerKey } from "../lib/types";
import { useIsDark } from "./useIsDark";
import { addVectorBasemap } from "./vectorBasemap";
import { applyMapTooltipStyle } from "../lib/mapTooltip";
import { MapExpand } from "./MapExpand";

type Mode = "status" | "single";

type SeedProps = {
  seed: boolean;
  id?: string;
  d: string;
  m: string;
  bucket?: string;
  gw: number | null;
  root: number | null;
  surface: number | null;
  rain: number | null;
  median: number | null;
  latest: number | null;
  period: string | null;
  estimate: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  gap: number | null;
  outsideBand: boolean;
  bandExcess: number | null;
  balance: number | null;
  balanceStatus: string;
  agreement: string;
  centroid?: number[];
};

// The basemap is vector, in the platform's palette, with names above the data (vectorBasemap.ts).

const tooltipOpts = { className: "liveTip", direction: "center" as const, opacity: 1, offset: [0, 0] as [number, number] };

function isDark() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

function activeLayerRow(p: SeedProps, layer: MandalHeatLayerKey | WaterMandalLayer | null) {
  if (!layer) return `<span class="tipRow tipActive"><i>Fusion status</i><b>${p.bucket ? statusMeta(p.bucket).label : "No fused record"}</b></span>`;
  const label = isWaterLayer(layer) ? WATER_LAYER_META[layer].label : layer === "rainfall_mm" ? "Rainfall (CHIRPS)" : "Water balance";
  const value = isWaterLayer(layer) ? waterLayerText(layer, p.d, p.m) ?? "No unique record"
    : mandalHeatValue(p.d, p.m, layer) === null ? "No value" : `${mandalHeatValue(p.d, p.m, layer)} mm`;
  return `<span class="tipRow tipActive"><i>${label}</i><b>${value}</b></span>`;
}

function tooltipHtml(p: SeedProps, layer: MandalHeatLayerKey | WaterMandalLayer | null = null) {
  return (
    `<span class="tipHead"><b>${titleCase(p.m)}</b></span>` +
    `<span class="tipDist">${titleCase(p.d)} District</span>` +
    activeLayerRow(p, layer) +
    `<span class="tipRow"><i>Latest recorded depth</i><b>${p.latest === null ? "Unavailable" : `${p.latest} m bgl`}</b></span>` +
    `<span class="tipRow"><i>Observation</i><b>${p.period ?? "Not supplied"}</b></span>` +
    `<span class="tipRow"><i>NASA GW percentile</i><b>${p.gw ?? "Unavailable"}</b></span>` +
    `<span class="tipFoot">Prototype snapshot · NASA percentile is not depth</span>`
  );
}

function featureStyle(
  p: SeedProps,
  opts: { heatLayer?: MandalHeatLayerKey | WaterMandalLayer | null; dark: boolean; selected: boolean },
): PathOptions {
  if (opts.heatLayer) {
    return {
      weight: opts.selected ? 2 : 0.5,
      color: opts.selected ? "#0d2138" : opts.dark ? "rgba(255,255,255,0.45)" : "#ffffff",
      fillColor: isWaterLayer(opts.heatLayer) ? waterLayerColor(opts.heatLayer, p.d, p.m, opts.dark) : mandalHeatColor(opts.heatLayer, p.d, p.m, opts.dark),
      fillOpacity: 0.82,
    };
  }
  if (p.seed) {
    return {
      weight: opts.selected ? 2.4 : 1.2,
      color: opts.selected ? "#0d2138" : "#ffffff",
      fillColor: statusMeta(p.bucket).color,
      fillOpacity: opts.selected ? 0.9 : 0.72,
    };
  }
  // every mandal with a real record -> full status choropleth
  if (p.id && p.bucket) {
    return {
      weight: opts.selected ? 2.4 : 0.6,
      color: opts.selected ? "#0d2138" : opts.dark ? "rgba(255,255,255,0.55)" : "#ffffff",
      fillColor: statusMeta(p.bucket).color,
      fillOpacity: opts.selected ? 0.95 : 0.78,
    };
  }
  // mandal with no estimate yet — show as a visible "no data" area, not a hole.
  return {
    weight: 0.5,
    color: opts.dark ? "rgba(150,180,210,0.4)" : "rgba(110,130,150,0.6)",
    fillColor: opts.dark ? "#3d4858" : "#c7cdd6",
    fillOpacity: 0.6,
  };
}

export function LiveMap({
  mode = "status",
  mandalId,
  selectedId,
  onSelect,
  navigateOnClick = false,
  height = 460,
  heatLayer = null,
  expandedView = false,
}: {
  mode?: Mode;
  mandalId?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  navigateOnClick?: boolean;
  height?: number | string;
  heatLayer?: MandalHeatLayerKey | WaterMandalLayer | null;
  expandedView?: boolean;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoRef = useRef<GeoJSON | null>(null);
  const tipsRef = useRef<Array<{ layer: Layer; props: SeedProps }>>([]);
  const layersById = useRef<Record<string, Layer>>({});
  const selectedRef = useRef<string | undefined>(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const heatRef = useRef<MandalHeatLayerKey | WaterMandalLayer | null>(heatLayer);
  heatRef.current = heatLayer;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let stopBasemap: (() => void) | null = null;
    let observer: MutationObserver | null = null;
    let resizeObs: ResizeObserver | null = null;
    let mask: Layer | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      const bindTip = (target: Layer, props: SeedProps) => {
        const content = () => tooltipHtml(props, heatRef.current);
        target.bindTooltip(content, tooltipOpts);
        const placeTip = (event?: { originalEvent?: MouseEvent }) => {
          const tip = target.getTooltip(), element = tip?.getElement();
          if (!map || !tip || !element) return;
          const size = map.getSize();
          element.style.width = `${Math.min(256, size.x - 24)}px`;
          const point = event?.originalEvent ? map.mouseEventToContainerPoint(event.originalEvent)
            : map.latLngToContainerPoint(tip.getLatLng() ?? map.getCenter());
          const w = element.offsetWidth, h = element.offsetHeight;
          const preferred = point.x + w + 18 < size.x ? point.x + w / 2 + 14 : point.x - w / 2 - 14;
          const x = Math.max(w / 2 + 10, Math.min(size.x - w / 2 - 10, preferred));
          const y = Math.max(h / 2 + 10, Math.min(size.y - h / 2 - 24, point.y));
          tip.setLatLng(map.containerPointToLatLng([x, y]));
        };
        target.on("tooltipopen", () => {
          applyMapTooltipStyle(target.getTooltip()?.getElement(),
            featureStyle(props, { heatLayer: heatRef.current, dark: isDark(), selected: false }).fillColor ?? "#98a2b3");
          placeTip();
        });
        target.on("mousemove", placeTip);
        tipsRef.current.push({ layer: target, props });
      };
      if (cancelled || !containerRef.current) return;

      // Build GeoJSON from the map outlines (official where rebuilt, prototype elsewhere; lon/lat rings).
      const features = mapGeometry.mandals
        .filter((f) => (mode === "single" ? sameMandal(f, mandalId) : true))
        .map((f) => {
          const rec = mandalByMapKey(f.d, f.m);
          return {
            type: "Feature" as const,
            properties: {
              d: f.d,
              m: f.m,
              seed: f.seed,
              id: rec?.id,
              bucket: rec?.status_bucket,
              gw: rec?.groundwater_percentile ?? null,
              root: rec?.rootzone_percentile ?? null,
              surface: rec?.surface_percentile ?? null,
              rain: rec?.rainfall_mm ?? null,
              median: rec?.median_groundwater_mbgl ?? null,
              latest: rec?.display_mbgl ?? null,
              period: rec?.latest_observation_period ?? null,
              estimate: rec?.estimate_mbgl ?? null,
              estimateLow: rec?.estimate_band_p10 ?? null,
              estimateHigh: rec?.estimate_band_p90 ?? null,
              gap: rec?.obs_model_gap_m ?? null,
              outsideBand: rec?.obs_outside_band === true,
              bandExcess: rec?.obs_band_excess_m ?? null,
              balance: rec?.water_balance_mm ?? null,
              balanceStatus: rec?.water_balance_status ?? "",
              agreement: rec?.sensor_satellite_agreement ?? "",
              centroid: f.c,
            },
            geometry: {
              type: "MultiPolygon" as const,
              coordinates: f.rings.map((ring) => [ring]),
            },
          };
        });
      const fc = { type: "FeatureCollection" as const, features };

      const dark = isDark();
      map = L.map(containerRef.current, {
        zoomControl: mode === "status" || expandedView,
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: mode === "status" || expandedView,
        doubleClickZoom: mode === "status" || expandedView,
        boxZoom: mode === "status" || expandedView,
        keyboard: false,
        zoomSnap: 0.25, maxBoundsViscosity: 1 });
      mapRef.current = map;

      addVectorBasemap(L, map, { cancelled: () => cancelled }).then((stop) => { stopBasemap = stop; });

      // Spotlight mask: dim everything outside Andhra Pradesh so the state
      // reads as a distinct shape against the surrounding basemap, and use the
      // mask stroke to draw a crisp AP outline for free.
      const maskOuter: [number, number][] = [
        [-89, -200],
        [-89, 200],
        [89, 200],
        [89, -200],
      ];
      const apHoles: [number, number][][] = districtGeometry.districts.flatMap((d) =>
        d.rings.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number])),
      );
      const maskStyle = (d: boolean): PathOptions => ({
        stroke: true,
        color: d ? "rgba(120,210,225,0.55)" : "rgba(15,72,110,0.55)",
        weight: 1.4,
        fill: true,
        fillColor: d ? "#050d18" : "#aeb9c6",
        fillOpacity: d ? 0.62 : 0.42,
        fillRule: "evenodd",
        interactive: false,
        className: "apMask",
      });
      if (mode === "status") mask = L.polygon([maskOuter, ...apHoles], maskStyle(dark)).addTo(map);

      const geo: GeoJSON = L.geoJSON(fc as GeoJsonObject, {
        style: (feat) => {
          const p = feat?.properties as SeedProps;
          return featureStyle(p, { heatLayer: heatRef.current, dark, selected: !!p?.id && p.id === selectedRef.current });
        },
        onEachFeature: (feat, layer) => {
          const p = feat.properties as SeedProps;
          const path = layer as unknown as { setStyle: (s: PathOptions) => void };
          const restore = () =>
            path.setStyle(
              featureStyle(p, { heatLayer: heatRef.current, dark: isDark(), selected: !!p.id && p.id === selectedRef.current }),
            );

          if (p.id) {
            // Compact summary on hover; full evidence is in the selected-place panel/page.
            const id = p.id;
            layersById.current[id] = layer;
            bindTip(layer, p);
            layer.on("mouseover", () => path.setStyle({ fillOpacity: 0.95, weight: 2.2 }));
            layer.on("mouseout", restore);
            layer.on("click", () => {
              if (navigateOnClick) router.push(`/mandals/${id}`);
              else onSelectRef.current?.(id);
            });
          } else if (mode !== "single") {
            // Mandals without a record yet: satellite/model heat context only.
            bindTip(layer, p);
            layer.on("mouseover", () => {
              if (heatRef.current) path.setStyle({ weight: 1.4, fillOpacity: 0.96 });
            });
            layer.on("mouseout", restore);
          }
        },
      }).addTo(map);
      geoRef.current = geo;

      // Pulsing markers at seed centroids — the easy hover/click target.
      features
        .filter((f) => f.properties.seed && f.properties.centroid)
        .forEach((f) => {
          const p = f.properties as SeedProps;
          const c = f.properties.centroid as number[];
          const color = featureStyle(p, { heatLayer: heatRef.current, dark: isDark(), selected: false }).fillColor;
          const icon = L.divIcon({
            className: "liveMarkerWrap",
            html: `<span class="liveMarker" style="--c:${color}"><span class="lmHalo"></span><span class="lmDot"></span></span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          const marker = L.marker([c[1], c[0]], { icon, riseOnHover: true });
          bindTip(marker, p);
          const polygon = p.id ? layersById.current[p.id] : undefined;
          const path = polygon as unknown as { setStyle: (s: PathOptions) => void } | undefined;
          marker.on("mouseover", () => path?.setStyle({ fillOpacity: 0.88, weight: 2.2 }));
          marker.on("mouseout", () => {
            const sel = selectedRef.current === p.id;
            path?.setStyle({ fillOpacity: sel ? 0.9 : 0.62, weight: sel ? 2.4 : 1.2 });
          });
          marker.on("click", () => {
            if (!p.id) return;
            if (navigateOnClick) router.push(`/mandals/${p.id}`);
            else onSelectRef.current?.(p.id);
          });
          marker.addTo(map!);
        });

      const fit = () => {
        try {
          const bounds = geo.getBounds();
          if (bounds.isValid()) {
            map!.fitBounds(bounds, { padding: mode === "single" ? [24, 24] : [12, 12] });
            if (mode === "single") map!.setZoom(map!.getZoom() - 0.25);
            // Keep the view on the mapped area rather than letting the user pan
            // off to another state entirely. A single mandal is tiny, so it gets
            // more surrounding context than the statewide view does.
            map!.setMaxBounds(bounds.pad(mode === "single" ? 2 : 0.12));
            map!.setMinZoom(map!.getZoom() - 0.5);
          }
        } catch {
          map!.setView([15.9, 79.7], 6);
        }
      };
      fit();
      // Leaflet renders blank if the container wasn't sized at init (small/grid maps):
      // recompute size once mounted, and on any container resize.
      setTimeout(() => { map?.invalidateSize(); fit(); }, 60);
      setTimeout(() => map?.invalidateSize(), 300);
      resizeObs = new ResizeObserver(() => map?.invalidateSize());
      resizeObs.observe(containerRef.current);

      // React to theme toggle by reskinning the mask; the basemap restyles itself.
      observer = new MutationObserver(() => {
        const d = isDark();
        (mask as unknown as { setStyle?: (s: PathOptions) => void })?.setStyle?.({
          color: d ? "rgba(120,210,225,0.55)" : "rgba(15,72,110,0.55)",
          fillColor: d ? "#050d18" : "#aeb9c6",
          fillOpacity: d ? 0.62 : 0.42,
        });
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      resizeObs?.disconnect();
      stopBasemap?.();
      layersById.current = {};
      tipsRef.current = [];
      geoRef.current = null;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [mode, mandalId, navigateOnClick, expandedView, router]);

  // Re-style all features on selection, heat-layer or theme change.
  const themeDark = useIsDark();
  useEffect(() => {
    const geo = geoRef.current;
    if (!geo) return;
    const dark = isDark();
    geo.eachLayer((lyr) => {
      const path = lyr as unknown as { feature?: { properties?: SeedProps }; setStyle: (s: PathOptions) => void };
      const p = path.feature?.properties;
      if (!p) return;
      path.setStyle(featureStyle(p, { heatLayer, dark, selected: !!p.id && p.id === selectedId }));
    });
    tipsRef.current.forEach(({ layer, props }) => {
      layer.setTooltipContent(tooltipHtml(props, heatLayer));
      applyMapTooltipStyle(layer.getTooltip()?.getElement(), featureStyle(props, { heatLayer, dark, selected: false }).fillColor ?? "#98a2b3");
      // Centroid markers are alternate targets for the same active map layer.
      const marker = (layer as { getElement?: () => HTMLElement }).getElement?.()?.querySelector<HTMLElement>(".liveMarker");
      marker?.style.setProperty("--c", featureStyle(props, { heatLayer, dark, selected: false }).fillColor ?? "#98a2b3");
    });
  }, [heatLayer, selectedId, themeDark]);

  // Real coverage — mandals with a fused record (not the legacy 10 seed flags).
  const mappedCount = mandals.length;

  return (
    <div className="liveMapWrap" style={{ height }}>
      <div ref={containerRef} className="liveMap" style={{ height }} />
      {!expandedView && <MapExpand title={mode === "single" ? "Mandal location & context" : "Statewide mandal status"}
        detailsHref={mode === "status" && selectedId ? `/mandals/${selectedId}/` : undefined}
        subtitle={heatLayer ? (isWaterLayer(heatLayer) ? WATER_LAYER_META[heatLayer].label : heatLayer === "rainfall_mm" ? "Rainfall (CHIRPS)" : "Water balance") : "Fusion status · prototype evidence"}>
        <LiveMap mode={mode} mandalId={mandalId} selectedId={selectedId} onSelect={onSelect}
          navigateOnClick={navigateOnClick} heatLayer={heatLayer} height="100%" expandedView />
      </MapExpand>}
      {mode === "status" && (
        <div className="liveBadge">
          <span className="liveBadgeDot" /> SNAPSHOT
          <span className="liveBadgeSep">·</span> {mappedCount} mandals
        </div>
      )}
    </div>
  );
}

function sameMandal(f: { d: string; m: string }, id?: string) {
  if (!id) return false;
  const found = mapGeometry.mandals.find((x) => mandalByMapKey(x.d, x.m)?.id === id);
  return found ? found.d === f.d && found.m === f.m : false;
}
