"use client";

import { useEffect, useState } from "react";
import { addDays, CATEGORY_META, daysBetween, daysUntil, shortDate, type DroughtCategory, type DroughtWatch } from "../../lib/drought";
import styles from "./Drought.module.css";

const RING: DroughtCategory[] = ["severe", "moderate|severe", "moderate", "normal|moderate", "normal"];

/** The three numbers an official asks first: how many, how bad, how long until the deadline. */
export function DroughtCommand({ data, builtDays }: {
  data: Pick<DroughtWatch, "state" | "season" | "rules">;
  /** Days to the deadline when the page was built; the browser recounts on load. */
  builtDays: number;
}) {
  const { state, season, rules } = data;
  const [days, setDays] = useState(builtDays);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setDays(daysUntil(season.declareBy));
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, [season.declareBy]);

  const triggered = state.trigger1;
  const ringTotal = RING.reduce((sum, key) => sum + state.counts[key], 0) || 1;
  const worse = state.counts.severe + state.counts["moderate|severe"] + state.counts.moderate;
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const span = Math.max(1, daysBetween(season.start, season.declareBy));
  const elapsed = Math.min(1, Math.max(0, (span - days) / span));
  const clockRadius = 52;
  const clockLength = 2 * Math.PI * clockRadius;

  return (
    <section className={styles.command} aria-labelledby="drought-command-title">
      <div className={styles.commandHead}>
        <div>
          <span className={styles.kicker} id="drought-command-title">{season.name} · Manual for Drought Management, 2020</span>
          <p>
            By the manual&rsquo;s first trigger, <b>{triggered} of {state.assessed} assessed mandals</b> have had a dry spell.
            On its three impact indicators, <b>{state.counts.severe} read severe</b> and <b>{state.counts.moderate} moderate</b>;
            {` ${state.counts["moderate|severe"]} more are moderate or severe until a missing indicator decides. `}
            This is the evidence the manual asks for, not a declaration: field verification and the notification are the State&rsquo;s.
          </p>
        </div>
        <span className={styles.asOf}>Rain to {shortDate(data.season.weeks[data.season.weeks.length - 1]?.end ?? season.asOf, true)}</span>
      </div>

      <div className={styles.commandGrid}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Step 1 · Trigger 1 · rainfall</span>
          <div className={styles.bigNumber} data-testid="drought-trigger1">{triggered}<small>of {state.assessed} mandals</small></div>
          <div className={styles.shareBar} aria-hidden="true">
            <i style={{ width: `${(100 * state.trigger1Light) / Math.max(1, state.assessed)}%` }} />
            <i style={{ width: `${(100 * triggered) / Math.max(1, state.assessed)}%`, background: "linear-gradient(90deg, #e39a3b, #b23a2e)" }} />
          </div>
          <p>
            Set by <b>{state.drySpell}</b> dry spells: {`${rules.drySpell.weeks} or more weeks in a row under half the week’s normal rain. `}
            On light soils, where the manual allows {rules.drySpell.weeksLightSoil} weeks, <b>{state.trigger1Light}</b>.
            By the satellite SPI route, <b>{state.trigger1Spi}</b>.
          </p>
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>Step 2 · Trigger 2 · impact</span>
          <div className={styles.ringWrap}>
            <svg className={styles.ring} viewBox="0 0 150 150" role="img"
              aria-label={`${worse} of ${ringTotal} triggered mandals moderate or worse on the impact indicators`}>
              <circle cx="75" cy="75" r={radius} stroke="rgba(255,255,255,.1)" strokeWidth="14" />
              {RING.map(key => {
                const length = (state.counts[key] / ringTotal) * circumference;
                const dash = drawn ? `${Math.max(0, length - 1.5)} ${circumference}` : `0 ${circumference}`;
                const segment = <circle key={key} className={styles.ringSeg} cx="75" cy="75" r={radius} stroke={CATEGORY_META[key].color}
                  strokeWidth="14" strokeDasharray={dash} strokeDashoffset={-offset} transform="rotate(-90 75 75)" />;
                offset += length;
                return segment;
              })}
              <text x="75" y="76" textAnchor="middle" className={styles.ringCenter}>{worse}</text>
              <text x="75" y="93" textAnchor="middle" className={styles.ringSub}>moderate</text>
              <text x="75" y="104" textAnchor="middle" className={styles.ringSub}>or worse</text>
            </svg>
            <ul className={styles.ringLegend}>
              {RING.map(key => (
                <li key={key}><i style={{ background: CATEGORY_META[key].color }} />{CATEGORY_META[key].label}<b>{state.counts[key]}</b></li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.tile}>
          <span className={styles.tileLabel}>Step 3 · declaration window</span>
          <div className={styles.clock}>
            <svg viewBox="0 0 132 132" role="img" aria-label={`${days} days to the ${shortDate(season.declareBy, true)} declaration deadline`}>
              <circle cx="66" cy="66" r={clockRadius} fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="10" />
              <circle cx="66" cy="66" r={clockRadius} fill="none" stroke="url(#droughtClock)" strokeWidth="10" strokeLinecap="round"
                strokeDasharray={`${(drawn ? elapsed : 0) * clockLength} ${clockLength}`} transform="rotate(-90 66 66)" className={styles.ringSeg} />
              <defs>
                <linearGradient id="droughtClock" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0" stopColor="#6fe0ee" /><stop offset=".7" stopColor="#e39a3b" /><stop offset="1" stopColor="#ff6b52" />
                </linearGradient>
              </defs>
              <text x="66" y="68" textAnchor="middle" className={styles.clockDays} data-testid="drought-days">{days >= 0 ? days : 0}</text>
              <text x="66" y="85" textAnchor="middle" className={styles.clockSub}>{days >= 0 ? "days to" : "window"}</text>
              <text x="66" y="96" textAnchor="middle" className={styles.clockSub}>{days >= 0 ? "declare" : "closed"}</text>
            </svg>
            <ul className={styles.milestones}>
              <li data-state="past"><b>{shortDate(season.earlyFrom)}</b> · early declaration possible</li>
              <li data-state="next"><b>{shortDate(season.declareBy, true)}</b> · notify kharif drought, with its intensity</li>
              <li><b>{shortDate(addDays(season.declareBy, 7))}</b> · NDRF memorandum, only if severe</li>
              <li>Up to 3 weeks&rsquo; extension for late sowing</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
