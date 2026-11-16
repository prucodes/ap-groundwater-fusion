import akvanJson from "../data/cyclone_akvan.json";
import liveJson from "../data/live_clouds.json";
import { mapGeometry } from "../lib/data";
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
  sensors: { baseline: string; reading: string; compared: number; risen: number; medianRiseM: number | null; inMissed: number; risenInMissed: number };
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
            marks={counting ? a.missed : undefined}
            label={counting ? `${a.name}'s rain by mandal, with the deep water tables the first two storms missed ringed.` : `The ${a.missedBefore.mandals} deep-water-table mandals Arnab and Murasu missed.`}
            legend={counting ? <>{NIGHT_RAIN.map(b => <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>)}<span><i className={styles.ring} />Missed by the first two</span></>
              : <span><i style={{ background: AMBER }} />Deep water table, under 50 mm from Arnab and Murasu</span>} />
        </div>
      </div>

      <ul className={styles.tiles}>
        <li><span>Rain so far</span><b>{counting ? `${Math.round(a.state!.rainTmc)}` : "–"}<small> TMC</small></b><em>{counting ? `normal for the days ${Math.round(a.state!.normalTmc)} TMC · ${a.state!.heavyMandals} mandals got 100 mm or more` : `counted from ${day(a.rainWindow.from)} once the gauges post the storm's days`}</em></li>
        <li data-key=""><span>Missed mandals reached</span><b>{counting ? a.missedBefore.reached : "–"}<small> of {a.missedBefore.mandals}</small></b><em>deep water tables the first two missed that got {a.missedBefore.reachedMm} mm or more from this one</em></li>
        <li><span>Sensors risen since {day(s.baseline)}</span><b>{s.risen.toLocaleString("en-IN")}<small> of {s.compared.toLocaleString("en-IN")}</small></b><em>{s.risenInMissed} of the {s.inMissed} in the missed mandals · latest {at(s.reading)} IST</em></li>
      </ul>

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
