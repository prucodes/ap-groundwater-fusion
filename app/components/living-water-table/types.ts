import type {
  GroundwaterCoverageStatus,
  MandalGroundwaterRecordV2,
  MapMandal,
} from "../../lib/types";

export type QualityChoice = "auto" | "standard" | "reduced";
export type ResolvedQuality = "standard" | "reduced";

export type DepthCategory =
  | "near_surface"
  | "very_shallow"
  | "shallow"
  | "moderate"
  | "deep"
  | "very_deep"
  | "extremely_deep";

export type VisualCategory =
  | DepthCategory
  | "measured_only"
  | "boundary_only"
  | "no_data"
  | "excluded"
  | "invalid_model_value";

export type JoinedMandal = {
  boundaryId: string;
  geometryIndex: number;
  geometry: MapMandal;
  record: MandalGroundwaterRecordV2;
  visualCategory: VisualCategory;
  fill: string;
};

/** Depth-to-water rolled up to district level for the district granularity view. */
export type DistrictAggregate = {
  name: string;
  rings: number[][][];
  centroid: number[];
  meanDepthMeters: number | null;
  visualCategory: VisualCategory;
  fill: string;
  mandalCount: number;
  coveredCount: number;
};

export type MapGranularity = "mandal" | "district";

export type JoinDiagnostics = {
  geometryCount: number;
  recordCount: number;
  joinedCount: number;
  unmatchedGeometryCount: number;
  unmatchedRecordCount: number;
  duplicateBoundaryIdCount: number;
  invalidCoordinateCount: number;
  manifestCountMatches: boolean;
  coverageCounts: Record<GroundwaterCoverageStatus, number>;
};

export type ScenePerformance = {
  sourceVertexCount: number;
  surfaceVertexCount: number;
  boundaryVertexCount: number;
  drawCalls: number | null;
  triangles: number | null;
  geometries: number | null;
  textures: number | null;
  initialLoadMs: number | null;
};

export type HoverState = {
  mandalId: string;
  x: number;
  y: number;
} | null;

export type CameraCommand = {
  type: "reset" | "zoom_in" | "zoom_out";
  sequence: number;
};
