import cyclone from "../data/cyclone_arnab.json";
import { formatNumber } from "../lib/data";
import { STATIC_MAP_VIEW } from "../lib/staticMap";
import { CycloneArnabMap } from "./CycloneArnabMap";
import { RowFold, foldAt } from "./RowFold";
import styles from "./CycloneArnab.module.css";

/* Cyclone Arnab against the water table (build_cyclone_arnab.py). The storm's rain
 * is the gauge network's season total read before and after it; groundwater after
 * the storm is not published yet, so depth is September's reading and the rise is
 * last year's precedent, Cyclone Montha on the same coast and date. */

type Band = { band: string; mandals: number; medianMm: number | null; heavy: number };
type Precedent = { band: string; mandals: number; extraRiseM: number; roseMorePct: number };
type Data = {
  landfall: string; rainWindow: { from: string; to: string; days: number }; groundwaterLatest: string;
  state: {
    rainTmc: number; normalTmc: number; seasonDeviationBefore: number; seasonDeviationAfter: number;
    soilMedianBefore: number; soilMedianAfter: number; soilDriestBefore: number; soilDriestAfter: number;
    soilAsOf: { before: string; after: string }; reservoirTmcBefore: number; reservoirTmcAfter: number;
    heavyMandals: number; deepMandals: number; deepHeavyMandals: number;
  };
  heavyMm: number; deepM: number;
  districts: Array<{ district: string; medianMm: number }>;
  byDepth: Band[];
  precedent: { bands: Precedent[] };
  map: Array<[number, string, string, number, number | null]>;
  watch: Array<{ district: string; mandal: string; stormMm: number; depthM: number }>;
  caveat: string;
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const month = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const list = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/* A cyclone's mark: two arms wound round an eye, turning slowly. */
function Spiral() {
  return (
    <svg className={styles.spiral} viewBox="0 0 120 120" aria-hidden="true">
      <g fill="none" strokeLinecap="round">
        <path d="M60 60c0-14 12-24 26-22 16 2 24 18 18 34" stroke="rgba(126, 220, 236, .9)" strokeWidth="7" />
        <path d="M60 60c0 14-12 24-26 22-16-2-24-18-18-34" stroke="rgba(126, 220, 236, .9)" strokeWidth="7" />
        <path d="M60 60c-10-4-14-18-4-28 9-9 26-8 36 2" stroke="rgba(255, 255, 255, .35)" strokeWidth="4" />
        <path d="M60 60c10 4 14 18 4 28-9 9-26 8-36-2" stroke="rgba(255, 255, 255, .35)" strokeWidth="4" />
      </g>
      <circle cx="60" cy="60" r="6" fill="#0b2a4d" stroke="rgba(255,255,255,.8)" strokeWidth="2" />
    </svg>
  );
}

export function CycloneArnab() {
  const d = cyclone as unknown as Data;
  if (!d?.state || !d.byDepth?.length) return null;
  const s = d.state;
  const soaked = d.districts.filter(x => x.medianMm >= d.heavyMm).map(x => x.district);
  const after = new Map(d.precedent.bands.map(b => [b.band, b]));
  const mostHeavy = Math.max(...d.byDepth.map(b => b.heavy), 1);
  const mostRise = Math.max(...d.precedent.bands.map(b => b.extraRiseM), 0.1);
  const seen = month(d.groundwaterLatest);
  return (
    <section className={`card ${styles.card}`} id="cyclone-arnab" aria-labelledby="cyclone-arnab-title" data-testid="cyclone-arnab">
      <div className={styles.band}>
        <div className={styles.bandText}>
          <span className={styles.eyebrow}>Cyclone Arnab · came ashore {day(d.landfall)}</span>
          <h3 className={styles.headline} id="cyclone-arnab-title">The rain fell where the water table was already high</h3>
          <p className={styles.lede}>
            The heaviest fell on {list(soaked)}, where most tables sat within {d.deepM} m of the surface.
            The deep, dry interior, which had the most room to take it, got little.
          </p>
        </div>
        <Spiral />
        <div className={styles.stats}>
          <div>
            <span>Rain in {d.rainWindow.days} days</span>
            <strong>{formatNumber(Math.round(s.rainTmc))} TMC</strong>
            <em>normal {formatNumber(Math.round(s.normalTmc))} · season {s.seasonDeviationBefore}% → {s.seasonDeviationAfter}%</em>
          </div>
          <div>
            <span>Soil moisture, 30 cm</span>
            <strong>{Math.round(s.soilMedianBefore)}% → {Math.round(s.soilMedianAfter)}%</strong>
            <em>median, {day(s.soilAsOf.before)} to {day(s.soilAsOf.after)}</em>
          </div>
          <div className={styles.key}>
            <span>Deep tables that got heavy rain</span>
            <strong>{s.deepHeavyMandals} <small>of {s.deepMandals}</small></strong>
            <em>deeper than {d.deepM} m, {d.heavyMm} mm or more</em>
          </div>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.mapCol}>
          <CycloneArnabMap rows={d.map} heavyMm={d.heavyMm} deepM={d.deepM} month={seen}
            aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height} />
        </div>
        <div className={styles.side}>
          <h4>Rain against room to rise</h4>
          <p className={styles.sideNote}>By depth in {seen}: mandals that got {d.heavyMm} mm or more from Arnab, beside how far that depth rose beyond the usual after Cyclone Montha, which came ashore on the same coast on the same date in 2025.</p>
          <div className={styles.mirror} role="table" aria-label="Arnab's heavy rain by depth, beside last year's rise">
            <div className={styles.mirrorHead} role="row">
              <span role="columnheader">Arnab, heavy-rain mandals</span>
              <span role="columnheader">Depth</span>
              <span role="columnheader">After Montha, extra rise</span>
            </div>
            {d.byDepth.map(b => {
              const p = after.get(b.band);
              return (
                <div className={styles.mirrorRow} role="row" key={b.band}>
                  <span role="cell" className={styles.left}>
                    <b>{b.heavy}</b>
                    <i style={{ width: `${(100 * b.heavy) / mostHeavy}%` }} />
                  </span>
                  <span role="cell" className={styles.mid}>{b.band}</span>
                  <span role="cell" className={styles.right}>
                    <i style={{ width: `${p ? (100 * p.extraRiseM) / mostRise : 0}%` }} />
                    <b>{p ? `${p.extraRiseM.toFixed(1)} m` : "–"}</b>
                  </span>
                </div>
              );
            })}
          </div>
          <p className={styles.sideNote}>The bars point in opposite directions: most of the heavy rain landed where last year&apos;s rise was smallest. The November readings will show whether Arnab follows.</p>
        </div>
      </div>

      {d.watch.length ? (
        <div className={styles.watch}>
          <h4>The {d.watch.length} mandals to watch in November</h4>
          <RowFold id="arnab-watch" total={d.watch.length} visible={6} noun="mandals">
            <div className="tableWrap capped">
              <table className="dataTable compact" aria-label="Deep water tables that got heavy rain">
                <thead><tr><th>Mandal</th><th>District</th><th>Arnab rain</th><th>Depth in {seen}</th></tr></thead>
                <tbody>
                  {d.watch.map((m, i) => (
                    <tr key={`${m.district}-${m.mandal}`} {...foldAt(i, 6)}>
                      <td>{m.mandal}</td><td>{m.district}</td><td>{Math.round(m.stormMm)} mm</td><td>{m.depthM.toFixed(1)} m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RowFold>
        </div>
      ) : null}
      <p className="cardNote">
        {d.caveat} Gauge rain {day(d.rainWindow.from)} to {day(d.rainWindow.to)}. Reservoir storage rose
        {" "}{formatNumber(Math.round(s.reservoirTmcAfter - s.reservoirTmcBefore))} TMC over the same days; river inflows arrive later.
      </p>
    </section>
  );
}
