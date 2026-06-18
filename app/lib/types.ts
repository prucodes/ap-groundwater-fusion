export type StatusBucket = "Verify" | "Stress" | "Watch" | "Low Confidence" | "Normal";

export type MandalFusionSeed = {
  id: string;
  rank: number;
  mandal_name: string;
  district_name: string;
  sensor_count: number;
  latest_sensor_date: string;
  median_groundwater_mbgl: number | null;
  avg_groundwater_mbgl: number | null;
  estimate_mbgl?: number | null;
  estimate_band_p10?: number | null;
  estimate_band_p90?: number | null;
  forecast_next_month_mbgl?: number | null;
  obs_model_gap_m?: number | null;
  display_mbgl?: number | null;
  display_basis?: "measured" | "modelled";
  trend_m_per_yr?: number | null;
  groundwater_percentile: number | null;
  measured_wetness_percentile?: number | null;
  rootzone_percentile: number | null;
  surface_percentile: number | null;
  rainfall_mm: number | null;
  annual_et_mm: number | null;
  water_balance_mm: number | null;
  water_balance_status: string;
  sensor_satellite_agreement: string;
  confidence_score: number | null;
  confidence_label: string;
  status: string;
  status_bucket: StatusBucket;
  recommended_action: string;
  data_quality_notes: string;
  boundary_source: string;
  boundary_official_flag: boolean;
  measured_input_label: string;
  measured_input_source: string;
  satellite_input_label: string;
  rainfall_input_label: string;
  water_balance_input_label: string;
  official_result: boolean;
  aware_apwrims_action_preview: {
    district_name: string;
    mandal_name: string;
    status: string;
    confidence_label: string;
    recommended_action: string;
    source_caveat: string;
  };
};

export type SatelliteSample = {
  station_id: string;
  station_name: string;
  district_name: string;
  mandal_name: string;
  latitude: string;
  longitude: string;
  groundwater_percentile: string;
  rootzone_percentile: string;
  surface_percentile: string;
  satellite_sample_date_or_fetch_date: string;
  gws_source_file: string;
  rtzsm_source_file: string;
  sfsm_source_file: string;
  data_label: string;
  notes: string;
};

export type ReadinessItem = {
  label: string;
  status: string;
  data_label: string;
  official_flag: boolean;
};

export type DashboardSummary = {
  summary: {
    prototype_notice: string;
    mandals_analyzed: number;
    mandals_needing_verification: number;
    avg_groundwater_percentile: number | null;
    avg_rootzone_percentile: number | null;
    avg_surface_percentile: number | null;
    avg_rainfall_mm: number | null;
    rainfall_period: string;
    avg_water_balance_mm: number | null;
    balance_year: string;
    deficit_mandals: number;
    overall_data_confidence: string;
    sample_fetch_date: string;
    status_distribution: Record<string, number>;
    confidence_distribution: Record<string, number>;
    source_labels: Record<string, string | boolean>;
  };
  nasa_percentile_summary: Array<Record<string, string>>;
};

export type MapMandal = {
  d: string;
  m: string;
  rings: number[][][];
  seed: boolean;
  c?: number[];
};

export type MapGeometry = {
  crs: string;
  boundary_source: string;
  official_flag: boolean;
  caveat: string;
  bbox: [number, number, number, number];
  feature_count: number;
  mandals: MapMandal[];
  district_structure?: string;
};

export type DistrictFeature = {
  d: string;
  rings: number[][][];
  c: number[];
  mandal_count: number;
  gw_percentile: number | null;
  rootzone_percentile: number | null;
  surface_percentile: number | null;
  rainfall_mm: number | null;
  annual_et_mm: number | null;
  water_balance_mm: number | null;
  water_balance_status: string;
};

export type DistrictLayerKey = "gw_percentile" | "rainfall_mm" | "water_balance_mm";

export type MandalHeatLayerKey = "rainfall_mm" | "water_balance_mm";

export type MandalHeat = {
  boundary_source: string;
  official_flag: boolean;
  caveat: string;
  rainfall_period: string;
  balance_year: string;
  layers: Record<MandalHeatLayerKey, { min: number; max: number }>;
  count: number;
  values: Record<string, { rainfall_mm: number | null; water_balance_mm: number | null; water_balance_status: string }>;
};

export type DistrictGeometry = {
  crs: string;
  boundary_source: string;
  official_flag: boolean;
  caveat: string;
  rainfall_period: string;
  balance_year: string;
  bbox: [number, number, number, number];
  layers: Record<DistrictLayerKey, { label: string; unit: string; min: number; max: number }>;
  district_count: number;
  districts: DistrictFeature[];
  district_structure?: string;
};
