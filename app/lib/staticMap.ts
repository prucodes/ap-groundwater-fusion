import { MAP_VIEW, districtGeometry, mapGeometry } from "./data";

/* Outlines for a map drawn on the server: projected as every map on the site
   is (MAP_VIEW), with points closer than a pixel and a half to the last one
   dropped and relative steps at one decimal. The full State in about a fifth
   of the bytes, with no visible change at the size it is shown. */

const TOLERANCE = 1.5;

function ringPath(ring: number[][]) {
  let out = "", lastX = 0, lastY = 0, keptX = NaN, keptY = NaN;
  ring.forEach(([lon, lat], i) => {
    const [x, y] = MAP_VIEW.project(lon, lat);
    const last = i === ring.length - 1;
    if (i > 0 && !last && Math.hypot(x - keptX, y - keptY) < TOLERANCE) return;
    const rx = Math.round(x * 10) / 10, ry = Math.round(y * 10) / 10;
    out += i === 0 ? `M${rx} ${ry}` : `l${+(rx - lastX).toFixed(1)} ${+(ry - lastY).toFixed(1)}`;
    lastX = rx; lastY = ry; keptX = x; keptY = y;
  });
  return out + "z";
}

const shapePath = (rings: number[][][]) => rings.map(ringPath).join("");

let mandalCache: string[] | undefined;
/** One path per boundary index, aligned with mapGeometry.mandals. */
export function mandalOutlines() {
  mandalCache ??= mapGeometry.mandals.map(feature => shapePath(feature.rings));
  return mandalCache;
}

let districtCache: string | undefined;
/** Every district outline in one path, for a fine white line over the mandals. */
export function districtOutlines() {
  districtCache ??= districtGeometry.districts.map(d => shapePath(d.rings)).join("");
  return districtCache;
}

export const STATIC_MAP_VIEW = { width: MAP_VIEW.width, height: MAP_VIEW.height };
