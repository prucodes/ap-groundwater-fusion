import { sideOf, type Garden } from "../../lib/gardenShared";
import type { PlantLook } from "./GardenRows";

/* What a plant looks like at a point in the garden's years. `position` runs along
   garden.steps: 3 is the fourth year, 3.4 is part way from it to the next, so the water
   rises and falls and the flowers open and nod smoothly between years. Every year is set
   against the same yardstick, the mandal's usual depth in the month. */

/** Water this many metres from its usual opens or bows a flower all the way. */
const FULL_MOVE_M = 3;

function at(garden: Garden, i: number, step: number) {
  const s = garden.steps[step], plant = garden.plants[i];
  const now = plant[4][s.index], usual = plant[5];
  const side = sideOf(now, usual);
  return { depth: now, side, mag: side === null || now === null || usual === null ? 0 : Math.min(1, Math.abs(now - usual) / FULL_MOVE_M) };
}

export function lookAt(garden: Garden, i: number, position: number, { grow = 1, roots = 1, heads = 1 }: { grow?: number; roots?: number; heads?: number } = {}): PlantLook {
  const last = garden.steps.length - 1, p = Math.max(0, Math.min(last, position));
  const a = Math.floor(p), b = Math.min(last, a + 1), f = p - a;
  const A = at(garden, i, a), B = f > 0 ? at(garden, i, b) : A;
  const depth = A.depth !== null && B.depth !== null ? A.depth + (B.depth - A.depth) * f : f < 0.5 ? A.depth ?? B.depth : B.depth ?? A.depth;
  const present = (A.depth === null ? 0.26 : 1) * (1 - f) + (B.depth === null ? 0.26 : 1) * f;
  const shown = Math.round(p) === a ? A : B;
  return {
    depth,
    side: ((A.side ?? 0) * (1 - f) + (B.side ?? 0) * f) * heads,
    mag: A.mag * (1 - f) + B.mag * f,
    present,
    grow, roots,
    counted: shown.side,
  };
}

/** Ease for the moves between years: slow off, slow on. */
export const easeStep = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
