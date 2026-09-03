"use client";

import { useMemo, useState } from "react";
import { HeaderHero } from "../../components/HeaderHero";
import { AgreementTag, ConfidenceBadge } from "../../components/Badges";
import { SelectedMandalPanel } from "../../components/SelectedMandalPanel";
import { PercentileBar } from "../../components/Signals";
import { ExportCsvButton } from "../../components/ExportButtons";
import {
  IconActivity,
  IconAlert,
  IconInfo,
  IconShield,
  IconTarget,
} from "../../components/icons";
import { balanceMeta, districts, formatNumber, mandals, titleCase, watchlistMandals } from "../../lib/data";
import type { MandalGroundwaterView } from "../../lib/types";

const MAX_DEPTH = 25;

function reasonFor(m: MandalGroundwaterView) {
  if (m.sensor_satellite_agreement === "declining_despite_positive_climate_balance") {
    return "Measured decline despite a positive climatic water balance — context mismatch to verify";
  }
  if (m.sensor_satellite_agreement === "declining_without_positive_climate_balance") {
    return "Measured decline without a positive climatic water balance — review history";
  }
  if (m.confidence_label.toLowerCase().includes("low")) {
    return "Sparse history — collect more readings";
  }
  return "Deep or deepening water table — monitor";
}

const summaryCards = [
  {
    key: "total",
    label: "Total to Review",
    meta: "non-normal mandals",
    icon: <IconActivity />,
    bg: "var(--st-low-bg)",
    color: "#5f5494",
    accent: false,
    count: (rows: MandalGroundwaterView[]) => rows.length,
  },
  {
    key: "strong",
    label: "Context mismatch",
    meta: "decline despite positive balance",
    icon: <IconAlert />,
    bg: "var(--st-verify-bg)",
    color: "#b0432f",
    accent: true,
    count: (rows: MandalGroundwaterView[]) =>
      rows.filter((r) => r.sensor_satellite_agreement === "declining_despite_positive_climate_balance").length,
  },
  {
    key: "moderate",
    label: "Decline + climate context",
    meta: "without positive balance",
    icon: <IconTarget />,
    bg: "var(--st-watch-bg)",
    color: "#a9741a",
    accent: false,
    count: (rows: MandalGroundwaterView[]) =>
      rows.filter((r) => r.sensor_satellite_agreement === "declining_without_positive_climate_balance").length,
  },
  {
    key: "low",
    label: "Low Confidence",
    meta: "single recent reading",
    icon: <IconShield />,
    bg: "var(--st-low-bg)",
    color: "#5f5494",
    accent: false,
    count: (rows: MandalGroundwaterView[]) =>
      rows.filter((r) => r.confidence_label.toLowerCase().includes("low")).length,
  },
  {
    key: "insufficient",
    label: "Insufficient Data",
    meta: "below threshold",
    icon: <IconInfo />,
    bg: "var(--st-insufficient-bg)",
    color: "#5d6b7e",
    accent: false,
    count: (rows: MandalGroundwaterView[]) => rows.filter((r) => r.status_bucket === "Insufficient Data").length,
  },
];

export default function WatchlistPage() {
  const base = watchlistMandals();
  const [district, setDistrict] = useState("all");
  const [agreement, setAgreement] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [selectedId, setSelectedId] = useState(base[0]?.id);

  const filtered = useMemo(
    () =>
      base.filter((m) => {
        if (district !== "all" && m.district_name !== district) return false;
        if (agreement !== "all" && m.sensor_satellite_agreement !== agreement) return false;
        if (confidence !== "all" && !m.confidence_label.toLowerCase().includes(confidence)) return false;
        return true;
      }),
    [base, district, agreement, confidence],
  );

  const current = mandals.find((m) => m.id === selectedId) ?? filtered[0] ?? base[0];

  function reset() {
    setDistrict("all");
    setAgreement("all");
    setConfidence("all");
  }

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Groundwater Monitoring Watchlist"
        subtitle={
          <>
            Mandals ranked for review using measured depth/trend and explicit data coverage. Climate-balance categories
            are contextual patterns to investigate, not causal attribution or pumping instructions.
          </>
        }
        showChips={false}
        variant="compact"
      />

      <div className="summaryRow stagger">
        {summaryCards.map((c) => (
          <div className={`summaryCard ${c.accent ? "accent" : ""}`} key={c.key}>
            <span className="summaryIcon" style={{ background: c.bg, color: c.color }}>
              {c.icon}
            </span>
            <div className="summaryNum">{c.count(base)}</div>
            <div className="summaryLbl">{c.label}</div>
            <div className="summaryMeta">{c.meta}</div>
          </div>
        ))}
      </div>

      <section className="card" style={{ padding: 0 }}>
        <div className="filterRow">
          <div className="selectField">
            <label>District</label>
            <select value={district} onChange={(e) => setDistrict(e.target.value)}>
              <option value="all">All Districts</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {titleCase(d)}
                </option>
              ))}
            </select>
          </div>
          <div className="selectField">
            <label>Signal</label>
            <select value={agreement} onChange={(e) => setAgreement(e.target.value)}>
              <option value="all">All Signals</option>
              <option value="declining_despite_positive_climate_balance">Decline despite positive balance</option>
              <option value="declining_without_positive_climate_balance">Decline without positive balance</option>
              <option value="stable_or_recovering">Stable / recovering</option>
            </select>
          </div>
          <div className="selectField">
            <label>Confidence</label>
            <select value={confidence} onChange={(e) => setConfidence(e.target.value)}>
              <option value="all">All Confidence</option>
              <option value="verify">Verify</option>
              <option value="low">Low</option>
            </select>
          </div>
          <button className="resetBtn" type="button" onClick={reset}>
            Reset Filters
          </button>
          <span className="filterCount">
            Showing <strong>{filtered.length}</strong> of {base.length} mandals
          </span>
          <ExportCsvButton rows={filtered} filename="ap_watchlist_prototype.csv" />
        </div>
      </section>

      <div className="watchlistLayout">
        <section className="card">
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>District</th>
                  <th>Mandal</th>
                  <th>Sensor Signal (Median)</th>
                  <th>NASA GW</th>
                  <th>Root-Zone</th>
                  <th>Surface</th>
                  <th>Water Balance</th>
                  <th>Agreement</th>
                  <th>Confidence</th>
                  <th>Reason for Flag</th>
                  <th>Recommended Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const depthPct = Math.min(100, ((m.median_groundwater_mbgl ?? 0) / MAX_DEPTH) * 100);
                  return (
                    <tr
                      key={m.id}
                      className={selectedId === m.id ? "selected" : ""}
                      onClick={() => setSelectedId(m.id)}
                    >
                      <td>
                        <span className="cellRank">{i + 1}</span>
                      </td>
                      <td>{titleCase(m.district_name)}</td>
                      <td className="cellStrong">{titleCase(m.mandal_name)}</td>
                      <td>
                        <div className="depthBar">
                          <span className="depthTrack">
                            <span className="depthFill" style={{ width: `${depthPct}%` }} />
                          </span>
                          <span className="depthVal">
                            {formatNumber(m.median_groundwater_mbgl)} <small>mbgl</small>
                          </span>
                        </div>
                      </td>
                      <td><PercentileBar value={m.groundwater_percentile} /></td>
                      <td><PercentileBar value={m.rootzone_percentile} /></td>
                      <td><PercentileBar value={m.surface_percentile} /></td>
                      <td>
                        {m.water_balance_status ? (
                          <span
                            className="badge"
                            style={{
                              color: balanceMeta(m.water_balance_status).color,
                              background: `${balanceMeta(m.water_balance_status).color}1f`,
                            }}
                          >
                            <span className="dot" /> {balanceMeta(m.water_balance_status).label}
                          </span>
                        ) : (
                          <span style={{ color: "var(--muted-2)" }}>—</span>
                        )}
                      </td>
                      <td>
                        <AgreementTag value={m.sensor_satellite_agreement} />
                      </td>
                      <td>
                        <ConfidenceBadge label={m.confidence_label} />
                      </td>
                      <td style={{ maxWidth: 170, color: "var(--muted)" }}>{reasonFor(m)}</td>
                      <td style={{ maxWidth: 200 }}>{m.recommended_action.split(".")[0]}.</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", color: "var(--muted)", padding: 28 }}>
                      No mandals match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="fusionNote" style={{ marginTop: 16 }}>
            <IconInfo />
            <span>
              <strong>Why these mandals are flagged:</strong> real APWRIMS readings (2014-2026) and NASA satellite-model
              percentiles disagree, or confidence is low on a single recent reading. NASA values are percentiles
              (0–100), not groundwater depth. Resolve with official APWRIMS data and official mandal boundaries.
            </span>
          </div>
        </section>

        {current && <SelectedMandalPanel mandal={current} />}
      </div>
    </div>
  );
}
