"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { GeoJsonObject } from "geojson";
import type { GeoJSON, Layer, Map as LeafletMap, PathOptions, TileLayer } from "leaflet";
import {
  agreementMeta,
  districtGeometry,
  mandalByMapKey,
  mandalHeatColor,
  mandalHeatStatus,
  mandalHeatValue,
  mandals,
  mapGeometry,
  statusMeta,
  titleCase,
} from "../lib/data";
import type { MandalHeatLayerKey } from "../lib/types";

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
  estimate: number | null;
  estimateLow: number | null;
  estimateHigh: number | null;
  gap: number | null;
  balance: number | null;
  balanceStatus: string;
  agreement: string;
  centroid?: number[];
};

// CARTO began stamping "API KEY REQUIRED" into its keyless basemap tiles, so the
// watermark appeared over every map without any change on our side. OpenStreetMap's
// standard tiles need no key. There is no dark variant, so dark mode is a CSS
// filter over the same tiles (see .leaflet-tile-pane in globals.css).
const BASEMAP_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const BASEMAP_ATTRIBUTION = "&copy; OpenStreetMap contributors";

const tooltipOpts = { sticky: true, className: "liveTip", direction: "auto" as const, opacity: 1, offset: [8, 0] as [number, number] };

function isDark() {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

function bar(value: number | null, color: string) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    `<span class="tipBar"><span class="tipBarFill" style="width:${v}%;background:${color}"></span></span>` +
    `<span class="tipVal">${value === null ? "—" : value}</span>`
  );
}

function balColor(status: string) {
  if (status === "Surplus") return "#5e9b6b";
  if (status === "Balanced") return "#1f8a8a";
  if (status === "Deficit") return "#c65a46";
  return "#98a2b3";
}

function tooltipHtml(p: SeedProps) {
  const meta = statusMeta(p.bucket);
  const agree = agreementMeta(p.agreement);
  const agreeColor = agree.className === "strong" ? "#c65a46" : agree.className === "agree" ? "#5e9b6b" : "#d79b2e";
  return (
    `<span class="tipHead"><b>${titleCase(p.m)}</b>` +
    `<span class="tipPill" style="color:${meta.color};background:${meta.color}22">${meta.label}</span></span>` +
    `<span class="tipDist">${titleCase(p.d)} District</span>` +
    `<span class="tipExplain">Different evidence layers — not duplicate readings. Depth is in m below ground; satellite values are 0–100 wetness percentiles.</span>` +
    `<span class="tipSection">Satellite / climate context</span>` +
    `<span class="tipMetric"><i>GRACE GW %ile</i>${bar(p.gw, "#12b5cb")}</span>` +
    `<span class="tipMetric"><i>Root-zone %ile</i>${bar(p.root, "#5e9b6b")}</span>` +
    `<span class="tipMetric"><i>Surface %ile</i>${bar(p.surface, "#3f86d6")}</span>` +
    (p.rain !== null ? `<span class="tipRow"><i>Rainfall (CHIRPS)</i><b>${p.rain} mm</b></span>` : "") +
    `<span class="tipSection">Groundwater depth</span>` +
    `<span class="tipRow"><i>Observed median history</i><b>${p.median ?? "—"} mbgl</b></span>` +
    (p.estimate !== null
      ? `<span class="tipRow tipPrimary"><i>Calculated level β</i><b>${p.estimate} mbgl</b></span>`
      : "") +
    (p.estimateLow !== null && p.estimateHigh !== null
      ? `<span class="tipRow"><i>Model band P10–P90</i><b>${p.estimateLow}–${p.estimateHigh} mbgl</b></span>`
      : "") +
    (p.gap !== null && p.gap >= 2
      ? `<span class="tipRow"><i>Measured–model gap</i><b style="color:#c65a46">${p.gap} m</b></span>`
      : "") +
    (p.balance !== null
      ? `<span class="tipRow"><i>Water balance</i><b style="color:${balColor(p.balanceStatus)}">${p.balanceStatus} (${p.balance > 0 ? "+" : ""}${p.balance} mm)</b></span>`
      : "") +
    `<span class="tipRow"><i>Agreement</i><b style="color:${agreeColor}">${agree.label}</b></span>` +
    `<span class="tipFoot">Click to inspect →</span>`
  );
}

function featureStyle(
  p: SeedProps,
  opts: { heatLayer?: MandalHeatLayerKey | null; dark: boolean; selected: boolean },
): PathOptions {
  if (opts.heatLayer) {
    return {
      weight: opts.selected ? 2 : 0.5,
      color: opts.selected ? "#0d2138" : "#ffffff",
      fillColor: mandalHeatColor(opts.heatLayer, p.d, p.m),
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

function baseTooltipHtml(p: SeedProps) {
  const rain = mandalHeatValue(p.d, p.m, "rainfall_mm");
  const bal = mandalHeatValue(p.d, p.m, "water_balance_mm");
  const status = mandalHeatStatus(p.d, p.m);
  return (
    `<span class="tipHead"><b>${titleCase(p.m)}</b></span><span class="tipDist">${titleCase(p.d)} District</span>` +
    (rain !== null ? `<span class="tipRow"><i>Rainfall (CHIRPS)</i><b>${rain} mm</b></span>` : "") +
    (bal !== null
      ? `<span class="tipRow"><i>Water balance</i><b style="color:${balColor(status)}">${status} (${bal > 0 ? "+" : ""}${bal} mm)</b></span>`
      : "") +
    `<span class="tipFoot">Satellite/model context</span>`
  );
}

export function LiveMap({
  mode = "status",
  mandalId,
  selectedId,
  onSelect,
  navigateOnClick = false,
  height = 460,
  heatLayer = null,
}: {
  mode?: Mode;
  mandalId?: string;
  selectedId?: string;
  onSelect?: (id: string) => void;
  navigateOnClick?: boolean;
  height?: number;
  heatLayer?: MandalHeatLayerKey | null;
}) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const geoRef = useRef<GeoJSON | null>(null);
  const layersById = useRef<Record<string, Layer>>({});
  const selectedRef = useRef<string | undefined>(selectedId);
  selectedRef.current = selectedId;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const heatRef = useRef<MandalHeatLayerKey | null>(heatLayer);
  heatRef.current = heatLayer;

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    let tile: TileLayer | null = null;
    let observer: MutationObserver | null = null;
    let resizeObs: ResizeObserver | null = null;
    let mask: Layer | null = null;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      // Build GeoJSON from the simplified prototype boundaries (lon/lat rings).
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
              estimate: rec?.estimate_mbgl ?? null,
              estimateLow: rec?.estimate_band_p10 ?? null,
              estimateHigh: rec?.estimate_band_p90 ?? null,
              gap: rec?.obs_model_gap_m ?? null,
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
        zoomControl: mode === "status",
        attributionControl: true,
        scrollWheelZoom: false,
        dragging: mode === "status",
        doubleClickZoom: mode === "status",
        boxZoom: mode === "status",
        keyboard: false,
        zoomSnap: 0.25, maxBoundsViscosity: 1 });
      mapRef.current = map;

      tile = L.tileLayer(BASEMAP_URL, {
        attribution: BASEMAP_ATTRIBUTION,
        maxZoom: 19,
      }).addTo(map);

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
      mask = L.polygon([maskOuter, ...apHoles], maskStyle(dark)).addTo(map);

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
              featureStyle(p, { heatLayer: heatRef.current, dark, selected: !!p.id && p.id === selectedRef.current }),
            );

          if (p.id) {
            // every real mandal: rich tooltip, hover lift, click-through.
            const id = p.id;
            layersById.current[id] = layer;
            layer.bindTooltip(tooltipHtml(p), tooltipOpts);
            layer.on("mouseover", () => path.setStyle({ fillOpacity: 0.95, weight: 2.2 }));
            layer.on("mouseout", restore);
            layer.on("click", () => {
              if (navigateOnClick) router.push(`/mandals/${id}`);
              else onSelectRef.current?.(id);
            });
          } else if (mode !== "single") {
            // Mandals without a record yet: satellite/model heat context only.
            layer.bindTooltip(baseTooltipHtml(p), tooltipOpts);
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
          const meta = statusMeta(p.bucket);
          const icon = L.divIcon({
            className: "liveMarkerWrap",
            html: `<span class="liveMarker" style="--c:${meta.color}"><span class="lmHalo"></span><span class="lmDot"></span></span>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          const marker = L.marker([c[1], c[0]], { icon, riseOnHover: true });
          marker.bindTooltip(tooltipHtml(p), tooltipOpts);
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

      // React to theme toggle by reskinning the mask. The basemap itself is
      // darkened by a CSS filter rather than a second tile URL.
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
      layersById.current = {};
      geoRef.current = null;
      if (map) map.remove();
      mapRef.current = null;
    };
  }, [mode, mandalId, navigateOnClick, router]);

  // Re-style all features on selection or heat-layer change.
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
  }, [heatLayer, selectedId]);

  // Real coverage — mandals with a fused record (not the legacy 10 seed flags).
  const mappedCount = mandals.length;

  return (
    <div className="liveMapWrap" style={{ height }}>
      <div ref={containerRef} className="liveMap" style={{ height }} />
      {mode === "status" && (
        <div className="liveBadge">
          <span className="liveBadgeDot" /> LIVE
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
