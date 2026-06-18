import { dataAsOf, districtGeometry, districtRollups, mandals, titleCase } from "./data";

/** Mean year-on-year trend (m/yr) of a district's mandals — forward-looking signal.
 *  Positive = water tables deepening (worse). */
function districtTrends(): Record<string, number> {
  const acc: Record<string, { t: number; n: number }> = {};
  for (const m of mandals) {
    const t = m.trend_m_per_yr;
    if (t === null || t === undefined) continue;
    const k = m.district_name.toUpperCase();
    (acc[k] ??= { t: 0, n: 0 });
    acc[k].t += t;
    acc[k].n += 1;
  }
  const out: Record<string, number> = {};
  for (const k in acc) out[k] = acc[k].n ? acc[k].t / acc[k].n : 0;
  return out;
}

/* Deterministic irrigation advisory — translates the fused signals into a
   plain "draw / hold / conserve" action per district. This is the irrigation-
   planning payoff: where it is safe to draw groundwater this season and where
   to hold back. Rule-based and auditable; not a calibrated recommendation. */

export type IrrigationAction = "Draw" | "Hold" | "Conserve";

export type DistrictAdvisory = {
  id: string;
  district: string;
  action: IrrigationAction;
  reason: string;
  verifyFirst: boolean;
  seedCount: number;
  hasSensor: boolean;
  gw: number | null;
  balance: number | null;
  balanceStatus: string;
  trend: number | null;
  outlook: "deepening" | "recovering" | "stable";
};

export const ACTION_META: Record<IrrigationAction, { color: string; label: string; gloss: string }> = {
  Draw: { color: "#5e9b6b", label: "Safe to draw", gloss: "Recharge healthy — normal irrigation withdrawal is reasonable." },
  Hold: { color: "#d79b2e", label: "Hold / monitor", gloss: "Balanced — meter usage and watch recharge through the season." },
  Conserve: { color: "#c65a46", label: "Conserve", gloss: "Stress or deficit — restrict pumping, push drip/efficiency." },
};

export function districtAdvisories(): DistrictAdvisory[] {
  const rollups = districtRollups();
  const trends = districtTrends();
  return districtGeometry.districts
    .map((d) => {
      const gw = d.gw_percentile;
      const bal = d.water_balance_mm;
      const status = d.water_balance_status;
      const rollup = rollups.find((r) => r.district_name.toUpperCase() === d.d.toUpperCase());
      const verify = rollup?.verify_count ?? 0;
      const seedCount = rollup?.seed_count ?? 0;
      const trend = trends[d.d.toUpperCase()] ?? null;
      const outlook: DistrictAdvisory["outlook"] =
        trend === null ? "stable" : trend > 0.3 ? "deepening" : trend < -0.3 ? "recovering" : "stable";

      let action: IrrigationAction;
      let reason: string;
      if (status === "Deficit" || (gw !== null && gw < 30)) {
        action = "Conserve";
        reason = status === "Deficit"
          ? "Annual water balance is in deficit — demand meets or exceeds rainfall."
          : "Groundwater storage is low versus its own history.";
      } else if (status === "Surplus" && gw !== null && gw >= 90) {
        action = "Draw";
        reason = "Annual surplus and storage well above its historical norm.";
      } else {
        action = "Hold";
        reason = "Near-balanced budget — keep usage metered and monitor recharge.";
      }

      // Forward-looking: a strong deepening trend tightens the advisory ahead of next season.
      if (trend !== null && trend > 1.0 && action !== "Conserve") {
        action = "Conserve";
        reason = `Water tables deepening fast (~${trend.toFixed(1)} m/yr) — tighten draw ahead of next season.`;
      } else if (trend !== null && trend > 0.5 && action === "Draw") {
        action = "Hold";
        reason = `Surplus now, but water tables deepening (~${trend.toFixed(1)} m/yr) — meter usage.`;
      }
      return {
        id: d.d,
        district: titleCase(d.d),
        action,
        reason,
        verifyFirst: verify > 0,
        seedCount,
        hasSensor: seedCount > 0,
        gw,
        balance: bal,
        balanceStatus: status,
        trend: trend === null ? null : Math.round(trend * 100) / 100,
        outlook,
      };
    })
    .sort((a, b) => {
      const order: Record<IrrigationAction, number> = { Conserve: 0, Hold: 1, Draw: 2 };
      return order[a.action] - order[b.action];
    });
}

/* The shape we would push into AWARE — one advisory object per district.
   Field names mirror a generic alert/advisory contract; the live endpoint and
   exact schema come from RTGS. */
export type AwareAdvisoryRecord = {
  region_type: "district";
  region_name: string;
  advisory: IrrigationAction;
  gw_percentile: number | null;
  water_balance_mm: number | null;
  water_balance_status: string;
  verify_required: boolean;
  trend_outlook: "deepening" | "recovering" | "stable";
  trend_m_per_yr: number | null;
  data_basis: "satellite+sensor" | "satellite-only";
  source: string;
  as_of: string;
  balance_reference_year: string;
};

export function awarePayload(): AwareAdvisoryRecord[] {
  return districtAdvisories().map((a) => ({
    region_type: "district",
    region_name: a.district,
    advisory: a.action,
    gw_percentile: a.gw,
    water_balance_mm: a.balance,
    water_balance_status: a.balanceStatus,
    verify_required: a.verifyFirst,
    trend_outlook: a.outlook,
    trend_m_per_yr: a.trend,
    data_basis: a.hasSensor ? "satellite+sensor" : "satellite-only",
    source: "AP Groundwater Intelligence (prototype)",
    // Advisory freshness = latest sensor month; the annual water balance it draws on
    // is a completed-year figure (TerraClimate), kept separate so neither looks stale.
    as_of: dataAsOf || districtGeometry.balance_year,
    balance_reference_year: districtGeometry.balance_year,
  }));
}

export const AWARE_FIELD_MAP: { ours: string; aware: string; note: string }[] = [
  { ours: "region_name", aware: "admin_unit", note: "District (official mandal codes when APWRIMS export is available)" },
  { ours: "advisory", aware: "action_code", note: "Draw / Hold / Conserve → AWARE action enum" },
  { ours: "gw_percentile", aware: "stress_index", note: "GRACE storage percentile (0–100), not depth" },
  { ours: "water_balance_mm", aware: "water_balance", note: "Annual rainfall − ET (mm/yr)" },
  { ours: "verify_required", aware: "needs_ground_truth", note: "Flag where sensor & satellite disagree" },
  { ours: "trend_outlook", aware: "season_outlook", note: "Next-season direction from YoY trend (deepening / recovering / stable)" },
  { ours: "data_basis", aware: "confidence_basis", note: "satellite+sensor vs satellite-only (no ground sensor)" },
  { ours: "as_of", aware: "valid_for", note: "Advisory freshness — latest sensor month" },
  { ours: "balance_reference_year", aware: "balance_year", note: "Completed year of the annual water-balance input (TerraClimate)" },
];
