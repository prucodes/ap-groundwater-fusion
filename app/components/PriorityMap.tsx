"use client";

import { useState } from "react";
import { StateOutlineMap } from "./StateOutlineMap";
import { PRIORITY_BAND_WORDS, PRIORITY_COLORS, PRIORITY_SIGN_WORDS } from "../lib/priorityLayer";
import type { PriorityBand, PrioritySign } from "../lib/summerPriority";
import { countEvent } from "../lib/visit-counter";
import styles from "./PriorityMap.module.css";

/* Where to plan summer drinking water first, on one State map: each group in its
   own colour, and a sign to filter by, so a reader can see where each reason
   falls. The page passes one band and one set of signs per boundary index. */

const SIGNS: PrioritySign[] = ["storms", "monsoon", "tanks", "quality"];
const KEY: Record<PriorityBand, string> = { first: "f", next: "x", watch: "w" };

export function PriorityMap({ bands, signs, notes, aspect, counts }: {
  /** One entry per boundary index: the mandal's group, or null when it is not on the list. */
  bands: Array<PriorityBand | null>;
  /** One entry per boundary index: the signs that agree there. */
  signs: PrioritySign[][];
  notes: string[];
  aspect: number;
  /** How many of the "plan first" mandals carry each sign. */
  counts: Record<PrioritySign, number>;
}) {
  const [only, setOnly] = useState<PrioritySign | null>(null);
  const keys = bands.map((band, i) => (!band ? "n" : only && !signs[i].includes(only) ? "d" : KEY[band]));
  const pick = (sign: PrioritySign | null) => {
    setOnly(sign);
    if (sign) countEvent(`summer/priority-map/${sign}`, `Summer: filtered the priority map by ${PRIORITY_SIGN_WORDS[sign].toLowerCase()}`);
  };
  const shown = bands.filter((band, i) => band === "first" && (!only || signs[i].includes(only))).length;
  return (
    <div className={styles.wrap}>
      <div className={styles.filters} role="group" aria-label="Show only the mandals where one sign agrees">
        <button type="button" aria-pressed={only === null} onClick={() => pick(null)}>All signs</button>
        {SIGNS.map((sign) => (
          <button key={sign} type="button" data-sign={sign} aria-pressed={only === sign} onClick={() => pick(only === sign ? null : sign)}>
            <i />{PRIORITY_SIGN_WORDS[sign]}<b>{counts[sign]}</b>
          </button>
        ))}
      </div>
      <StateOutlineMap testId="priority-map" aspect={aspect} keys={keys} notes={notes}
        colors={{ f: PRIORITY_COLORS.first, x: PRIORITY_COLORS.next, w: PRIORITY_COLORS.watch, d: "var(--map-dim, #b7c2cc)", n: PRIORITY_COLORS.none }}
        label={only
          ? `Drinking-water priority by mandal, only where ${PRIORITY_SIGN_WORDS[only].toLowerCase()}: ${shown} of the mandals to plan first.`
          : "Drinking-water priority by mandal: plan first, plan next and watch."}
        legend={<>
          {(["first", "next", "watch"] as PriorityBand[]).map((band) => <span key={band}><i style={{ background: PRIORITY_COLORS[band] }} />{PRIORITY_BAND_WORDS[band]}</span>)}
          {only ? <span><i style={{ background: "var(--map-dim, #b7c2cc)" }} />On the list, without this sign</span> : null}
        </>} />
      <p className={styles.caption} aria-live="polite">
        {only ? <><b>{shown}</b> of the mandals to plan first: {PRIORITY_SIGN_WORDS[only].toLowerCase()}.</> : <>Tap a sign to see where it falls.</>}
      </p>
    </div>
  );
}
