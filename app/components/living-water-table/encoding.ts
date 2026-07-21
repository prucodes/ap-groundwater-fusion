import type { GroundwaterCoverageStatus } from "../../lib/types";
import type { DepthCategory, VisualCategory } from "./types";

export const DEPTH_CATEGORIES: ReadonlyArray<{
  key: DepthCategory;
  label: string;
  minInclusive: number;
  maxExclusive: number | null;
  color: string;
}> = [
  { key: "near_surface", label: "Near surface", minInclusive: 0, maxExclusive: 2, color: "#b8f2d9" },
  { key: "very_shallow", label: "Very shallow", minInclusive: 2, maxExclusive: 10, color: "#65d9d4" },
  { key: "shallow", label: "Shallow", minInclusive: 10, maxExclusive: 20, color: "#27b5dc" },
  { key: "moderate", label: "Moderate", minInclusive: 20, maxExclusive: 30, color: "#1680d5" },
  { key: "deep", label: "Deep", minInclusive: 30, maxExclusive: 40, color: "#1759bd" },
  { key: "very_deep", label: "Very deep", minInclusive: 40, maxExclusive: 60, color: "#183d91" },
  { key: "extremely_deep", label: "Extremely deep", minInclusive: 60, maxExclusive: null, color: "#17295f" },
];

export const COVERAGE_STYLES: Record<
  Exclude<VisualCategory, DepthCategory>,
  { label: string; color: string }
> = {
  measured_only: { label: "Measured only", color: "#f0c96a" },
  boundary_only: { label: "Boundary only", color: "#506275" },
  no_data: { label: "No data", color: "#344454" },
  excluded: { label: "Excluded", color: "#745f93" },
  invalid_model_value: { label: "Invalid model value", color: "#7c4650" },
};

export function depthCategory(value: number | null | undefined): DepthCategory | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  return (
    DEPTH_CATEGORIES.find(
      (category) =>
        value >= category.minInclusive &&
        (category.maxExclusive === null || value < category.maxExclusive),
    )?.key ?? "extremely_deep"
  );
}

export function categoryForRecord(
  coverageStatus: GroundwaterCoverageStatus,
  nowcastValue: number | null,
): VisualCategory {
  if (coverageStatus !== "modelled") return coverageStatus;
  return depthCategory(nowcastValue) ?? "invalid_model_value";
}

export function colorForCategory(category: VisualCategory): string {
  const depth = DEPTH_CATEGORIES.find((candidate) => candidate.key === category);
  return depth?.color ?? COVERAGE_STYLES[category as keyof typeof COVERAGE_STYLES].color;
}

export function labelForCategory(category: VisualCategory): string {
  const depth = DEPTH_CATEGORIES.find((candidate) => candidate.key === category);
  return depth?.label ?? COVERAGE_STYLES[category as keyof typeof COVERAGE_STYLES].label;
}

export function depthRangeLabel(
  minInclusive: number,
  maxExclusive: number | null,
): string {
  if (maxExclusive === null) return `≥ ${minInclusive} m bgl`;
  if (minInclusive === 0) return `< ${maxExclusive} m bgl`;
  return `${minInclusive}–<${maxExclusive} m bgl`;
}
