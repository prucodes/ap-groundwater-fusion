import type { MandalGroundwaterView } from "./types";
import { mandals } from "./data";

/* ============================================================
   Early-warning engine — a transparent, deterministic severity model.

   It scores groundwater depth/trend only when a measured or modelled basis is
   available. Climate context cannot create severity by itself. Unknown agreement
   values fail closed with diagnostics.
   ============================================================ */

export type Severity = "Critical" | "High" | "Watch" | "Normal";

export type AlertFactor = { label: string; weight: number };

export type MandalAlert = {
  mandal: MandalGroundwaterView;
  state: "scored" | "insufficient_data";
  score: number;
  severity: Severity;
  factors: AlertFactor[];
  diagnostics: string[];
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
      return "Field-verify the current level and review the measured history.";
    case "High":
      return "Review the measured history and schedule field verification.";
    case "Watch":
      return "Monitor and corroborate with the next field observation.";
    default:
      return "Continue routine monitoring.";
  }
}

export function alertFor(m: MandalGroundwaterView): MandalAlert {
  const factors: AlertFactor[] = [];
  const diagnostics: string[] = [];
  const groundwaterValue = m.estimate_mbgl ?? m.display_mbgl;
  if (
    m.coverage_status === "boundary_only" ||
    m.coverage_status === "no_data" ||
    groundwaterValue === null ||
    groundwaterValue === undefined
  ) {
    return {
      mandal: m,
      state: "insufficient_data",
      score: 0,
      severity: "Normal",
      factors: [],
      diagnostics: ["No measured or modelled groundwater value is available."],
      leadAction: "Review source coverage or collect a field observation.",
    };
  }

  const depth = groundwaterValue;
  if (depth >= 15) factors.push({ label: `Deep groundwater (${depth} mbgl)`, weight: 3 });
  else if (depth >= 10) factors.push({ label: `Moderately deep (${depth} mbgl)`, weight: 1 });

  if ((m.trend_m_per_yr ?? 0) > 1.2)
    factors.push({ label: `Measured decline (${m.trend_m_per_yr} m/yr deepening)`, weight: 3 });
  else if ((m.trend_m_per_yr ?? 0) > 0.3)
    factors.push({ label: `Measured decline (${m.trend_m_per_yr} m/yr deepening)`, weight: 1 });

  switch (m.sensor_satellite_agreement) {
    case "declining_despite_positive_climate_balance":
      factors.push({ label: "Decline despite positive climate balance; verify context", weight: 1 });
      break;
    case "declining_without_positive_climate_balance":
    case "stable_or_recovering":
      break;
    case "unknown":
      diagnostics.push("Context agreement is unknown; no agreement score was applied.");
      break;
    default:
      diagnostics.push(`Unsupported agreement key: ${String(m.sensor_satellite_agreement)}`);
  }
  if ((m.confidence_label || "").toLowerCase().includes("limited")) {
    diagnostics.push("Limited data completeness; severity was not increased.");
  }

  const score = factors.reduce((acc, f) => acc + f.weight, 0);
  const severity = severityFor(score);
  return { mandal: m, state: "scored", score, severity, factors, diagnostics, leadAction: leadActionFor(severity) };
}

/** All alerts sorted by score (desc). */
export function computeAlerts(): MandalAlert[] {
  return mandals
    .map(alertFor)
    .sort((a, b) => b.score - a.score || a.mandal.mandal_name.localeCompare(b.mandal.mandal_name));
}

/** Only actionable (non-Normal), highest first. */
export function activeAlerts(): MandalAlert[] {
  return computeAlerts().filter((a) => a.state === "scored" && a.severity !== "Normal");
}

export function severityCounts(): Record<Severity, number> {
  const counts: Record<Severity, number> = { Critical: 0, High: 0, Watch: 0, Normal: 0 };
  for (const a of computeAlerts()) counts[a.severity] += 1;
  return counts;
}

export const MAX_ALERT_SCORE = 8;
