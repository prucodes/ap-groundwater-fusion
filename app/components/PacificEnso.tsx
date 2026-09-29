"use client";

import { useEffect, useRef, useState } from "react";
import { basePath, pacificEnso } from "../lib/data";

/** What an El Niño is, shown rather than defined — with Andhra Pradesh in frame.
 *
 *  The explainers that circulate stop at the ocean and are drawn for a global
 *  audience; not one of them has India in the picture, so a reader here is left
 *  to take the connection on trust. This is NOAA's measured sea-surface
 *  anomaly across a window that runs from the Bay of Bengal to Peru, one frame
 *  per month, with the state marked on the same map. Step through it and the
 *  warm water leaves Indonesia and slides east while Andhra Pradesh sits on the
 *  left-hand edge of the same picture.
 *
 *  The colour is the measurement. Nothing here is drawn.
 */
export function PacificEnso() {
  const data = pacificEnso;
  const [index, setIndex] = useState(data.months.length - 1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setIndex((current) => {
        if (current >= data.months.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 420);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, data.months.length]);

  const month = data.months[index];
  const warm = month.nino34C >= 0.5;
  const cool = month.nino34C <= -0.5;

  return (
    <div className="pacWrap">
      <div className="pacStage" style={{ aspectRatio: String(data.aspect) }}>
        <img className="pacBase" src={`${basePath}/${data.basemap}`} alt="" />
        {data.months.map((m, i) => (
          <img
            key={m.month}
            className={`pacField ${i === index ? "on" : ""}`}
            src={`${basePath}/${m.file}`}
            alt={i === index ? `Sea surface temperature anomaly, ${m.month}` : ""}
            loading={i > index + 2 ? "lazy" : "eager"}
          />
        ))}

        <span className="pacPin" style={{ left: `${data.andhraPradesh.xPct}%`, top: `${data.andhraPradesh.yPct}%` }}>
          <i />
          <em>Andhra Pradesh</em>
        </span>
        <span className="pacNote west">warm water normally piles up here</span>
        <span className="pacNote east">cold water normally rises here</span>
      </div>

      <div className="pacControls">
        <button
          type="button"
          className="pacPlay"
          onClick={() => {
            if (index >= data.months.length - 1) setIndex(0);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pause" : "Play through the months"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <input
          className="pacScrub"
          type="range"
          min={0}
          max={data.months.length - 1}
          value={index}
          onChange={(event) => {
            setPlaying(false);
            setIndex(Number(event.target.value));
          }}
          aria-label="Month"
        />
        <span className="pacMonth">{month.month}</span>
        <span className={`pacIndex ${warm ? "warm" : cool ? "cool" : ""}`}>
          {month.nino34C > 0 ? "+" : ""}
          {month.nino34C.toFixed(2)} °C
          <em>Niño 3.4, this month</em>
        </span>
      </div>

      <div className="pacLegend">
        <span className="pacRamp" aria-hidden="true" />
        <span>3 °C cooler than normal</span>
        <span className="pacLegendMid">normal</span>
        <span>3 °C warmer</span>
      </div>
    </div>
  );
}
