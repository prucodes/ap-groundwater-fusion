import * as THREE from "three";
import type { DistrictGeometry, MapGeometry } from "../../lib/types";
import type { DistrictAggregate, JoinedMandal } from "./types";

const SURFACE_HEIGHT = 0.09;

// Relief view: column height encodes depth to water. Deeper water table (larger
// m bgl) => taller column. Reference depth matches the legend's "extremely deep"
// band (>= 60 m bgl).
const RELIEF_MAX = 1.5;
const DEPTH_REF_M = 60;

/** Modelled (or measured-only) depth to water in m bgl, or null when the record
 *  carries no groundwater value (boundary-only / no-data). */
export function featureDepthMeters(feature: JoinedMandal): number | null {
  const record = feature.record;
  if (record.nowcast) return record.nowcast.value;
  if (record.observation) return record.observation.latestMeasuredValue;
  return null;
}

/** Maps a depth (m bgl) to a top-face height. Flat view returns the uniform
 *  slab height; relief view scales by depth, clamped to the legend range. */
export function depthToHeight(depth: number | null, relief: boolean): number {
  if (!relief) return SURFACE_HEIGHT;
  if (depth === null || !Number.isFinite(depth)) return SURFACE_HEIGHT;
  const t = Math.min(Math.max(depth, 0), DEPTH_REF_M) / DEPTH_REF_M;
  return SURFACE_HEIGHT + t * RELIEF_MAX;
}

export function mandalTopHeight(feature: JoinedMandal, relief: boolean): number {
  return depthToHeight(featureDepthMeters(feature), relief);
}

export type Projector = {
  point: (longitude: number, latitude: number) => [number, number];
  width: number;
  height: number;
};

export function createProjector(bbox: MapGeometry["bbox"]): Projector {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = bbox;
  const centerLongitude = (minLongitude + maxLongitude) / 2;
  const centerLatitude = (minLatitude + maxLatitude) / 2;
  const longitudeScale = Math.cos((centerLatitude * Math.PI) / 180);
  const width = (maxLongitude - minLongitude) * longitudeScale;
  const height = maxLatitude - minLatitude;
  return {
    point(longitude, latitude) {
      return [
        (longitude - centerLongitude) * longitudeScale,
        latitude - centerLatitude,
      ];
    },
    width,
    height,
  };
}

function colorComponents(color: string, factor = 1): [number, number, number] {
  const parsed = new THREE.Color(color);
  return [parsed.r * factor, parsed.g * factor, parsed.b * factor];
}

function cleanRing(ring: number[][]): number[][] {
  if (ring.length < 2) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

type SurfaceItem = {
  rings: number[][][];
  fill: string;
  topY: number;
  index: number;
};

/** Shared extruded-polygon builder. Each item becomes a colored top face at
 *  `topY` with vertical sides down to y=0, tagged with `index` for picking. */
function buildSurface(
  items: SurfaceItem[],
  projector: Projector,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const featureIndices: number[] = [];

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    color: [number, number, number],
    featureIndex: number,
  ) => {
    positions.push(x, y, z);
    colors.push(...color);
    featureIndices.push(featureIndex);
  };

  const pushTriangle = (
    vertices: Array<[number, number, number]>,
    color: [number, number, number],
    featureIndex: number,
  ) => {
    vertices.forEach(([x, y, z]) =>
      pushVertex(x, y, z, color, featureIndex),
    );
  };

  items.forEach((item) => {
    const topColor = colorComponents(item.fill);
    const sideColor = colorComponents(item.fill, 0.52);
    const topY = item.topY;
    item.rings.forEach((sourceRing) => {
      const ring = cleanRing(sourceRing);
      const contour = ring.map(([longitude, latitude]) => {
        const [x, z] = projector.point(longitude, latitude);
        return new THREE.Vector2(x, z);
      });
      const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      triangles.forEach(([a, b, c]) => {
        pushTriangle(
          [
            [contour[a].x, topY, contour[a].y],
            [contour[b].x, topY, contour[b].y],
            [contour[c].x, topY, contour[c].y],
          ],
          topColor,
          item.index,
        );
      });
      contour.forEach((point, index) => {
        const next = contour[(index + 1) % contour.length];
        pushTriangle(
          [
            [point.x, 0, point.y],
            [next.x, 0, next.y],
            [next.x, topY, next.y],
          ],
          sideColor,
          item.index,
        );
        pushTriangle(
          [
            [point.x, 0, point.y],
            [next.x, topY, next.y],
            [point.x, topY, point.y],
          ],
          sideColor,
          item.index,
        );
      });
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute(
    "featureIndex",
    new THREE.Float32BufferAttribute(featureIndices, 1),
  );
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildGroundwaterSurface(
  joined: JoinedMandal[],
  projector: Projector,
  relief = false,
): THREE.BufferGeometry {
  return buildSurface(
    joined.map((feature) => ({
      rings: feature.geometry.rings,
      fill: feature.fill,
      topY: mandalTopHeight(feature, relief),
      index: feature.geometryIndex,
    })),
    projector,
  );
}

export function buildDistrictSurface(
  aggregates: DistrictAggregate[],
  projector: Projector,
  relief = false,
): THREE.BufferGeometry {
  return buildSurface(
    aggregates.map((aggregate, index) => ({
      rings: aggregate.rings,
      fill: aggregate.fill,
      topY: depthToHeight(aggregate.meanDepthMeters, relief),
      index,
    })),
    projector,
  );
}

export function buildRingLines(
  rings: number[][][],
  projector: Projector,
  y = SURFACE_HEIGHT + 0.012,
): THREE.BufferGeometry {
  const positions: number[] = [];
  rings.forEach((sourceRing) => {
    const ring = cleanRing(sourceRing);
    ring.forEach((point, index) => {
      const next = ring[(index + 1) % ring.length];
      const [x1, z1] = projector.point(point[0], point[1]);
      const [x2, z2] = projector.point(next[0], next[1]);
      positions.push(x1, y, z1, x2, y, z2);
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export function buildAllMandalLines(
  joined: JoinedMandal[],
  projector: Projector,
): THREE.BufferGeometry {
  return buildRingLines(
    joined.flatMap((feature) => feature.geometry.rings),
    projector,
  );
}

export function buildDistrictLines(
  districts: DistrictGeometry,
  projector: Projector,
): THREE.BufferGeometry {
  return buildRingLines(
    districts.districts.flatMap((district) => district.rings),
    projector,
    SURFACE_HEIGHT + 0.035,
  );
}

export function sourceVertexCount(joined: JoinedMandal[]): number {
  return joined.reduce(
    (total, feature) =>
      total +
      feature.geometry.rings.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
    0,
  );
}

export function featureIndexFromIntersection(
  geometry: THREE.BufferGeometry,
  faceIndex: number | null | undefined,
): number | null {
  if (faceIndex === undefined || faceIndex === null) return null;
  const attribute = geometry.getAttribute("featureIndex");
  const vertexIndex = faceIndex * 3;
  if (!attribute || vertexIndex >= attribute.count) return null;
  return Math.round(attribute.getX(vertexIndex));
}
