"use client";

import { useState } from "react";
import { basePath } from "../lib/data";
import { countEvent } from "../lib/visit-counter";
import styles from "./TankSwipe.module.css";

/* One village tank before and after the cyclones, the same Sentinel-2 view on both
   sides of a handle the reader drags (build_cyclone_tanks.py). */

export type TankPicture = {
  mandal: string; district: string; before: { date: string; file: string }; after: { date: string; file: string };
  shareBefore: number; shareAfter: number; widthKm: number;
};

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function TankSwipe({ pictures }: { pictures: TankPicture[] }) {
  const [which, setWhich] = useState(0);
  const [at, setAt] = useState(50);
  const p = pictures[which];
  if (!p) return null;
  return (
    <div className={styles.wrap} data-testid="tank-swipe">
      {pictures.length > 1 ? (
        <div className={styles.pick} role="group" aria-label="Which tank">
          {pictures.map((x, i) => <button key={x.mandal} type="button" aria-pressed={i === which} onClick={() => { setWhich(i); setAt(50); }}>
            {x.mandal}<small>{x.district}</small>
          </button>)}
        </div>
      ) : null}
      <figure className={styles.frame} style={{ ["--at" as string]: `${at}%` }}>
        <img src={`${basePath}/${p.after.file}`} alt={`The largest tank bed in ${p.mandal} mandal on ${day(p.after.date)}, after the cyclones`} />
        <img className={styles.before} src={`${basePath}/${p.before.file}`} alt={`The same tank bed on ${day(p.before.date)}, before the cyclones`} />
        <span className={styles.handle} aria-hidden="true"><i /></span>
        <span className={`${styles.tag} ${styles.left}`}>{day(p.before.date)} · before</span>
        <span className={`${styles.tag} ${styles.right}`}>{day(p.after.date)} · after</span>
        <input type="range" min={0} max={100} value={at} aria-label="Drag between before and after"
          onChange={e => { setAt(Number(e.target.value)); countEvent("arnab/tank-swipe", "Cyclones: compared a tank before and after"); }} />
      </figure>
      <p className={styles.caption}>
        <b>{p.mandal}</b>, {p.district}: the mandal&rsquo;s tank beds held water over <b>{Math.round(100 * p.shareBefore)}%</b> of their area before the storms and <b>{Math.round(100 * p.shareAfter)}%</b> after. The view is {p.widthKm} km across; Sentinel-2 true colour, 10 m.
      </p>
    </div>
  );
}
