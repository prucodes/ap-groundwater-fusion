import type { Verse as VerseText } from "../lib/verses";
import styles from "./Verse.module.css";

/* One line from the epics, set quietly: the Sanskrit in Telugu script, the English beneath,
   and who said it. Colours come from --verse-* so the welcome screen can set its own. */
export function Verse({ verse, className }: { verse: VerseText; className?: string }) {
  return (
    <figure className={`${styles.verse} ${className ?? ""}`} data-testid="verse" data-verse={verse.id}>
      <span className={styles.mark} aria-hidden="true"><i /><svg viewBox="0 0 12 16"><path d="M6 1C4.4 4.6 1.5 7.6 1.5 10.4a4.5 4.5 0 0 0 9 0C10.5 7.6 7.6 4.6 6 1Z" /></svg><i /></span>
      {verse.telugu ? (
        <blockquote className={styles.script} lang="sa-Telu">
          {verse.telugu.map(line => <span key={line}>{line}</span>)}
        </blockquote>
      ) : null}
      <p className={verse.telugu ? styles.english : styles.prose}>{verse.english}</p>
      <figcaption className={styles.cite}>
        {verse.speaker ? <span>{verse.speaker}<span aria-hidden="true">&ensp;·&ensp;</span></span> : null}<cite>{verse.source}</cite>
      </figcaption>
    </figure>
  );
}
