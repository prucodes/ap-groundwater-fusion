import akvanJson from "../data/cyclone_akvan.json";
import liveJson from "../data/live_clouds.json";
import { MAP_VIEW, mapGeometry } from "../lib/data";
import { STATIC_MAP_VIEW } from "../lib/staticMap";
import { StateOutlineMap } from "./StateOutlineMap";
import { LiveLoop, type LiveClouds } from "./LiveLoop";
import styles from "./CycloneAkvan.module.css";

/* The third cyclone, as it comes (phase3_levels/build_cyclone_akvan.py), on the same
   night-sky band as the satellite films: the storm itself from Himawari on the left,
   and on the right the State at night with the mandals it matters to most lit up.
   Before the rain is counted those are the deep water tables the first two storms
   missed; once the gauges count it, the map is its rain with those mandals ringed,
   and the State's sensors say whether the water table has answered, each against its
   own reading while the storm was still at sea. Server rendered. */

type Akvan = {
  event: string; name: string; nameConfirmed: boolean; landfall: string; landfallConfirmed: boolean; near: string;
  rainWindow: { from: string; to: string | null; gaugesTo: string; closes: string; open: boolean; baselineTo: string };
  state: { rainTmc: number; normalTmc: number; seasonDeviationBefore: number; seasonDeviationAfter: number; mandals: number; heavyMandals: number } | null;
  missedBefore: { mandals: number; reached: number; reachedMm: number; medianMm: number | null };
  districts: Array<{ district: string; medianMm: number; heavy: number }>;
  map: Array<[number, string, string, number, boolean]>;
  missed: number[];
  sensors: {
    baseline: string; reading: string; compared: number; risen: number; medianRiseM: number | null; inMissed: number; risenInMissed: number;
    stations: Array<[string, number, number, number, number]>;
    districts: Array<{ district: string; compared: number; risen: number; medianRiseM: number }>;
  };
  timeline: Array<{ day: string; compared: number; risen: number; medianRiseM: number | null; rainTmc: number | null }>;
};
const a = akvanJson as unknown as Akvan;

/** Storm rain on a night map: deep slate for a little, through cyan, to near white for 200 mm. */
const NIGHT_RAIN = [
  { key: "0", max: 25, label: "Under 25 mm", color: "#23405e" },
  { key: "1", max: 50, label: "25 to 50", color: "#2c6688" },
  { key: "2", max: 100, label: "50 to 100", color: "#3b9cc2" },
  { key: "3", max: 200, label: "100 to 200", color: "#7fd3ea" },
  { key: "4", max: Infinity, label: "200 mm or more", color: "#e8f9ff" },
];
const AMBER = "#f2b24a", SLATE = "#1c3550";
/** A sensor counts as risen past 10 cm (build_cyclone_akvan.RISE_M); a 2 m rise glows fullest. */
const RISE_M = 0.1, FULL_GLOW_M = 2;
const DAY_MS = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`)) / DAY_MS);

/* The water table's answer, day by day: the share of sensors risen since the storm was at sea
   (the lit line) over the State's rain so far (the faint field behind it). One point a day. */
function Response({ a }: { a: Akvan }) {
  const t = a.timeline;
  const first = t[0]?.day ?? a.sensors.baseline.slice(0, 10);
  const last = [t[t.length - 1]?.day ?? first, a.rainWindow.closes].sort()[1];
  const span = Math.max(1, daysBetween(first, last));
  const W = 640, H = 168, L = 8, R = 52, T = 14, B = 26;
  const x = (iso: string) => L + ((W - L - R) * daysBetween(first, iso)) / span;
  const pct = t.map(p => (p.compared ? (100 * p.risen) / p.compared : 0));
  const top = Math.max(20, Math.ceil(Math.max(...pct, 0) / 20) * 20);
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const rainMax = Math.max(...t.map(p => p.rainTmc ?? 0), 0);
  const rainY = (v: number) => H - B - (H - T - B) * 0.85 * (rainMax ? v / rainMax : 0);
  const rainPts = t.filter(p => p.rainTmc !== null);
  const line = t.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)} ${y(pct[i]).toFixed(1)}`).join("");
  const area = rainPts.length > 1 ? `M${x(rainPts[0].day)} ${H - B}` + rainPts.map(p => `L${x(p.day).toFixed(1)} ${rainY(p.rainTmc!).toFixed(1)}`).join("") + `L${x(rainPts[rainPts.length - 1].day)} ${H - B}Z` : "";
  const ticks = Array.from({ length: span + 1 }, (_, i) => addDays(first, i));
  const now = pct[pct.length - 1] ?? 0, lastPoint = t[t.length - 1];
  const answered = a.sensors.districts.filter(d => d.risen > 0).slice(0, 5);
  return (
    <section className={styles.response} aria-labelledby="akvan-response-title" data-testid="akvan-response">
      <div className={styles.responseHead}>
        <span className={styles.kicker}>The water table&rsquo;s answer</span>
        <h3 id="akvan-response-title">
          {a.sensors.risen
            ? `${Math.round(now)}% of the State’s sensors have risen since ${day(a.sensors.baseline)}${a.sensors.medianRiseM ? `, by ${a.sensors.medianRiseM.toFixed(2)} m in the middle sensor` : ""}`
            : `${a.sensors.compared.toLocaleString("en-IN")} sensors are watching. None has risen yet.`}
        </h3>
        <p>Each automatic recorder against its own reading on {at(a.sensors.baseline)} IST, before the storm reached the coast. A sensor counts once its water table is more than 10 cm nearer the surface.</p>
      </div>
      <svg className={styles.chart} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Share of sensors risen since ${day(first)}, by day, ${t.map((p, i) => `${day(p.day)} ${Math.round(pct[i])}%`).join(", ")}.`}>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} className={styles.axis} />
        <line x1={L} x2={W - R} y1={y(top)} y2={y(top)} className={styles.grid} />
        <text x={W - R + 6} y={y(top) + 4} className={styles.tick}>{top}%</text>
        {area ? <path d={area} className={styles.rain} /> : null}
        {a.landfall >= first && a.landfall <= last ? <g className={styles.landfall}>
          <line x1={x(a.landfall)} x2={x(a.landfall)} y1={T - 4} y2={H - B} />
          <text x={x(a.landfall) + 5} y={T + 6}>{a.landfallConfirmed ? "Ashore" : "Landfall expected"}</text>
        </g> : null}
        {ticks.filter((d, i) => i % Math.ceil(span / 9) === 0 || d === last).map((d, i, shown) => (
          // Every other date steps aside on a phone, where the chart's text is drawn larger.
          <text key={d} x={x(d)} y={H - 8} className={styles.tick} data-minor={i % 2 && i !== shown.length - 1 ? "" : undefined} textAnchor={i === 0 ? "start" : i === shown.length - 1 ? "end" : "middle"}>{day(d)}</text>
        ))}
        {t.length > 1 ? <path d={line} className={styles.line} /> : null}
        {t.map((p, i) => <circle key={p.day} cx={x(p.day)} cy={y(pct[i])} r={i === t.length - 1 ? 4 : 2.5} className={styles.dot} />)}
        {lastPoint ? <text x={x(lastPoint.day) + 8} y={y(now) - 8} className={styles.value}>{Math.round(now)}%</text> : null}
        {rainMax && rainPts.length > 1 ? <text x={x(rainPts[rainPts.length - 1].day) - 6} y={H - B - 8} className={styles.rainLabel} textAnchor="end">{Math.round(rainPts[rainPts.length - 1].rainTmc!)} TMC</text> : null}
      </svg>
      <p className={styles.key}><span><i className={styles.keyLine} />Sensors risen</span><span><i className={styles.keyRain} />Rain so far, State gauges</span></p>
      {answered.length ? (
        <ol className={styles.answered} aria-label="Districts where most sensors have risen">
          {answered.map(d => (
            <li key={d.district}>
              <b>{d.district}</b>
              <span className={styles.bar}><i style={{ width: `${(100 * d.risen) / d.compared}%` }} /></span>
              <em>{`${d.risen} of ${d.compared} · ${d.medianRiseM > 0 ? "+" : ""}${d.medianRiseM.toFixed(2)} m`}</em>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export function CycloneAkvan() {
  const counting = a.state !== null && a.rainWindow.to !== null;
  const n = mapGeometry.mandals.length;
  const keys = Array<string>(n).fill("n");
  const notes = mapGeometry.mandals.map(() => "Not one of the deep water tables the first two storms missed.");
  if (counting) {
    for (const [i, , , mm, wasMissed] of a.map) {
      keys[i] = NIGHT_RAIN.find(b => mm < b.max)!.key;
      notes[i] = `${mm} mm from ${day(a.rainWindow.from)} to ${day(a.rainWindow.to!)}.${wasMissed ? " Its deep water table got under 50 mm from Arnab and Murasu together." : ""}`;
    }
  } else {
    for (const i of a.missed) {
      keys[i] = "m";
      notes[i] = "Deeper than 8 m, and under 50 mm from Arnab and Murasu together: where rain would help most.";
    }
  }
  const colors: Record<string, string> = counting ? { ...Object.fromEntries(NIGHT_RAIN.map(b => [b.key, b.color])), n: SLATE } : { m: AMBER, n: SLATE };
  const s = a.sensors;
  // Every sensor as a point of light: faint until its water table rises, then lit by how far.
  const points = s.stations.map(([, lat, lng, , rise]) => {
    const [px, py] = MAP_VIEW.project(lng, lat);
    return [Math.round(px * 10) / 10, Math.round(py * 10) / 10, rise > RISE_M ? Math.min(1, rise / FULL_GLOW_M) : 0] as [number, number, number];
  });
  const landfall = `${a.landfallConfirmed ? "came ashore" : "expected ashore"} on ${a.near}, ${a.landfallConfirmed ? day(a.landfall) : `around the night of ${day(a.landfall)}`}`;
  return (
    <div className={styles.wrap} data-testid="cyclone-akvan">
      <div className={styles.head}>
        <span className={styles.kicker}><span className={styles.liveDot} aria-hidden="true" />The third cyclone · {a.name}{a.nameConfirmed ? "" : " (name to be confirmed by IMD)"}</span>
        <h2>{counting ? `What ${a.name} brought, and whether it reached the mandals the first two missed` : `${a.name} is heading for the part of the State the first two storms missed`}</h2>
        <p>
          {`IMD’s forecast: a very severe cyclonic storm, ${landfall}. Arnab and Murasu left `}
          <b>{`${a.missedBefore.mandals} of the State’s deep water tables`}</b>
          {` with under ${a.missedBefore.reachedMm} mm, most of them in the south and in Rayalaseema, near where this one is forecast to land.`}
        </p>
      </div>

      <div className={styles.panels}>
        <LiveLoop d={liveJson as unknown as LiveClouds} />
        <div className={styles.night}>
          <StateOutlineMap testId="akvan-map" aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height} keys={keys} colors={colors} notes={notes}
            marks={counting ? a.missed : undefined} points={points}
            label={counting ? `${a.name}'s rain by mandal, with the deep water tables the first two storms missed ringed.` : `The ${a.missedBefore.mandals} deep-water-table mandals Arnab and Murasu missed.`}
            legend={<>{counting ? <>{NIGHT_RAIN.map(b => <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>)}<span><i className={styles.ring} />Missed by the first two</span></>
              : <span><i style={{ background: AMBER }} />Deep water table, under 50 mm from Arnab and Murasu</span>}
              <span><i className={styles.sensorDot} />Sensor</span><span><i className={styles.sensorLit} />Water table risen</span></>} />
        </div>
      </div>

      <ul className={styles.tiles}>
        <li><span>Rain so far</span><b>{counting ? `${Math.round(a.state!.rainTmc)}` : "–"}<small> TMC</small></b><em>{counting ? `normal for the days ${Math.round(a.state!.normalTmc)} TMC · ${a.state!.heavyMandals} mandals got 100 mm or more` : `counted from ${day(a.rainWindow.from)} once the gauges post the storm's days`}</em></li>
        <li data-key=""><span>Missed mandals reached</span><b>{counting ? a.missedBefore.reached : "–"}<small> of {a.missedBefore.mandals}</small></b><em>deep water tables the first two missed that got {a.missedBefore.reachedMm} mm or more from this one</em></li>
        <li><span>Sensors risen since {day(s.baseline)}</span><b>{s.risen.toLocaleString("en-IN")}<small> of {s.compared.toLocaleString("en-IN")}</small></b><em>{s.risenInMissed} of the {s.inMissed} in the missed mandals · latest {at(s.reading)} IST</em></li>
      </ul>

      {a.timeline.length > 1 || s.risen ? <Response a={a} /> : null}

      <ol className={styles.steps} aria-label="Where the count stands">
        <li data-done=""><b>Baselines frozen</b><span>gauges to {day(a.rainWindow.baselineTo)} · {s.compared.toLocaleString("en-IN")} sensors on {day(s.baseline)}</span></li>
        <li data-done={a.landfallConfirmed || undefined}><b>{a.landfallConfirmed ? "Ashore" : "Landfall expected"}</b><span>{day(a.landfall)} · {a.near}</span></li>
        <li data-done={counting || undefined}><b>{counting ? "Rain counted" : "Rain not yet counted"}</b><span>{counting ? `${day(a.rainWindow.from)} to ${day(a.rainWindow.to!)}` : "gauges post two days late"}</span></li>
        <li data-done={(counting && !a.rainWindow.open) || undefined}><b>{counting && !a.rainWindow.open ? "Count closed" : "Count closes"}</b><span>{day(a.rainWindow.closes)}, or later if rain is still falling</span></li>
      </ol>

      <p className={styles.note}>
        {a.landfallConfirmed ? "" : "The date and place of landfall are IMD's forecast until the storm crosses the coast. "}
        Rain: the State&rsquo;s gauges, the season total less its value on {day(a.rainWindow.baselineTo)}. Sensors: APWRIMS automatic water-level
        recorders, each against its own reading on {at(s.baseline)} IST; a rise is the water table nearer the surface by more than 10 cm. Satellite:
        Himawari-9 (Japan Meteorological Agency) via NASA GIBS. Updated morning and evening. A research sample pending authorisation, not official data.
      </p>
    </div>
  );
}
