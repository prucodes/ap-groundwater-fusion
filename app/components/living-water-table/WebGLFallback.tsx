"use client";

import { useMemo } from "react";
import { createProjector } from "./geometry";
import type { JoinedMandal } from "./types";
import styles from "./living-water-table.module.css";

function pathForFeature(
  feature: JoinedMandal,
  point: (longitude: number, latitude: number) => [number, number],
): string {
  return feature.geometry.rings
    .map((ring) =>
      ring
        .map(([longitude, latitude], index) => {
          const [x, y] = point(longitude, latitude);
          return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" ")
        .concat(" Z"),
    )
    .join(" ");
}

export function WebGLFallback({
  joined,
  bbox,
  selectedMandalId,
  reason,
  onSelect,
  onRetry3D,
}: {
  joined: JoinedMandal[];
  bbox: [number, number, number, number];
  selectedMandalId: string | null;
  reason: string;
  onSelect: (mandalId: string) => void;
  onRetry3D: () => void;
}) {
  const paths = useMemo(() => {
    const sourceProjector = createProjector(bbox);
    const width = 1000;
    const height = 780;
    return joined.map((feature) => ({
      feature,
      path: pathForFeature(feature, (longitude, latitude) => {
        const [x, y] = sourceProjector.point(longitude, latitude);
        return [
          ((x + sourceProjector.width / 2) / sourceProjector.width) * width,
          height -
            ((y + sourceProjector.height / 2) / sourceProjector.height) * height,
        ];
      }),
    }));
  }, [bbox, joined]);

  return (
    <div className={styles.fallback} data-testid="living-water-table-fallback">
      <div className={styles.fallbackNotice}>
        <div>
          <strong>Accessible 2D fallback</strong>
          <span>{reason}</span>
        </div>
        <button type="button" onClick={onRetry3D}>
          Retry 3D
        </button>
      </div>
      <svg
        className={styles.fallbackMap}
        viewBox="0 0 1000 780"
        role="img"
        aria-label="Two-dimensional Andhra Pradesh mandal groundwater map"
      >
        {paths.map(({ feature, path }) => {
          const selected =
            feature.record.identity.mandalId === selectedMandalId;
          return (
            <path
              d={path}
              fill={feature.fill}
              stroke={selected ? "#f7d777" : "rgba(220,248,255,.45)"}
              strokeWidth={selected ? 3.5 : 0.75}
              key={feature.boundaryId}
              onClick={() => onSelect(feature.record.identity.mandalId)}
            />
          );
        })}
      </svg>
      <p className={styles.fallbackHelp}>
        The same 670 boundary states and V2 records remain selectable. Use the
        keyboard mandal selector for a non-canvas alternative.
      </p>
    </div>
  );
}
