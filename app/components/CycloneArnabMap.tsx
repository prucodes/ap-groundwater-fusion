"use client";

import { useState } from "react";
import { StateOutlineMap } from "./StateOutlineMap";

/* Cyclone Arnab on the State map. The opening view puts the storm's rain and the
   water table's depth on one map, so the mismatch shows at a glance: heavy rain on
   shallow tables along the north coast, deep tables left dry inland. The other two
   views give each measure alone. The mandals where heavy rain met a deep table keep
   an ink ring in every view. */

type View = "meet" | "rain" | "depth";
type Row = [number, string, string, number, number | null];

const VIEWS: { key: View; label: string }[] = [
  { key: "meet", label: "Where they meet" },
  { key: "rain", label: "Storm rain" },
  { key: "depth", label: "Depth before" },
];

const RAIN = [
  { key: "0", max: 25, label: "Under 25 mm", color: "#e3edf7" },
  { key: "1", max: 50, label: "25 to 50", color: "#b5d0ec" },
  { key: "2", max: 100, label: "50 to 100", color: "#6fa3d9" },
  { key: "3", max: 200, label: "100 to 200", color: "#2f63b4" },
  { key: "4", max: Infinity, label: "200 mm or more", color: "#1b2a78" },
];
const DEPTH = [
  { key: "a", max: 3, label: "Under 3 m", color: "#cfe7e4" },
  { key: "b", max: 8, label: "3 to 8 m", color: "#e9d7a8" },
  { key: "c", max: 20, label: "8 to 20 m", color: "#c98f4a" },
  { key: "d", max: Infinity, label: "Over 20 m", color: "#7a4520" },
];
const MEET = {
  w: { label: "Heavy rain, deep table", color: "#12b5cb" },
  h: { label: "Heavy rain, shallow table", color: "#8fb3e0" },
  d: { label: "Deep table, little rain", color: "#c98f4a" },
  o: { label: "Neither", color: "#e6ebf1" },
};

export function CycloneArnabMap({ rows, heavyMm, deepM, month, aspect }: {
  rows: Row[]; heavyMm: number; deepM: number; month: string; aspect: number;
}) {
  const [view, setView] = useState<View>("meet");
  const count = rows.reduce((n, r) => Math.max(n, r[0] + 1), 0);
  const keys = Array<string>(count).fill("i"), notes = Array<string>(count).fill("No reading.");
  const marks: number[] = [];
  for (const [i, , , rain, depth] of rows) {
    const heavy = rain >= heavyMm, deep = depth !== null && depth >= deepM;
    const meet = heavy && deep ? "w" : heavy ? "h" : deep ? "d" : "o";
    if (meet === "w") marks.push(i);
    keys[i] = view === "rain" ? RAIN.find(b => rain < b.max)!.key
      : view === "depth" ? (depth === null ? "i" : DEPTH.find(b => depth < b.max)!.key)
      : meet;
    notes[i] = `${rain} mm from the storm; water table ${depth === null ? "not read" : `${depth.toFixed(1)} m down`} in ${month}.`;
  }
  const scale = view === "rain" ? RAIN : view === "depth" ? DEPTH : null;
  const colors: Record<string, string> = scale
    ? Object.fromEntries(scale.map(b => [b.key, b.color]))
    : Object.fromEntries(Object.entries(MEET).map(([k, v]) => [k, v.color]));
  colors.i = "#e6ebf1";

  return <div className="arnabMap">
    <div className="segmented" role="group" aria-label="Map view">
      {VIEWS.map(v => <button key={v.key} type="button" className={`segBtn ${view === v.key ? "active" : ""}`} aria-pressed={view === v.key}
        onClick={() => setView(v.key)} data-testid={`arnab-view-${v.key}`}>{v.label}</button>)}
    </div>
    <StateOutlineMap testId="arnab-map" aspect={aspect} keys={keys} colors={colors} notes={notes} marks={marks}
      label={`Cyclone Arnab: ${VIEWS.find(v => v.key === view)?.label}.`}
      legend={scale
        ? <>
          {scale.map(b => <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>)}
          <span><i className="weekMoveRing" />Heavy rain on a deep table</span>
        </>
        : <>
          {(Object.keys(MEET) as Array<keyof typeof MEET>).map(k => <span key={k}><i style={{ background: MEET[k].color }} />{MEET[k].label}</span>)}
        </>} />
    <p className="arnabMapKey">Heavy rain is {heavyMm} mm or more in the four days; a deep table is {deepM} m or more below ground in {month}.</p>
  </div>;
}
