import type { MandalGroundwaterRecordV2 } from "../../lib/types";

export type ModelEstimateDisplay = {
  label: "Held-out model estimate" | "Model estimate";
  explanation: string;
  samePeriodAsObservation: boolean;
  absoluteDifferenceM: number | null;
  observationInsideInterval: boolean | null;
};

/**
 * The active Phase 0 bundle predicts each mandal's deliberately excluded latest
 * target row. Keep that evaluation context explicit rather than promoting the
 * contract's historical `nowcast` field name to an operational claim.
 */
export function modelEstimateDisplay(
  record: MandalGroundwaterRecordV2,
): ModelEstimateDisplay | null {
  const estimate = record.nowcast;
  if (!estimate) return null;

  const observation = record.observation;
  const samePeriodAsObservation = Boolean(
    observation?.observationPeriod &&
      observation.observationPeriod === estimate.targetPeriod,
  );
  const isPhase0HeldOutEstimate =
    estimate.modelVersion === "phase0-nowcast-2.0.0" &&
    record.provenance.builderScriptVersion === "phase0-publisher-2.0.0";
  const absoluteDifferenceM =
    samePeriodAsObservation && observation
      ? Math.abs(observation.latestMeasuredValue - estimate.value)
      : null;
  const observationInsideInterval =
    samePeriodAsObservation && observation
      ? observation.latestMeasuredValue >= estimate.lower &&
        observation.latestMeasuredValue <= estimate.upper
      : null;

  return {
    label: isPhase0HeldOutEstimate
      ? "Held-out model estimate"
      : "Model estimate",
    explanation: isPhase0HeldOutEstimate
      ? "Evaluation estimate generated without the target-period observation."
      : "Generation context is not sufficient to treat this as an operational nowcast.",
    samePeriodAsObservation,
    absoluteDifferenceM,
    observationInsideInterval,
  };
}
