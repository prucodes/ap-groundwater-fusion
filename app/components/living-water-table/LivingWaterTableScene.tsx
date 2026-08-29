"use client";

import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three/examples/jsm/controls/OrbitControls.js";
import type { DistrictGeometry, MapGeometry } from "../../lib/types";
import {
  buildAllMandalLines,
  buildDistrictLines,
  buildDistrictSurface,
  buildGroundwaterSurface,
  buildRingLines,
  createProjector,
  featureIndexFromIntersection,
  mandalTopHeight,
  sourceVertexCount,
} from "./geometry";
import type {
  CameraCommand,
  DistrictAggregate,
  JoinedMandal,
  MapGranularity,
  ResolvedQuality,
  ScenePerformance,
} from "./types";

type Props = {
  joined: JoinedMandal[];
  districtGeometry: DistrictGeometry;
  districtAggregates: DistrictAggregate[];
  bbox: MapGeometry["bbox"];
  quality: ResolvedQuality;
  relief: boolean;
  granularity: MapGranularity;
  selectedMandalId: string | null;
  cameraCommand: CameraCommand;
  onHover: (feature: JoinedMandal | null, position?: { x: number; y: number }) => void;
  onDistrictHover: (
    aggregate: DistrictAggregate | null,
    position?: { x: number; y: number },
  ) => void;
  onSelect: (mandalId: string | null) => void;
  onContextLost: () => void;
  onSceneReady: (performance: ScenePerformance) => void;
  loadStartedAt: number;
};

const INITIAL_CAMERA: [number, number, number] = [0, 8.8, 11.8];

export const CAMERA_FOV = 36;

export function defaultCameraFraming(
  bbox: MapGeometry["bbox"],
  aspect: number,
) {
  const projector = createProjector(bbox);
  const verticalFov = THREE.MathUtils.degToRad(CAMERA_FOV);
  // The floor keeps a degenerate viewport from pushing the camera to infinity,
  // but it must sit below a portrait phone's aspect (375/729 ~ 0.51). At 0.8 the
  // scene was framed as if the screen were wider than it is, so the state was
  // cropped off both edges on a phone.
  const horizontalFov =
    2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(aspect, 0.35));
  const boundsPadding = 1.15;
  const distance = Math.max(
    (projector.height * boundsPadding) / (2 * Math.tan(verticalFov / 2)),
    (projector.width * boundsPadding) / (2 * Math.tan(horizontalFov / 2)),
  );
  const direction = new THREE.Vector3(0, 0.48, 0.877).normalize();
  return {
    distance,
    position: direction.multiplyScalar(distance),
    target: new THREE.Vector3(0, 0.035, 0),
    minDistance: distance * 0.68,
    maxDistance: distance * 2.1,
  };
}

function CameraRig({
  command,
  bbox,
}: {
  command: CameraCommand;
  bbox: MapGeometry["bbox"];
}) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const initialized = useRef(false);
  const { camera, gl, invalidate, size } = useThree();

  useEffect(() => {
    const framing = defaultCameraFraming(
      bbox,
      size.width / Math.max(size.height, 1),
    );
    const orbit = new OrbitControlsImpl(camera, gl.domElement);
    camera.position.copy(framing.position);
    orbit.target.copy(framing.target);
    orbit.enableDamping = false;
    orbit.enablePan = true;
    orbit.panSpeed = 0.45;
    orbit.rotateSpeed = 0.55;
    orbit.zoomSpeed = 0.75;
    orbit.minDistance = framing.minDistance;
    orbit.maxDistance = framing.maxDistance;
    orbit.minPolarAngle = 0.34;
    orbit.maxPolarAngle = 1.22;
    const onChange = () => {
      orbit.target.x = THREE.MathUtils.clamp(orbit.target.x, -2.2, 2.2);
      orbit.target.z = THREE.MathUtils.clamp(orbit.target.z, -2.2, 2.2);
      invalidate();
    };
    orbit.addEventListener("change", onChange);
    orbit.update();
    controls.current = orbit;
    initialized.current = true;
    invalidate();
    return () => {
      orbit.removeEventListener("change", onChange);
      orbit.dispose();
      controls.current = null;
    };
  }, [bbox, camera, gl, invalidate, size.height, size.width]);

  useEffect(() => {
    const orbit = controls.current;
    if (!orbit || !initialized.current || command.sequence === 0) return;
    const framing = defaultCameraFraming(
      bbox,
      size.width / Math.max(size.height, 1),
    );
    if (command.type === "reset") {
      camera.position.copy(framing.position);
      orbit.target.copy(framing.target);
      orbit.minDistance = framing.minDistance;
      orbit.maxDistance = framing.maxDistance;
    } else {
      const direction = camera.position.clone().sub(orbit.target);
      direction.multiplyScalar(command.type === "zoom_in" ? 0.82 : 1.22);
      const length = THREE.MathUtils.clamp(
        direction.length(),
        framing.minDistance,
        framing.maxDistance,
      );
      direction.setLength(length);
      camera.position.copy(orbit.target).add(direction);
    }
    camera.lookAt(orbit.target);
    camera.updateProjectionMatrix();
    orbit.update();
    invalidate();
  }, [bbox, camera, command, invalidate, size.height, size.width]);

  return null;
}

function ContextLifecycle({ onContextLost }: { onContextLost: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", lost, false);
    return () => canvas.removeEventListener("webglcontextlost", lost, false);
  }, [gl, onContextLost]);
  return null;
}

function PerformanceProbe({
  base,
  onReady,
}: {
  base: Omit<
    ScenePerformance,
    "drawCalls" | "triangles" | "geometries" | "textures" | "initialLoadMs"
  >;
  onReady: (performance: ScenePerformance) => void;
}) {
  const sent = useRef(false);
  const frameCount = useRef(0);
  useFrame(({ gl, invalidate }) => {
    if (sent.current) return;
    frameCount.current += 1;
    if (frameCount.current < 2) {
      invalidate();
      return;
    }
    sent.current = true;
    onReady({
      ...base,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      initialLoadMs: null,
    });
  });
  return null;
}

function GroundwaterMapMesh({
  joined,
  districtGeometry,
  bbox,
  relief,
  selectedMandalId,
  onHover,
  onSelect,
  onSceneReady,
}: Omit<
  Props,
  | "quality"
  | "granularity"
  | "districtAggregates"
  | "onDistrictHover"
  | "cameraCommand"
  | "onContextLost"
  | "loadStartedAt"
>) {
  const projector = useMemo(() => createProjector(bbox), [bbox]);
  const surfaceGeometry = useMemo(
    () => buildGroundwaterSurface(joined, projector, relief),
    [joined, projector, relief],
  );
  const mandalLines = useMemo(
    () => buildAllMandalLines(joined, projector),
    [joined, projector],
  );
  const districtLines = useMemo(
    () => buildDistrictLines(districtGeometry, projector),
    [districtGeometry, projector],
  );
  const selected = useMemo(
    () =>
      selectedMandalId
        ? joined.find((feature) => feature.record.identity.mandalId === selectedMandalId) ??
          null
        : null,
    [joined, selectedMandalId],
  );
  const selectedLines = useMemo(
    () =>
      selected
        ? buildRingLines(
            selected.geometry.rings,
            projector,
            mandalTopHeight(selected, relief) + 0.06,
          )
        : null,
    [projector, selected, relief],
  );
  const selectedSurface = useMemo(() => {
    if (!selected) return null;
    const geometry = buildGroundwaterSurface([selected], projector, relief);
    geometry.translate(0, 0.035, 0);
    return geometry;
  }, [projector, selected, relief]);

  useEffect(
    () => () => {
      surfaceGeometry.dispose();
      mandalLines.dispose();
      districtLines.dispose();
    },
    [districtLines, mandalLines, surfaceGeometry],
  );
  useEffect(
    () => () => {
      selectedLines?.dispose();
      selectedSurface?.dispose();
    },
    [selectedLines, selectedSurface],
  );

  const featureFromEvent = <T extends MouseEvent,>(event: ThreeEvent<T>) => {
    const featureIndex = featureIndexFromIntersection(
      surfaceGeometry,
      event.faceIndex,
    );
    return featureIndex === null
      ? null
      : joined.find((feature) => feature.geometryIndex === featureIndex) ?? null;
  };

  const pointerPosition = <T extends MouseEvent,>(event: ThreeEvent<T>) => {
    const native = event.nativeEvent;
    return { x: native.offsetX, y: native.offsetY };
  };

  return (
    <group>
      <mesh
        geometry={surfaceGeometry}
        onPointerMove={(event) => {
          event.stopPropagation();
          onHover(featureFromEvent(event), pointerPosition(event));
        }}
        onPointerOut={() => onHover(null)}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(featureFromEvent(event)?.record.identity.mandalId ?? null);
        }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.86}
          metalness={0.02}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={mandalLines}>
        <lineBasicMaterial color="#c5f8ff" transparent opacity={0.2} />
      </lineSegments>
      <lineSegments geometry={districtLines}>
        <lineBasicMaterial color="#eafcff" transparent opacity={0.5} />
      </lineSegments>
      {selectedSurface ? (
        <mesh geometry={selectedSurface} renderOrder={3}>
          <meshStandardMaterial
            color="#7be8ef"
            transparent
            opacity={0.28}
            roughness={0.38}
            metalness={0.03}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      ) : null}
      {selectedLines ? (
        <lineSegments geometry={selectedLines} renderOrder={4}>
          <lineBasicMaterial
            color="#fff0a8"
            transparent
            opacity={1}
            depthTest={false}
          />
        </lineSegments>
      ) : null}
      <PerformanceProbe
        base={{
          sourceVertexCount: sourceVertexCount(joined),
          surfaceVertexCount: surfaceGeometry.getAttribute("position").count,
          boundaryVertexCount:
            mandalLines.getAttribute("position").count +
            districtLines.getAttribute("position").count,
        }}
        onReady={onSceneReady}
      />
    </group>
  );
}

function DistrictMapMesh({
  aggregates,
  districtGeometry,
  bbox,
  relief,
  onDistrictHover,
  onSceneReady,
}: {
  aggregates: DistrictAggregate[];
  districtGeometry: DistrictGeometry;
  bbox: MapGeometry["bbox"];
  relief: boolean;
  onDistrictHover: (
    aggregate: DistrictAggregate | null,
    position?: { x: number; y: number },
  ) => void;
  onSceneReady: (performance: ScenePerformance) => void;
}) {
  const projector = useMemo(() => createProjector(bbox), [bbox]);
  const surfaceGeometry = useMemo(
    () => buildDistrictSurface(aggregates, projector, relief),
    [aggregates, projector, relief],
  );
  const districtLines = useMemo(
    () => buildDistrictLines(districtGeometry, projector),
    [districtGeometry, projector],
  );
  const sourceVertices = useMemo(
    () =>
      aggregates.reduce(
        (total, aggregate) =>
          total +
          aggregate.rings.reduce(
            (ringTotal, ring) => ringTotal + ring.length,
            0,
          ),
        0,
      ),
    [aggregates],
  );

  useEffect(
    () => () => {
      surfaceGeometry.dispose();
      districtLines.dispose();
    },
    [districtLines, surfaceGeometry],
  );

  const aggregateFromEvent = <T extends MouseEvent,>(event: ThreeEvent<T>) => {
    const index = featureIndexFromIntersection(surfaceGeometry, event.faceIndex);
    return index === null ? null : aggregates[index] ?? null;
  };
  const pointerPosition = <T extends MouseEvent,>(event: ThreeEvent<T>) => {
    const native = event.nativeEvent;
    return { x: native.offsetX, y: native.offsetY };
  };

  return (
    <group>
      <mesh
        geometry={surfaceGeometry}
        onPointerMove={(event) => {
          event.stopPropagation();
          onDistrictHover(aggregateFromEvent(event), pointerPosition(event));
        }}
        onPointerOut={() => onDistrictHover(null)}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.86}
          metalness={0.02}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments geometry={districtLines}>
        <lineBasicMaterial color="#eafcff" transparent opacity={0.6} />
      </lineSegments>
      <PerformanceProbe
        base={{
          sourceVertexCount: sourceVertices,
          surfaceVertexCount: surfaceGeometry.getAttribute("position").count,
          boundaryVertexCount: districtLines.getAttribute("position").count,
        }}
        onReady={onSceneReady}
      />
    </group>
  );
}

export function LivingWaterTableScene(props: Props) {
  const dpr: [number, number] =
    props.quality === "reduced" ? [1, 1.15] : [1, 1.65];
  const handleSceneReady = (performance: ScenePerformance) =>
    props.onSceneReady({
      ...performance,
      initialLoadMs:
        typeof window === "undefined"
          ? null
          : Math.round(performanceNow() - props.loadStartedAt),
    });
  return (
    <Canvas
      key={props.quality}
      camera={{ position: INITIAL_CAMERA, fov: CAMERA_FOV, near: 0.1, far: 80 }}
      dpr={dpr}
      frameloop="demand"
      gl={{
        antialias: props.quality === "standard",
        alpha: false,
        powerPreference:
          props.quality === "reduced" ? "low-power" : "high-performance",
      }}
      onPointerMissed={() => props.onSelect(null)}
    >
      <color attach="background" args={["#04111f"]} />
      <fog attach="fog" args={["#04111f", 15, 31]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={["#bcefff", "#030a12", 0.85]} />
      <directionalLight position={[3, 9, 7]} intensity={1.9} color="#e2fbff" />
      <directionalLight position={[-7, 3, -4]} intensity={0.7} color="#2f7fae" />
      <directionalLight position={[0, 2, -9]} intensity={0.34} color="#79dfea" />
      <mesh position={[0, -0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[12, 11]} />
        <meshStandardMaterial color="#03101c" roughness={1} metalness={0} />
      </mesh>
      {props.quality === "standard" ? (
        <gridHelper args={[12, 20]} position={[0, -0.035, 0]}>
          <lineBasicMaterial
            attach="material"
            color="#27455a"
            transparent
            opacity={0.07}
          />
        </gridHelper>
      ) : null}
      {props.granularity === "district" ? (
        <DistrictMapMesh
          aggregates={props.districtAggregates}
          districtGeometry={props.districtGeometry}
          bbox={props.bbox}
          relief={props.relief}
          onDistrictHover={props.onDistrictHover}
          onSceneReady={handleSceneReady}
        />
      ) : (
        <GroundwaterMapMesh
          joined={props.joined}
          districtGeometry={props.districtGeometry}
          bbox={props.bbox}
          relief={props.relief}
          selectedMandalId={props.selectedMandalId}
          onHover={props.onHover}
          onSelect={props.onSelect}
          onSceneReady={handleSceneReady}
        />
      )}
      <CameraRig command={props.cameraCommand} bbox={props.bbox} />
      <ContextLifecycle onContextLost={props.onContextLost} />
    </Canvas>
  );
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
