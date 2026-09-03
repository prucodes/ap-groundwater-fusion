"use client";

import { useMemo } from "react";
import type { DistrictSeries } from "../lib/data";
import { titleCase } from "../lib/data";

/**
 * Twenty-eight district hydrographs on one screen, sorted steepest-deepening
 * first.
 *
 * The point of small multiples is comparison, so every tile is drawn on ONE
 * shared depth scale — a tile that looks deeper is deeper, not differently
 * scaled. A per-tile scale would make this chart actively misleading, which is
 * the usual way small multiples go wrong.
 */

const W = 168;
const H = 46;
const PAD_Y = 4;

type Props = {
  series: DistrictSeries[];
  selected?: string;
  onSelect?: (district: string) => void;
};

export function DistrictTrendGrid({ series, selected, onSelect }: Props) {
  const usable = series.filter((s) => s.points.length >= 2);

  const { scaleMin, scaleMax, stateMedian } = useMemo(() => {
    const all = usable.flatMap((s) => s.points.map((p) => p.value));
    const sorted = [...all].sort((a, b) => a - b);
    return {
      scaleMin: 0, // always anchored at the ground surface
      scaleMax: Math.max(...all) * 1.05,
      stateMedian: sorted[Math.floor(sorted.length / 2)],
    };
  }, [usable]);

  if (!usable.length) return null;

  const y = (v: number) => PAD_Y + ((v - scaleMin) / (scaleMax - scaleMin)) * (H - PAD_Y * 2);
  const medianY = y(stateMedian);

  return (
    <div className="dtg">
      <div className="dtgGrid">
        {usable.map((s) => {
          const step = s.points.length > 1 ? W / (s.points.length - 1) : 0;
          const coords = s.points.map((p, i) => `${(i * step).toFixed(1)},${y(p.value).toFixed(1)}`);
          const trace = coords.join(" ");
          const area = `0,${H} ${trace} ${W},${H}`;
          const last = s.points[s.points.length - 1];
          const lastX = W;
          const lastY = y(last.value);
          const deepening = (s.trendMPerYear ?? 0) > 0;
          const active = selected === s.district_name;

          return (
            <button
              type="button"
              key={s.district_name}
              className={`dtgTile ${active ? "dtgActive" : ""}`}
              onClick={() => onSelect?.(s.district_name)}
              aria-pressed={active}
              title={`${titleCase(s.district_name)} — latest ${last.value.toFixed(2)} m below ground`}
            >
              <span className="dtgName">{titleCase(s.district_name)}</span>

              <svg viewBox={`0 0 ${W} ${H}`} className="dtgSpark" aria-hidden="true" preserveAspectRatio="none">
                {/* Shared state median: the common baseline that makes 28 separate
                    tiles readable as one comparison. */}
                <line x1="0" y1={medianY} x2={W} y2={medianY} stroke="var(--line-strong)" strokeWidth="1" strokeDasharray="3 3" />
                <polygon points={area} fill={deepening ? "var(--st-verify)" : "var(--cyan)"} opacity="0.14" />
                <polyline
                  points={trace}
                  fill="none"
                  stroke={deepening ? "var(--st-verify)" : "var(--cyan)"}
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx={lastX} cy={lastY} r="2.6" fill={deepening ? "var(--st-verify)" : "var(--cyan)"} />
              </svg>

              <span className="dtgFoot">
                <span className={`dtgTrend ${deepening ? "down" : "up"}`}>
                  {s.trendMPerYear === null
                    ? "—"
                    : `${deepening ? "▼" : "▲"} ${Math.abs(s.trendMPerYear).toFixed(2)} m/yr`}
                </span>
                <span className="dtgLatest">{last.value.toFixed(1)}<small> m</small></span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="dtgKey">
        <span className="dtgKeyItem"><i className="dtgSwatch dtgSwatchDown" /> deepening</span>
        <span className="dtgKeyItem"><i className="dtgSwatch dtgSwatchUp" /> recovering</span>
        <span className="dtgKeyItem"><i className="dtgSwatch dtgSwatchMed" /> state median depth</span>
        <span className="dtgKeyItem dtgKeyNote">
          All 28 share one depth scale anchored at the ground surface, so tiles are directly comparable.
          Slope is least squares over the measured record.
        </span>
      </div>
    </div>
  );
}
