import cyclone from "../data/cyclone_arnab.json";
import { formatNumber } from "../lib/data";
import { RowFold, foldAt } from "./RowFold";
import { IconWaves } from "./icons";

/* Cyclone Arnab against the water table (build_cyclone_arnab.py). The storm's rain
 * is the gauge network's season total read before and after it; groundwater after
 * the storm is not published yet, so the depth columns are September's readings and
 * the rise is last year's precedent, Cyclone Montha on the same coast and date. */

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
  watch: Array<{ district: string; mandal: string; stormMm: number; depthM: number }>;
  caveat: string;
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const month = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });
const list = (names: string[]) => names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function CycloneArnab() {
  const d = cyclone as unknown as Data;
  if (!d?.state || !d.byDepth?.length) return null;
  const s = d.state;
  const soaked = d.districts.filter(x => x.medianMm >= d.heavyMm).map(x => x.district);
  const after = new Map(d.precedent.bands.map(b => [b.band, b]));
  return (
    <section className="card" id="cyclone-arnab" aria-labelledby="cyclone-arnab-title" data-testid="cyclone-arnab">
      <div className="cardHead">
        <div className="cardTitle" id="cyclone-arnab-title"><span className="titleIcon"><IconWaves /></span>Cyclone Arnab</div>
        <span className="cardSub">came ashore {day(d.landfall)} · gauge rain {day(d.rainWindow.from)} to {day(d.rainWindow.to)}</span>
      </div>
      <p className="cardLede">
        Arnab&apos;s heaviest rain fell on {list(soaked)}, where the water table was mostly within {d.deepM} m of the surface.
        It mostly missed the deep, dry interior, where the ground had the most room to take it.
      </p>
      <div className="monsoonHeadline">
        <div className="monsoonStat">
          <span>Rain in {d.rainWindow.days} days</span>
          <strong>{formatNumber(Math.round(s.rainTmc))} TMC</strong>
          <em>against a normal {formatNumber(Math.round(s.normalTmc))} TMC · season shortfall {s.seasonDeviationBefore}% → {s.seasonDeviationAfter}%</em>
        </div>
        <div className="monsoonStat">
          <span>Soil moisture at 30 cm</span>
          <strong>{Math.round(s.soilMedianBefore)}% → {Math.round(s.soilMedianAfter)}%</strong>
          <em>statewide median, {day(s.soilAsOf.before)} to {day(s.soilAsOf.after)} · driest on record for the date {s.soilDriestBefore} → {s.soilDriestAfter} mandals</em>
        </div>
        <div className="monsoonStat">
          <span>Where the table had room</span>
          <strong>{s.deepHeavyMandals} of {s.deepMandals}</strong>
          <em>mandals deeper than {d.deepM} m in {month(d.groundwaterLatest)} got {d.heavyMm} mm or more</em>
        </div>
      </div>
      <div className="tableWrap">
        <table className="dataTable compact" aria-label="Arnab's rain by depth to water, beside last year's precedent">
          <thead>
            <tr><th>Depth in {month(d.groundwaterLatest)}</th><th>Mandals</th><th>Arnab, median rain</th><th>{d.heavyMm} mm or more</th><th>After Montha in 2025, rise beyond the usual</th></tr>
          </thead>
          <tbody>
            {d.byDepth.map(b => {
              const p = after.get(b.band);
              return (
                <tr key={b.band}>
                  <td>{b.band}</td>
                  <td>{b.mandals}</td>
                  <td>{b.medianMm === null ? "–" : `${b.medianMm} mm`}</td>
                  <td>{b.heavy}</td>
                  <td>{p ? `${p.extraRiseM.toFixed(1)} m · ${p.roseMorePct}% of ${p.mandals} rose more` : "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="cardNote">
        Last year Cyclone Montha came ashore on the same coast on the same date. Where October brought {d.heavyMm} mm or
        more above the usual, the November reading rose more than usual, and more the deeper the table had been. Shallow
        tables have little room to rise. The November readings will show whether Arnab follows. These are the mandals
        to watch:
      </p>
      {d.watch.length ? (
        <RowFold id="arnab-watch" total={d.watch.length} visible={6} noun="mandals">
          <div className="tableWrap capped">
            <table className="dataTable compact" aria-label="Deep water tables that got heavy rain">
              <thead><tr><th>Mandal</th><th>District</th><th>Arnab rain</th><th>Depth in {month(d.groundwaterLatest)}</th></tr></thead>
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
      ) : null}
      <p className="cardNote">
        {d.caveat} Reservoir storage rose {formatNumber(Math.round(s.reservoirTmcAfter - s.reservoirTmcBefore))} TMC over
        the same days; river inflows arrive later.
      </p>
    </section>
  );
}
