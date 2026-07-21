import districtGeometryJson from "../../data/ap_district_geometry.json";
import mapGeometryJson from "../../data/ap_map_geometry.json";
import datasetManifestJson from "../../data/dataset_manifest.json";
import groundwaterRecordsJson from "../../data/mandal_groundwater_records_v2.json";
import modelCardJson from "../../data/model_card.json";
import type {
  GroundwaterRecordCollectionV2,
  MapGeometry,
  DistrictGeometry,
} from "../../lib/types";
import type { DatasetManifestV2, ModelCard } from "../../lib/data";
import { categoryForRecord, colorForCategory, depthCategory } from "./encoding";
import type {
  DistrictAggregate,
  JoinDiagnostics,
  JoinedMandal,
} from "./types";

const recordsBundle = groundwaterRecordsJson as GroundwaterRecordCollectionV2;
const mapGeometry = mapGeometryJson as MapGeometry;
const districtGeometry = districtGeometryJson as DistrictGeometry;
const manifest = datasetManifestJson as DatasetManifestV2;
const modelCard = modelCardJson as ModelCard;

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function geometryBoundaryId(
  districtName: string,
  mandalName: string,
  geometryIndex: number,
): string {
  return `ap-prototype-boundary-${slug(districtName)}-${slug(mandalName)}-${String(
    geometryIndex + 1,
  ).padStart(3, "0")}`;
}

function validRing(ring: number[][]): boolean {
  return (
    ring.length >= 4 &&
    ring.every(
      (point) =>
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        point[0] >= -180 &&
        point[0] <= 180 &&
        point[1] >= -90 &&
        point[1] <= 90,
    )
  );
}

/** Rolls up mandal depth-to-water to district level for the district view.
 *  Mean of member mandals' displayed depth; districts are matched to mandals by
 *  normalized name slug. Districts with no valued mandal render as "no data". */
function buildDistrictAggregates(
  joined: JoinedMandal[],
  geometry: DistrictGeometry,
): DistrictAggregate[] {
  const depthsBySlug = new Map<string, number[]>();
  const mandalsBySlug = new Map<string, number>();
  joined.forEach((feature) => {
    const key = slug(feature.record.identity.districtName);
    mandalsBySlug.set(key, (mandalsBySlug.get(key) ?? 0) + 1);
    const depth =
      feature.record.nowcast?.value ??
      feature.record.observation?.latestMeasuredValue ??
      null;
    if (depth !== null && Number.isFinite(depth)) {
      const list = depthsBySlug.get(key) ?? [];
      list.push(depth);
      depthsBySlug.set(key, list);
    }
  });
  return geometry.districts.map((district) => {
    const key = slug(district.d);
    const depths = depthsBySlug.get(key) ?? [];
    const meanDepthMeters = depths.length
      ? depths.reduce((total, value) => total + value, 0) / depths.length
      : null;
    const visualCategory = depthCategory(meanDepthMeters) ?? "no_data";
    return {
      name: district.d,
      rings: district.rings,
      centroid: district.c,
      meanDepthMeters,
      visualCategory,
      fill: colorForCategory(visualCategory),
      mandalCount: district.mandal_count ?? mandalsBySlug.get(key) ?? 0,
      coveredCount: depths.length,
    };
  });
}

function buildData() {
  if (recordsBundle.contractVersion !== "2.0.0") {
    throw new Error(`Unsupported groundwater contract ${recordsBundle.contractVersion}`);
  }
  if (
    manifest.dataContractVersion !== "2.0.0" ||
    manifest.manifestVersion !== "2.0.0"
  ) {
    throw new Error("The active dataset manifest is not Phase 0 V2.");
  }

  const recordByBoundary = new Map(
    recordsBundle.records.map((record) => [record.identity.boundaryId, record]),
  );
  const duplicateBoundaryIdCount =
    recordsBundle.records.length - recordByBoundary.size;
  if (duplicateBoundaryIdCount > 0) {
    throw new Error(`Duplicate V2 boundary identities: ${duplicateBoundaryIdCount}`);
  }

  const usedRecordIds = new Set<string>();
  let invalidCoordinateCount = 0;
  const joined: JoinedMandal[] = [];
  const unmatchedGeometry: string[] = [];

  mapGeometry.mandals.forEach((feature, geometryIndex) => {
    const boundaryId = geometryBoundaryId(feature.d, feature.m, geometryIndex);
    const record = recordByBoundary.get(boundaryId);
    if (!record) {
      unmatchedGeometry.push(boundaryId);
      return;
    }
    if (
      record.identity.districtName !== feature.d ||
      record.identity.mandalName !== feature.m
    ) {
      throw new Error(`Boundary identity drift detected for ${boundaryId}`);
    }
    invalidCoordinateCount += feature.rings.filter((ring) => !validRing(ring)).length;
    usedRecordIds.add(record.identity.mandalId);
    const visualCategory = categoryForRecord(
      record.identity.coverageStatus,
      record.nowcast?.value ?? null,
    );
    joined.push({
      boundaryId,
      geometryIndex,
      geometry: feature,
      record,
      visualCategory,
      fill: colorForCategory(visualCategory),
    });
  });

  const unmatchedRecords = recordsBundle.records.filter(
    (record) => !usedRecordIds.has(record.identity.mandalId),
  );
  const coverageCounts = {
    modelled: 0,
    measured_only: 0,
    boundary_only: 0,
    no_data: 0,
    excluded: 0,
  };
  recordsBundle.records.forEach((record) => {
    coverageCounts[record.identity.coverageStatus] += 1;
  });

  const diagnostics: JoinDiagnostics = {
    geometryCount: mapGeometry.mandals.length,
    recordCount: recordsBundle.records.length,
    joinedCount: joined.length,
    unmatchedGeometryCount: unmatchedGeometry.length,
    unmatchedRecordCount: unmatchedRecords.length,
    duplicateBoundaryIdCount,
    invalidCoordinateCount,
    manifestCountMatches:
      mapGeometry.mandals.length === manifest.counts.boundaryFeatureCount &&
      coverageCounts.modelled === manifest.counts.modelledRecordCount &&
      coverageCounts.measured_only === manifest.counts.measuredOnlyCount &&
      coverageCounts.boundary_only === manifest.counts.boundaryOnlyCount &&
      coverageCounts.no_data === manifest.counts.noDataCount,
    coverageCounts,
  };

  if (
    diagnostics.joinedCount !== diagnostics.geometryCount ||
    diagnostics.unmatchedGeometryCount ||
    diagnostics.unmatchedRecordCount ||
    diagnostics.invalidCoordinateCount ||
    !diagnostics.manifestCountMatches
  ) {
    throw new Error(
      `Living Water Table join failed: ${JSON.stringify(diagnostics)}`,
    );
  }

  return {
    joined,
    diagnostics,
    mapGeometry,
    districtGeometry,
    districtAggregates: buildDistrictAggregates(joined, districtGeometry),
    manifest,
    modelCard,
  };
}

export const livingWaterTableData = buildData();
