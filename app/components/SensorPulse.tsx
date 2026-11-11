import { districtGeometry } from "../lib/data";
import { sensors, sensorHistory } from "../lib/sensors";
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

/** Rust deeper than a year ago, cyan shallower, by how many metres. */
function tone(change: number) {
  const t = Math.min(1, Math.abs(change) / 8);
  if (Math.abs(change) < 0.1) return "#93a7b8";
  return change > 0 ? `rgba(214, 112, 72, ${0.45 + 0.55 * t})` : `rgba(74, 196, 230, ${0.45 + 0.55 * t})`;
}

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export function SensorPulse() {
  const s = sensors.state;
  const live = sensors.stations.filter(st => st[7] !== null && st[7] <= sensors.activeHours && st[6] !== null);
  const outlines = districtGeometry.districts.flatMap(d => d.rings.map(r => "M" + r.map(([lng, lat]) => `${x(lng).toFixed(1)},${y(lat).toFixed(1)}`).join("L") + "Z"));
  // A reading past 100 m, or a change of more than 50 m in a year, is more often a dry well or a faulty sensor
  // than water: kept on the map, left out of the list a reader would quote.
  const plausible = live.filter(st => st[5] <= MAX_LEVEL_M && Math.abs(st[5] - (st[6] as number)) <= MAX_CHANGE_M);
  const doubtful = live.length - plausible.length;
  const biggest = [...plausible].sort((a, b) => (b[5] - (b[6] ?? 0)) - (a[5] - (a[6] ?? 0))).slice(0, 5);
  const days = sensorHistory.days;
  const deeperPct = Math.round((100 * s.deeperThanYearAgo) / Math.max(s.compared, 1));
  return (
    <div className={styles.wrap} data-testid="sensor-pulse">
      <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`${live.length} automatic water-level sensors, each coloured by its change since the same date last year: ${s.deeperThanYearAgo} deeper, ${s.shallowerThanYearAgo} shallower.`}>
        {outlines.map((d, i) => <path key={i} d={d} className={styles.district} />)}
        {live.map(st => <circle key={`${st[0]}-${st[1]}`} cx={x(st[2])} cy={y(st[1])} r={2.6} fill={tone(st[5] - (st[6] as number))}>
          <title>{`${st[0]}, ${st[4]} (${st[3].replace(" (d)", "")}): ${st[5].toFixed(1)} m today, ${(st[6] as number).toFixed(1)} m a year ago`}</title>
        </circle>)}
      </svg>
      <div className={styles.side}>
        <div className={styles.big}><b>{deeperPct}%</b><span>of the State&rsquo;s reporting sensors are deeper than on the same date last year: <strong>{s.deeperThanYearAgo.toLocaleString("en-IN")}</strong> of {s.compared.toLocaleString("en-IN")}</span></div>
        <ul className={styles.tiles}>
          <li><span>Median today</span><b>{s.medianM.toFixed(1)} m</b><em>below ground</em></li>
          <li><span>Same sensors, a year ago</span><b>{s.medianYearAgoM.toFixed(1)} m</b><em>{(s.medianM - s.medianYearAgoM).toFixed(1)} m deeper now</em></li>
          <li><span>Reporting</span><b>{s.active.toLocaleString("en-IN")}</b><em>of {s.stations.toLocaleString("en-IN")} sensors, last {sensors.activeHours} h</em></li>
        </ul>
        <h3>Fallen furthest since a year ago</h3>
        <ol className={styles.list}>
          {biggest.map(st => <li key={st[0]}><span>{st[4]}<small>{st[3].replace(" (d)", "")}</small></span><b>{(st[5] - (st[6] as number)).toFixed(1)} m</b><em>{(st[6] as number).toFixed(1)} → {st[5].toFixed(1)} m</em></li>)}
        </ol>
        <p className={styles.key} aria-hidden="true"><i className={styles.deeper} />deeper than a year ago<i className={styles.shallower} />shallower</p>
        <p className={styles.note}>
          {doubtful ? `${doubtful} readings past ${MAX_LEVEL_M} m or ${MAX_CHANGE_M} m from a year ago are left out of the list, as more likely a dry well or a faulty sensor. ` : ""}
          Latest reading {when(sensors.latestReading)} IST{days.length > 1 ? `; read daily since ${days[0][0]}` : "; read daily from today"}. Each sensor is set against itself a
          year ago: the sensors stand in different wells from the monthly hand readings the rest of the site uses, so the two are not mixed.
          APWRIMS telemetry, as its public dashboard shows it; a research sample pending authorisation, not official data.
        </p>
      </div>
    </div>
  );
}
