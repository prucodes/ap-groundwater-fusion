import type { MandalGroundwaterView } from "../lib/types";
import { formatNumber, statusMeta } from "../lib/data";
import { IconArrowRight, IconInfo } from "./icons";

export function FusionExplanationCard({ mandal }: { mandal: MandalGroundwaterView }) {
  const meta = statusMeta(mandal.status_bucket);
  const sig = mandal.sensor_satellite_agreement;
  const est = formatNumber(mandal.estimate_mbgl);
  const interval = `${formatNumber(mandal.estimate_band_p10)}–${formatNumber(mandal.estimate_band_p90)}`;
  const climateBalance = mandal.water_balance_status || "—";

  const note =
    sig === "declining_despite_positive_climate_balance"
      ? `The measured trend is declining while the climatic water balance is ${climateBalance.toLowerCase()}. This is a context mismatch to investigate, not evidence of a specific cause.`
      : sig === "declining_without_positive_climate_balance"
      ? `The measured trend is declining without a positive climatic water balance (${climateBalance}). Climate balance remains context and is not direct recharge.`
      : sig === "unknown"
      ? "Context agreement is unknown because one or more required fields are missing."
      : `The measured trend is stable or recovering. The ${climateBalance.toLowerCase()} climate balance is supporting context only.`;

  return (
    <div>
      <div className="fusionFlow">
        <div className="fusionNode">
          <div className="nodeLabel">Measured · APWRIMS</div>
          <div className="nodeVal">{formatNumber(mandal.median_groundwater_mbgl)} mbgl</div>
          <div className="metricSub">{mandal.observation_month_count} observation months</div>
        </div>
        <span className="fusionArrow">
          <IconArrowRight />
        </span>
        <div className="fusionNode">
          <div className="nodeLabel">Rainfall / ET context</div>
          <div className="nodeVal" style={{ color: "var(--sig-gw)" }}>
            {formatNumber(mandal.rainfall_mm)} mm
          </div>
          <div className="metricSub">climate balance: {climateBalance}</div>
        </div>
        <span className="fusionArrow">
          <IconArrowRight />
        </span>
        <div className="fusionNode verdict">
          <div className="nodeLabel">Modelled nowcast</div>
          <div className="nodeVal" style={{ color: meta.color }}>
            {est} m
          </div>
          <div className="metricSub">model P10–P90 {interval} m · {meta.label}</div>
        </div>
      </div>
      <div className="fusionNote">
        <IconInfo />
        <span>{note}</span>
      </div>
    </div>
  );
}
