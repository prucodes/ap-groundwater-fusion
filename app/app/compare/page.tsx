"use client";

import { useState } from "react";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { AgreementTag, ConfidenceBadge, StatusBadge } from "../../components/Badges";
import { PercentileRing } from "../../components/charts";
import { WetnessTag } from "../../components/Signals";
import { LiveMap } from "../../components/LiveMap";
import { IconArrowRight, IconColumns } from "../../components/icons";
import { balanceMeta, formatNumber, mandals, titleCase, wetnessLabel } from "../../lib/data";
import type { MandalFusionSeed } from "../../lib/types";

function BalanceCell({ m }: { m: MandalFusionSeed }) {
  if (m.water_balance_mm === null || m.water_balance_mm === undefined) return <>—</>;
  const meta = balanceMeta(m.water_balance_status);
  return (
    <span style={{ color: meta.color, fontWeight: 600 }}>
      {m.water_balance_mm > 0 ? "+" : ""}
      {formatNumber(m.water_balance_mm)} mm · {meta.label}
    </span>
  );
}

function MandalPicker({
  value,
  onChange,
  exclude,
}: {
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
}) {
  return (
    <select className="compareSelect" value={value} onChange={(e) => onChange(e.target.value)}>
      {mandals
        .filter((m) => m.id !== exclude)
        .map((m) => (
          <option key={m.id} value={m.id}>
            {titleCase(m.mandal_name)} — {titleCase(m.district_name)}
          </option>
        ))}
    </select>
  );
}

function Row({ label, a, b, highlight }: { label: string; a: React.ReactNode; b: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`compareRow ${highlight ? "hl" : ""}`}>
      <div className="compareCell">{a}</div>
      <div className="compareLabel">{label}</div>
      <div className="compareCell">{b}</div>
    </div>
  );
}

function MandalColHead({ m }: { m: MandalFusionSeed }) {
  return (
    <div className="compareHead">
      <h3>{titleCase(m.mandal_name)}</h3>
      <span className="sub">{titleCase(m.district_name)} District</span>
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
        <StatusBadge bucket={m.status_bucket} />
        <ConfidenceBadge label={m.confidence_label} />
      </div>
      <div style={{ marginTop: 12 }}>
        <LiveMap mode="single" mandalId={m.id} height={190} />
      </div>
    </div>
  );
}

export default function ComparePage() {
  const [aId, setAId] = useState(mandals[0]?.id);
  const [bId, setBId] = useState(mandals[3]?.id ?? mandals[1]?.id);
  const a = mandals.find((m) => m.id === aId) ?? mandals[0];
  const b = mandals.find((m) => m.id === bId) ?? mandals[1];

  const rings = (m: MandalFusionSeed, key: "groundwater_percentile" | "rootzone_percentile" | "surface_percentile", color: string) => (
    <PercentileRing value={m[key]} color={color} size={64}>
      <span className="v" style={{ fontSize: 15 }}>{formatNumber(m[key])}</span>
    </PercentileRing>
  );

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Compare Mandals"
        subtitle={<>Side-by-side fusion comparison of any two mandals — APWRIMS readings vs NASA satellite-model signals.</>}
        showChips={false}
      />

      <section className="card">
        <div className="comparePickers">
          <MandalPicker value={a.id} onChange={setAId} exclude={b.id} />
          <span className="compareVs"><IconColumns /> vs</span>
          <MandalPicker value={b.id} onChange={setBId} exclude={a.id} />
        </div>

        <div className="compareGrid">
          <MandalColHead m={a} />
          <div className="compareSpacer" />
          <MandalColHead m={b} />
        </div>

        <div className="compareTable">
          <Row label="Median groundwater (APWRIMS)" a={<><b>{formatNumber(a.median_groundwater_mbgl)}</b> mbgl</>} b={<><b>{formatNumber(b.median_groundwater_mbgl)}</b> mbgl</>} highlight />
          <Row label="Sensor / station count" a={a.sensor_count} b={b.sensor_count} />
          <Row label="NASA groundwater pctl" a={rings(a, "groundwater_percentile", "#12b5cb")} b={rings(b, "groundwater_percentile", "#12b5cb")} highlight />
          <Row label="Root-zone moisture pctl" a={rings(a, "rootzone_percentile", "#5e9b6b")} b={rings(b, "rootzone_percentile", "#5e9b6b")} />
          <Row label="Surface moisture pctl" a={rings(a, "surface_percentile", "#3f86d6")} b={rings(b, "surface_percentile", "#3f86d6")} />
          <Row label="Wetness vs own history" a={<WetnessTag value={a.measured_wetness_percentile ?? null} />} b={<WetnessTag value={b.measured_wetness_percentile ?? null} />} />
          <Row
            label="Evapotranspiration (annual)"
            a={a.annual_et_mm !== null ? <><b>{formatNumber(a.annual_et_mm)}</b> mm</> : "—"}
            b={b.annual_et_mm !== null ? <><b>{formatNumber(b.annual_et_mm)}</b> mm</> : "—"}
          />
          <Row
            label="Water balance (annual)"
            a={<BalanceCell m={a} />}
            b={<BalanceCell m={b} />}
            highlight
          />
          <Row label="Sensor–satellite agreement" a={<AgreementTag value={a.sensor_satellite_agreement} />} b={<AgreementTag value={b.sensor_satellite_agreement} />} highlight />
          <Row label="Confidence" a={<ConfidenceBadge label={a.confidence_label} />} b={<ConfidenceBadge label={b.confidence_label} />} />
          <Row label="Latest reading" a={a.latest_sensor_date || "—"} b={b.latest_sensor_date || "—"} />
          <Row
            label="Recommended action"
            a={<span style={{ fontSize: 12, color: "var(--muted)" }}>{a.recommended_action.split(".")[0]}.</span>}
            b={<span style={{ fontSize: 12, color: "var(--muted)" }}>{b.recommended_action.split(".")[0]}.</span>}
          />
        </div>

        <div className="compareLinks">
          <Link className="linkAction" href={`/mandals/${a.id}`}>Open {titleCase(a.mandal_name)} <IconArrowRight /></Link>
          <Link className="linkAction" href={`/mandals/${b.id}`}>Open {titleCase(b.mandal_name)} <IconArrowRight /></Link>
        </div>
      </section>

      <div className="protoBanner">
        <span className="bannerIcon"><IconColumns /></span>
        <span>
          Comparison uses real APWRIMS readings (2014-2026) and real NASA/NDMC GRACE-DA percentiles (0–100, not depth).
          <strong> Prototype</strong> — not official results.
        </span>
      </div>
    </div>
  );
}
