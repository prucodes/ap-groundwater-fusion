"use client";

import { useState } from "react";
import { StateOutlineMap } from "./StateOutlineMap";
import { RAIN_SCALE } from "../lib/arnabScale";
import { countEvent } from "../lib/visit-counter";

/* What Arnab's rain fell on. Storm rain alone, or the same rain against the drought
   manual's flags: which flagged mandals it reached and which it missed. The mandals
   the manual reads as severe, or possibly severe, keep an ink ring. */

type View = "rain" | "drought";
type Row = [number, string, string, number, number | null, string];

const FLAGS = {
  h: { label: "Flagged, heavy rain", color: "#12b5cb" },
  l: { label: "Flagged, little rain", color: "#d4573a" },
  o: { label: "Not flagged", color: "#e6ebf1" },
};

export function ArnabRainMap({ rows, heavyMm, window, aspect }: { rows: Row[]; heavyMm: number; window: string; aspect: number }) {
  const [view, setView] = useState<View>("rain");
  const count = rows.reduce((n, r) => Math.max(n, r[0] + 1), 0);
  const keys = Array<string>(count).fill("i"), notes = Array<string>(count).fill("No reading.");
  const marks: number[] = [];
  for (const [i, , , rain, , flag] of rows) {
    const flagged = flag === "s" || flag === "m";
    if (flag === "s") marks.push(i);
    keys[i] = view === "rain" ? RAIN_SCALE.find(b => rain < b.max)!.key : !flagged ? "o" : rain >= heavyMm ? "h" : "l";
    notes[i] = `${rain} mm, ${window}. ${flag === "s" ? "Drought manual: severe or possibly severe." : flag === "m" ? "Drought manual: moderate." : "No drought flag."}`;
  }
  const colors: Record<string, string> = view === "rain"
    ? Object.fromEntries(RAIN_SCALE.map(b => [b.key, b.color]))
    : Object.fromEntries(Object.entries(FLAGS).map(([k, v]) => [k, v.color]));
  colors.i = "#e6ebf1";
  const pick = (next: View, label: string) => {
    if (next !== view) countEvent(`arnab/map-${next}`, `Arnab: viewed the map as ${label}`);
    setView(next);
  };

  return <div className="arnabMap">
    <div className="segmented" role="group" aria-label="Map view">
      <button type="button" className={`segBtn ${view === "rain" ? "active" : ""}`} aria-pressed={view === "rain"} onClick={() => pick("rain", "storm rain")} data-testid="arnab-view-rain">Storm rain</button>
      <button type="button" className={`segBtn ${view === "drought" ? "active" : ""}`} aria-pressed={view === "drought"} onClick={() => pick("drought", "drought flags")} data-testid="arnab-view-drought">Drought flags</button>
    </div>
    <StateOutlineMap testId="arnab-rain-map" aspect={aspect} keys={keys} colors={colors} notes={notes} marks={view === "drought" ? marks : undefined}
      label={`Cyclone Arnab's rain, ${window}: ${view === "rain" ? "storm rain" : "against the drought flags"}.`}
      legend={view === "rain"
        ? <>{RAIN_SCALE.map(b => <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>)}</>
        : <>
          {Object.entries(FLAGS).map(([k, v]) => <span key={k}><i style={{ background: v.color }} />{v.label}</span>)}
          <span><i className="weekMoveRing" />Severe or possibly severe</span>
        </>} />
  </div>;
}
