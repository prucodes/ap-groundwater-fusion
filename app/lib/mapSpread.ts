import { MAP_VIEW, mapGeometry } from "./data";

/* A State map's mandals, lined up. Each mandal becomes a square that leaves its place on
   the map for a place in a column, so a count the page states as a number becomes a
   shape: how many fell, how many are past their record, how many read severe. This works
   out where every square goes; components/MapSpread.tsx draws them and the move. Every
   position is in the maps' shared units (MAP_VIEW, 1000 across), so the squares sit in
   whichever map's own SVG they are drawn in. */

/** Where a mandal stands on the map: the centre of its outline, and the side of a square of the same area. */
export type Home = [x: number, y: number, size: number];

let homes: Home[] | undefined;
/** One home per boundary index, aligned with mapGeometry.mandals. */
export function mandalHomes(): Home[] {
  homes ??= mapGeometry.mandals.map(feature => {
    let area = 0, cx = 0, cy = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const ring of feature.rings) {
      const points = ring.map(([lon, lat]) => MAP_VIEW.project(lon, lat));
      points.forEach(([x, y], i) => {
        const [nx, ny] = points[(i + 1) % points.length], cross = x * ny - nx * y;
        area += cross; cx += (x + nx) * cross; cy += (y + ny) * cross;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      });
    }
    area /= 2;
    // A degenerate outline (no area) stands at the middle of its bounds.
    return Math.abs(area) < 1e-6 ? [(minX + maxX) / 2, (minY + maxY) / 2, 4] : [cx / (6 * area), cy / (6 * area), Math.sqrt(Math.abs(area))];
  });
  return homes;
}

/** A district's middle, for a mandal the State counts that has no outline of its own on the map. */
export function districtHome(district: string): Home | null {
  const name = district.trim().toUpperCase(), all = mandalHomes();
  const mine = mapGeometry.mandals.flatMap((feature, i) => (feature.d.trim().toUpperCase() === name ? [all[i]] : []));
  if (!mine.length) return null;
  return [mine.reduce((sum, h) => sum + h[0], 0) / mine.length, mine.reduce((sum, h) => sum + h[1], 0) / mine.length, 12];
}

export type SpreadItem = {
  /** Whatever the page uses to colour and name it: the boundary index, or a row index. */
  id: number;
  /** The column it stands in, 0 at the left. */
  column: number;
  /** Its place up the column: lower stands lower. */
  rank: number;
  /** When it sets off, 0 to 1: the mandals the figure is about go first. */
  order: number;
  home: Home | null;
};

/** A square: its centre on the strip, its offset from there to its home on the map, the scale that makes it the mandal's own size there, and when it leaves. */
export type SpreadTile = { id: number; x: number; y: number; hx: number; hy: number; hs: number; o: number };

export type Spread = {
  tiles: SpreadTile[];
  size: number;
  width: number; height: number;
  baseline: number; left: number; right: number;
  /** Each column's left and right edge, how many stand in it, and where its top is. */
  columns: Array<{ left: number; right: number; count: number; top: number }>;
  /** The line between the two sides, when there are two sides. */
  divide: number | null;
};

const r1 = (v: number) => Math.round(v * 10) / 10, r3 = (v: number) => Math.round(v * 1000) / 1000;

export function layoutSpread(items: SpreadItem[], { columns, divideBefore = null, top = 230, bottom = 64, gap = 4 }: {
  columns: number;
  /** The column the dividing line stands before, for a strip with two sides. */
  divideBefore?: number | null;
  /** Room left free above the tallest column (for the toggle and the counts), and below the line (for its marks). */
  top?: number; bottom?: number;
  gap?: number;
}): Spread {
  const width = MAP_VIEW.width, height = MAP_VIEW.height, left = 34, right = width - 34, baseline = height - bottom;
  const columnWidth = (right - left - gap * (columns - 1)) / columns;
  const stacks: SpreadItem[][] = Array.from({ length: columns }, () => []);
  for (const item of items) stacks[Math.max(0, Math.min(columns - 1, item.column))].push(item);
  stacks.forEach(stack => stack.sort((a, b) => a.rank - b.rank));
  const tallest = Math.max(1, ...stacks.map(stack => stack.length)), room = baseline - top;
  // As few squares across a column as will let the tallest fit, so each square is as large as it can be.
  let across = 1;
  while (across < 16 && Math.ceil(tallest / across) * (columnWidth / across) > room) across++;
  const pitch = columnWidth / across, rise = Math.min(pitch, room / Math.ceil(tallest / across)), size = Math.min(pitch, rise) * 0.84;
  const tiles: SpreadTile[] = [];
  const edges = stacks.map((stack, c) => {
    const x0 = left + c * (columnWidth + gap);
    stack.forEach((item, k) => {
      const x = x0 + (k % across + 0.5) * pitch, y = baseline - (Math.floor(k / across) + 0.5) * rise;
      const home = item.home;
      tiles.push({ id: item.id, x: r1(x), y: r1(y), hx: home ? r1(home[0] - x) : 0, hy: home ? r1(home[1] - y) : 0,
        hs: home ? r3(Math.max(0.5, Math.min(3.2, home[2] / size))) : 0, o: r3(item.order) });
    });
    return { left: r1(x0), right: r1(x0 + columnWidth), count: stack.length, top: r1(baseline - Math.ceil(stack.length / across) * rise) };
  });
  const divide = divideBefore === null ? null : r1(left + divideBefore * (columnWidth + gap) - gap / 2);
  return { tiles, size: r1(size), width, height, baseline, left, right, columns: edges, divide };
}

/** A value's column on a strip in whole metres: `before` columns to the left of the divide, `after` to the right, the end ones taking everything beyond. */
export function metreColumn(value: number, side: -1 | 0 | 1, before: number, after: number) {
  if (side > 0) return before + Math.min(after - 1, Math.floor(Math.abs(value)));
  return before - 1 - Math.min(before - 1, Math.floor(Math.abs(value)));
}

/** Where a whole number of metres falls along such a strip, for its marks: the edge of the column
    that starts there, 0 being the divide. Negative is the left side. */
export function metreX(spread: Spread, metres: number, before: number) {
  if (metres === 0 && spread.divide !== null) return spread.divide;
  const column = metres < 0 ? before + metres : before + metres;
  const c = spread.columns[Math.max(0, Math.min(spread.columns.length - 1, column))];
  return c.left;
}
