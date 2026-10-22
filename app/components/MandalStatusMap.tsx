"use client";

import { useState } from "react";
import { useIsDark } from "./useIsDark";
import { IconInfo } from "./icons";
import {
  MAP_VIEW,
  boundaryLabel,
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
import { isWaterLayer, WATER_LAYER_META, waterLayerColor, waterLayerText, type WaterMandalLayer } from "../lib/waterMandals";
import { FIELD_LAYER_META, fieldLayerColor, fieldLayerText, isFieldLayer, type FieldLayer } from "../lib/fieldSignals";
import { RECHARGE_LAYER_META, isRechargeLayer, rechargeColor, rechargeText, type RechargeLayer } from "../lib/rechargeEfficiency";
import { RAIN_LAYER_META, isRainLayer, rainColor, rainText, type RainLayer } from "../lib/rainGoverned";
import { mapTooltipStyle } from "../lib/mapTooltip";
import { HoverHydrograph } from "./HoverHydrograph";

type HoverState = { d: string; m: string; id?: string; i: number };

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
  layer?: MandalHeatLayerKey | WaterMandalLayer | FieldLayer | RechargeLayer | RainLayer | null;
  /** Cap height (px); omit to fill the container width and scale by aspect. */
  maxHeight?: number;
}) {
  const dark = useIsDark();
  const [hover, setHover] = useState<HoverState | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);

  const hoverRec = hover ? mandalByMapKey(hover.d, hover.m) : undefined;
  const fillFor = (d: string, m: string) => {
    if (layer) return isWaterLayer(layer) ? waterLayerColor(layer, d, m, dark)
      : isRechargeLayer(layer) ? rechargeColor(d, m)
      : isRainLayer(layer) ? rainColor(d, m)
      : isFieldLayer(layer) ? fieldLayerColor(layer, d, m) : mandalHeatColor(layer, d, m, dark);
    const record = mandalByMapKey(d, m);
    return record?.status_bucket ? statusMeta(record.status_bucket).color : "var(--field)";
  };

  return (
    <div className="estMapWrap">
      <svg
        viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}
        className="estMapSvg"
        role="group"
        aria-label="Groundwater status by mandal"
        style={
          maxHeight
            ? { height: maxHeight, width: "auto", maxWidth: "100%", margin: "0 auto" }
            : { width: "93%", height: "auto", display: "block", margin: "0 auto" }
        }
      >
        {mapGeometry.mandals.map((m, i) => {
          const rec = mandalByMapKey(m.d, m.m);
          const fill = fillFor(m.d, m.m);
          const selected = !!rec && rec.id === selectedId;
          const active = !!hover && hover.d === m.d && hover.m === m.m;
          return (
            <path
              key={`${m.d}|${m.m}|${i}`}
              data-mandal="true"
              tabIndex={i === focusIndex ? 0 : -1}
              role="button"
              aria-label={`${titleCase(m.m)}, ${titleCase(m.d)}: ${rec ? statusMeta(rec.status_bucket).label : "No groundwater data"}`}
              aria-pressed={selected}
              d={mandalToPath(m.rings)}
              fill={fill}
              fillOpacity={selected ? 1 : 0.9}
              stroke={selected || active ? "var(--ink)" : "var(--hairline)"}
              strokeWidth={selected ? 1.4 : active ? 1.1 : 0.3}
              onMouseEnter={() => setHover({ d: m.d, m: m.m, id: rec?.id, i })}
              onMouseLeave={() => setHover(null)}
              onFocus={() => { setFocusIndex(i); setHover({ d: m.d, m: m.m, id: rec?.id, i }); }}
              onKeyDown={event => {
                if (event.key === "Escape") { setHover(null); return; }
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (rec) onSelect(rec.id); return; }
                if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const paths = event.currentTarget.ownerSVGElement?.querySelectorAll<SVGPathElement>("[data-mandal]");
                  if (!paths?.length) return;
                  const next = event.key === "Home" ? 0 : event.key === "End" ? paths.length - 1 : (i + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + paths.length) % paths.length;
                  paths[next].focus();
                }
              }}
              onClick={() => rec && onSelect(rec.id)}
              style={{ cursor: rec ? "pointer" : "default", transition: "stroke-width .1s" }}
            />
          );
        })}
      </svg>

      {hover ? (
        <div className="estHoverCard" style={mapTooltipStyle(fillFor(hover.d, hover.m))} aria-live="polite">
          <div className="estHoverTitle">{titleCase(hover.m)}</div>
          <div className="estHoverSub">{titleCase(hover.d)} District</div>
          {layer && isWaterLayer(layer) ? (
            <div className="estHoverRow">
              <span>{WATER_LAYER_META[layer].label}</span>
              <strong>{waterLayerText(layer, hover.d, hover.m) ?? "No unique record"}</strong>
            </div>
          ) : layer && isRainLayer(layer) ? (
            <div className="estHoverRow">
              <span>{RAIN_LAYER_META[layer].label}</span>
              <strong>{rainText(hover.d, hover.m) ?? "Too few seasons"}</strong>
            </div>
          ) : layer && isRechargeLayer(layer) ? (
            <div className="estHoverRow">
              <span>{RECHARGE_LAYER_META[layer].label}</span>
              <strong>{rechargeText(hover.d, hover.m) ?? "Not scored"}</strong>
            </div>
          ) : layer && isFieldLayer(layer) ? (
            <div className="estHoverRow">
              <span>{FIELD_LAYER_META[layer].label}</span>
              <strong>{fieldLayerText(layer, hover.d, hover.m) ?? (layer === "vci" ? "No value" : "Not matched")}</strong>
            </div>
          ) : layer ? (
            <div className="estHoverRow">
              <span>{layer === "rainfall_mm" ? "Rainfall" : "Water balance"}</span>
              <strong>{formatNumber(mandalHeatValue(hover.d, hover.m, layer))} mm</strong>
            </div>
          ) : hoverRec ? (
            <>
              <div className="estHoverRow">
                <span>Status</span>
                <strong>
                  {statusMeta(hoverRec.status_bucket).label}
                </strong>
              </div>
              <div className="estHoverRow">
                <span>Estimated depth</span>
                <span>{formatNumber(hoverRec.estimate_mbgl)} m</span>
              </div>
              <div className="estHoverRow"><span>Latest recorded</span><span>{formatNumber(hoverRec.display_mbgl)} m bgl</span></div>
              <div className="estHoverRow"><span>Observation period</span><span>{hoverRec.latest_observation_period || "Not supplied"}</span></div>
              <HoverHydrograph index={hover.i} />
              <div className="estHoverSub">{`${boundaryLabel(mapGeometry.mandals.find((f) => f.d === hover?.d && f.m === hover?.m))} · not an official result`}</div>
            </>
          ) : (
            <div className="estHoverRow">
              <span>Status</span>
              <span>{mandalHeatStatus(hover.d, hover.m) ? "–" : "No estimate yet"}</span>
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
