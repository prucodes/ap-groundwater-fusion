import type { MandalFusionSeed } from "../lib/types";
import { formatNumber, statusMeta } from "../lib/data";
import { IconArrowRight, IconInfo } from "./icons";

export function FusionExplanationCard({ mandal }: { mandal: MandalFusionSeed }) {
  const meta = statusMeta(mandal.status_bucket);
  const sig = mandal.sensor_satellite_agreement;
  const est = formatNumber(mandal.estimate_mbgl);
  const band = formatNumber(((mandal.estimate_band_p90 ?? 0) - (mandal.estimate_band_p10 ?? 0)) / 2);
  const recharge = mandal.water_balance_status || "—";

  const note =
    sig === "over_extraction"
      ? `Pumping-pressure hypothesis (verify): the water table is falling even though the climatic water balance is ${recharge.toLowerCase()}. That pattern is consistent with extraction outpacing recharge — a candidate for demand management, to be confirmed with field data.`
      : sig === "drought_decline"
      ? `Climate-stress hypothesis (verify): the water table is falling alongside a rainfall deficit (${recharge}). Consistent with a climate-driven decline; recovery is plausible with better monsoon recharge.`
      : `Stable / recovering: the water table is holding or rising, consistent with a ${recharge.toLowerCase()} water balance.`;

  return (
    <div>
      <div className="fusionFlow">
        <div className="fusionNode">
          <div className="nodeLabel">Measured · APWRIMS</div>
          <div className="nodeVal">{formatNumber(mandal.median_groundwater_mbgl)} mbgl</div>
          <div className="metricSub">sensor history</div>
        </div>
        <span className="fusionArrow">
          <IconArrowRight />
        </span>
        <div className="fusionNode">
          <div className="nodeLabel">Satellite recharge</div>
          <div className="nodeVal" style={{ color: "var(--sig-gw)" }}>
            {formatNumber(mandal.rainfall_mm)} mm
          </div>
          <div className="metricSub">balance: {recharge}</div>
        </div>
        <span className="fusionArrow">
          <IconArrowRight />
        </span>
        <div className="fusionNode verdict">
          <div className="nodeLabel">Fused estimate β</div>
          <div className="nodeVal" style={{ color: meta.color }}>
            {est} m
          </div>
          <div className="metricSub">±{band} m · {meta.label}</div>
        </div>
      </div>
      <div className="fusionNote">
        <IconInfo />
        <span>{note}</span>
      </div>
    </div>
  );
}
