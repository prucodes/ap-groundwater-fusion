import type { MandalFusionSeed } from "./types";
import { titleCase } from "./data";

function escape(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function mandalsToCsv(rows: MandalFusionSeed[]): string {
  const header = [
    "district",
    "mandal",
    "mandal_id",
    "latest_sensor_date",
    "sensor_count",
    "latest_measured_mbgl",
    "median_groundwater_mbgl",
    "data_basis",
    "model_estimate_mbgl",
    "estimate_band_p10",
    "estimate_band_p90",
    "forecast_next_month_mbgl",
    "yoy_trend_m_per_yr",
    "sensor_vs_model_gap_m",
    "nasa_grace_groundwater_percentile",
    "measured_wetness_percentile",
    "rootzone_percentile",
    "surface_percentile",
    "rainfall_mm_chirps",
    "annual_et_mm_terraclimate",
    "water_balance_mm",
    "water_balance_status",
    "sensor_satellite_agreement",
    "confidence_score",
    "confidence_label",
    "status_bucket",
    "recommended_action",
    "measured_input_label",
    "satellite_input_label",
    "boundary_source",
    "official_result",
  ];
  const lines = rows.map((m) =>
    [
      titleCase(m.district_name),
      titleCase(m.mandal_name),
      m.id,
      m.latest_sensor_date,
      m.sensor_count,
      m.display_mbgl,
      m.median_groundwater_mbgl,
      m.display_basis,
      m.estimate_mbgl,
      m.estimate_band_p10,
      m.estimate_band_p90,
      m.forecast_next_month_mbgl,
      m.trend_m_per_yr,
      m.obs_model_gap_m,
      m.groundwater_percentile,
      m.measured_wetness_percentile,
      m.rootzone_percentile,
      m.surface_percentile,
      m.rainfall_mm,
      m.annual_et_mm,
      m.water_balance_mm,
      m.water_balance_status,
      m.sensor_satellite_agreement,
      m.confidence_score,
      m.confidence_label,
      m.status_bucket,
      m.recommended_action,
      m.measured_input_label ?? "APWRIMS mandal groundwater series",
      m.satellite_input_label ?? "NASA/NDMC GRACE-DA satellite-model",
      m.boundary_source,
      m.official_result,
    ]
      .map(escape)
      .join(","),
  );
  const banner = [
    `# AP Groundwater Fusion — PROTOTYPE export (generated ${new Date().toISOString().slice(0, 10)})`,
    `# Modelled estimates with confidence bands — NOT official APWRIMS results. Boundaries are public-prototype.`,
    `# nasa_grace_groundwater_percentile = NASA GRACE-DA district storage percentile (0-100), not depth.`,
    `# measured_wetness_percentile = mandal vs its own APWRIMS history. model_estimate_mbgl = modelled depth (metres below ground).`,
    `# data_basis: measured = sensor reading available; modelled = model estimate. Verify pumping/drought attributions in the field.`,
  ].join("\n");
  return [banner, header.join(","), ...lines].join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
