import {
  datasetManifest,
  districtGeometry,
  districtRollups,
  mandals,
  monsoonWatch,
  titleCase,
} from "./data";

/** Median year-on-year trend (m/yr) of a district's mandals.
 *  Positive = water tables deepening (worse). Median, not mean, so one mandal
 *  with a displaced well cannot carry a district. */
function districtTrends(): Record<string, number> {
  const acc: Record<string, number[]> = {};
  for (const m of mandals) {
    const t = m.trend_m_per_yr;
    if (t === null || t === undefined) continue;
    (acc[m.district_name.toUpperCase()] ??= []).push(t);
  }
  const out: Record<string, number> = {};
  for (const k in acc) {
    const sorted = [...acc[k]].sort((a, b) => a - b);
    out[k] = sorted[Math.floor(sorted.length / 2)];
  }
  return out;
}

/* Prototype monitoring classification. Groundwater depth, trend and this
   season's measured recharge determine the review tier; climate balance is
   displayed only as context and cannot create a pumping recommendation.

   THE TIER IS COMPARATIVE, AND DELIBERATELY SO. The rule this replaces used
   absolute cuts -- "any mandal in stress" and "trend over 1.0 m/yr" -- and put
   all 28 districts in the top tier. 386 of 670 mandals carry a stress
   indicator and the median district trend is 1.58 m/yr, so both tests were
   true everywhere and the output carried no information. Worse, both were
   denominated in quantities that grow when the model improves, so any fresh
   absolute cut would saturate again at the next model change.

   Every component below is instead the district's distance ABOVE a statewide
   figure computed from the same data. "Everywhere is stressed" cannot make
   everywhere a priority, because the statewide figure moves with it. */

/** Weights: one point per ten percentage points of extra stressed mandals, per
 *  half a metre a year of extra deepening, and per ten points of extra mandals
 *  short of their own recharge this season. */
const STRESS_POINTS_PER = 10;
const TREND_POINTS_PER = 0.5;
const SHORTFALL_POINTS_PER = 10;
/** Where the priority list stops. This is a judgement about how long a list a
 *  district office can act on in a month -- not a claim that a district below
 *  it is safe. It currently yields eleven districts of twenty-eight. */
const REVIEW_SCORE = 3.0;
/** A season this far short reaches the list on its own, without waiting for the
 *  multi-year trend to catch up. */
const SHORT_SEASON_SHARE = 0.35;
/** Field verify is about whether a district's readings can be relied on at all,
 *  not about how stressed it is. Three or more mandals whose readings contradict
 *  their own signal is a data problem before it is a water problem. */
const VERIFY_MANDALS = 3;

export type IrrigationAction = "Monitor" | "Review" | "Field verify";

export type DistrictAdvisory = {
  id: string;
  district: string;
  action: IrrigationAction;
  reason: string;
  verifyFirst: boolean;
  verifyMandals: number;
  seedCount: number;
  hasSensor: boolean;
  gw: number | null;
  balance: number | null;
  balanceStatus: string;
  trend: number | null;
  outlook: "deepening" | "recovering" | "stable";
  priorityScore: number;
  stressShare: number | null;
  rechargeShortShare: number | null;
  rechargeFlagged: number | null;
  rechargeCompared: number | null;
  stateMedianTrend: number;
};

export const ACTION_META: Record<IrrigationAction, { color: string; label: string; gloss: string }> = {
  Monitor: { color: "#5e9b6b", label: "Monitor", gloss: "Below the prototype review threshold; not a safety clearance." },
  Review: { color: "#d79b2e", label: "Review history", gloss: "Measurably worse than the state; review the measured history first." },
  "Field verify": { color: "#c65a46", label: "Field verify", gloss: "Coverage or consistency checks require field corroboration." },
};

/** This season's recharge, per district, from the monsoon watch. A measured
 *  change in depth between two readings of the same well -- the same class of
 *  evidence as the trend, and admissible here for the same reason. Rainfall and
 *  the ocean state are not, and do not appear. */
function rechargeByDistrict(): Record<string, { flagged: number; compared: number }> {
  const acc: Record<string, { flagged: number; compared: number }> = {};
  for (const m of monsoonWatch.mandals) {
    const key = m.district.toUpperCase();
    (acc[key] ??= { flagged: 0, compared: 0 });
    acc[key].compared += 1;
    if (m.status !== "normal") acc[key].flagged += 1;
  }
  return acc;
}

/** The statewide figures every district is measured against. */
function stateNorms() {
  const withBucket = mandals.filter((m) => m.status_bucket);
  const stressShare = withBucket.length
    ? withBucket.filter((m) => m.status_bucket === "Stress").length / withBucket.length
    : 0;
  const trends = mandals
    .map((m) => m.trend_m_per_yr)
    .filter((t): t is number => t !== null && t !== undefined)
    .sort((a, b) => a - b);
  const medianTrend = trends.length ? trends[Math.floor(trends.length / 2)] : 0;
  const recharge = Object.values(rechargeByDistrict());
  const compared = recharge.reduce((sum, r) => sum + r.compared, 0);
  const shortShare = compared ? recharge.reduce((sum, r) => sum + r.flagged, 0) / compared : 0;
  return { stressShare, medianTrend, shortShare };
}

export function districtAdvisories(): DistrictAdvisory[] {
  const rollups = districtRollups();
  const trends = districtTrends();
  const recharge = rechargeByDistrict();
  const norms = stateNorms();

  return districtGeometry.districts
    .map((d) => {
      const key = d.d.toUpperCase();
      const gw = d.gw_percentile;
      const bal = d.water_balance_mm;
      const status = d.water_balance_status;
      const rollup = rollups.find((r) => r.district_name.toUpperCase() === key);
      const verify = rollup?.verify_count ?? 0;
      const seedCount = rollup?.seed_count ?? 0;
      const stressShare = rollup && rollup.seed_count ? rollup.stress_count / rollup.seed_count : null;
      const trend = trends[key] ?? null;
      const season = recharge[key] ?? null;
      const shortShare = season && season.compared ? season.flagged / season.compared : null;

      const parts: string[] = [];
      let score = 0;
      if (stressShare !== null) {
        const over = Math.max(0, stressShare - norms.stressShare);
        score += over * 100 / STRESS_POINTS_PER;
        if (over > 0) {
          parts.push(`${Math.round(stressShare * 100)}% of its mandals carry a stress indicator against ${Math.round(norms.stressShare * 100)}% statewide`);
        }
      }
      if (trend !== null) {
        const over = Math.max(0, trend - norms.medianTrend);
        score += over / TREND_POINTS_PER;
        if (over > 0) {
          parts.push(`its median mandal is deepening ${trend.toFixed(1)} m/yr against ${norms.medianTrend.toFixed(1)} statewide`);
        }
      }
      if (shortShare !== null) {
        const over = Math.max(0, shortShare - norms.shortShare);
        score += over * 100 / SHORTFALL_POINTS_PER;
        if (over > 0 && season) {
          parts.push(`${season.flagged} of ${season.compared} source series carry provisional seasonal shortfall flags against ${Math.round(norms.shortShare * 100)}% statewide`);
        }
      }
      score = Math.round(score * 100) / 100;

      let action: IrrigationAction;
      let reason: string;
      if (!seedCount) {
        action = "Field verify";
        reason = "No reconciled mandal groundwater history is available for this prototype district rollup.";
      } else if (verify >= VERIFY_MANDALS) {
        action = "Field verify";
        reason = `${verify} mandals have verification flags; inspect observation history and model-band checks before interpreting the district figures.`;
      } else if (score >= REVIEW_SCORE || (shortShare !== null && shortShare >= SHORT_SEASON_SHARE)) {
        action = "Review";
        reason = parts.length
          ? `Worse than the state on measured signals: ${parts.join("; ")}. Review the history before the rabi allocation.`
          : "Measured signals place this district above the statewide norm; review the history.";
      } else {
        action = "Monitor";
        reason = "Below the comparative review threshold; continue monitoring. This does not establish adequate groundwater supply.";
      }
      reason += status ? ` Climate-balance context: ${status.toLowerCase()} (not direct recharge).` : "";

      return {
        id: d.d,
        district: titleCase(d.d),
        action,
        reason,
        // What the pill says: this district's readings need ground truth before
        // its figures are used. Holding a single such mandal is worth printing
        // as a count, but it is not an instruction to verify the district.
        verifyFirst: verify >= VERIFY_MANDALS || !seedCount,
        verifyMandals: verify,
        seedCount,
        hasSensor: seedCount > 0,
        gw,
        balance: bal,
        balanceStatus: status,
        trend: trend === null ? null : Math.round(trend * 100) / 100,
        outlook:
          trend === null ? "stable" : trend > 0.3 ? "deepening" : trend < -0.3 ? "recovering" : "stable",
        priorityScore: score,
        stressShare: stressShare === null ? null : Math.round(stressShare * 1000) / 1000,
        rechargeShortShare: shortShare === null ? null : Math.round(shortShare * 1000) / 1000,
        rechargeFlagged: season ? season.flagged : null,
        rechargeCompared: season ? season.compared : null,
        stateMedianTrend: Math.round(norms.medianTrend * 100) / 100,
      } as DistrictAdvisory;
    })
    .sort((a, b) => {
      const order: Record<IrrigationAction, number> = { "Field verify": 0, Review: 1, Monitor: 2 };
      if (order[a.action] !== order[b.action]) return order[a.action] - order[b.action];
      // Within a tier the score is the ordering a reader actually wants: the
      // tier is a coarse band, the score says where to start.
      return b.priorityScore - a.priorityScore;
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
  priority_score: number;
  stress_share: number | null;
  recharge_short_share: number | null;
  data_basis: "groundwater_history+context" | "context_only";
  source: string;
  as_of: string;
  balance_reference_year: string;
  operational_use: false;
  method_status: "seasonal_baseline_review_pending";
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
    priority_score: a.priorityScore,
    stress_share: a.stressShare,
    recharge_short_share: a.rechargeShortShare,
    data_basis: a.hasSensor ? "groundwater_history+context" : "context_only",
    source: "AP Groundwater Intelligence (unreleased AWARE preview; official schema and field verification required)",
    // Advisory freshness = latest sensor month; the annual water balance it draws on
    // is a completed-year figure (TerraClimate), kept separate so neither looks stale.
    as_of: datasetManifest.periods.latestObservationPeriod || districtGeometry.balance_year,
    balance_reference_year: districtGeometry.balance_year,
    operational_use: false,
    method_status: "seasonal_baseline_review_pending",
  }));
}

export const AWARE_FIELD_MAP: { ours: string; aware: string; note: string }[] = [
  { ours: "region_name", aware: "admin_unit", note: "District (official mandal codes when APWRIMS export is available)" },
  { ours: "advisory", aware: "action_code", note: "Unreleased Monitor / Review / Field verify preview; official enum not supplied" },
  { ours: "gw_percentile", aware: "stress_index", note: "GRACE storage percentile (0–100), not depth" },
  { ours: "water_balance_mm", aware: "water_balance", note: "Annual rainfall − ET (mm/yr)" },
  { ours: "verify_required", aware: "needs_ground_truth", note: "Flag for field verification" },
  { ours: "trend_outlook", aware: "season_outlook", note: "Measured year-on-year direction, not a future forecast" },
  { ours: "priority_score", aware: "priority_rank", note: "Distance above the statewide norm on stressed mandals, deepening trend and this season's recharge; comparative, not absolute" },
  { ours: "recharge_short_share", aware: "season_recharge_gap", note: "Share of the district's mandals short of their own ten-year recharge normal this season" },
  { ours: "data_basis", aware: "confidence_basis", note: "Groundwater-history coverage versus context-only" },
  { ours: "as_of", aware: "valid_for", note: "Latest observation period" },
  { ours: "balance_reference_year", aware: "balance_year", note: "Completed year of the annual water-balance input (TerraClimate)" },
];
