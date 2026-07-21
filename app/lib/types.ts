export type StatusBucket = "Verify" | "Stress" | "Watch" | "Low Confidence" | "Normal" | "Insufficient Data";

export type GroundwaterCoverageStatus =
  | "modelled"
  | "measured_only"
  | "boundary_only"
  | "no_data"
  | "excluded";

export type GroundwaterAgreement =
  | "declining_despite_positive_climate_balance"
  | "declining_without_positive_climate_balance"
  | "stable_or_recovering"
  | "unknown";

export type MandalGroundwaterRecordV2 = {
  contractVersion: "2.0.0";
  identity: {
    mandalId: string;
    mandalName: string;
    districtId: string;
    districtName: string;
    boundaryId: string;
    boundarySource: string;
    boundaryStatus: "prototype" | "official";
    identifierStatus: "temporary" | "official";
    coverageStatus: GroundwaterCoverageStatus;
    coverageReason: string | null;
    joinedSourceSeriesIds: string[];
    joinMethod: "district_and_mandal" | "district_and_reconciled_mandal" | "boundary_only";
  };
  observation: {
    latestMeasuredValue: number;
    unit: "m_bgl";
    observationPeriod: string;
    aggregationMethod: string;
    observationRecordCount: number;
    uniqueObservationMonthCount: number;
    physicalStationCount: number | null;
    sourceStatus: "session_sample" | "authorized_source" | "unknown";
    authorizationStatus: "pending" | "authorized" | "unknown";
    validityPeriod: { start: string; end: string };
    fetchDate: string | null;
  } | null;
  nowcast: {
    value: number;
    unit: "m_bgl";
    targetPeriod: string;
    modelVersion: string;
    lower: number;
    upper: number;
    intervalType: "model_quantile_p10_p90";
    eligibleEvaluationCohort: string;
    qualityStatus: "eligible" | "limited" | "not_evaluated";
  } | null;
  forecast: {
    issueDate: string;
    targetDate: string;
    horizonMonths: number;
    value: number;
    unit: "m_bgl";
    lower: number | null;
    upper: number | null;
    modelVersion: string;
    evaluationMetric: Record<string, unknown>;
    baselineMetric: Record<string, unknown>;
    beatsBaselines: boolean;
    releaseStatus: "released" | "experimental" | "research_only" | "not_released";
  } | null;
  signals: {
    graceDa: {
      groundwaterPercentile: number | null;
      rootZonePercentile: number | null;
      surfacePercentile: number | null;
      validPeriod: string | null;
      fetchDate: string | null;
      spatialLevel: "district_regional_model_assimilated_context";
    };
    rainfall: {
      amountMm: number | null;
      anomalyPct: number | null;
      validPeriod: string | null;
      source: string;
    };
    evapotranspiration: {
      amountMm: number | null;
      anomalyPct: number | null;
      validPeriod: string | null;
      source: string;
    };
    climateBalance: {
      amountMm: number | null;
      validPeriod: string | null;
      label: "rainfall_minus_actual_et";
      category: "positive" | "neutral" | "negative" | "unknown";
    };
    extractionCategory: string | null;
  };
  quality: {
    observationHistoryMonths: number;
    missingFeatures: string[];
    intervalWidthM: number | null;
    terrainCohort: string | null;
    evaluationCohort: string;
    dataCompleteness: "complete" | "partial" | "groundwater_missing";
    confidenceClass: "high" | "moderate" | "limited" | "not_assessed";
    confidenceMethod: string;
  };
  assessment: {
    monitoringStatus: "stable" | "watch" | "stress" | "verify" | "insufficient_data";
    measuredTrendMPerYear: number | null;
    contextAgreement: GroundwaterAgreement;
  };
  provenance: {
    sourceNames: string[];
    sourceFilesOrUris: string[];
    authorizationStatus: string;
    generatedAt: string;
    inputHashes: Record<string, string>;
    modelVersion: string | null;
    dataContractVersion: "2.0.0";
    geometryVersion: string;
    builderScriptVersion: string;
  };
};

export type GroundwaterRecordCollectionV2 = {
  contractVersion: "2.0.0";
  generatedAt: string;
  records: MandalGroundwaterRecordV2[];
  joinDiagnostics: Record<string, unknown>;
};

/**
 * Explicit presentation adapter derived only from MandalGroundwaterRecordV2.
 * It keeps existing screens stable while removing ambiguous V1 field names from
 * the active JSON contract.
 */
export type MandalGroundwaterView = {
  id: string;
  rank: number;
  mandal_name: string;
  district_name: string;
  coverage_status: GroundwaterCoverageStatus;
  observation_record_count: number;
  observation_month_count: number;
  physical_station_count: number | null;
  latest_observation_period: string;
  median_groundwater_mbgl: number | null;
  avg_groundwater_mbgl: number | null;
  estimate_mbgl?: number | null;
  estimate_band_p10?: number | null;
  estimate_band_p90?: number | null;
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
  sensor_satellite_agreement: GroundwaterAgreement;
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
