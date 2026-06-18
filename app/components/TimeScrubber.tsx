"use client";

import { useState } from "react";
import { Sparkline } from "./charts";

type Series = { name: string; color: string; points: number[] };

export function TimeScrubber({ series, months }: { series: Series[]; months: string[] }) {
  const n = months.length;
  const [idx, setIdx] = useState(n - 1);

  return (
    <div>
      <Sparkline area markerIndex={idx} series={series} />

      <input
        type="range"
        className="scrubber"
        min={0}
        max={n - 1}
        value={idx}
        onChange={(e) => setIdx(Number(e.target.value))}
        aria-label="Timeline month"
      />
      <div className="scrubMonth">{months[idx]}</div>

      <div className="scrubValues">
        {series.map((s) => {
          const v = s.points[idx];
          const prev = idx > 0 ? s.points[idx - 1] : v;
          const delta = Math.round((v - prev) * 10) / 10;
          return (
            <div className="scrubValue" key={s.name}>
              <span className="scrubDot" style={{ background: s.color }} />
              <span className="scrubName">{s.name}</span>
              <span className="scrubNum">{v.toFixed(1)}</span>
              <span className={`scrubDelta ${delta > 0 ? "up" : delta < 0 ? "down" : ""}`}>
                {delta > 0 ? "▲" : delta < 0 ? "▼" : "—"} {Math.abs(delta).toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="sideCaveat" style={{ marginTop: 10 }}>
        Illustrative timeline (prototype) generated from one NASA GRACE-DA sample — percentiles 0–100, not groundwater
        depth and not a measured time series.
      </div>
    </div>
  );
}
