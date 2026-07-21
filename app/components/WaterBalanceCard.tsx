import type { MandalGroundwaterView } from "../lib/types";
import { balanceMeta, formatNumber } from "../lib/data";
import { IconCloudRain, IconLeaf } from "./icons";

/* Annual water balance: rainfall (supply) vs actual ET (demand) → net.
   Negative/near-zero net = demand met by stored/groundwater (overdraft pressure). */
export function WaterBalanceCard({ mandal, year }: { mandal: MandalGroundwaterView; year?: string }) {
  const et = mandal.annual_et_mm;
  const net = mandal.water_balance_mm;
  if (et === null || et === undefined || net === null || net === undefined) return null;

  const supply = et + net; // annual precipitation = ET + (precip - ET)
  const max = Math.max(supply, et, 1);
  const meta = balanceMeta(mandal.water_balance_status);
  const deficit = mandal.water_balance_status === "Deficit";

  const note = deficit
    ? "Crop + atmospheric demand nearly equals or exceeds rainfall — the shortfall is met by stored / groundwater, i.e. overdraft pressure."
    : "Rainfall comfortably exceeds demand — conditions favour recharge over the year.";

  return (
    <div>
      <div className="wbRows">
        <div className="wbRow">
          <span className="wbLabel">
            <IconCloudRain /> Rainfall (supply)
          </span>
          <span className="wbTrack">
            <span className="wbFill supply" style={{ width: `${(supply / max) * 100}%` }} />
          </span>
          <span className="wbVal">{formatNumber(supply)} mm</span>
        </div>
        <div className="wbRow">
          <span className="wbLabel">
            <IconLeaf /> Evapotranspiration (demand)
          </span>
          <span className="wbTrack">
            <span className="wbFill demand" style={{ width: `${(et / max) * 100}%` }} />
          </span>
          <span className="wbVal">{formatNumber(et)} mm</span>
        </div>
      </div>

      <div className="wbNet">
        <div>
          <span className="wbNetLabel">Net annual balance</span>
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
        TerraClimate {year || ""} annual actual ET vs rainfall (~4 km, modeled). Recharge-vs-demand context — not
        groundwater depth.
      </div>
    </div>
  );
}
