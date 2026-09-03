import Link from "next/link";
import type { CSSProperties } from "react";
import type { MandalGroundwaterView } from "../lib/types";
import { agreementMeta, balanceMeta, formatNumber, sampleForMandal, statusMeta, titleCase } from "../lib/data";
import { AgreementTag } from "./Badges";
import { IconArrowRight, IconDroplet, IconFlask, IconSatellite, IconTarget } from "./icons";

export function SelectedMandalPanel({ mandal }: { mandal: MandalGroundwaterView }) {
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
          <span className="k">Observation records</span>
          <span className="v">{mandal.observation_record_count}</span>
        </div>
        <div className="kvRow">
          <span className="k">Observation period</span>
          <span className="v">{mandal.latest_observation_period || "—"}</span>
        </div>
        <div className="kvRow">
          <span className="k">Source</span>
          <span className="v">APWRIMS (AP-GWD)</span>
        </div>
        <div className="sideCaveat">APWRIMS readings (session sample · authorization pending); level estimates are modelled (β), not official results.</div>
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconTarget /> Measured &amp; Modelled Values
        </div>
        <div className="sideCaveat">
          These are not competing sensor readings. APWRIMS is observed depth history; the β value is this app&apos;s calculated
          mandal groundwater level for the current target period.
        </div>
        {mandal.display_basis === "measured" && (mandal.display_mbgl ?? null) !== null && (
          <div className="kvRow">
            <span className="k">Latest measured mandal aggregate</span>
            <span className="v">{formatNumber(mandal.display_mbgl)} mbgl · {mandal.latest_observation_period}</span>
          </div>
        )}
        <div className="kvRow">
          <span className="k">Calculated level β</span>
          <span className="v">
            {formatNumber(mandal.estimate_mbgl)} mbgl
            {(mandal.estimate_band_p10 ?? null) !== null && (
              <span className="muted"> · model P10–P90 {formatNumber(mandal.estimate_band_p10)}–{formatNumber(mandal.estimate_band_p90)} mbgl</span>
            )}
          </span>
        </div>
        {(mandal.obs_model_gap_m ?? 0) >= 8 ? (
          <div className="sideCaveat" style={{ color: "var(--rust)", fontWeight: 600 }}>
            ⚠ The latest measured aggregate differs by {formatNumber(mandal.obs_model_gap_m)} m from the nowcast — review before use.
          </div>
        ) : (
          <div className="sideCaveat">
            No forecast horizon is released. The displayed range is a model P10–P90 quantile range, not a guaranteed confidence interval.
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
          GRACE-DA is regional model-assimilated wetness context, not a direct mandal groundwater-depth measurement.
        </div>
      </div>

      <div className="sideSection">
        <div className="sideSectionTitle">
          <IconTarget /> Fusion &amp; Agreement
        </div>
        <div className="kvRow">
          <span className="k">Climate context vs measured trend</span>
          <span className="v">
            <AgreementTag value={mandal.sensor_satellite_agreement} />
          </span>
        </div>
        <div className="kvRow">
          <span className="k">Data completeness class</span>
          <span className="v">{mandal.confidence_label}</span>
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
          <IconDroplet /> Monitoring Note
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

function agreementReason(m: MandalGroundwaterView) {
  const a = agreementMeta(m.sensor_satellite_agreement).label;
  if (m.sensor_satellite_agreement === "declining_despite_positive_climate_balance") {
    return `${a}. This is a context mismatch to investigate, not a causal attribution.`;
  }
  if (m.sensor_satellite_agreement === "declining_without_positive_climate_balance") {
    return `${a}. Climate balance is contextual and does not directly measure recharge.`;
  }
  return `${a}. Modelled nowcasts remain a prototype and should be checked against official field observations.`;
}
