import type { MandalGroundwaterView } from "./types";
import { titleCase } from "./data";

function escape(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Shared provenance banner prepended to every CSV export (audit requirement). */
export function csvBanner(extra: string[] = []): string {
  return [
    `# AP Groundwater Fusion — PROTOTYPE export (generated ${new Date().toISOString().slice(0, 10)})`,
    `# Measured aggregates and modelled nowcasts are separate. Quantile ranges are not guaranteed confidence intervals.`,
    `# APWRIMS readings are a browser-session research sample (authorization pending). NASA values are GRACE-DA district storage percentile (0-100), not depth.`,
    `# Monitoring categories are verify-first indicators, not pumping or climate attributions.`,
    ...extra.map((l) => `# ${l}`),
  ].join("\n");
}

export function mandalsToCsv(rows: MandalGroundwaterView[]): string {
  const header = [
    "district",
    "mandal",
    "mandal_id",
    "coverage_status",
    "latest_observation_period",
    "observation_record_count",
    "observation_month_count",
    "physical_station_count",
    "latest_measured_mbgl",
    "median_groundwater_mbgl",
    "data_basis",
    "model_estimate_mbgl",
    "model_quantile_p10",
    "model_quantile_p90",
    "forecast_release_status",
    "yoy_trend_m_per_yr",
    "observation_vs_nowcast_gap_m",
    "nasa_grace_groundwater_percentile",
    "measured_wetness_percentile",
    "rootzone_percentile",
    "surface_percentile",
    "rainfall_mm_chirps",
    "annual_et_mm_terraclimate",
    "water_balance_mm",
    "water_balance_status",
    "context_agreement",
    "data_completeness_class",
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
      m.coverage_status,
      m.latest_observation_period,
      m.observation_record_count,
      m.observation_month_count,
      m.physical_station_count,
      m.display_mbgl,
      m.median_groundwater_mbgl,
      m.display_basis,
      m.estimate_mbgl,
      m.estimate_band_p10,
      m.estimate_band_p90,
      "not_released",
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
  const banner = csvBanner([
    "nasa_grace_groundwater_percentile = GRACE-DA district storage percentile (0-100), not depth.",
    "measured_wetness_percentile = mandal vs its own APWRIMS history. model_estimate_mbgl = modelled depth (mbgl).",
    "data_basis: measured = recorded mandal aggregate; modelled = temporal nowcast.",
    "physical_station_count is blank because station identifiers are not verifiable in the source schema.",
    "No forecast horizon is released.",
  ]);
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
