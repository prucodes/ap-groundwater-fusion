"use client";

import { useId, useMemo, useState } from "react";
import { isMonsoonMonth, type DepthPoint } from "../lib/data";

/**
 * Depth-to-water hydrograph — the fundamental instrument of the discipline, and
 * until now the app's largest unused asset: ~11 years of monthly readings per
 * mandal were being rendered as a ~140px sparkline.
 *
 * Two domain conventions drive the drawing:
 *  - Depth is measured downward from the surface, so the axis is inverted: the
 *    ground line sits at the top and deeper water plots lower.
 *  - Because of that, filling *below* the trace paints the water body itself. A
 *    high fill reads as a shallow, healthy water table without needing a legend.
 */

type Props = {
  series: DepthPoint[];
  /** Modelled nowcast for the target period, drawn beyond the measured record. */
  nowcast?: { value: number; lower: number | null; upper: number | null; period: string } | null;
  height?: number;
};

const PAD = { top: 18, right: 16, bottom: 26, left: 44 };
const VIEW_W = 900;

function niceCeil(value: number) {
  if (value <= 5) return Math.ceil(value);
  if (value <= 20) return Math.ceil(value / 2) * 2;
  return Math.ceil(value / 5) * 5;
}

export function Hydrograph({ series, nowcast = null, height = 260 }: Props) {
  const gid = useId().replace(/:/g, "");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const model = useMemo(() => {
    if (series.length < 2) return null;

    const values = series.map((p) => p.value);
    if (nowcast) {
      values.push(nowcast.value);
      if (nowcast.lower !== null) values.push(nowcast.lower);
      if (nowcast.upper !== null) values.push(nowcast.upper);
    }
    // The scale always starts at the ground surface: a hydrograph that cropped
    // the top would hide how close the water actually is to the surface.
    const maxDepth = niceCeil(Math.max(...values) * 1.08);

    const plotW = VIEW_W - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    // One extra slot when a nowcast is drawn past the end of the measured record.
    const slots = series.length - 1 + (nowcast ? 1 : 0);
    const x = (i: number) => PAD.left + (slots === 0 ? 0 : (i / slots) * plotW);
    const y = (depth: number) => PAD.top + (depth / maxDepth) * plotH;

    const points = series.map((p, i) => ({ ...p, x: x(i), y: y(p.value), i }));
    const trace = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const water =
      `${PAD.left},${PAD.top + plotH} ` + trace + ` ${points[points.length - 1].x.toFixed(1)},${PAD.top + plotH}`;

    // Monsoon bands: one shaded run per June–September, drawn behind everything.
    const bands: { x: number; w: number }[] = [];
    let runStart: number | null = null;
    points.forEach((p, i) => {
      const wet = isMonsoonMonth(p.period);
      if (wet && runStart === null) runStart = p.x;
      const ends = !wet || i === points.length - 1;
      if (ends && runStart !== null) {
        bands.push({ x: runStart, w: Math.max(2, p.x - runStart) });
        runStart = null;
      }
    });

    // Year ticks, thinned so labels never collide on a narrow card.
    const firstOfYear = points.filter((p, i) => i === 0 || p.period.slice(0, 4) !== points[i - 1].period.slice(0, 4));
    const step = Math.ceil(firstOfYear.length / 8);
    const ticks = firstOfYear.filter((_, i) => i % step === 0);

    const depthTicks = [0, maxDepth / 2, maxDepth].map((d) => ({ d, y: y(d) }));

    const nc = nowcast
      ? {
          x: x(slots),
          y: y(nowcast.value),
          top: nowcast.lower !== null ? y(nowcast.lower) : null,
          bottom: nowcast.upper !== null ? y(nowcast.upper) : null,
        }
      : null;

    return { points, trace, water, bands, ticks, depthTicks, maxDepth, plotH, plotW, nc, x, y };
  }, [series, nowcast, height]);

  if (!model) {
    return <p className="muted" style={{ fontSize: 13 }}>Not enough measured history to draw a hydrograph.</p>;
  }

  const { points, trace, water, bands, ticks, depthTicks, plotH, nc } = model;
  const active = hoverIndex !== null ? points[hoverIndex] : points[points.length - 1];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = 0;
    let best = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - svgX);
      if (d < best) { best = d; nearest = i; }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className="hydrograph">
      <div className="hgReadout">
        <div className="hgReadMain">
          <span className="hgReadValue">{active.value.toFixed(2)}</span>
          <span className="hgReadUnit">m below ground</span>
        </div>
        <div className="hgReadMeta">
          <span className="hgReadPeriod">{active.period}</span>
          {isMonsoonMonth(active.period) ? <span className="hgMonsoonTag">monsoon</span> : null}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        className="hgSvg"
        role="img"
        aria-label={`Depth to water from ${points[0].period} to ${points[points.length - 1].period}, in metres below ground level.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={`water-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--deep-navy)" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {bands.map((b, i) => (
          <rect key={i} x={b.x} y={PAD.top} width={b.w} height={plotH} fill="var(--sig-gw)" opacity="0.07" />
        ))}

        {depthTicks.map((t) => (
          <g key={t.d}>
            <line x1={PAD.left} y1={t.y} x2={VIEW_W - PAD.right} y2={t.y} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD.left - 8} y={t.y + 4} textAnchor="end" fontSize="11" fill="var(--muted-2)">
              {t.d === 0 ? "0" : t.d.toFixed(0)}
            </text>
          </g>
        ))}

        {/* The ground surface. Everything below it is subsurface. */}
        <line x1={PAD.left} y1={PAD.top} x2={VIEW_W - PAD.right} y2={PAD.top} stroke="var(--ink-soft)" strokeWidth="1.5" />

        <polygon points={water} fill={`url(#water-${gid})`} />
        <polyline points={trace} fill="none" stroke="var(--cyan)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />

        {nc && nc.top !== null && nc.bottom !== null ? (
          <g>
            {/* Modelled nowcast with its p10–p90 band, held visually apart from
                the measured trace so the two are never read as one series. */}
            <line
              x1={points[points.length - 1].x}
              y1={points[points.length - 1].y}
              x2={nc.x}
              y2={nc.y}
              stroke="var(--amber)"
              strokeWidth="1.6"
              strokeDasharray="4 3"
            />
            <line x1={nc.x} y1={nc.top} x2={nc.x} y2={nc.bottom} stroke="var(--amber)" strokeWidth="7" strokeLinecap="round" opacity="0.28" />
            <circle cx={nc.x} cy={nc.y} r="4" fill="var(--amber)" />
          </g>
        ) : null}

        {ticks.map((t) => (
          <text key={t.period} x={t.x} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted-2)">
            {t.period.slice(0, 4)}
          </text>
        ))}

        {hoverIndex !== null ? (
          <g>
            <line x1={active.x} y1={PAD.top} x2={active.x} y2={PAD.top + plotH} stroke="var(--ink-soft)" strokeWidth="1" opacity="0.45" />
            <circle cx={active.x} cy={active.y} r="4.5" fill="var(--card)" stroke="var(--cyan)" strokeWidth="2" />
          </g>
        ) : (
          <circle cx={active.x} cy={active.y} r="4" fill="var(--cyan)" />
        )}
      </svg>

      <div className="hgKey">
        <span className="hgKeyItem"><i className="hgSwatch hgSwatchLine" /> Measured (APWRIMS)</span>
        {nc ? <span className="hgKeyItem"><i className="hgSwatch hgSwatchModel" /> Modelled nowcast · p10–p90</span> : null}
        <span className="hgKeyItem"><i className="hgSwatch hgSwatchMonsoon" /> Monsoon (Jun–Sep)</span>
        <span className="hgKeyItem hgKeyNote">Depth increases downward — a higher fill is a shallower water table.</span>
      </div>
    </div>
  );
}
