/** Assembly constituencies: every site figure rolled up by the constituency the
 *  State's mandal record names. Built by phase3_levels/build_constituencies.py. */
export type Constituency = {
  ac: string;
  code: string | null;
  pc: string;
  districts: string[];
  mandals: string[];
  /** Mandals with no constituency on their State record, placed by where their centre falls. */
  placedByLocation: string[];
  officialOutlines: number;
  /** Whose outline is drawn: the State's (rebuilt within 3%), or the union of the mandals. */
  outline: "official" | "mandals" | null;
  officialKm2: number | null;
  reserved: string | null;
  groundwater: { assessed: number; stress: number; watch: number; stable: number; medianDepthM: number | null };
  stateReading: { mandals: number; stations: number; medianSinceMayM: number | null; deeperThanYearAgo: number };
  drought: { assessed: number; active: number; severe: number; trigger1: number };
  rain: { mandals: number; medianDeparturePct: number | null };
  rings: number[][][] | null;
};

export type ConstituencyData = {
  generatedAt: string;
  source: string;
  note: string;
  summary: { constituencies: number; withMandals: number; officialOutlines: number; parliamentary: number; stateAssembly: number; stateParliament: number; mandals: number; placedByRecord: number; placedByLocation: number; mandalsWithoutConstituency: number };
  parliament: Array<{ pc: string; acs: string[] }>;
  constituencies: Constituency[];
};

/** What the client map and table receive: no rings, one SVG path, flat numbers. */
export type ConstituencyRow = {
  ac: string;
  code: string | null;
  pc: string;
  districts: string;
  mandals: number;
  mandalNames: string;
  placedByLocation: string;
  outline: "official" | "mandals" | null;
  officialKm2: number | null;
  path: string | null;
  /** Where the constituency's name sits on the map: its largest part's centre. */
  label: [number, number] | null;
  stressShare: number | null;
  stress: number;
  assessed: number;
  medianDepthM: number | null;
  sinceMayM: number | null;
  stations: number;
  droughtShare: number | null;
  droughtActive: number;
  droughtSevere: number;
  rainPct: number | null;
};

export const METRICS = {
  stressShare: { label: "Groundwater in stress", unit: "% of assessed mandals", kind: "share" },
  sinceMayM: { label: "Fall since May (State wells)", unit: "median metres deeper, early Sep", kind: "fall" },
  droughtShare: { label: "Drought manual: moderate or severe", unit: "% of assessed mandals", kind: "share" },
  rainPct: { label: "Gauge rain vs normal", unit: "median departure, water year", kind: "rain" },
} as const;
export type MetricKey = keyof typeof METRICS;

const SHARE = ["#f3ecd9", "#f1d49a", "#e9a15a", "#d4573a", "#9e2a20"];
const FALL = ["#2d8f8f", "#9fd0c8", "#f3ecd9", "#e9a15a", "#c0392b", "#7d1d14"];
const RAIN = ["#9e2a20", "#d4573a", "#f1d49a", "#cfe6e3", "#5fb3b0", "#1f6f6f"];

export function metricColor(metric: MetricKey, value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "var(--drought-empty, #d8dee8)";
  if (metric === "stressShare" || metric === "droughtShare") return SHARE[Math.min(4, Math.floor(value / 20))];
  if (metric === "sinceMayM") {
    const steps = [-0.5, 0, 0.5, 1.5, 3];
    const i = steps.findIndex(step => value < step);
    return FALL[i === -1 ? 5 : i];
  }
  const steps = [-60, -40, -20, 0, 20];
  const i = steps.findIndex(step => value < step);
  return RAIN[i === -1 ? 5 : i];
}

export function metricLegend(metric: MetricKey): Array<{ color: string; label: string }> {
  if (metric === "stressShare" || metric === "droughtShare")
    return ["0–19%", "20–39%", "40–59%", "60–79%", "80–100%"].map((label, i) => ({ color: SHARE[i], label }));
  if (metric === "sinceMayM")
    return ["shallower 0.5 m+", "up to 0.5 m shallower", "0–0.5 m deeper", "0.5–1.5 m deeper", "1.5–3 m deeper", "3 m+ deeper"]
      .map((label, i) => ({ color: FALL[i], label }));
  return ["below −60%", "−60 to −40%", "−40 to −20%", "−20 to 0%", "0 to +20%", "above +20%"].map((label, i) => ({ color: RAIN[i], label }));
}

export function metricText(metric: MetricKey, value: number | null): string {
  if (value === null || value === undefined) return "no data";
  if (metric === "sinceMayM") return value >= 0 ? `${value.toFixed(2)} m deeper` : `${Math.abs(value).toFixed(2)} m shallower`;
  if (metric === "rainPct") return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)}%`;
  return `${value.toFixed(0)}%`;
}
