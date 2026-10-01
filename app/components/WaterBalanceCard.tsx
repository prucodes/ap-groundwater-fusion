import type { MandalGroundwaterView } from "../lib/types";
import { balanceMeta, formatNumber } from "../lib/data";
import { IconCloudRain, IconLeaf } from "./icons";

/* Climatic context only: annual precipitation minus modelled actual ET. */
export function WaterBalanceCard({ mandal, year }: { mandal: MandalGroundwaterView; year?: string }) {
  const et = mandal.annual_et_mm;
  const net = mandal.water_balance_mm;
  if (et === null || et === undefined || net === null || net === undefined) return null;

  const supply = et + net; // annual precipitation = ET + (precip - ET)
  const max = Math.max(supply, et, 1);
  const meta = balanceMeta(mandal.water_balance_status);
  const note = "Rainfall minus modelled actual ET is climatic context, not crop water requirement, groundwater recharge, pumping or safe yield.";

  return (
    <div>
      <div className="wbRows">
        <div className="wbRow">
          <span className="wbLabel">
            <IconCloudRain /> Annual rainfall
          </span>
          <span className="wbTrack">
            <span className="wbFill supply" style={{ width: `${(supply / max) * 100}%` }} />
          </span>
          <span className="wbVal">{formatNumber(supply)} mm</span>
        </div>
        <div className="wbRow">
          <span className="wbLabel">
            <IconLeaf /> Modelled actual ET
          </span>
          <span className="wbTrack">
            <span className="wbFill demand" style={{ width: `${(et / max) * 100}%` }} />
          </span>
          <span className="wbVal">{formatNumber(et)} mm</span>
        </div>
      </div>

      <div className="wbNet">
        <div>
          <span className="wbNetLabel">Annual rainfall minus actual ET</span>
          <span className="wbNetValue" style={{ color: meta.color }}>
            {net > 0 ? "+" : ""}
            {formatNumber(net)} mm
          </span>
        </div>
        <span className="badge" style={{ color: meta.color, background: `${meta.color}1f` }}>
          <span className="dot" /> {meta.label}
        </span>
      </div>

      <p className="wbNote">{note}</p>
      <div className="sideCaveat" style={{ marginTop: 10 }}>
        TerraClimate {year || ""} annual actual ET vs rainfall (~4 km, modeled). Not groundwater depth
        or a field irrigation instruction.
      </div>
    </div>
  );
}
