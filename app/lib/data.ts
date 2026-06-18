import dashboardSummaryJson from "../data/dashboard_summary.json";
import mandalFusionSeedJson from "../data/mandal_dataset.json";
import readinessJson from "../data/source_readiness.json";
import satelliteSamplesJson from "../data/satellite_station_samples.json";
import mapGeometryJson from "../data/ap_map_geometry.json";
import districtGeometryJson from "../data/ap_district_geometry.json";
import mandalHeatJson from "../data/ap_mandal_heat.json";
import nasaProvenanceJson from "../data/nasa_provenance.json";
import levelsEstimatesJson from "../data/mandal_levels_estimated.json";
import type {
  DashboardSummary,
  DistrictGeometry,
  DistrictLayerKey,
  MandalFusionSeed,
  MandalHeat,
  MandalHeatLayerKey,
  MapGeometry,
  ReadinessItem,
  SatelliteSample,
  StatusBucket,
} from "./types";

export const dashboardSummary = dashboardSummaryJson as DashboardSummary;
export const mandals = mandalFusionSeedJson as MandalFusionSeed[];
export const readinessItems = readinessJson as ReadinessItem[];
export const satelliteSamples = satelliteSamplesJson as SatelliteSample[];
export const mapGeometry = mapGeometryJson as MapGeometry;
export const districtGeometry = districtGeometryJson as DistrictGeometry;

export type NasaRaster = {
  raster_name: string;
  label: string;
  signal: string;
  source_url: string;
  fetch_date: string;
  file_size_kb: number;
  sha256_short: string;
  resolution_deg: string;
  resolution_km: string;
  crs: string;
  width: string;
  height: string;
  nodata: string;
  dtype: string;
  min: number;
  mean: number;
  max: number;
  count: number;
};
export type NasaProvenance = {
  source: string;
  station_points_sampled: number;
  total_null_or_nodata_samples: number;
  fetch_date: string;
  rasters: NasaRaster[];
  data_label: string;
};
export const nasaProvenance = nasaProvenanceJson as NasaProvenance;

function hexLerp(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Generic heat color: diverging (deficit→surplus) for balance, sequential otherwise. */
export function heatColor(value: number | null, min: number, max: number, diverging: boolean): string {
  if (value === null || value === undefined) return "#dfe6ef";
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  if (diverging) {
    return t < 0.5 ? hexLerp("#c65a46", "#e7cf86", t * 2) : hexLerp("#e7cf86", "#4f9268", (t - 0.5) * 2);
  }
  return hexLerp("#e6f1f8", "#0e6f95", t);
}

/** Choropleth color for a district layer value. */
export function districtLayerColor(key: DistrictLayerKey, value: number | null): string {
  const { min, max } = districtGeometry.layers[key];
  return heatColor(value, min, max, key === "water_balance_mm");
}

/* ---------------- Mandal heat (statewide, all ~670 mandals) ---------------- */

export const mandalHeat = mandalHeatJson as MandalHeat;

/* ---------------- Estimated levels (β) — Phase 3 metres engine ---------------- */

export type MandalLevelEstimate = {
  mandal: string;
  district: string;
  mkey: string;
  lat: number;
  lon: number;
  aquifer: "hard_rock" | "alluvial" | "coastal" | string;
  as_of: string;
  observed_mbgl: number;
  estimate_mbgl: number;
  band_p10: number;
  band_p90: number;
  trend_m_per_yr: number | null;
};
export type LevelsEstimateBundle = {
  generated: string;
  label: string;
  n_mandals: number;
  backtest: {
    forecast_rmse_m: number;
    forecast_mae_m: number;
    forecast_r2: number;
    vs_persistence_pct: number;
    by_terrain_mae_m: Record<string, number>;
  };
  mandals: MandalLevelEstimate[];
};
export const levelsEstimates = levelsEstimatesJson as LevelsEstimateBundle;

/** Sequential depth color: shallow (good, teal) → deep (stressed, amber/red). */
export function depthColor(mbgl: number | null): string {
  if (mbgl === null || mbgl === undefined) return "#dfe6ef";
  // 0 m (shallow) -> 20 m (deep); clamp
  const t = Math.max(0, Math.min(1, mbgl / 20));
  return t < 0.5 ? hexLerp("#2f8f6b", "#e7cf86", t * 2) : hexLerp("#e7cf86", "#bf4b3b", (t - 0.5) * 2);
}

function mandalHeatEntry(district: string, mandal: string) {
  return mandalHeat.values[`${district.toUpperCase()}|${mandal.toUpperCase()}`];
}

export function mandalHeatValue(district: string, mandal: string, layer: MandalHeatLayerKey): number | null {
  return mandalHeatEntry(district, mandal)?.[layer] ?? null;
}

export function mandalHeatStatus(district: string, mandal: string): string {
  return mandalHeatEntry(district, mandal)?.water_balance_status ?? "";
}

export function mandalHeatColor(layer: MandalHeatLayerKey, district: string, mandal: string): string {
  const { min, max } = mandalHeat.layers[layer];
  return heatColor(mandalHeatValue(district, mandal, layer), min, max, layer === "water_balance_mm");
}
export const prototypeNotice = dashboardSummary.summary.prototype_notice;

export function formatNumber(value: number | string | null | undefined, suffix = "") {
  if (value === null || value === undefined || value === "") return "No data";
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return `${numeric.toLocaleString("en-IN", { maximumFractionDigits: 2 })}${suffix}`;
}

export function titleCase(value: string) {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

/* ---------------- Status helpers ---------------- */

export const STATUS_ORDER: StatusBucket[] = ["Normal", "Watch", "Stress", "Verify", "Low Confidence"];

export const STATUS_META: Record<string, { className: string; color: string; label: string }> = {
  Normal: { className: "normal", color: "#5e9b6b", label: "Normal" },
  Watch: { className: "watch", color: "#d79b2e", label: "Watch" },
  Stress: { className: "stress", color: "#e07b39", label: "Stress" },
  Verify: { className: "verify", color: "#c65a46", label: "Verify" },
  "Low Confidence": { className: "low", color: "#7a6fa6", label: "Low Confidence" },
  "Insufficient Data": { className: "insufficient", color: "#98a2b3", label: "Insufficient Data" },
};

export function statusMeta(bucket?: string | null) {
  return STATUS_META[bucket ?? ""] ?? STATUS_META["Insufficient Data"];
}

export const AGREEMENT_META: Record<string, { className: string; label: string }> = {
  over_extraction: { className: "strong", label: "Pumping-pressure (verify)" },
  drought_decline: { className: "partial", label: "Climate-stress (verify)" },
  stable_or_recovering: { className: "agree", label: "Stable / recovering" },
  // legacy keys (kept for back-compat if any cached data is read)
  strong_disagreement: { className: "strong", label: "Pumping-pressure (verify)" },
  partial_or_neutral: { className: "partial", label: "Climate-stress (verify)" },
  agree_normal_or_wet: { className: "agree", label: "Stable / recovering" },
};

export function agreementMeta(value: string) {
  return AGREEMENT_META[value] ?? { className: "partial", label: titleCase(value || "unknown") };
}

export function confidenceClass(label: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("verify")) return "verify";
  if (l.includes("low")) return "low";
  if (l.includes("high")) return "normal";
  return "watch";
}

export function wetnessLabel(percentile: number | null | undefined) {
  if (percentile === null || percentile === undefined) return "No data";
  if (percentile >= 90) return "Very Wet";
  if (percentile >= 70) return "Wet";
  if (percentile >= 30) return "Normal";
  if (percentile >= 10) return "Dry";
  return "Very Dry";
}

/** Wetness tier for percentile bars / assessment pills (infographic style). */
export function wetnessTier(percentile: number | null | undefined): {
  className: string;
  label: string;
  color: string;
} {
  if (percentile === null || percentile === undefined)
    return { className: "normal", label: "No data", color: "#98a2b3" };
  if (percentile >= 98) return { className: "extreme", label: "Extremely Wet", color: "#0f93a8" };
  if (percentile >= 90) return { className: "verywet", label: "Very Wet", color: "#1f8a8a" };
  if (percentile >= 70) return { className: "wet", label: "Wet", color: "#5e9b6b" };
  if (percentile >= 30) return { className: "normal", label: "Normal", color: "#8a97a8" };
  return { className: "dry", label: "Dry", color: "#d79b2e" };
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026.04" -> "Apr 2026"; "2026-04" -> "Apr 2026"; "2025" -> "2025"; passthrough. */
export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "";
  const m = String(period).match(/^(\d{4})[.\-](\d{1,2})$/);
  if (m) {
    const idx = Number(m[2]) - 1;
    return idx >= 0 && idx < 12 ? `${MONTH_ABBR[idx]} ${m[1]}` : period;
  }
  return String(period);
}

/** Freshness stamp — the most recent sensor month across all mandals ("2026-05"). */
export const dataAsOf = (() => {
  let max = "";
  for (const m of mandals) {
    const d = m.latest_sensor_date;
    if (d && d > max) max = d;
  }
  return max;
})();

/** Water-balance status from a net mm/yr value — mirrors the pipeline thresholds. */
export function balanceStatusFor(mm: number | null | undefined): "Surplus" | "Balanced" | "Deficit" | "" {
  if (mm === null || mm === undefined) return "";
  if (mm >= 250) return "Surplus";
  if (mm >= 50) return "Balanced";
  return "Deficit";
}

export function balanceMeta(status: string | null | undefined): { label: string; color: string; className: string } {
  switch (status) {
    case "Surplus":
      return { label: "Surplus", color: "#5e9b6b", className: "surplus" };
    case "Balanced":
      return { label: "Balanced", color: "#1f8a8a", className: "balanced" };
    case "Deficit":
      return { label: "Deficit", color: "#c65a46", className: "deficit" };
    default:
      return { label: status || "No data", color: "#98a2b3", className: "none" };
  }
}

/* ---------------- Selectors ---------------- */

/** Priority mandals for action: stressed (deep/declining), worst first. */
export function verifyMandals() {
  return mandals
    .filter((m) => m.status_bucket === "Stress")
    .sort((a, b) => (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0));
}

export function watchlistMandals() {
  // Everything that is not a clean "Normal" agreement is reviewable in the watchlist.
  return mandals
    .filter((m) => m.status_bucket !== "Normal")
    .sort((a, b) => (a.confidence_score ?? 0) - (b.confidence_score ?? 0));
}

export function selectedMandal(id?: string) {
  return mandals.find((mandal) => mandal.id === id) ?? mandals[0];
}

export function sampleForMandal(mandal: MandalFusionSeed) {
  return satelliteSamples.find(
    (sample) =>
      sample.mandal_name.toLowerCase() === mandal.mandal_name.toLowerCase() &&
      sample.district_name.toLowerCase() === mandal.district_name.toLowerCase(),
  );
}

export const districts = Array.from(new Set(mandals.map((m) => m.district_name))).sort();

export type DistrictRollup = {
  district_name: string;
  mandal_count: number;
  seed_count: number;
  verify_count: number;
  normal_count: number;
  stress_count: number;
  avg_groundwater_percentile: number | null;
  avg_median_mbgl: number | null;
  avg_estimate_mbgl: number | null;
  avg_trend_m_per_yr: number | null;
  avg_water_balance_mm: number | null;
  deficit_count: number;
  worst_bucket: string;
  mandals: MandalFusionSeed[];
};

function meanOf(nums: (number | null | undefined)[], digits = 2): number | null {
  const v = nums.filter((n): n is number => n !== null && n !== undefined);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10 ** digits) / 10 ** digits : null;
}

const BUCKET_SEVERITY = ["Normal", "Watch", "Stress", "Low Confidence", "Verify", "Insufficient Data"];

export function districtRollups(): DistrictRollup[] {
  return districts
    .map((d) => {
      const rows = mandals.filter((m) => m.district_name === d);
      const gw = rows.map((r) => r.groundwater_percentile).filter((v): v is number => v !== null);
      const md = rows.map((r) => r.median_groundwater_mbgl).filter((v): v is number => v !== null);
      const wb = rows.map((r) => r.water_balance_mm).filter((v): v is number => v !== null && v !== undefined);
      const worst = rows.reduce((acc, r) => {
        return BUCKET_SEVERITY.indexOf(r.status_bucket) > BUCKET_SEVERITY.indexOf(acc) ? r.status_bucket : acc;
      }, "Normal");
      const realCount =
        districtGeometry.districts.find((x) => x.d.toUpperCase() === d.toUpperCase())?.mandal_count ?? rows.length;
      return {
        district_name: d,
        mandal_count: realCount,
        seed_count: rows.length,
        verify_count: rows.filter((r) => r.status_bucket === "Stress").length,
        normal_count: rows.filter((r) => r.status_bucket === "Normal").length,
        stress_count: rows.filter((r) => r.status_bucket === "Stress").length,
        avg_groundwater_percentile: gw.length ? Math.round((gw.reduce((a, b) => a + b, 0) / gw.length) * 100) / 100 : null,
        avg_median_mbgl: md.length ? Math.round((md.reduce((a, b) => a + b, 0) / md.length) * 100) / 100 : null,
        avg_estimate_mbgl: meanOf(rows.map((r) => r.estimate_mbgl)),
        avg_trend_m_per_yr: meanOf(rows.map((r) => r.trend_m_per_yr)),
        avg_water_balance_mm: wb.length ? Math.round((wb.reduce((a, b) => a + b, 0) / wb.length) * 10) / 10 : null,
        deficit_count: rows.filter((r) => r.water_balance_status === "Deficit").length,
        worst_bucket: worst,
        mandals: rows,
      };
    })
    .sort((a, b) => b.verify_count - a.verify_count);
}

/* ---------------- Status distribution (display, includes Insufficient Data) ---------------- */

export function statusDistribution() {
  const counts: Record<string, number> = {
    Normal: 0,
    Watch: 0,
    Stress: 0,
    Verify: 0,
    "Low Confidence": 0,
    "Insufficient Data": 0,
  };
  for (const m of mandals) counts[m.status_bucket] = (counts[m.status_bucket] ?? 0) + 1;
  return counts;
}

/* ---------------- Map projection ---------------- */

export const MAP_VIEW = (() => {
  const [minLon, minLat, maxLon, maxLat] = mapGeometry.bbox;
  const midLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const lonSpan = (maxLon - minLon) * cosLat;
  const latSpan = maxLat - minLat;
  const pad = 16;
  const width = 1000;
  const inner = width - pad * 2;
  const height = Math.round((inner * (latSpan / lonSpan)) + pad * 2);
  function project(lon: number, lat: number): [number, number] {
    const x = pad + ((lon - minLon) * cosLat) / lonSpan * inner;
    const y = pad + ((maxLat - lat) / latSpan) * (height - pad * 2);
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  }
  return { width, height, project, minLon, minLat, maxLon, maxLat };
})();

export function ringToPath(ring: number[][]): string {
  if (!ring.length) return "";
  const parts = ring.map(([lon, lat], i) => {
    const [x, y] = MAP_VIEW.project(lon, lat);
    return `${i === 0 ? "M" : "L"}${x} ${y}`;
  });
  return `${parts.join(" ")} Z`;
}

export function mandalToPath(rings: number[][][]): string {
  return rings.map(ringToPath).join(" ");
}

/** Normalize a mandal/district name for tolerant matching (mirrors the Python norm). */
function normName(s: string): string {
  return String(s)
    .toUpperCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b/g, " ")
    .replace(/[.\-]/g, " ")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** normName with all spaces removed — collapses spacing variants like
 *  "REGIDI AMADALAVALASA" vs "REGIDIAMADALAVALASA", "PEDA BAYALU" vs "PEDABAYALU". */
function squashName(s: string): string {
  return normName(s).replace(/ /g, "");
}

/** Levenshtein similarity ratio in [0,1] — catches spelling drift like
 *  "BALIJIPETA"/"BALAJIPETA", "ANAPARTHY"/"ANAPARTHI". */
function simRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

// Prebuilt indices (first wins): normalized name and space-squashed name.
const _mandalByNorm: Record<string, MandalFusionSeed> = {};
const _mandalBySquash: Record<string, MandalFusionSeed> = {};
const _squashKeys: string[] = [];
for (const m of mandals) {
  const k = normName(m.mandal_name);
  if (!(k in _mandalByNorm)) _mandalByNorm[k] = m;
  const s = squashName(m.mandal_name);
  if (!(s in _mandalBySquash)) {
    _mandalBySquash[s] = m;
    _squashKeys.push(s);
  }
}

// Memoize geometry->record matches; mandalByMapKey runs per-polygon per-render.
const _mapKeyCache = new Map<string, MandalFusionSeed | undefined>();

/** Join a map-geometry mandal (UPPERCASE d/m) to its dataset record, tolerant of
 *  spelling differences: exact (district+mandal) → normalized name → space-squashed
 *  → fuzzy (Levenshtein ≥ 0.86). Recovers ~45 mandals whose public-boundary spelling
 *  drifts from the APWRIMS dataset (e.g. AP's 2022 district reorganization). */
export function mandalByMapKey(district: string, mandal: string) {
  const cacheKey = `${district}|${mandal}`;
  if (_mapKeyCache.has(cacheKey)) return _mapKeyCache.get(cacheKey);

  const exact = mandals.find(
    (m) =>
      m.district_name.toUpperCase() === district.toUpperCase() &&
      m.mandal_name.toUpperCase() === mandal.toUpperCase(),
  );
  let rec = exact ?? _mandalByNorm[normName(mandal)] ?? _mandalBySquash[squashName(mandal)];

  if (!rec) {
    const target = squashName(mandal);
    let best: MandalFusionSeed | undefined;
    let bestScore = 0;
    for (const key of _squashKeys) {
      if (Math.abs(key.length - target.length) > 2) continue;
      const score = simRatio(target, key);
      if (score > bestScore) {
        bestScore = score;
        best = _mandalBySquash[key];
      }
    }
    if (best && bestScore >= 0.86) rec = best;
  }

  _mapKeyCache.set(cacheKey, rec);
  return rec;
}
