import waterMandalsJson from "../data/water_context_mandals.json";
import { heatColor } from "./data";
import type { WaterMandalValues } from "./data";

/** Per-mandal gauge-rain departure and soil moisture for the map layers (~30 KB). */
export const waterMandals = waterMandalsJson as unknown as WaterMandalValues;

export type WaterMandalLayer = "gauge_rain_dev" | "soil_pct";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "date unconfirmed";
};

/** Fixed scales, so a colour means the same thing week to week. */
export const WATER_LAYER_META: Record<WaterMandalLayer, {
  label: string; unit: string; min: number; max: number; diverging: boolean; low: string; high: string; period: string; note: string;
}> = {
  gauge_rain_dev: {
    label: "Gauge rain vs normal", unit: "%", min: -60, max: 60, diverging: true, low: "Deficit", high: "Excess",
    period: waterMandals.rain ? `${day(waterMandals.rain.start)} to ${day(waterMandals.rain.end)}` : "not available",
    note: "Measured: AP DES mandal rain gauges via APWRIMS, against the department's normal for the same window.",
  },
  soil_pct: {
    label: `Soil moisture, ${waterMandals.soil?.depthCm ?? 30} cm`, unit: "% of capacity", min: 0, max: 100, diverging: false,
    low: "Dry", high: "Wet", period: waterMandals.soil ? day(waterMandals.soil.asOf) : "not available",
    note: "Modelled: NRSC VIC land-surface model via APWRIMS. Plant-available water as a share of what the soil holds.",
  },
};

export function isWaterLayer(layer: string | null | undefined): layer is WaterMandalLayer {
  return layer === "gauge_rain_dev" || layer === "soil_pct";
}

export function waterForMandal(district: string, mandal: string) {
  const row = waterMandals.values[`${district.toUpperCase()}|${mandal.toUpperCase()}`];
  return row ? { rainDeviationPct: row[0], soilPct: row[1], soilRankDriest: row[2], soilOfYears: row[3] } : null;
}

export function waterLayerValue(layer: WaterMandalLayer, district: string, mandal: string): number | null {
  const row = waterForMandal(district, mandal);
  return row ? (layer === "gauge_rain_dev" ? row.rainDeviationPct : row.soilPct) : null;
}

export function waterLayerColor(layer: WaterMandalLayer, district: string, mandal: string): string {
  const meta = WATER_LAYER_META[layer];
  return heatColor(waterLayerValue(layer, district, mandal), meta.min, meta.max, meta.diverging);
}

export function waterLayerGradient(layer: WaterMandalLayer) {
  return WATER_LAYER_META[layer].diverging
    ? "linear-gradient(90deg, #c65a46, #e7cf86, #4f9268)"
    : "linear-gradient(90deg, #e6f1f8, #0e6f95)";
}

/** "−51%" / "38% · 2nd driest of 13" for hover cards; null when the mandal has no value. */
export function waterLayerText(layer: WaterMandalLayer, district: string, mandal: string): string | null {
  const row = waterForMandal(district, mandal);
  if (!row) return null;
  if (layer === "gauge_rain_dev") {
    const v = row.rainDeviationPct;
    return v === null ? null : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)}% vs normal`;
  }
  if (row.soilPct === null) return null;
  const rank = row.soilRankDriest && row.soilOfYears ? ` · ${row.soilRankDriest === 1 ? "driest" : `rank ${row.soilRankDriest}`} of ${row.soilOfYears} years` : "";
  return `${row.soilPct.toFixed(0)}%${rank}`;
}
