"use client";

import { useRouter } from "next/navigation";
import type { MandalGroundwaterView } from "../lib/types";
import { formatNumber, titleCase } from "../lib/data";
import { AgreementTag, ConfidenceBadge } from "./Badges";

const MAX_DEPTH = 25; // mbgl scale ceiling for the depth gauge

function trendLabel(m: MandalGroundwaterView) {
  const t = m.trend_m_per_yr ?? 0;
  if (t > 0.1) return { txt: `↓ ${t.toFixed(1)} m/yr`, color: "var(--rust)" };
  if (t < -0.1) return { txt: `↑ ${Math.abs(t).toFixed(1)} m/yr`, color: "var(--green)" };
  return { txt: "≈ stable", color: "var(--muted)" };
}

export function MandalTable({
  rows,
  limit,
  selectedId,
  onSelect,
}: {
  rows: MandalGroundwaterView[];
  limit?: number;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const data = limit ? rows.slice(0, limit) : rows;

  function activate(m: MandalGroundwaterView) {
    if (onSelect) onSelect(m.id);
    else router.push(`/mandals/${m.id}`);
  }

  return (
    <div className="tableWrap">
      <table className="dataTable">
        <thead>
          <tr>
            <th>#</th>
            <th>District</th>
            <th>Mandal</th>
            <th>Measured (median)</th>
            <th>Est. Level β</th>
            <th>Trend</th>
            <th>Signal</th>
            <th>Confidence</th>
            <th>Status</th>
            <th>Recommended Action</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m) => {
            const depthPct = Math.min(100, ((m.median_groundwater_mbgl ?? 0) / MAX_DEPTH) * 100);
            return (
              <tr
                key={m.id}
                className={selectedId === m.id ? "selected" : ""}
                onClick={() => activate(m)}
              >
                <td>
                  <span className="cellRank">{m.rank}</span>
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
                <td>
                  <span className="cellPct">
                    {formatNumber(m.estimate_mbgl)} <small>m</small>
                    <small>±{formatNumber(((m.estimate_band_p90 ?? 0) - (m.estimate_band_p10 ?? 0)) / 2)} m</small>
                  </span>
                </td>
                <td style={{ color: trendLabel(m).color, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {trendLabel(m).txt}
                </td>
                <td>
                  <AgreementTag value={m.sensor_satellite_agreement} />
                </td>
                <td>
                  <ConfidenceBadge label={m.confidence_label} />
                </td>
                <td style={{ maxWidth: 170, color: "var(--ink-soft)" }}>{m.status}</td>
                <td style={{ maxWidth: 220 }}>{m.recommended_action.split(".")[0]}.</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
