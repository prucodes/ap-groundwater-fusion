"use client";

import { useState } from "react";
import { MAP_VIEW, mandalToPath, mapGeometry, monsoonWatch } from "../lib/data";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* One shared scale for the map and its legend: a diverging ramp centred on
   "did what it usually does", because the reader's question is not how much the
   water moved but whether it moved the way it should have. */
const SHORT_STOPS: Array<{ upTo: number; fill: string; label: string }> = [
  { upTo: -1, fill: "#2f7d6b", label: "better than usual" },
  { upTo: 0, fill: "#8fbfae", label: "about normal" },
  { upTo: 1, fill: "#f2d7a0", label: "up to 1 m short" },
  { upTo: 2, fill: "#e2a05f", label: "1–2 m short" },
  { upTo: 4, fill: "#cf6b46", label: "2–4 m short" },
  { upTo: Infinity, fill: "#9e2f22", label: "more than 4 m short" },
];

function shortfallFill(value: number | undefined) {
  if (value === undefined) return "var(--field)";
  return (SHORT_STOPS.find((stop) => value <= stop.upTo) ?? SHORT_STOPS[SHORT_STOPS.length - 1]).fill;
}

/** Andhra Pradesh by mandal, shaded by how far this season is from that mandal's own normal. */
export function RechargeMap() {
  const [hover, setHover] = useState<number | null>(null);
  const byBoundary = new Map<number, (typeof monsoonWatch.mandals)[number]>();
  monsoonWatch.mandals.forEach((m) => {
    if (m.boundaryIndex !== null) byBoundary.set(m.boundaryIndex, m);
  });
  const active = hover === null ? null : byBoundary.get(hover);

  return (
    <div className="rechargeMapWrap">
      <svg
        viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`}
        className="rechargeMapSvg"
        role="img"
        aria-label="Recharge shortfall by mandal, this season against each mandal's own ten-year normal"
      >
        {mapGeometry.mandals.map((feature, index) => {
          const row = byBoundary.get(index);
          return (
            <path
              key={index}
              d={mandalToPath(feature.rings)}
              fill={shortfallFill(row?.shortfallM)}
              className={`rechargeCell ${row ? "" : "noData"} ${hover === index ? "hot" : ""}`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover((current) => (current === index ? null : current))}
            >
              <title>
                {row
                  ? `${row.mandal}, ${row.district}: ${row.shortfallM > 0 ? "+" : ""}${row.shortfallM} m against its own normal`
                  : `${feature.m}, ${feature.d}: not enough comparable seasons`}
              </title>
            </path>
          );
        })}
      </svg>

      <div className="rechargeLegend">
        {SHORT_STOPS.map((stop) => (
          <span className="rechargeKey" key={stop.label}>
            <span className="rechargeSwatch" style={{ background: stop.fill }} />
            {stop.label}
          </span>
        ))}
        <span className="rechargeKey">
          <span className="rechargeSwatch noData" />
          fewer than 7 comparable years
        </span>
      </div>

      <p className="rechargeReadout">
        {active
          ? `${active.mandal}, ${active.district} — ${active.thisSeasonM > 0 ? "fell" : "rose"} ${Math.abs(active.thisSeasonM).toFixed(2)} m since May, against ${active.typicalM > 0 ? "a fall of" : "a rise of"} ${Math.abs(active.typicalM).toFixed(2)} m in a normal year.`
          : "Tap or hover a mandal for its own number. Green mandals recharged as well as they usually do; the deepest reds did not recharge at all."}
      </p>
    </div>
  );
}

/** Every season measured from its May reading, in the direction a reader expects:
 *  a recharging monsoon lifts the line, a failing one drops it. */
export function RechargeTrajectory() {
  const series = monsoonWatch.trajectory;
  const current = series.find((s) => s.current);
  const past = series.filter((s) => !s.current);
  if (!current || past.length < 3) return null;

  // Stored as change in DEPTH, where negative means the table came up. Negated
  // here so the axis runs the way the question does: up is more water.
  const rise = (changeM: number) => -changeM;
  const months = [5, 6, 7, 8, 9, 10, 11, 12];
  const bandFor = (month: number) => {
    const values = past
      .map((s) => s.points.find((p) => p.month === month))
      .filter((p): p is { month: number; changeM: number } => !!p)
      .map((p) => rise(p.changeM));
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return {
      month,
      low: sorted[0],
      high: sorted[sorted.length - 1],
      mid: sorted[Math.floor(sorted.length / 2)],
    };
  };
  const band = months.map(bandFor).filter((b): b is NonNullable<typeof b> => !!b);
  const nowPoints = current.points.map((p) => ({ month: p.month, value: rise(p.changeM) }));

  const all = [...band.flatMap((b) => [b.low, b.high]), ...nowPoints.map((p) => p.value), 0];
  // A little headroom, so the current line is never drawn flush against the axis
  // and read as clipped.
  const headroom = (Math.max(...all) - Math.min(...all)) * 0.08 || 0.2;
  const lo = Math.min(...all) - headroom;
  const hi = Math.max(...all) + headroom;
  const width = 720;
  const height = 300;
  const pad = { top: 18, right: 14, bottom: 30, left: 54 };
  const x = (month: number) => pad.left + ((month - 5) / 7) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + ((hi - value) / (hi - lo || 1)) * (height - pad.top - pad.bottom);

  const envelope =
    band.map((b) => `${b === band[0] ? "M" : "L"}${x(b.month).toFixed(1)} ${y(b.high).toFixed(1)}`).join(" ") +
    " " +
    [...band].reverse().map((b) => `L${x(b.month).toFixed(1)} ${y(b.low).toFixed(1)}`).join(" ") +
    " Z";
  const median = band.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.month).toFixed(1)} ${y(b.mid).toFixed(1)}`).join(" ");
  const now = nowPoints.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.month).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const ticks = [hi, (hi + lo) / 2, lo];
  const last = nowPoints[nowPoints.length - 1];

  return (
    <div className="trajectoryWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="trajectorySvg" role="img"
           aria-label="How far the water table has risen since May, this season against the ten before it">
        {ticks.map((value, i) => (
          <g key={i}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="trajGrid" />
            <text x={pad.left - 8} y={y(value) + 4} className="trajAxis" textAnchor="end">
              {value > 0.05 ? "+" : ""}{value.toFixed(1)} m
            </text>
          </g>
        ))}
        <path d={envelope} className="trajBand" />
        <path d={median} className="trajMedian" />
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="trajZero" />
        <text x={width - pad.right - 4} y={y(0) - 7} className="trajAxisNote" textAnchor="end">
          level with May
        </text>
        <path d={now} className="trajNow" />
        {nowPoints.map((p) => (
          <circle key={p.month} cx={x(p.month)} cy={y(p.value)} r={4} className="trajNowDot" />
        ))}
        <text x={x(last.month) + 8} y={y(last.value) + 4} className="trajNowLabel">
          {current.year}
        </text>
        {months.map((month) => (
          <text key={month} x={x(month)} y={height - 8} className="trajAxis" textAnchor="middle">
            {MONTHS[month]}
          </text>
        ))}
      </svg>
      <div className="trajKey">
        <span><span className="trajKeySwatch band" /> the range across the ten seasons before this one</span>
        <span><span className="trajKeyLine median" /> their median</span>
        <span><span className="trajKeyLine now" /> {current.year}</span>
        <span className="trajKeyNote">above the dashed line the water table has risen since May</span>
      </div>
    </div>
  );
}

/** Forty-six June–Augusts, with the El Niño ones marked. */
export function RainfallHistory() {
  const history = monsoonWatch.rainfallHistory;
  if (!history) return null;
  const rows = history.years;
  const max = Math.max(...rows.map((r) => r.mm));
  const width = 720;
  const height = 250;
  const pad = { top: 12, right: 8, bottom: 34, left: 46 };
  const band = (width - pad.left - pad.right) / rows.length;
  const y = (mm: number) => pad.top + (1 - mm / max) * (height - pad.top - pad.bottom);
  const meanY = y(history.meanMm);
  const current = rows[rows.length - 1];

  return (
    <div className="rainHistWrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="rainHistSvg" role="img"
           aria-label="June to August rainfall for every year since 1981, El Nino years marked">
        <line x1={pad.left} x2={width - pad.right} y1={meanY} y2={meanY} className="rainMean" />
        <text x={pad.left - 8} y={meanY + 4} className="trajAxis" textAnchor="end">
          {Math.round(history.meanMm)} mm
        </text>
        {rows.map((row, index) => {
          const top = y(row.mm);
          return (
            <rect
              key={row.year}
              x={pad.left + index * band + band * 0.14}
              y={top}
              width={band * 0.72}
              height={height - pad.bottom - top}
              className={`rainBar ${row.state} ${row.year === current.year ? "current" : ""}`}
            >
              <title>
                {row.year}: {row.mm} mm, {row.anomalyPct > 0 ? "+" : ""}{row.anomalyPct}% —{" "}
                {row.state === "el_nino" ? "El Niño" : row.state === "la_nina" ? "La Niña" : "neutral"}
              </title>
            </rect>
          );
        })}
        {rows.filter((r) => r.year % 5 === 0).map((row) => (
          <text
            key={row.year}
            x={pad.left + rows.indexOf(row) * band + band / 2}
            y={height - 14}
            className="trajAxis"
            textAnchor="middle"
          >
            {row.year}
          </text>
        ))}
      </svg>
      <div className="trajKey">
        <span><span className="rainKeySwatch el_nino" /> El Niño monsoon</span>
        <span><span className="rainKeySwatch la_nina" /> La Niña monsoon</span>
        <span><span className="rainKeySwatch neutral" /> neutral</span>
        <span className="trajKeyNote">
          line is the {rows.length}-year mean · {current.year} is {Math.abs(current.anomalyPct)}% below it
        </span>
      </div>
    </div>
  );
}
