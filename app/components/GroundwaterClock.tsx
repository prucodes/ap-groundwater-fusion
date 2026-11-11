"use client";

import { useEffect, useRef, useState } from "react";
import { StateOutlineMap } from "./StateOutlineMap";
import { IconPause, IconPlay } from "./icons";
import { countEvent } from "../lib/visit-counter";
import styles from "./GroundwaterClock.module.css";

/* The groundwater clock: the month each mandal's water table is expected to go deeper
   than any May on record (build_summer_outlook.py, "passes"). Pick a month, or play
   them, and the map fills with the mandals past their record by then: red on a
   typical winter, amber only if the winter is as dry as their driest. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
const RED = "#a33b2c", AMBER = "#e0a24a";

function lakhs(n: number) {
  if (n >= 1e7) return `${(n / 1e7).toFixed(1)} crore`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(n >= 1e6 ? 0 : 1)} lakh`;
  return Math.round(n).toLocaleString("en-IN");
}

export function GroundwaterClock({ months, typical, dry, projected, people, names, aspect, startAt }: {
  /** The reading month, then each month to May. */
  months: string[];
  /** Per boundary index: the index in `months` it passes its deepest May, or null. */
  typical: Array<number | null>;
  dry: Array<number | null>;
  /** Per boundary index: whether the mandal has a projection at all (grey when not). */
  projected: boolean[];
  people: Array<number | null>;
  names: string[];
  aspect: number;
  /** The month the page opens on, set by the server so the build and the browser agree. */
  startAt: number;
}) {
  const [at, setAt] = useState(startAt);
  const [playing, setPlaying] = useState(false);
  const counted = useRef(false);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setAt(i => {
      if (i >= months.length - 1) { setPlaying(false); return i; }
      return i + 1;
    }), 900);
    return () => window.clearInterval(timer);
  }, [playing, months.length]);

  const tally = months.map((_, i) => {
    let t = 0, d = 0, tp = 0, dp = 0;
    typical.forEach((m, j) => {
      if (m !== null && m <= i) { t += 1; tp += people[j] ?? 0; }
      else if (dry[j] !== null && (dry[j] as number) <= i) { d += 1; dp += people[j] ?? 0; }
    });
    return { typical: t, dry: d, typicalPeople: tp, dryPeople: dp };
  });
  const most = Math.max(1, ...tally.map(x => x.typical + x.dry));
  const now = tally[at];
  const keys = typical.map((m, j) => (m !== null && m <= at ? "t" : dry[j] !== null && (dry[j] as number) <= at ? "d" : !projected[j] ? "n" : "w"));
  const pick = (i: number) => {
    setPlaying(false);
    setAt(i);
    if (!counted.current) { counted.current = true; countEvent("app/groundwater-clock", "Summer: turned the groundwater clock"); }
  };
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (at >= months.length - 1) setAt(0);
    setPlaying(true);
    if (!counted.current) { counted.current = true; countEvent("app/groundwater-clock", "Summer: turned the groundwater clock"); }
  };
  const label = at === 0 ? `in the ${monthName(months[0])} reading` : `by ${monthName(months[at])}`;

  return (
    <div className={styles.wrap}>
      <div className={styles.mapCol}>
        <div className={styles.readout} aria-live="polite" data-testid="clock-readout">
          <span>{at === 0 ? `Already, ${monthName(months[0])} reading` : `By ${monthName(months[at])} ${months[at].slice(0, 4)}`}</span>
          <b>{now.typical}<small> mandals</small></b>
          <em>past their deepest May {label}, home to {lakhs(now.typicalPeople)} people{now.dry ? <>; <strong>{now.dry} more</strong> if the winter is as dry as their driest</> : null}</em>
        </div>
        <StateOutlineMap testId="clock-map" aspect={aspect} keys={keys}
          colors={{ t: RED, d: AMBER, w: "var(--map-calm, #d9e4ea)", n: "#e3e8ec" }}
          notes={names.map((name, j) => typical[j] !== null
            ? `${name}: past its deepest May ${typical[j] === 0 ? `already, in ${monthName(months[0])}` : `by ${monthName(months[typical[j] as number])}`} on a typical winter.`
            : dry[j] !== null ? `${name}: past its deepest May only if the winter is as dry as its driest, by ${monthName(months[dry[j] as number])}.`
              : projected[j] ? `${name}: within its record either way.` : `${name}: no projection; too short a record, or no reading.`)}
          label={`Mandals past their deepest May on record ${label}: ${now.typical} on a typical winter, ${now.dry} more in a dry one.`}
          legend={<>
            <span><i style={{ background: RED }} />Past its record, typical winter</span>
            <span><i style={{ background: AMBER }} />Only in a dry winter</span>
            <span><i style={{ background: "var(--map-calm, #d9e4ea)" }} />Not yet, or within its record</span>
          </>} />
      </div>

      <div className={styles.face}>
        <div className={styles.faceHead}>
          <button type="button" onClick={play} aria-label={playing ? "Pause the clock" : "Play the clock, month by month"} data-testid="clock-play">
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          <span>Month by month to May</span>
        </div>
        <ol className={styles.months} aria-label="Mandals past their deepest May, month by month">
          {months.map((ym, i) => {
            const x = tally[i];
            return <li key={ym}>
              <button type="button" aria-pressed={i === at} onClick={() => pick(i)}
                aria-label={`${i === 0 ? `${monthName(ym)} reading` : monthName(ym)}: ${x.typical} mandals past their record, ${x.dry} more in a dry winter`}>
                <span className={styles.month}>{i === 0 ? "Now" : monthName(ym).slice(0, 3)}</span>
                <span className={styles.bar} aria-hidden="true">
                  <i style={{ width: `${(100 * x.typical) / most}%` }} />
                  <u style={{ width: `${(100 * x.dry) / most}%` }} />
                </span>
                <b>{x.typical}</b>
              </button>
            </li>;
          })}
        </ol>
        <p className={styles.note}>&ldquo;Now&rdquo; is the {monthName(months[0])} reading. Bars add up: a mandal stays past its record once it is.</p>
      </div>
    </div>
  );
}
