"use client";

import { useMemo } from "react";
import { MAP_VIEW, districtGeometry, mandalByMapKey, mandalToPath, mapGeometry, titleCase } from "../lib/data";
import styles from "./MandalLocator.module.css";

/* Where a mandal is, drawn by the site: its district close up with the mandal filled in
   its status colour among its neighbours, and the State small in the corner with the
   district marked. Replaces a zoomable tile map that showed one outline on a basemap. */

type Box = { x: number; y: number; w: number; h: number };
const PAD = 0.08;

function bounds(paths: number[][][][]): Box {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rings of paths) for (const ring of rings) for (const [lon, lat] of ring) {
    const [x, y] = MAP_VIEW.project(lon, lat);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

let stateCache: string | undefined;
const stateOutline = () => (stateCache ??= districtGeometry.districts.map(d => mandalToPath(d.rings)).join(""));

export function MandalLocator({ mandalId, color }: { mandalId: string; color: string }) {
  const view = useMemo(() => {
    const index = mapGeometry.mandals.findIndex(f => mandalByMapKey(f.d, f.m)?.id === mandalId);
    if (index < 0) return null;
    const district = mapGeometry.mandals[index].d;
    const neighbours = mapGeometry.mandals.map((f, i) => ({ f, i })).filter(({ f }) => f.d === district);
    const box = bounds(neighbours.map(({ f }) => f.rings));
    // A square-ish frame around the district, so a long thin district still reads at the column's size.
    const side = Math.max(box.w, box.h * 1.25) * (1 + 2 * PAD), cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const frame = { x: cx - side / 2, y: cy - side / 2.5, w: side, h: side / 1.25 };
    const districtShape = districtGeometry.districts.find(d => d.d.trim().toUpperCase() === district.trim().toUpperCase());
    return {
      frame, district, name: mapGeometry.mandals[index].m,
      neighbours: neighbours.filter(({ i }) => i !== index).map(({ f }) => mandalToPath(f.rings)),
      mandal: mandalToPath(mapGeometry.mandals[index].rings),
      districtPath: districtShape ? mandalToPath(districtShape.rings) : null,
      stroke: side / 260,
    };
  }, [mandalId]);
  if (!view) return <div className={styles.empty}>No outline on the map for this mandal.</div>;
  const { frame, stroke } = view;
  return (
    <figure className={styles.figure} aria-label={`${titleCase(view.name)} within ${titleCase(view.district)} district, and the district within Andhra Pradesh`}>
      <svg viewBox={`${frame.x} ${frame.y} ${frame.w} ${frame.h}`} role="img" aria-hidden="true">
        {view.neighbours.map((d, i) => <path key={i} d={d} className={styles.neighbour} style={{ strokeWidth: stroke }} />)}
        {view.districtPath ? <path d={view.districtPath} className={styles.district} style={{ strokeWidth: stroke * 2.2 }} /> : null}
        <path d={view.mandal} className={styles.mandal} fill={color} style={{ strokeWidth: stroke * 1.6 }} />
      </svg>
      <svg className={styles.inset} viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`} aria-hidden="true">
        <path d={stateOutline()} className={styles.state} />
        {view.districtPath ? <path d={view.districtPath} className={styles.insetDistrict} /> : null}
      </svg>
    </figure>
  );
}
