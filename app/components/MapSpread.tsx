"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { Spread } from "../lib/mapSpread";
import { countEvent } from "../lib/visit-counter";
import { PickerGlide } from "./PickerGlide";
import styles from "./MapSpread.module.css";

/* A map's mandals lined up (lib/mapSpread.ts works out where): the toggle, the squares
   drawn inside the map's own SVG, and the strip's words over it. A map opts in with three
   small changes: its outlines go in a group with `spreadShapes`, the element wrapping its
   SVG takes `spreadStage` and data-view, and it renders these three pieces. The move is CSS:
   each square carries the way back to its mandal's place as an offset and a scale. */

export type SpreadView = "map" | "spread";
export const spreadStage = styles.stage;
export const spreadShapes = styles.shapes;

export function SpreadToggle({ view, onChange, label, event, float = false }: {
  view: SpreadView; onChange: (view: SpreadView) => void;
  /** The second arrangement, in two words: "By change". */
  label: string;
  event: [name: string, title: string];
  /** Over the map's empty corner rather than in a toolbar. */
  float?: boolean;
}) {
  const pick = (next: SpreadView) => {
    if (next === view) return;
    onChange(next);
    if (next === "spread") countEvent(event[0], event[1]);
  };
  return (
    <div className={`${styles.pick} ${float ? styles.float : ""}`} role="group" aria-label="Arrange the mandals" data-testid="spread-toggle">
      <PickerGlide />
      <button type="button" aria-pressed={view === "map"} onClick={() => pick("map")}>On the map</button>
      <button type="button" aria-pressed={view === "spread"} onClick={() => pick("spread")}>{label}</button>
    </div>
  );
}

/** The squares and the strip's line, for inside the map's SVG. */
export function SpreadTiles({ spread, colorOf, marks = [] }: {
  spread: Spread; colorOf: (id: number) => string;
  /** Where the line carries a mark, in map units. */
  marks?: number[];
}) {
  const { size, baseline, left, right, divide } = spread, half = size / 2;
  return (
    <g className={styles.layer} data-testid="spread-tiles" aria-hidden="true">
      <g className={styles.axis} aria-hidden="true">
        <line x1={left} x2={right} y1={baseline + 2} y2={baseline + 2} />
        {marks.map(x => <line key={x} x1={x} x2={x} y1={baseline + 2} y2={baseline + 10} />)}
        {divide !== null ? <line x1={divide} x2={divide} y1={baseline + 10} y2={Math.min(...spread.columns.map(c => c.top)) - 24} className={styles.divide} /> : null}
      </g>
      {spread.tiles.map(tile => (
        <rect key={tile.id} x={tile.x - half} y={tile.y - half} width={size} height={size} rx={Math.round(size * 18) / 100}
          fill={colorOf(tile.id)} className={styles.tile} data-id={tile.id}
          style={{ "--hx": tile.hx, "--hy": tile.hy, "--hs": tile.hs, "--o": tile.o } as CSSProperties} />
      ))}
    </g>
  );
}

const pct = (value: number, of: number) => `${((100 * value) / of).toFixed(2)}%`;

/** The strip's words, in page type over the map so they stay readable on a phone. */
export function SpreadWords({ spread, sides, marks = [], columns, top = 6 }: {
  spread: Spread;
  /** What each side of the divide is, with its count. */
  sides?: { left: ReactNode; right: ReactNode };
  /** Words under the line's marks. */
  marks?: Array<{ x: number; text: string; align?: "start" | "end" }>;
  /** For a strip of named columns: a count over each and a name under it. */
  columns?: Array<{ count: ReactNode; name: string }>;
  /** How far down the side counts stand, in pixels, to clear a toggle over the map. */
  top?: number;
}) {
  const { width, height, baseline } = spread;
  return (
    <div className={styles.words} style={{ "--ratio": `${width} / ${height}` } as CSSProperties} aria-hidden="true">
      {sides ? (
        <>
          <span className={styles.side} style={{ left: pct(spread.left, width), top }}>{sides.left}</span>
          <span className={styles.side} data-end="" style={{ right: pct(width - spread.right, width), top }}>{sides.right}</span>
        </>
      ) : null}
      {marks.map(mark => <i key={mark.x} className={styles.mark} data-align={mark.align}
        style={mark.align === "end" ? { right: pct(width - mark.x, width), top: pct(baseline + 12, height) } : { left: pct(mark.x, width), top: pct(baseline + 12, height) }}>{mark.text}</i>)}
      {columns?.map((column, i) => {
        const edge = spread.columns[i], centre = (edge.left + edge.right) / 2;
        return (
          <Fragment key={column.name}>
            <b className={styles.count} style={{ left: pct(centre, width), top: pct(edge.top - 8, height) }}>{column.count}</b>
            <i className={styles.mark} data-name="" style={{ left: pct(centre, width), top: pct(baseline + 12, height), "--w": pct(edge.right - edge.left + 12, width) } as CSSProperties}>{column.name}</i>
          </Fragment>
        );
      })}
    </div>
  );
}
