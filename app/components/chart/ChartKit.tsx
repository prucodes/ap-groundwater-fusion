/* Shared pieces for the site's SVG charts, so every chart speaks the same visual language.

   Callout   the insight written on the chart itself: a ring on the point, a short leader
             and a label with a halo that keeps it legible over the data.
   ChartData "Show the numbers": the values behind a chart as a small table, for anyone who
             reads numbers better than shapes, and for screen readers, which cannot see SVG. */

type Anchor = "start" | "middle" | "end";

export function Callout({ x, y, label, sub, dx = 0, dy = -30, anchor = "middle", tone = "ink" }: {
  x: number;
  y: number;
  label: string;
  sub?: string;
  /** Where the label sits relative to the point, in the chart's own units. */
  dx?: number;
  dy?: number;
  anchor?: Anchor;
  tone?: "ink" | "alert" | "good";
}) {
  const lx = x + dx, ly = y + dy;
  const up = dy < 0;
  // The leader stops short of the ring and of the label, so neither is crossed.
  const fromY = y + (up ? -7 : 7), toY = ly + (up ? 5 : -12);
  const lead = Math.hypot(lx - x, toY - fromY) > 10;
  return (
    <g className={`chartCallout chartCallout-${tone}`} aria-hidden="true">
      <circle cx={x} cy={y} r={6} className="chartCalloutRing" />
      {lead ? <line x1={x} y1={fromY} x2={lx} y2={toY} className="chartCalloutLeader" /> : null}
      <text x={lx} y={up ? ly - (sub ? 13 : 0) : ly} textAnchor={anchor} className="chartCalloutLabel">
        {label}
        {sub ? <tspan x={lx} dy="14" className="chartCalloutSub">{sub}</tspan> : null}
      </text>
    </g>
  );
}

export function ChartData({ caption, columns, rows }: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  if (!rows.length) return null;
  return (
    <details className="chartData">
      <summary>Show the numbers</summary>
      <div className="chartDataScroll">
        <table>
          <caption>{caption}</caption>
          <thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>{row.map((cell, j) => j === 0 ? <th key={j} scope="row">{cell}</th> : <td key={j}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
