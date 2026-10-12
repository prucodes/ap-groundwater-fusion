"use client";

import { useState } from "react";
import { StateOutlineMap } from "./StateOutlineMap";
import { CATEGORY_CODE, CATEGORY_META, CATEGORY_ORDER, type DroughtCategory } from "../lib/drought";

/* This week against last on the drought manual, mandal by mandal. Three views of
   one map: what moved (worse and better only), last week's reading and this
   week's. Switching glides each mandal's colour from one to the other, and the
   mandals that moved keep an ink ring in every view so the eye can follow them. */

type View = "moved" | "before" | "after";

const VIEWS: { key: View; label: string }[] = [
  { key: "moved", label: "What moved" },
  { key: "before", label: "Last week" },
  { key: "after", label: "This week" },
];

const CODE_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_CODE).map(([k, v]) => [v, k])) as Record<string, DroughtCategory>;

const MOVE_COLOR = { w: "#c65a46", b: "#1f8a8a", n: "#e3e8ec" };

export function WeekMoveMap({ before, after, moves, aspect, label }: {
  /** Last week's category code per boundary index. */
  before: string;
  /** This week's category code per boundary index. */
  after: string;
  /** "w" worse, "b" better or "n" per boundary index, as the list beside the map counts them. */
  moves: string;
  aspect: number;
  label: string;
}) {
  const anyMoved = /[wb]/.test(moves);
  const [view, setView] = useState<View>(anyMoved ? "moved" : "after");
  const count = before.length;
  const marks = anyMoved ? Array.from(moves).flatMap((m, index) => (m === "n" ? [] : [index])) : undefined;
  const keys = view === "moved" ? Array.from(moves) : Array.from(view === "before" ? before : after);
  const colors: Record<string, string> = view === "moved"
    ? { ...MOVE_COLOR }
    : { ...Object.fromEntries(CATEGORY_ORDER.map(c => [CATEGORY_CODE[c], CATEGORY_META[c].color])), n: MOVE_COLOR.n };
  const notes = Array.from({ length: count }, (_, index) => {
    const was = CODE_CATEGORY[before[index]], now = CODE_CATEGORY[after[index]];
    if (!now) return "No reading.";
    if (was && was !== now) return `${CATEGORY_META[was].label} last week, ${CATEGORY_META[now].label.toLowerCase()} now.`;
    return `${CATEGORY_META[now].label}, the same as last week.`;
  });
  const shown = view === "moved" ? [] : CATEGORY_ORDER.filter(c => (view === "before" ? before : after).includes(CATEGORY_CODE[c]));
  const worse = (moves.match(/w/g) ?? []).length, better = (moves.match(/b/g) ?? []).length;

  return <div className="weekMoveMap">
    {anyMoved ? <div className="segmented weekMoveViews" role="group" aria-label="Map view">
      {VIEWS.map(v => <button key={v.key} type="button" className={`segBtn ${view === v.key ? "active" : ""}`} aria-pressed={view === v.key}
        onClick={() => setView(v.key)} data-testid={`week-view-${v.key}`}>{v.label}</button>)}
    </div> : null}
    <StateOutlineMap testId="week-move-map" aspect={aspect} keys={keys} colors={colors} notes={notes} marks={marks}
      label={`${label} ${VIEWS.find(v => v.key === view)?.label}.`}
      legend={view === "moved"
        ? <>
          <span><i style={{ background: MOVE_COLOR.w }} />Worse reading ({worse})</span>
          <span><i style={{ background: MOVE_COLOR.b }} />Better reading ({better})</span>
          <span><i className="weekMoveHeld" />Held its reading</span>
        </>
        : <>
          {shown.map(c => <span key={c}><i className={c === "insufficient" ? "weekMoveNoData" : undefined} style={{ background: CATEGORY_META[c].color }} />{CATEGORY_META[c].short}</span>)}
          {anyMoved ? <span><i className="weekMoveRing" />Moved this week</span> : null}
        </>} />
  </div>;
}
