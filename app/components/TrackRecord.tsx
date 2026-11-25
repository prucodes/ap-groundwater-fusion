import Link from "next/link";
import { trackRecord, type TrackVerdict } from "../lib/trackRecord";
import styles from "./TrackRecord.module.css";

/* Every part of the site, by the calls it makes and how often they came true
   (lib/trackRecord.ts). Server rendered; each figure is read from its own test's file. */

export const VERDICT_WORDS: Record<TrackVerdict, string> = {
  holds: "Holds up",
  mixed: "Holds, with a limit",
  "not yet": "Not borne out yet",
  pending: "Being tested",
};

export function TrackRecord() {
  const rows = trackRecord();
  return (
    <section className="card" id="track-record" aria-labelledby="track-record-title" data-testid="track-record">
      <div className="cardHead">
        <div className="cardTitle" id="track-record-title">Track record</div>
        <span className="cardSub">what each part says, and how often it came true</span>
      </div>
      <p className="cardLede">
        Officials act on calls, not on metres. Each line is a call the site makes, how often it came true and the rate
        it has to beat. Tested on past years means every year was predicted from the others only; frozen as published
        means the calls were written down before anyone knew the outcome.
      </p>
      <ol className={styles.list}>
        {rows.map(e => (
          <li key={e.id} data-verdict={e.verdict} data-testid={`track-${e.id}`}>
            <div className={styles.head}>
              <span className={styles.badge}>{VERDICT_WORDS[e.verdict]}</span>
              <Link href={e.href}>{e.product}</Link>
              <em>{e.kind}</em>
            </div>
            <div className={styles.body}>
              <p>{e.headline}</p>
              <small>{e.detail}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
