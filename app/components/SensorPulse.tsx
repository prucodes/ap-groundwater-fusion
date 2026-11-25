import type { CSSProperties } from "react";
import { districtGeometry } from "../lib/data";
import { sensors, sensorHistory } from "../lib/sensors";
import { SensorView } from "./SensorView";
import styles from "./SensorPulse.module.css";

/* Today, from the State's sensors: every automatic recorder that reported in the
   last two days, as a dot where it stands, coloured by how far its water table
   has moved since the same date last year. Same sensor against itself, so the
   difference in wells between networks does not enter. Server rendered. */

const W = 640, PAD = 10;
const MAX_LEVEL_M = 100, MAX_CHANGE_M = 50;
const [west, south, east, north] = districtGeometry.bbox as unknown as [number, number, number, number];
const k = Math.cos(((south + north) / 2) * Math.PI / 180);
const H = Math.round(((north - south) / ((east - west) * k)) * (W - 2 * PAD) + 2 * PAD);
const x = (lng: number) => PAD + ((lng - west) * k * (W - 2 * PAD)) / ((east - west) * k);
const y = (lat: number) => PAD + ((north - lat) * (H - 2 * PAD)) / (north - south);

/** Deeper, shallower or neither, by the rule the daily count uses (moved() in fetch_apwrims_sensors.py): more than
   0.1 m either way, in whole centimetres, so 1.23 against 1.13 m (0.10000000000000009 in floating point) is neither. */
const side = (change: number) => { const cm = Math.round(change * 100); return cm > 10 ? 1 : cm < -10 ? -1 : 0; };

/** Rust deeper than a year ago, cyan shallower, by how many metres. */
function tone(change: number) {
  const t = Math.min(1, Math.abs(change) / 8);
  if (!side(change)) return "#93a7b8";
  return change > 0 ? `rgba(214, 112, 72, ${0.45 + 0.55 * t})` : `rgba(74, 196, 230, ${0.45 + 0.55 * t})`;
}

/* The same dots lined up by change: a column for every metre, shallower to the left of the
   sensors that have not moved, deeper to the right, so the share that is deeper is a shape
   rather than a figure. The last column on each side takes everything beyond it. */
const BIN_W = 20, COLUMNS = 4, PITCH = BIN_W / COLUMNS, SHALLOWER_BINS = 9, DEEPER_BINS = 21;
const STRIP_X = (W - (SHALLOWER_BINS + 1 + DEEPER_BINS) * BIN_W) / 2, BASELINE = H - 46;
const binOf = (change: number) => (side(change) > 0 ? SHALLOWER_BINS + 1 + Math.min(DEEPER_BINS - 1, Math.floor(change))
  : side(change) < 0 ? SHALLOWER_BINS - 1 - Math.min(SHALLOWER_BINS - 1, Math.floor(-change)) : SHALLOWER_BINS);
/** Where a whole number of metres falls on the strip: negative is shallower. */
const metreX = (m: number) => STRIP_X + (m < 0 ? SHALLOWER_BINS + m : SHALLOWER_BINS + 1 + m) * BIN_W;
const pct = (v: number, of: number) => `${((100 * v) / of).toFixed(2)}%`;

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export function SensorPulse() {
  const s = sensors.state;
  const live = sensors.stations.filter(st => st[7] !== null && st[7] <= sensors.activeHours && st[6] !== null);
  const outlines = districtGeometry.districts.flatMap(d => d.rings.map(r => "M" + r.map(([lng, lat]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("L") + "Z"));
  // A reading past 100 m, or a change of more than 50 m in a year, is more often a dry well or a faulty sensor
  // than water: kept on the map, left out of the list a reader would quote.
  const plausible = live.filter(st => st[5] <= MAX_LEVEL_M && Math.abs(st[5] - (st[6] as number)) <= MAX_CHANGE_M);
  const doubtful = live.length - plausible.length;
  // One row per village: two sensors in the same place read as a duplicate, so the larger fall stands for both.
  const biggest = [...plausible].sort((a, b) => (b[5] - (b[6] ?? 0)) - (a[5] - (a[6] ?? 0)))
    .filter((st, i, all) => all.findIndex(other => other[4] === st[4] && other[3] === st[3]) === i).slice(0, 5);
  const days = sensorHistory.days;
  const deeperPct = Math.round((100 * s.deeperThanYearAgo) / Math.max(s.compared, 1));
  // The dots arrive deepest-fallen first, so the spread of rust across the State is what the eye meets.
  const order = new Map([...live].sort((a, b) => (b[5] - (b[6] as number)) - (a[5] - (a[6] as number))).map((st, i) => [st, i / Math.max(live.length - 1, 1)]));
  const listed = new Map(biggest.map((st, i) => [st, `f${i}`]));
  // Each dot's place on the strip: its column by the metres it moved, stacked up from the line in order of change.
  const bins = new Map<number, typeof live>();
  [...live].sort((a, b) => (a[5] - (a[6] as number)) - (b[5] - (b[6] as number))).forEach(st => { const bin = binOf(st[5] - (st[6] as number)); bins.set(bin, [...(bins.get(bin) ?? []), st]); });
  const tallest = Math.max(1, ...[...bins.values()].map(list => Math.ceil(list.length / COLUMNS)));
  // A column that would run off the top is packed tighter rather than cut.
  const rise = Math.min(PITCH, (BASELINE - 70) / tallest);
  const place = new Map<(typeof live)[number], [number, number]>();
  bins.forEach((list, bin) => list.forEach((st, i) => place.set(st, [
    Math.round((STRIP_X + bin * BIN_W + PITCH / 2 + (i % COLUMNS) * PITCH - x(st[2])) * 10) / 10,
    Math.round((BASELINE - PITCH / 2 - Math.floor(i / COLUMNS) * rise - y(st[1])) * 10) / 10,
  ])));
  const moved = (st: (typeof live)[number]) => { const [dx, dy] = place.get(st) ?? [0, 0]; return { "--sx": dx, "--sy": dy }; };
  const unmoved = live.length - s.deeperThanYearAgo - s.shallowerThanYearAgo;
  // A row and its dot answer each other on hover: the dot rings, the row lights.
  const pairing = biggest.map((_, i) => `.${styles.wrap}:has([data-pair="f${i}"]:hover) [data-pair="f${i}"]`).join(",");
  const pulsing = biggest.map((_, i) => `.${styles.wrap}:has([data-pair="f${i}"]:hover) [data-ring="f${i}"]`).join(",");
  return (
    <div className={styles.wrap} data-testid="sensor-pulse">
      {pairing ? <style>{`${pairing}{--paired:1}${pulsing}{animation-name:${styles.ringPulse}}`}</style> : null}
      <SensorView>
        <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} role="img" data-draw="sequence"
          aria-label={`${live.length} automatic water-level sensors, each coloured by its change since the same date last year: ${s.deeperThanYearAgo} deeper, ${s.shallowerThanYearAgo} shallower, ${unmoved} within 0.1 m.`}>
          {outlines.map((d, i) => <path key={i} d={d} className={styles.district} />)}
          <g className={styles.axis} aria-hidden="true">
            <line x1={STRIP_X} x2={W - STRIP_X} y1={BASELINE + 1.5} y2={BASELINE + 1.5} />
            {[-5, 0, 5, 10, 15].map(m => <line key={m} x1={metreX(m)} x2={metreX(m)} y1={BASELINE + 1.5} y2={BASELINE + 7} />)}
          </g>
          {live.map(st => <circle key={`${st[0]}-${st[1]}`} cx={x(st[2])} cy={y(st[1])} r={2.6} fill={tone(st[5] - (st[6] as number))}
            className={styles.dot} data-pair={listed.get(st)} data-side={side(st[5] - (st[6] as number))} style={{ "--order": order.get(st), ...moved(st) } as CSSProperties}>
            <title>{`${st[0]}, ${st[4]} (${st[3].replace(" (d)", "")}): ${st[5].toFixed(1)} m today, ${(st[6] as number).toFixed(1)} m a year ago`}</title>
          </circle>)}
          {biggest.map((st, i) => <circle key={`ring-${i}`} cx={x(st[2])} cy={y(st[1])} r={9} className={styles.ring} data-ring={`f${i}`} aria-hidden="true" style={moved(st) as CSSProperties} />)}
        </svg>
        {/* The strip's own words, in page type so they stay readable on a phone; shown only when the dots are lined up. */}
        <div className={styles.strip} aria-hidden="true">
          <span className={styles.stripShallower} style={{ left: pct(STRIP_X, W) }}><b>{s.shallowerThanYearAgo.toLocaleString("en-IN")}</b> shallower</span>
          <span className={styles.stripDeeper} style={{ right: pct(STRIP_X, W) }}><b>{s.deeperThanYearAgo.toLocaleString("en-IN")}</b> deeper than a year ago</span>
          {[[-5, "5 m"], [5, "5 m"], [10, "10 m"], [15, "15 m"]].map(([m, label]) => <i key={m} style={{ left: pct(metreX(m as number), W), top: pct(BASELINE + 9, H) }}>{label}</i>)}
          <i style={{ left: pct(metreX(0) - BIN_W / 2, W), top: pct(BASELINE + 9, H) }}>no change</i>
          <i data-end="" style={{ right: pct(STRIP_X, W), top: pct(BASELINE + 9, H) }}>{DEEPER_BINS - 1} m+</i>
        </div>
      </SensorView>
      <div className={styles.side}>
        <div className={styles.big}><b>{deeperPct}%</b><span>of the State&rsquo;s reporting sensors are deeper than on the same date last year: <strong>{s.deeperThanYearAgo.toLocaleString("en-IN")}</strong> of {s.compared.toLocaleString("en-IN")}</span></div>
        <ul className={styles.tiles}>
          <li><span>Median today</span><b>{s.medianM.toFixed(1)} m</b><em>below ground</em></li>
          <li><span>Same sensors, a year ago</span><b>{s.medianYearAgoM.toFixed(1)} m</b><em>{(s.medianM - s.medianYearAgoM).toFixed(1)} m deeper now</em></li>
          <li><span>Reporting</span><b>{s.active.toLocaleString("en-IN")}</b><em>of {s.stations.toLocaleString("en-IN")} sensors, last {sensors.activeHours} h</em></li>
        </ul>
        <h3>Fallen furthest since a year ago</h3>
        <ol className={styles.list}>
          {biggest.map(st => <li key={st[0]} data-pair={listed.get(st)}><span>{st[4]}<small>{st[3].replace(" (d)", "")}</small></span><b>{(st[5] - (st[6] as number)).toFixed(1)} m</b><em>{(st[6] as number).toFixed(1)} → {st[5].toFixed(1)} m</em></li>)}
        </ol>
        <p className={styles.key} aria-hidden="true"><i className={styles.deeper} />deeper than a year ago<i className={styles.shallower} />shallower</p>
        <p className={styles.note}>
          {doubtful ? `${doubtful} readings past ${MAX_LEVEL_M} m or ${MAX_CHANGE_M} m from a year ago are left out of the list, as more likely a dry well or a faulty sensor. ` : ""}
          Latest reading {when(sensors.latestReading)} IST{days.length > 1 ? `; read daily since ${new Date(`${days[0][0]}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : "; read daily from today"}. Each sensor is set against itself a
          year ago: the sensors stand in different wells from the monthly hand readings the rest of the site uses, so the two are not mixed.
          APWRIMS telemetry, as its public dashboard shows it; a research sample pending authorisation, not official data.
        </p>
      </div>
    </div>
  );
}
