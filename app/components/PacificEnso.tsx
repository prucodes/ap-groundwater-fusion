"use client";

import { useEffect, useState } from "react";
import { countEvent } from "../lib/visit-counter";
import { basePath, mapGeometry, pacificEnso } from "../lib/data";
import { IconChevronLeft, IconChevronRight, IconPause, IconPlay } from "./icons";
import styles from "./PacificEnso.module.css";

const data = pacificEnso;
const project = (lon: number, lat: number) => [
  (lon - data.window.lon0) / (data.window.lon1 - data.window.lon0) * 1000,
  (data.window.lat0 - lat) / (data.window.lat0 - data.window.lat1) * 1000 / data.aspect,
];
const statePath = mapGeometry.mandals.flatMap(m => m.rings.map(ring => ring.map((point, i) =>
  `${i ? "L" : "M"}${project(point[0], point[1]).map(n => n.toFixed(2)).join(",")}`
).join(" ") + "Z")).join(" ");
const monthLabel = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const signed = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)} °C`;
const locationStyle = (lon: number, lat: number) => {
  const [x, y] = project(lon, lat);
  return { left: `${x / 10}%`, top: `${y / 10 * data.aspect}%` };
};

/** A data explorer, separate from the film's schematic wind explanation. */
export function PacificEnso() {
  const [index, setIndex] = useState(data.months.length - 1);
  const [playing, setPlaying] = useState(false);
  const [layer, setLayer] = useState<"anomaly" | "earth">("anomaly");
  useEffect(() => {
    if (!playing) return;
    if (index >= data.months.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setIndex(index + 1), 650);
    return () => clearTimeout(timer);
  }, [playing, index]);
  const select = (next: number) => {
    countEvent("monsoon/pacific-scrub", "Monsoon: moved through Pacific months");
    setPlaying(false);
    setIndex(next);
  };
  const month = data.months[index];
  const box = project(190, 5), end = project(240, -5);

  return (
    <div className={styles.explorer}>
      <div className={styles.readout}>
        <div><span className={styles.eyebrow}>NOAA / ERSST v5</span><h3>Pacific heat, month by month</h3><span className="pacMonth">{monthLabel(month.month)}</span></div>
        <div className={styles.values}>
          <div><strong style={{ color: month.nino34C >= 0 ? "#bd593c" : "#237fa4" }}>{signed(month.nino34C)}</strong><span>Niño 3.4 · monthly anomaly</span></div>
          <div><strong>{signed(month.nino34ThreeMonthC)}</strong><span>Three-month mean · this baseline</span></div>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div role="group" aria-label="Pacific map layer" className={styles.segmented}>
          <button type="button" aria-pressed={layer === "anomaly"} onClick={() => setLayer("anomaly")}>Temperature anomaly</button>
          <button type="button" aria-pressed={layer === "earth"} onClick={() => { countEvent("monsoon/pacific-earth", "Monsoon: switched the Pacific map to Earth imagery"); setLayer("earth"); }}>Earth imagery</button>
        </div>
        <span>Baseline 1991–2020 · Not a rainfall forecast</span>
      </div>
      <div className={`${styles.stage} pacStage`} style={{ aspectRatio: String(data.aspect) }} role="img" aria-label={`Pacific sea-surface temperature ${layer === "anomaly" ? `anomaly for ${monthLabel(month.month)}` : "basemap"}; Andhra Pradesh, Indonesia, South America and Niño 3.4 located`}>
        <img className={styles.base} src={`${basePath}/${data.basemap}`} alt="" />
        {data.months.map((m, i) => <img key={m.month} className={`${styles.field} pacField ${i === index ? "on" : ""}`} style={{ opacity: i === index && layer === "anomaly" ? 1 : 0 }} src={`${basePath}/${m.file}`} alt="" />)}
        <svg className={styles.overlay} viewBox={`0 0 1000 ${1000 / data.aspect}`} aria-hidden="true">
          <path d={statePath} fill="#70f4d2" stroke="#d6fff1" strokeWidth=".65" />
          <path d={`M0 ${project(62, 0)[1]}H1000`} stroke="#ffffff45" strokeDasharray="3 7" />
          <rect x={box[0]} y={box[1]} width={end[0] - box[0]} height={end[1] - box[1]} fill="none" stroke="#fff" strokeWidth="1.4" strokeDasharray="6 4" />
          <text x={box[0] + 8} y={box[1] - 9}>NIÑO 3.4</text>
        </svg>
        <span className={`${styles.apPin} pacPin`} style={{ left: `${data.andhraPradesh.xPct}%`, top: `${data.andhraPradesh.yPct}%` }}><i /><em>Andhra Pradesh</em></span>
        <span className={styles.place} style={locationStyle(120, -3)}><i /><em>Indonesia</em></span>
        <span className={`${styles.place} ${styles.america}`} style={locationStyle(282, -8)}><i /><em>South America</em></span>
        <span className={styles.ocean}>PACIFIC OCEAN</span>
      </div>
      <div className={styles.legend}><span>−3 °C</span><i /><span>0</span><i /><span>+3 °C</span><em>Sea-surface temperature difference from normal</em></div>
      <div className={styles.controls}>
        <button type="button" className="pacPlay" title={playing ? "Pause months" : "Play months"} aria-label={playing ? "Pause months" : "Play through the months"} onClick={() => { countEvent("monsoon/pacific-play", "Monsoon: played the Pacific months"); if (index === data.months.length - 1) setIndex(0); setPlaying(!playing); }}>{playing ? <IconPause /> : <IconPlay />}</button>
        <button type="button" title="Previous month" aria-label="Previous month" disabled={index === 0} onClick={() => select(index - 1)}><IconChevronLeft /></button>
        <input className="pacScrub" type="range" min={0} max={data.months.length - 1} value={index} onChange={event => select(Number(event.target.value))} aria-label="Month" aria-valuetext={monthLabel(month.month)} />
        <button type="button" title="Next month" aria-label="Next month" disabled={index === data.months.length - 1} onClick={() => select(index + 1)}><IconChevronRight /></button>
      </div>
      <div className={styles.timeline} role="group" aria-label="Monthly Niño 3.4 anomalies">
        {data.months.map((m, i) => <button type="button" key={m.month} aria-pressed={i === index} aria-label={`${monthLabel(m.month)}: ${signed(m.nino34C)}`} title={`${monthLabel(m.month)}: ${signed(m.nino34C)}`} onClick={() => select(i)}>
          <span className={styles.barArea}><i style={{ height: `${Math.max(2, Math.abs(m.nino34C) / 3 * 36)}px`, top: m.nino34C >= 0 ? "auto" : "40px", bottom: m.nino34C >= 0 ? "20px" : "auto", background: m.nino34C >= 0 ? "#df9367" : "#58a8ba" }} /></span>
          <span>{m.month.slice(5)}</span><small>{i === 0 || m.month.endsWith("-01") ? m.month.slice(0, 4) : ""}</small>
        </button>)}
      </div>
      <p className={styles.note}>Colours show reconstructed ocean temperatures, not wind measurements or water flowing to India. Monthly Niño 3.4 values alone do not establish an ENSO event. AP mandal outlines are official where rebuilt from the State's points, prototype elsewhere.</p>
    </div>
  );
}
