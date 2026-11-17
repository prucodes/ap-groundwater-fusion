"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { districtGeometry, districtLayerColor, mandalToPath, MAP_VIEW, titleCase } from "../lib/data";
import type { DistrictFeature, DistrictLayerKey } from "../lib/types";
import { mapTooltipStyle } from "../lib/mapTooltip";
import { useIsDark } from "./useIsDark";
import styles from "./DistrictChoropleth.module.css";

/* The State's 28 districts, drawn by the site itself in the same frame and projection as
   every other State map (MAP_VIEW), coloured by one district figure. It replaces a
   zoomable tile map on the pages that only ever needed the State at a glance: nothing to
   pan away from, no third-party basemap to load, sharp at any size, and it washes in west
   to east when it is reached (ChartReveal), like the mandal maps. A change of figure, a
   scenario or a set of categories glides from one colouring to the next. Hover or focus a
   district for its figures. */

const SWEEP_MS = 520;

function fillFor(p: DistrictFeature, layer: DistrictLayerKey, dark: boolean, scenario?: Record<string, number | null>, override?: Record<string, string>) {
  if (override?.[p.d]) return override[p.d];
  if (scenario) return districtLayerColor("water_balance_mm", scenario[p.d] ?? null, dark);
  return districtLayerColor(layer, p[layer] as number | null, dark);
}

const mm = (v: number | null) => (v === null ? "–" : `${Math.round(v).toLocaleString("en-IN")} mm`);
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v)).toLocaleString("en-IN")} mm`;

export function DistrictChoropleth({ layer, scenarioValues, colorOverride, label, overrideLabel, maxHeight = 520, testId }: {
  layer: DistrictLayerKey;
  /** Per-district water balance under a modelled scenario, in place of the published figure. */
  scenarioValues?: Record<string, number | null>;
  /** A colour per district (categories decided by the page), in place of the figure's scale. */
  colorOverride?: Record<string, string>;
  /** What the map shows, for a screen reader. */
  label: string;
  /** For a category colouring, what each district's category is called, shown first on hover. */
  overrideLabel?: Record<string, string>;
  maxHeight?: number;
  testId?: string;
}) {
  const dark = useIsDark();
  const frame = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const shapes = useMemo(() => districtGeometry.districts.map(d => {
    const d0 = mandalToPath(d.rings), at = d0.match(/^M\s*(-?[\d.]+)/);
    return { path: d0, sweep: `${Math.round(Math.min(1, Math.max(0, Number(at?.[1] ?? 0) / MAP_VIEW.width)) * SWEEP_MS)}ms` };
  }), []);
  const fills = districtGeometry.districts.map(d => fillFor(d, layer, dark, scenarioValues, colorOverride));

  const show = (index: number, clientX?: number, clientY?: number) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    if (clientX === undefined || clientY === undefined) {
      const path = frame.current?.querySelectorAll<SVGPathElement>("path[data-district]")[index]?.getBoundingClientRect();
      if (path) { clientX = path.left + path.width / 2; clientY = path.top + path.height / 2; }
    }
    setHover({ index, x: (clientX ?? box.left) - box.left, y: (clientY ?? box.top) - box.top });
  };

  const p = hover ? districtGeometry.districts[hover.index] : null;
  const rows = p ? [
    ...(scenarioValues ? [["Scenario balance", scenarioValues[p.d] === null || scenarioValues[p.d] === undefined ? "Unavailable" : signed(scenarioValues[p.d] as number), true] as const] : []),
    ["NASA groundwater %ile", p.gw_percentile === null ? "–" : String(Math.round(p.gw_percentile)), !scenarioValues && !colorOverride && layer === "gw_percentile"] as const,
    ["Rainfall (CHIRPS)", mm(p.rainfall_mm), !scenarioValues && !colorOverride && layer === "rainfall_mm"] as const,
    ["Actual ET (annual)", mm(p.annual_et_mm), false] as const,
    ...(p.water_balance_mm !== null ? [["Water balance", `${p.water_balance_status} (${signed(p.water_balance_mm)})`, !scenarioValues && !colorOverride && layer === "water_balance_mm"] as const] : []),
  ] : [];
  const width = frame.current?.clientWidth ?? 600, height = frame.current?.clientHeight ?? 500;

  return (
    <figure className={styles.figure} data-testid={testId}>
      <div ref={frame} className={styles.frame} data-draw="sequence" style={{ aspectRatio: `${MAP_VIEW.width} / ${MAP_VIEW.height}`, maxHeight }}
        onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`} role="group" aria-label={label}>
          {districtGeometry.districts.map((d, index) => (
            // Stroked in its own colour: a district is drawn from many small pieces, and a white edge
            // on each would draw mandal lines on a figure that is one number for the whole district.
            <path key={d.d} d={shapes[index].path} fill={fills[index]} stroke={fills[index]} data-district={d.d} data-hot={hover?.index === index || undefined}
              style={{ "--sweep": shapes[index].sweep } as CSSProperties}
              tabIndex={0} role="button" aria-label={`${titleCase(d.d)}${overrideLabel?.[d.d] ? `: ${overrideLabel[d.d]}` : ""}`}
              onPointerMove={event => { if (event.pointerType !== "touch") show(index, event.clientX, event.clientY); }}
              onClick={event => show(index, event.clientX, event.clientY)}
              onFocus={() => show(index)} onBlur={() => setHover(null)}
              onKeyDown={event => { if (event.key === "Escape") setHover(null); }} />
          ))}
        </svg>
        {p && hover ? (
          <div className={`${styles.tip} liveTip`} role="tooltip"
            style={{ ...mapTooltipStyle(fills[hover.index]), left: Math.max(6, Math.min(hover.x + 14, width - 262)), top: Math.max(6, Math.min(hover.y + 12, height - 200)) }}>
            <span className="tipHead"><b>{titleCase(p.d)}</b><span className="tipPill">{p.mandal_count} mandals</span></span>
            <span className="tipDist">{overrideLabel?.[p.d] ?? "District zonal mean · satellite and model"}</span>
            {rows.map(([name, value, active]) => <span key={name} className={`tipRow${active ? " tipActive" : ""}`}><i>{name}</i><b>{value}</b></span>)}
            <span className="tipFoot">Regional context, not groundwater depth</span>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
