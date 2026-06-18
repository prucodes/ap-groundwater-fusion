import Link from "next/link";
import type { CSSProperties } from "react";
import type { MandalFusionSeed } from "../lib/types";
import { agreementMeta, balanceMeta, formatNumber, sampleForMandal, statusMeta, titleCase } from "../lib/data";
import { AgreementTag } from "./Badges";
import { IconArrowRight, IconDroplet, IconFlask, IconSatellite, IconTarget } from "./icons";

export function SelectedMandalPanel({ mandal }: { mandal: MandalFusionSeed }) {
  const meta = statusMeta(mandal.status_bucket);
  const sample = sampleForMandal(mandal);

  return (
    <div className="sidePanel sidePanelSelect" key={mandal.id} style={{ "--accent": meta.color } as CSSProperties}>
      <div className="sidePanelHead">
        <h3>{titleCase(mandal.mandal_name)}</h3>
        <div className="sub">{titleCase(mandal.district_name)} District · Mandal ID {mandal.id}</div>
        <div className="sidePanelChips">
          <span className="badge" style={{ background: meta.color, color: "#fff" }}>
            {meta.label}
          </span>
          <span className="badge">{mandal.confidence_label} Confidence</span>
        </div>
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconFlask /> Measured Input · APWRIMS (APWRIMS-format)
        </div>
        <div className="kvRow">
          <span className="k">Median groundwater</span>
          <span className="v">{formatNumber(mandal.median_groundwater_mbgl)} mbgl</span>
        </div>
        <div className="kvRow">
          <span className="k">Sensor / station count</span>
          <span className="v">{mandal.sensor_count}</span>
        </div>
        <div className="kvRow">
          <span className="k">Latest reading</span>
          <span className="v">{mandal.latest_sensor_date || "—"}</span>
        </div>
        <div className="kvRow">
          <span className="k">Source</span>
          <span className="v">APWRIMS (AP-GWD)</span>
        </div>
        <div className="sideCaveat">APWRIMS readings (session sample · authorization pending); level estimates are modelled (β), not official results.</div>
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconTarget /> Level &amp; Next-Month Forecast
        </div>
        {mandal.display_basis === "measured" && (mandal.display_mbgl ?? null) !== null && (
          <div className="kvRow">
            <span className="k">Latest measured (sensor)</span>
            <span className="v">{formatNumber(mandal.display_mbgl)} mbgl · {mandal.latest_sensor_date}</span>
          </div>
        )}
        <div className="kvRow">
          <span className="k">Model nowcast (this month)</span>
          <span className="v">
            {formatNumber(mandal.estimate_mbgl)} m
            {(mandal.estimate_band_p10 ?? null) !== null && (
              <span className="muted"> · band {formatNumber(mandal.estimate_band_p10)}–{formatNumber(mandal.estimate_band_p90)}</span>
            )}
          </span>
        </div>
        {(mandal.forecast_next_month_mbgl ?? null) !== null && (
          <div className="kvRow">
            <span className="k">Next month (projected)</span>
            <span className="v" style={{ color: (mandal.trend_m_per_yr ?? 0) > 0 ? "var(--rust)" : "var(--green)" }}>
              {formatNumber(mandal.forecast_next_month_mbgl)} m {(mandal.trend_m_per_yr ?? 0) > 0 ? "↓ deepening" : "↑ recovering"}
            </span>
          </div>
        )}
        {(mandal.obs_model_gap_m ?? 0) >= 8 ? (
          <div className="sideCaveat" style={{ color: "var(--rust)", fontWeight: 600 }}>
            ⚠ Sensor reading diverges {formatNumber(mandal.obs_model_gap_m)} m from the model — flagged for field verification.
          </div>
        ) : (
          <div className="sideCaveat">
            Forecast is a linear projection from the model trend (±{formatNumber(mandal.estimate_band_p90 != null && mandal.estimate_band_p10 != null ? Math.round(((mandal.estimate_band_p90 - mandal.estimate_band_p10) / 2) * 10) / 10 : null)} m band). Backtest MAE ≈ 1.3 m.
          </div>
        )}
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconSatellite /> NASA Satellite-Model Signal (GRACE-DA)
        </div>
        <div className="kvRow">
          <span className="k">Groundwater percentile</span>
          <span className="v">{formatNumber(mandal.groundwater_percentile)}</span>
        </div>
        <div className="kvRow">
          <span className="k">Root-zone percentile</span>
          <span className="v">{formatNumber(mandal.rootzone_percentile)}</span>
        </div>
        <div className="kvRow">
          <span className="k">Surface percentile</span>
          <span className="v">{formatNumber(mandal.surface_percentile)}</span>
        </div>
        {mandal.rainfall_mm !== null && mandal.rainfall_mm !== undefined && (
          <div className="kvRow">
            <span className="k">Recent rainfall (CHIRPS)</span>
            <span className="v">{formatNumber(mandal.rainfall_mm)} mm</span>
          </div>
        )}
        <div className="kvRow">
          <span className="k">Sample / fetch date</span>
          <span className="v">{sample?.satellite_sample_date_or_fetch_date || "—"}</span>
        </div>
        <div className="sideCaveat">
          Percentiles (0–100), not groundwater depth. Sources: NASA/NDMC GRACE-DA + CHIRPS rainfall.
        </div>
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconTarget /> Fusion &amp; Agreement
        </div>
        <div className="kvRow">
          <span className="k">Recharge vs decline</span>
          <span className="v">
            <AgreementTag value={mandal.sensor_satellite_agreement} />
          </span>
        </div>
        <div className="kvRow">
          <span className="k">Confidence score</span>
          <span className="v">{Math.round((mandal.confidence_score ?? 0) * 100)} / 100</span>
        </div>
        {mandal.water_balance_mm !== null && mandal.water_balance_mm !== undefined && (
          <div className="kvRow">
            <span className="k">Water balance (annual)</span>
            <span className="v" style={{ color: balanceMeta(mandal.water_balance_status).color }}>
              {mandal.water_balance_mm > 0 ? "+" : ""}
              {formatNumber(mandal.water_balance_mm)} mm · {balanceMeta(mandal.water_balance_status).label}
            </span>
          </div>
        )}
        <div className="sideCaveat">{agreementReason(mandal)}</div>
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconDroplet /> Recommended Action
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5 }}>
          {mandal.recommended_action}
        </p>
        <Link className="linkAction" href={`/mandals/${mandal.id}`} style={{ marginTop: 12 }}>
          Open full mandal insight <IconArrowRight />
        </Link>
      </div>
    </div>
  );
}

function agreementReason(m: MandalFusionSeed) {
  const a = agreementMeta(m.sensor_satellite_agreement).label;
  if (m.sensor_satellite_agreement === "over_extraction") {
    return `${a}: water table falling despite a healthy water balance — consistent with extraction outpacing recharge. Verify in the field before demand-management action.`;
  }
  if (m.sensor_satellite_agreement === "drought_decline") {
    return `${a}: water table falling alongside a rainfall deficit — climate-stress hypothesis (verify); recovery plausible with better monsoon recharge.`;
  }
  return `${a}: water table holding or recovering. Modelled estimate (β), confirm with official APWRIMS data.`;
}
