"use client";

import { useState } from "react";
import { IconInfo } from "./icons";
import {
  MAP_VIEW,
  mandalByMapKey,
  mandalHeatColor,
  mandalHeatStatus,
  mandalHeatValue,
  mandalToPath,
  mapGeometry,
  formatNumber,
  statusMeta,
  titleCase,
} from "../lib/data";
import type { MandalHeatLayerKey } from "../lib/types";

type HoverState = { d: string; m: string; id?: string };

/** Crisp SVG status choropleth — same look as the Estimates map (no Leaflet basemap).
 *  mode "status" colours by fusion status bucket; otherwise by the heat layer. */
export function MandalStatusMap({
  selectedId,
  onSelect,
  layer = null,
  maxHeight,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
  layer?: MandalHeatLayerKey | null;
  /** Cap height (px); omit to fill the container width and scale by aspect. */
  maxHeight?: number;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const hoverRec = hover ? mandalByMapKey(hover.d, hover.m) : undefined;

  return (
    <div className="estMapWrap">
      <svg
        viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}
        className="estMapSvg"
        role="img"
        aria-label="Groundwater status by mandal"
        style={
          maxHeight
            ? { height: maxHeight, width: "auto", maxWidth: "100%", margin: "0 auto" }
            : { width: "93%", height: "auto", display: "block", margin: "0 auto" }
        }
      >
        {mapGeometry.mandals.map((m, i) => {
          const rec = mandalByMapKey(m.d, m.m);
          const fill = layer
            ? mandalHeatColor(layer, m.d, m.m)
            : rec?.status_bucket
              ? statusMeta(rec.status_bucket).color
              : "var(--field)";
          const selected = !!rec && rec.id === selectedId;
          const active = !!hover && hover.d === m.d && hover.m === m.m;
          return (
            <path
              key={`${m.d}|${m.m}|${i}`}
              d={mandalToPath(m.rings)}
              fill={fill}
              fillOpacity={selected ? 1 : 0.9}
              stroke={selected || active ? "var(--ink)" : "var(--hairline)"}
              strokeWidth={selected ? 1.4 : active ? 1.1 : 0.3}
              onMouseEnter={() => setHover({ d: m.d, m: m.m, id: rec?.id })}
              onMouseLeave={() => setHover(null)}
              onClick={() => rec && onSelect(rec.id)}
              style={{ cursor: rec ? "pointer" : "default", transition: "stroke-width .1s" }}
            />
          );
        })}
      </svg>

      {hover ? (
        <div className="estHoverCard">
          <div className="estHoverTitle">{titleCase(hover.m)}</div>
          <div className="estHoverSub">{titleCase(hover.d)} District</div>
          {layer ? (
            <div className="estHoverRow">
              <span>{layer === "rainfall_mm" ? "Rainfall" : "Water balance"}</span>
              <strong>{formatNumber(mandalHeatValue(hover.d, hover.m, layer))} mm</strong>
            </div>
          ) : hoverRec ? (
            <>
              <div className="estHoverRow">
                <span>Status</span>
                <strong style={{ color: statusMeta(hoverRec.status_bucket).color }}>
                  {statusMeta(hoverRec.status_bucket).label}
                </strong>
              </div>
              <div className="estHoverRow">
                <span>Estimated depth</span>
                <span>{formatNumber(hoverRec.estimate_mbgl)} m</span>
              </div>
            </>
          ) : (
            <div className="estHoverRow">
              <span>Status</span>
              <span>{mandalHeatStatus(hover.d, hover.m) ? "—" : "No estimate yet"}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="estHoverHint">
          <IconInfo /> Hover a mandal · click to inspect
        </div>
      )}
    </div>
  );
}
