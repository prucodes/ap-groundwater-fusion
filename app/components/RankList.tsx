import type { CSSProperties, ReactNode } from "react";
import styles from "./RankList.module.css";

/* A short ranked list beside a map: each row a name, a bar against the list's own scale,
   and the figure. The bars grow in when the list is reached (ChartReveal finds them). */
export type RankRow = { name: string; value: ReactNode; share: number; color: string; note?: ReactNode };

export function RankList({ title, rows, foot }: { title: string; rows: RankRow[]; foot?: ReactNode }) {
  return (
    <div className={styles.list}>
      <h3>{title}</h3>
      <ol>
        {rows.map(row => (
          <li key={row.name}>
            <span className={styles.name}>{row.name}{row.note ? <small>{row.note}</small> : null}</span>
            <span className={styles.track} aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, row.share))}%`, "--tone": row.color } as CSSProperties} /></span>
            <b>{row.value}</b>
          </li>
        ))}
      </ol>
      {foot ? <p className={styles.foot}>{foot}</p> : null}
    </div>
  );
}
