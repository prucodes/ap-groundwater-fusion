import { formatNumber } from "../lib/data";
import { arnab, arnabDay, listOf, soakedDistricts } from "../lib/arnab";
import { ArnabOpenLink } from "./ArnabOpenLink";
import { IconArrowRight } from "./icons";
import styles from "./CycloneArnab.module.css";

/* The cyclones on Monsoon Watch: the finding and three figures in a storm band,
 * pointing to their own page (/cyclones/), where the maps, the reservoirs day by day
 * and the groundwater check live. Once Murasu's landfall day is counted, the band
 * gives the two storms together; until then, Arnab alone. */

/* A cyclone's mark: two arms wound round an eye, turning slowly. */
export function ArnabSpiral({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
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
  const d = arnab, s = d.state, tg = d.together, ts = tg?.state;
  if (!s || !d.byDepth?.length) return null;
  if (tg && ts) return (
    <section className={`card ${styles.card}`} id="cyclone-arnab" aria-labelledby="cyclone-arnab-title" data-testid="cyclone-arnab">
      <div className={styles.band}>
        <div className={styles.bandText}>
          <span className={styles.eyebrow}>Cyclones Arnab and Murasu · {arnabDay(tg.rainWindow.from)} to {arnabDay(tg.rainWindow.to)}</span>
          <h3 className={styles.headline} id="cyclone-arnab-title">Two cyclones fell on the coast and missed the deep interior</h3>
          <p className={styles.lede}>
            {formatNumber(Math.round(ts.rainTmc))} TMC in {tg.rainWindow.days} days, {(ts.rainTmc / ts.normalTmc).toFixed(1)}× the normal. Of
            the {ts.deepMandals} mandals with a water table deeper than {d.deepM} m, {ts.deepStillDry} got under {tg.stillDryMm} mm from
            both, most in {listOf(tg.stillDry.slice(0, 3).map(x => x.district))}.
          </p>
        </div>
        <ArnabSpiral className={styles.spiral} />
        <div className={styles.stats}>
          <div>
            <span>Rain in {tg.rainWindow.days} days</span>
            <strong>{formatNumber(Math.round(ts.rainTmc))} TMC</strong>
            <em>normal {formatNumber(Math.round(ts.normalTmc))} · season {ts.seasonDeviationBefore}% → {ts.seasonDeviationAfter}%</em>
          </div>
          <div>
            <span>Deep tables, heavy rain</span>
            <strong>{ts.deepHeavyMandals} <small>of {ts.deepMandals}</small></strong>
            <em>{d.heavyMm} mm or more from the two</em>
          </div>
          <div className={styles.key}>
            <span>Deep tables missed</span>
            <strong>{ts.deepStillDry} <small>of {ts.deepMandals}</small></strong>
            <em>under {tg.stillDryMm} mm from the two</em>
          </div>
        </div>
        <ArnabOpenLink className={styles.open}>
          Both storms on the map, reservoirs day by day, and the groundwater check <IconArrowRight />
        </ArnabOpenLink>
      </div>
    </section>
  );
  return (
    <section className={`card ${styles.card}`} id="cyclone-arnab" aria-labelledby="cyclone-arnab-title" data-testid="cyclone-arnab">
      <div className={styles.band}>
        <div className={styles.bandText}>
          <span className={styles.eyebrow}>Cyclone Arnab · came ashore {arnabDay(d.landfall)}</span>
          <h3 className={styles.headline} id="cyclone-arnab-title">The rain fell where the water table was already high</h3>
          <p className={styles.lede}>
            The heaviest fell along the coast, on {listOf(soakedDistricts())}, and most of it landed where tables sat
            within {d.deepM} m of the surface. The deep, dry interior, which had the most room to take it, got little.
          </p>
        </div>
        <ArnabSpiral className={styles.spiral} />
        <div className={styles.stats}>
          <div>
            <span>Rain in {d.rainWindow.days} days</span>
            <strong>{formatNumber(Math.round(s.rainTmc))} TMC</strong>
            <em>normal {formatNumber(Math.round(s.normalTmc))} · season {s.seasonDeviationBefore}% → {s.seasonDeviationAfter}%</em>
          </div>
          <div>
            <span>Soil, 30 cm</span>
            <strong>{Math.round(s.soilMedianBefore)}% → {Math.round(s.soilMedianAfter)}%</strong>
            <em>median, {arnabDay(s.soilAsOf.before)} to {arnabDay(s.soilAsOf.after)}</em>
          </div>
          <div className={styles.key}>
            <span>Deep tables, heavy rain</span>
            <strong>{s.deepHeavyMandals} <small>of {s.deepMandals}</small></strong>
            <em>deeper than {d.deepM} m, {d.heavyMm} mm or more</em>
          </div>
        </div>
        <ArnabOpenLink className={styles.open}>
          Maps, reservoirs day by day, and the groundwater check <IconArrowRight />
        </ArnabOpenLink>
      </div>
    </section>
  );
}
