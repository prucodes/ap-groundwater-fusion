/** How forecasts made in the same month after similar rain fared in the
 *  rolling-origin backtest. Built by phase3_levels/build_forecast_reliability.py;
 *  nothing here changes a forecast. */
import json from "../data/forecast_reliability.json";

export type ReliabilityVerdict = "beats" | "level" | "worse" | "untested";

type Cell = {
  originMonth: number;
  rain: "deficit" | "normal" | "surplus";
  rows: number;
  years: number;
  forecastMaeM: number;
  noChangeMaeM: number;
  biasM: number;
  gain: number;
  verdict: ReliabilityVerdict;
};

type ForecastReliability = {
  generatedAt: string;
  origins: string[];
  counts: Partial<Record<ReliabilityVerdict, number>>;
  backtest: { firstTarget: string; lastTarget: string; rows: number };
  cells: Record<string, Cell>;
  /** mandal id -> [rain over the three months to the origin, % from normal; cell key] */
  mandals: Record<string, [number | null, string | null]>;
};

export const forecastReliability = json as unknown as ForecastReliability;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RAIN_WORDS = { deficit: "below-normal", normal: "near-normal", surplus: "above-normal" } as const;

export type Reliability = {
  verdict: ReliabilityVerdict;
  tone: "good" | "caution" | "muted";
  headline: string;
  detail: string;
  rainPct: number | null;
};

/** One mandal's forecast, set against how such forecasts have done. */
export function reliabilityFor(id: string): Reliability | null {
  const entry = forecastReliability.mandals[id];
  if (!entry) return null;
  const [rainPct, key] = entry;
  const cell = key ? forecastReliability.cells[key] : undefined;
  if (!cell) {
    return { verdict: "untested", tone: "muted", rainPct, headline: "Untested conditions",
      detail: "The backtest has too few forecasts made in this month after similar rain to say how far to trust it." };
  }
  const month = MONTHS[cell.originMonth - 1];
  const scored = `${cell.forecastMaeM.toFixed(2)} m against ${cell.noChangeMaeM.toFixed(2)} m average error over ${cell.years} years`;
  const outcome =
    cell.verdict === "beats" ? `beat assuming no change by ${Math.round(100 * cell.gain)}%`
      : cell.verdict === "level" ? "did about as well as assuming no change"
        : "did worse than assuming no change";
  const bias = Math.abs(cell.biasM) >= 0.5
    ? ` They expected ${cell.biasM < 0 ? "more" : "less"} water than came, by about ${Math.abs(cell.biasM).toFixed(1)} m.`
    : "";
  return {
    verdict: cell.verdict,
    tone: cell.verdict === "beats" ? "good" : "caution",
    rainPct,
    headline: cell.verdict === "beats" ? "Backed by its record" : "Lower confidence",
    detail: `Forecasts made in ${month} after ${RAIN_WORDS[cell.rain]} rain ${outcome} (${scored}).${bias}`,
  };
}

/** The statewide line: how many of this month's forecasts carry each verdict. */
export function reliabilitySummary() {
  const counts = forecastReliability.counts;
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0);
  const latest = forecastReliability.origins[forecastReliability.origins.length - 1];
  return {
    total,
    lower: (counts.level ?? 0) + (counts.worse ?? 0),
    backed: counts.beats ?? 0,
    month: latest ? MONTHS[Number(latest.slice(5, 7)) - 1] : null,
  };
}
