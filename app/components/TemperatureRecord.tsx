"use client";

import { apTemperature } from "../lib/data";

/** Andhra Pradesh's temperature record, from two products that disagree.
 *
 *  Both say the state is warming and both say El Niño years run hotter here
 *  once the trend is taken out. They differ by roughly a factor of three on how
 *  fast, so both series are drawn on the same baseline and the gap between them
 *  is left visible rather than resolved by picking one. No rate is printed as a
 *  headline figure and nothing here is projected forward.
 */
export function TemperatureRecord() {
  const data = apTemperature;
  const records = Object.values(data.records);
  const fine = records.find((r) => r.canRankYears) ?? records[0];
  const colours = ["#e2705a", "#5aa8e0"];

  const years = fine.series.map((p) => p.year);
  const all = records.flatMap((r) => r.series.map((p) => p.anomalyC));
  const lo = Math.min(...all) - 0.15;
  const hi = Math.max(...all) + 0.15;
  const W = 760;
  const H = 260;
  const pad = { top: 14, right: 16, bottom: 26, left: 46 };
  const x = (year: number) =>
    pad.left + ((year - years[0]) / (years[years.length - 1] - years[0])) * (W - pad.left - pad.right);
  const y = (value: number) => pad.top + ((hi - value) / (hi - lo)) * (H - pad.top - pad.bottom);
  const path = (series: Array<{ year: number; anomalyC: number }>) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year).toFixed(1)} ${y(p.anomalyC).toFixed(1)}`).join(" ");

  const warmest = fine.series.find((p) => p.year === fine.warmestYear);
  const ticks = [Math.ceil(lo * 2) / 2, 0, Math.floor(hi * 2) / 2].filter(
    (v, i, a) => a.indexOf(v) === i && v >= lo && v <= hi,
  );

  return (
    <div className="tempWrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="tempChart" role="img"
           aria-label={`Andhra Pradesh annual temperature against its ${data.baseline} average, from two records`}>
        {ticks.map((value) => (
          <g key={value}>
            <line className={value === 0 ? "tempZero" : "tempGrid"}
                  x1={pad.left} x2={W - pad.right} y1={y(value)} y2={y(value)} />
            <text className="tempAxis" x={pad.left - 8} y={y(value) + 4} textAnchor="end">
              {value > 0 ? "+" : ""}{value.toFixed(1)}
            </text>
          </g>
        ))}
        {records.map((record, i) => (
          <path key={record.label} d={path(record.series)} className="tempLine"
                style={{ stroke: colours[i % colours.length] }} />
        ))}
        {warmest ? (
          <g>
            <circle cx={x(warmest.year)} cy={y(warmest.anomalyC)} r={6} fill={colours[0]}
                    stroke="var(--card)" strokeWidth={2} />
            <text className="tempPeak" x={x(warmest.year)} y={y(warmest.anomalyC) - 14} textAnchor="middle">
              {warmest.year}
            </text>
          </g>
        ) : null}
        {[years[0], 1970, 1990, 2010, years[years.length - 1]].map((year) => (
          <text key={year} className="tempAxis" x={x(year)} y={H - 8} textAnchor="middle">{year}</text>
        ))}
      </svg>

      <div className="tempKey">
        {records.map((record, i) => (
          <span key={record.label}>
            <i style={{ background: colours[i % colours.length] }} />
            {record.label}
            <em>{record.note}</em>
          </span>
        ))}
        <span className="tempKeyNote">°C against the {data.baseline} average</span>
      </div>

      <div className="tempFindings">
        <div className="tempFinding">
          <span>Warmest year on record</span>
          <strong>{data.agreement.warmestYear}</strong>
          <em>
            in {fine.lastYear - fine.firstYear + 1} years of {fine.label}. The coarser record has cells larger
            than the state and cannot rank a single year, so it is not counted here.
          </em>
        </div>
        <div className="tempFinding">
          <span>El Niño years, against the trend</span>
          <strong>
            +{Math.min(...records.map((r) => r.enso!.differenceC)).toFixed(2)} to +
            {Math.max(...records.map((r) => r.enso!.differenceC)).toFixed(2)} °C
          </strong>
          <em>
            hotter than La Niña years across {records[0].enso!.elNinoYears} and{" "}
            {records[0].enso!.laNinaYears} events, in <strong>both</strong>{" "}
            records (p&nbsp;={" "}
            {records.map((r) => r.enso!.pValue).sort((a, b) => a - b).map((p) => p.toString()).join(" and ")}).
            The warming trend is removed first, or this would only say that El Niño years fell later.
          </em>
        </div>
        <div className="tempFinding muted">
          <span>How fast it is warming</span>
          <strong>
            {data.agreement.trendRangeCPerDecade[0].toFixed(2)}–
            {data.agreement.trendRangeCPerDecade[1].toFixed(2)} °C
            <small>&nbsp;per decade</small>
          </strong>
          <em>
            The two records differ by nearly a factor of three. Both are certain the state is warming; neither
            can be taken alone for the rate, so it is published as the range they span and not as a figure.
          </em>
        </div>
      </div>
    </div>
  );
}
