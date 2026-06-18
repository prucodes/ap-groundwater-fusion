import type { MandalFusionSeed } from "./types";
import { mandals } from "./data";

/* ============================================================
   Early-warning engine — a transparent, deterministic severity model.

   It does NOT invent data: it scores the coincidence of independent risk
   signals we already have (deep seed reading, sensor↔satellite disagreement,
   annual water deficit, low confidence). The weights and tiers are explicit so
   the output is auditable for governance — no black box.
   ============================================================ */

export type Severity = "Critical" | "High" | "Watch" | "Normal";

export type AlertFactor = { label: string; weight: number };

export type MandalAlert = {
  mandal: MandalFusionSeed;
  score: number;
  severity: Severity;
  factors: AlertFactor[];
  leadAction: string;
};

export const SEVERITY_META: Record<Severity, { color: string; className: string; label: string }> = {
  Critical: { color: "#c65a46", className: "critical", label: "Critical" },
  High: { color: "#e07b39", className: "high", label: "High" },
  Watch: { color: "#d79b2e", className: "watch", label: "Watch" },
  Normal: { color: "#5e9b6b", className: "normal", label: "Normal" },
};

function severityFor(score: number): Severity {
  if (score >= 6) return "Critical";
  if (score >= 4) return "High";
  if (score >= 1) return "Watch";
  return "Normal";
}

function leadActionFor(severity: Severity): string {
  switch (severity) {
    case "Critical":
      return "Dispatch field verification; review bore-well permits pending official APWRIMS confirmation.";
    case "High":
      return "Schedule a piezometer re-survey and review irrigation/cropping context this cycle.";
    case "Watch":
      return "Monitor; corroborate with additional recent station readings.";
    default:
      return "No action — within expected range.";
  }
}

export function alertFor(m: MandalFusionSeed): MandalAlert {
  const factors: AlertFactor[] = [];

  const depth = m.median_groundwater_mbgl ?? 0;
  if (depth >= 15) factors.push({ label: `Deep groundwater (${depth} mbgl)`, weight: 3 });
  else if (depth >= 10) factors.push({ label: `Moderately deep (${depth} mbgl)`, weight: 1 });

  if (m.sensor_satellite_agreement === "strong_disagreement")
    factors.push({ label: "Sensor–satellite disagreement", weight: 2 });
  else if (m.sensor_satellite_agreement === "partial_or_neutral")
    factors.push({ label: "Partial sensor–satellite agreement", weight: 1 });

  if (m.water_balance_status === "Deficit") factors.push({ label: "Annual water deficit", weight: 2 });
  else if (m.water_balance_status === "Balanced") factors.push({ label: "Tight water balance", weight: 1 });

  if ((m.confidence_label || "").toLowerCase().includes("low"))
    factors.push({ label: "Low data confidence", weight: 1 });

  const score = factors.reduce((acc, f) => acc + f.weight, 0);
  const severity = severityFor(score);
  return { mandal: m, score, severity, factors, leadAction: leadActionFor(severity) };
}

/** All alerts sorted by score (desc). */
export function computeAlerts(): MandalAlert[] {
  return mandals
    .map(alertFor)
    .sort((a, b) => b.score - a.score || a.mandal.mandal_name.localeCompare(b.mandal.mandal_name));
}

/** Only actionable (non-Normal), highest first. */
export function activeAlerts(): MandalAlert[] {
  return computeAlerts().filter((a) => a.severity !== "Normal");
}

export function severityCounts(): Record<Severity, number> {
  const counts: Record<Severity, number> = { Critical: 0, High: 0, Watch: 0, Normal: 0 };
  for (const a of computeAlerts()) counts[a.severity] += 1;
  return counts;
}

export const MAX_ALERT_SCORE = 8;
