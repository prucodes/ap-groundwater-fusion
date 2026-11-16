import akvanJson from "../data/cyclone_akvan.json";
import { mandalByMapKey, mapGeometry } from "../lib/data";
import { sensors } from "../lib/sensors";
import styles from "./MandalSensors.module.css";

/* The State's automatic recorders inside this mandal, as they read today: each one
   against itself a year ago, and against its own reading before Cyclone Akvan once
   the storm has passed. Server rendered; nothing shows where no sensor stands. */

const akvan = akvanJson as unknown as { name: string; sensors: { baseline: string; stations: Array<[string, number, number, number | null, number]> } };
const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} m`;

export function MandalSensors({ mandalId }: { mandalId: string }) {
  const index = mapGeometry.mandals.findIndex(x => mandalByMapKey(x.d, x.m)?.id === mandalId);
  if (index < 0) return null;
  const mine = sensors.stations.filter(st => st[8] === index && st[7] !== null && st[7] <= sensors.activeHours);
  if (!mine.length) return null;
  const rise = new Map(akvan.sensors.stations.map(r => [`${r[0]}|${r[1]}|${r[2]}`, r[4]]));
  const showRise = mine.some(st => Math.abs(rise.get(`${st[0]}|${st[1]}|${st[2]}`) ?? 0) > 0.1);
  return (
    <section className="card" aria-labelledby="mandal-sensors-title" data-testid="mandal-sensors">
      <div className="cardHead">
        <div className="cardTitle" id="mandal-sensors-title">The water table today, from {mine.length === 1 ? "the sensor" : `the ${mine.length} sensors`} in this mandal</div>
        <span className="cardSub">APWRIMS automatic recorders · latest {at(sensors.latestReading)} IST</span>
      </div>
      <ol className={styles.list}>
        {mine.map(st => {
          const change = st[6] === null ? null : st[5] - st[6];
          const r = rise.get(`${st[0]}|${st[1]}|${st[2]}`);
          return <li key={`${st[0]}-${st[1]}`}>
            <span className={styles.name}>{st[0].replace(/_gw$|\(GW\)$/i, "").replace(/_/g, " ")}</span>
            <b>{st[5].toFixed(1)} m</b>
            <em data-tone={change === null ? undefined : change > 0.1 ? "deeper" : change < -0.1 ? "higher" : undefined}>
              {change === null ? "no reading a year ago" : Math.abs(change) <= 0.1 ? `level with a year ago (${(st[6] as number).toFixed(1)} m)`
                : `${Math.abs(change).toFixed(1)} m ${change > 0 ? "deeper" : "higher"} than a year ago (${(st[6] as number).toFixed(1)} m)`}
            </em>
            {showRise && r !== undefined ? <em data-tone={r > 0.1 ? "higher" : undefined}>{r > 0.1 ? `risen ${r.toFixed(1)} m since ${akvan.name}` : `${signed(-r)} since ${akvan.name}`}</em> : null}
          </li>;
        })}
      </ol>
      <p className={styles.note}>Below ground. Each sensor is set against itself: the sensors stand in different wells from the monthly hand readings above, so their depths can differ. A research sample pending authorisation, not official data.</p>
    </section>
  );
}
