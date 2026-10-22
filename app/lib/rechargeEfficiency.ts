import rechargeJson from "../data/recharge_efficiency.json";

/* Where rain becomes groundwater, per mandal, over twelve years (~52 KB).
 *
 * The map layer's side of build_recharge_efficiency.py: the median share of a
 * monsoon's rain that showed up as storage, by GEC-2015's water-table
 * fluctuation, net of pumping. Shaped like the other mandal layers, keyed
 * "DISTRICT|MANDAL", so a fill is one lookup.
 *
 * Two classes are coloured apart rather than ranked. A mandal whose share passes
 * 100% stored more than the counted rain delivered (a canal, upslope flow,
 * October rain or a specific yield that is off), so it is not local performance.
 * A mandal whose table sits deeper than the method comfortably holds is set
 * aside as a precaution, because water-table fluctuation is for an unconfined
 * aquifer and a deep reading can turn a head change into water that is not there.
 */

export type RechargeClass = "weak" | "moderate" | "strong" | "imports" | "set aside";

type Recharge = {
  generatedAt: string; method: string; caveat: string; limits: string[];
  scored: number; ranked: number; yearsAvailable: [number, number];
  stateMedianSharePct: number | null;
  counts: Record<string, number>;
  byAquifer: Array<{ aquifer: string; mandals: number; medianSharePct: number }>;
  thresholds: { strongPct: number; weakPct: number; importsPct: number; deepWellM: number };
  window: { preMonsoonMonth: number; postMonsoonMonth: number; rainMonths: number[]; minYears: number; minRainMm: number };
  codes: { class: RechargeClass[] };
  /** "DISTRICT|MANDAL" -> [median share %, class code, years scored, typical depth m]. */
  values: Record<string, [number, number, number, number | null]>;
  strongest: RechargeRow[]; weakest: RechargeRow[]; setAside: RechargeRow[];
};
export type RechargeRow = {
  district: string; mandal: string; aquifer: string | null; medianSharePct: number;
  years: number; typicalDepthM: number | null; specificYield: number; class: RechargeClass;
};

export const recharge = rechargeJson as unknown as Recharge;

export type RechargeLayer = "recharge_share";
export function isRechargeLayer(layer: string | null | undefined): layer is RechargeLayer {
  return layer === "recharge_share";
}

export const RECHARGE_LAYER_META: Record<RechargeLayer, { label: string; period: string; note: string }> = {
  recharge_share: {
    label: "Rain that reaches the aquifer (estimate)",
    period: `${recharge.yearsAvailable[0]} to ${recharge.yearsAvailable[1]}, median of each mandal's years`,
    note: `${recharge.method} ${recharge.caveat}`,
  },
};

export function rechargeForMandal(district: string, mandal: string) {
  const row = recharge.values[`${district.toUpperCase()}|${mandal.toUpperCase()}`];
  if (!row) return null;
  return { sharePct: row[0], klass: recharge.codes.class[row[1]] ?? null,
           years: row[2], depthM: row[3] };
}

/* Blue where rain reaches the aquifer, brown where it does not; the two classes
   that are not a rain figure get their own flat colours so they cannot be read
   as the good or the bad end of one scale. */
const NO_VALUE = "#d3d9dc";
const IMPORTS = "#6f4f9c";
const SET_ASIDE = "#b6bcc4";
const RAMP: Array<[number, number, number]> = [
  [168, 92, 48], [214, 162, 92], [238, 238, 234], [122, 176, 196], [31, 110, 150],
];

export function rechargeColor(district: string, mandal: string): string {
  const row = rechargeForMandal(district, mandal);
  if (!row) return NO_VALUE;
  if (row.klass === "imports") return IMPORTS;
  if (row.klass === "set aside") return SET_ASIDE;
  // The state median sits at the middle stop, so colour reads against the State
  // rather than against a round number nobody chose.
  const mid = recharge.stateMedianSharePct ?? 12;
  const t = Math.max(0, Math.min(1, row.sharePct <= mid
    ? 0.5 * (row.sharePct / Math.max(mid, 0.1))
    : 0.5 + 0.5 * Math.min(1, (row.sharePct - mid) / Math.max(mid * 2, 0.1))));
  return rampAt(ease(t));
}

/* 574 small polygons on a full ramp read as confetti, and the eye finds nothing.
   Widening the pale middle leaves colour only where a mandal is notably above or
   below the State, which is the only comparison this data can carry anyway. */
function ease(t: number): number {
  const from = 2 * t - 1;
  return 0.5 + Math.sign(from) * Math.pow(Math.abs(from), 1.7) / 2;
}

export function rechargeText(district: string, mandal: string): string | null {
  const row = rechargeForMandal(district, mandal);
  if (!row) return null;
  if (row.klass === "imports") return `${row.sharePct}% · more than the counted rain`;
  if (row.klass === "set aside") return `set aside · water table ${row.depthM} m down`;
  return `${row.sharePct}% of monsoon rain kept · ${row.years} years`;
}

export function rechargeLegend() {
  const mid = recharge.stateMedianSharePct ?? 12;
  const counts = recharge.counts;
  return [
    { key: "strong", label: `${recharge.thresholds.strongPct}% or more kept`,
      color: rampAt(ease(0.85)), count: counts.strong ?? 0 },
    { key: "moderate", label: `Around the State median, ${mid}%`,
      color: rampAt(0.5), count: counts.moderate ?? 0 },
    { key: "weak", label: `Under ${recharge.thresholds.weakPct}% kept`,
      color: rampAt(ease(0.1)), count: counts.weak ?? 0 },
    { key: "imports", label: "More than the counted rain", color: IMPORTS, count: counts.imports ?? 0 },
    { key: "set aside", label: `Table below ${recharge.thresholds.deepWellM} m; set aside`,
      color: SET_ASIDE, count: counts["set aside"] ?? 0 },
  ];
}

function rampAt(t: number): string {
  const at = t * (RAMP.length - 1);
  const low = Math.floor(at), high = Math.min(RAMP.length - 1, low + 1), mix = at - low;
  const ch = (i: number) => Math.round(RAMP[low][i] + (RAMP[high][i] - RAMP[low][i]) * mix);
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`;
}
