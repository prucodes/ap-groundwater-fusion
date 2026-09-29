import type { MandalGroundwaterView } from "./types";
import { monsoonWatch, titleCase } from "./data";

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
    "forecast_horizon_months",
    "forecast_target_period",
    "forecast_mbgl",
    "forecast_band_p10",
    "forecast_band_p90",
    "yoy_trend_m_per_yr",
    "observation_vs_nowcast_gap_m",
    "observation_outside_model_band",
    "observation_beyond_band_m",
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
      m.forecast_mbgl === null || m.forecast_mbgl === undefined ? "not_released" : "released",
      m.forecast_horizon_months,
      m.forecast_target_period,
      m.forecast_mbgl,
      m.forecast_band_p10,
      m.forecast_band_p90,
      m.trend_m_per_yr,
      m.obs_model_gap_m,
      m.obs_outside_band === null || m.obs_outside_band === undefined ? "" : m.obs_outside_band ? "yes" : "no",
      m.obs_band_excess_m,
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
    "Only the 3-month horizon is released; it is a modelled outlook with a P10-P90 interval, not a measurement.",
  ]);
  return [banner, header.join(","), ...lines].join("\n");
}

/** The flagged-mandal list, in the shape a district office can act on.
 *
 *  Ranked by how far past BOTH flag tests a mandal is, so the top of the file is
 *  the part worth a field visit. Every column is a measured change in that
 *  mandal's own readings; nothing here is modelled and nothing here authorizes
 *  an irrigation instruction. */
export function monsoonWatchToCsv(): string {
  const w = monsoonWatch;
  const banner = csvBanner([
    `Monsoon recharge watch: ${w.season.preMonsoonMonth} to ${w.season.latestMonth}.`,
    `Each mandal's change in depth since its May reading, against the median of its OWN change over the previous ten years.`,
    `Flagged short at >= 1.0 m AND >= 2.0x that mandal's own year-to-year spread. Positive metres mean the water table fell.`,
    `water_short_mm3 = shortfall_m x specific_yield x area_km2, in million cubic metres. Specific yield is the CGWB measurement where one exists for that mandal, otherwise the documented aquifer proxy.`,
    w.enso
      ? `Ocean state at publication: ${w.enso.season} ${w.enso.asOf.slice(0, 4)} ONI ${w.enso.oniC > 0 ? "+" : ""}${w.enso.oniC} C (${w.enso.state}). Context only; not used to derive any column.`
      : `Ocean state unavailable at publication.`,
  ]);
  const header = [
    "rank",
    "district",
    "mandal",
    "aquifer",
    "status",
    "change_since_may_m",
    "typical_change_m",
    "shortfall_m",
    "water_short_mm3",
    "specific_yield",
    "area_km2",
    "own_spread_m",
    "latest_depth_mbgl",
    "comparable_years",
  ];
  const lines = w.mandals
    .filter((m) => m.status !== "normal")
    .map((m, index) =>
      [
        index + 1,
        m.district,
        m.mandal,
        m.aquifer,
        m.status,
        m.thisSeasonM,
        m.typicalM,
        m.shortfallM,
        m.shortfallMm3,
        m.specificYield,
        m.areaKm2,
        m.spreadM,
        m.latestDepthM,
        m.comparableYears,
      ]
        .map(escape)
        .join(","),
    );
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
