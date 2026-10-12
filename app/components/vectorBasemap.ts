"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type * as Leaflet from "leaflet";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import { basePath } from "../lib/data";
import labelArea from "../data/ap_label_area.json";

/* The basemap under every Leaflet map: OpenFreeMap's vector tiles (OpenMapTiles schema,
   OpenStreetMap data, no key), drawn by MapLibre in the platform's own palette. It replaced
   OpenStreetMap's raster tiles, which were saturated on the light theme and, with no dark
   style published, inverted by a CSS filter on the dark one.

   Two layers: the ground (land, water, rivers, borders) beneath the data, and the place
   names above it, so a district headquarters stays legible over the choropleth. Only places
   inside Andhra Pradesh are named: neighbouring states, their cities and the sea drew the eye
   away from the State the map is about. The data itself stays Leaflet's: the same paths,
   tooltips and clicks as before. */

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

export const BASEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">&copy; OpenMapTiles</a> · ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">&copy; OpenStreetMap contributors</a>';

const PALETTE = {
  light: {
    land: "#f4f6f9", water: "#d9e6f2", river: "#c3d6e8", state: "#b9c3cf", country: "#9fabba",
    city: "#3f4f63", town: "#5d6b7e", halo: "#f4f6f9",
  },
  dark: {
    land: "#0f1e32", water: "#071526", river: "#18344f", state: "#2a4262", country: "#3b5677",
    city: "#c9d6e5", town: "#8fa3ba", halo: "#0b1828",
  },
} as const;

type Palette = (typeof PALETTE)["light" | "dark"];

const NAME = ["coalesce", ["get", "name:en"], ["get", "name_en"], ["get", "name:latin"], ["get", "name"]] as ExpressionSpecification;

/** Only places inside Andhra Pradesh: the State padded about 650 m outward, so a coastal city
 *  whose point sits just offshore keeps its name and a town across a land border does not.
 *  Built by scripts/build_label_area.py. */
const IN_AP = ["within", labelArea.geometry] as unknown as ExpressionSpecification;

function source(): StyleSpecification["sources"] {
  return { omt: { type: "vector", url: TILES } };
}

/** Land, water, rivers and borders: drawn beneath the data. */
export function groundStyle(dark: boolean): StyleSpecification {
  const p: Palette = PALETTE[dark ? "dark" : "light"];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: source(),
    layers: [
      { id: "land", type: "background", paint: { "background-color": p.land } },
      { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": p.water } },
      {
        id: "rivers", type: "line", source: "omt", "source-layer": "waterway",
        filter: ["in", ["get", "class"], ["literal", ["river", "canal"]]],
        paint: { "line-color": p.river, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 1.4, 12, 2.4] },
      },
      {
        id: "state-borders", type: "line", source: "omt", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": p.state, "line-width": 0.9, "line-dasharray": [3, 2] },
      },
      {
        id: "country-borders", type: "line", source: "omt", "source-layer": "boundary",
        filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
        paint: { "line-color": p.country, "line-width": 1.2 },
      },
    ],
  } as unknown as StyleSpecification;
}

/** City and town names inside Andhra Pradesh: drawn above the data, on a transparent canvas. */
export function labelStyle(dark: boolean): StyleSpecification {
  const p: Palette = PALETTE[dark ? "dark" : "light"];
  const halo = { "text-halo-color": p.halo, "text-halo-width": 1.4, "text-halo-blur": 0.4 };
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: source(),
    layers: [
      {
        id: "towns", type: "symbol", source: "omt", "source-layer": "place", minzoom: 8,
        filter: ["all", ["==", ["get", "class"], "town"], IN_AP],
        layout: { "text-field": NAME, "text-font": ["Noto Sans Regular"], "text-size": 10.5, "text-max-width": 8 },
        paint: { "text-color": p.town, ...halo },
      },
      {
        id: "cities", type: "symbol", source: "omt", "source-layer": "place", minzoom: 5,
        filter: ["all", ["==", ["get", "class"], "city"], IN_AP],
        layout: {
          "text-field": NAME, "text-font": ["Noto Sans Bold"], "text-max-width": 8,
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 10.5, 9, 13],
          "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
        },
        paint: { "text-color": p.city, ...halo },
      },
    ],
  } as unknown as StyleSpecification;
}

const dark = () => typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

let software: boolean | undefined;
/** Whether WebGL here runs on the CPU (no usable GPU: some virtual machines and older laptops,
 *  and headless test runners). There two basemap canvases slowed every page around them, so the
 *  map draws its data on the plain sea colour instead; `?basemap` in the URL forces it on. */
export function softwareWebGL(): boolean {
  if (software !== undefined) return software;
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    const name = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    software = /swiftshader|llvmpipe|software|basic render/i.test(name);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    software = false;
  }
  return software;
}

type GLLayer = Leaflet.Layer & { getMaplibreMap: () => { setStyle: (style: StyleSpecification) => void } };

/** Put the ground beneath and the names above `map`; returns the cleanup. If the tiles cannot
 *  be reached the container's own sea colour shows and the data still draws. */
export async function addVectorBasemap(
  L: typeof Leaflet, map: Leaflet.Map, { labels = true, cancelled = () => false }: { labels?: boolean; cancelled?: () => boolean } = {},
): Promise<() => void> {
  if (softwareWebGL() && !new URLSearchParams(window.location.search).has("basemap")) return () => {};
  const gl = await import("maplibre-gl");
  // The static export does not emit MapLibre's module worker; scripts/vendor-maplibre.mjs copies it.
  gl.setWorkerUrl(`${basePath}/vendor/maplibre-gl-worker.js`);
  await import("@maplibre/maplibre-gl-leaflet");
  if (cancelled()) return () => {};   // the map was removed while the renderer loaded
  const make = (L as unknown as { maplibreGL: (options: Record<string, unknown>) => GLLayer }).maplibreGL;
  const ground = make({ style: groundStyle(dark()), interactive: false, attributionControl: false }).addTo(map) as GLLayer;
  let names: GLLayer | null = null;
  if (labels) {
    const pane = map.getPane("basemapLabels") ?? map.createPane("basemapLabels");
    pane.style.zIndex = "450";          // above the overlay pane (400), below tooltips and popups
    pane.style.pointerEvents = "none";  // the data beneath keeps its hover and clicks
    names = make({ style: labelStyle(dark()), pane: "basemapLabels", interactive: false, attributionControl: false }).addTo(map) as GLLayer;
  }
  map.attributionControl?.addAttribution(BASEMAP_ATTRIBUTION);
  const observer = new MutationObserver(() => {
    const d = dark();
    ground.getMaplibreMap().setStyle(groundStyle(d));
    names?.getMaplibreMap().setStyle(labelStyle(d));
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
