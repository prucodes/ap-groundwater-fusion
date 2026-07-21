import { datasetManifest, districtGeometry, districtRollups, mandals, titleCase } from "./data";

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

/* Prototype monitoring classification. Groundwater depth/trend determines the
   review tier; climate balance is displayed only as context and cannot create a
   pumping recommendation. */

export type IrrigationAction = "Monitor" | "Review" | "Field verify";

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
  Monitor: { color: "#5e9b6b", label: "Monitor", gloss: "Continue observation and history review." },
  Review: { color: "#d79b2e", label: "Review history", gloss: "Review measured trends and contextual signals." },
  "Field verify": { color: "#c65a46", label: "Field verify", gloss: "Confirm the current groundwater level before operational use." },
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
      if (!seedCount) {
        action = "Field verify";
        reason = "No reconciled mandal groundwater history is available for this prototype district rollup.";
      } else if (verify > 0 || (trend !== null && trend > 1.0)) {
        action = "Field verify";
        reason = `Groundwater history includes stress or a strong deepening trend${trend !== null ? ` (~${trend.toFixed(1)} m/yr)` : ""}.`;
      } else if (trend !== null && trend > 0.3) {
        action = "Review";
        reason = `Measured groundwater trend is deepening (~${trend.toFixed(1)} m/yr); review the history.`;
      } else {
        action = "Monitor";
        reason = "No strong groundwater deepening signal in the available measured/modelled records.";
      }
      reason += status ? ` Climate-balance context: ${status.toLowerCase()} (not direct recharge).` : "";
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
      const order: Record<IrrigationAction, number> = { "Field verify": 0, Review: 1, Monitor: 2 };
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
  data_basis: "groundwater_history+context" | "context_only";
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
    data_basis: a.hasSensor ? "groundwater_history+context" : "context_only",
    source: "AP Groundwater Intelligence (unreleased AWARE preview; official schema and field verification required)",
    // Advisory freshness = latest sensor month; the annual water balance it draws on
    // is a completed-year figure (TerraClimate), kept separate so neither looks stale.
    as_of: datasetManifest.periods.latestObservationPeriod || districtGeometry.balance_year,
    balance_reference_year: districtGeometry.balance_year,
  }));
}

export const AWARE_FIELD_MAP: { ours: string; aware: string; note: string }[] = [
  { ours: "region_name", aware: "admin_unit", note: "District (official mandal codes when APWRIMS export is available)" },
  { ours: "advisory", aware: "action_code", note: "Unreleased Monitor / Review / Field verify preview; official enum not supplied" },
  { ours: "gw_percentile", aware: "stress_index", note: "GRACE storage percentile (0–100), not depth" },
  { ours: "water_balance_mm", aware: "water_balance", note: "Annual rainfall − ET (mm/yr)" },
  { ours: "verify_required", aware: "needs_ground_truth", note: "Flag for field verification" },
  { ours: "trend_outlook", aware: "season_outlook", note: "Measured year-on-year direction, not a future forecast" },
  { ours: "data_basis", aware: "confidence_basis", note: "Groundwater-history coverage versus context-only" },
  { ours: "as_of", aware: "valid_for", note: "Latest observation period" },
  { ours: "balance_reference_year", aware: "balance_year", note: "Completed year of the annual water-balance input (TerraClimate)" },
];
