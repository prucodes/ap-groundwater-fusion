import { districtGeometry, districtRollups, formatNumber, titleCase } from "./data";

/* Deterministic, data-driven district situation brief (no LLM).
   Reads the fused district signals and composes an auditable narrative.
   Upgradeable to a live Claude-written narrative when an API key is provided. */

export type BriefSignal = { label: string; value: string; tone: "good" | "warn" | "bad" | "neutral" };

export type DistrictBrief = {
  district: string;
  headline: string;
  paragraph: string;
  signals: BriefSignal[];
  action: string;
  plain: string;
};

function wetnessPhrase(gw: number | null): string {
  if (gw === null) return "no satellite groundwater read";
  if (gw >= 98) return "extremely wet";
  if (gw >= 90) return "very wet";
  if (gw >= 70) return "wet";
  if (gw >= 30) return "near-normal";
  return "dry";
}

function balancePhrase(bal: number | null, status: string): string {
  if (bal === null) return "an unmeasured water balance";
  const mm = `${bal > 0 ? "+" : ""}${formatNumber(bal)} mm/yr`;
  if (status === "Surplus") return `a comfortable annual water surplus (${mm})`;
  if (status === "Balanced") return `a modest annual surplus (${mm})`;
  return `an annual water deficit (${mm}) — demand meets or exceeds rainfall`;
}

export function generateDistrictBrief(districtName: string): DistrictBrief | null {
  const d = districtGeometry.districts.find((x) => x.d.toUpperCase() === districtName.toUpperCase());
  if (!d) return null;
  const rollup = districtRollups().find((r) => r.district_name.toUpperCase() === districtName.toUpperCase());

  const name = titleCase(d.d);
  const gw = d.gw_percentile;
  const wet = wetnessPhrase(gw);
  const bal = balancePhrase(d.water_balance_mm, d.water_balance_status);
  const deficit = d.water_balance_status === "Deficit";

  // Seed-mandal fusion detail (only the 5 districts with seed sensors).
  let verifyText = "";
  let verifyCount = 0;
  if (rollup && rollup.verify_count > 0) {
    verifyCount = rollup.verify_count;
    const names = rollup.mandals
      .filter((m) => m.status_bucket === "Verify")
      .map((m) => titleCase(m.mandal_name))
      .slice(0, 3)
      .join(", ");
    verifyText = ` ${verifyCount} seed mandal${verifyCount > 1 ? "s" : ""}${names ? ` (${names})` : ""} ${verifyCount > 1 ? "are" : "is"} flagged for verification where deep readings contradict the wet satellite signal.`;
  }

  const headline = deficit
    ? `${name} — annual water deficit; conservation & verification advised.`
    : verifyCount > 0
      ? `${name} — broadly wet but ${verifyCount} mandal${verifyCount > 1 ? "s" : ""} need${verifyCount > 1 ? "" : "s"} verification.`
      : `${name} — water surplus; routine monitoring.`;

  const mandalCount = d.mandal_count; // real total mandals in the district (satellite-wide)
  const paragraph =
    `Across ${mandalCount} mandals, the NASA groundwater percentile averages ${formatNumber(gw)} (${wet} at regional scale), ` +
    `with ${bal}.` +
    verifyText;

  const signals: BriefSignal[] = [
    { label: "NASA GW %ile", value: formatNumber(gw), tone: "neutral" },
    { label: "Rainfall (CHIRPS)", value: `${formatNumber(d.rainfall_mm)} mm`, tone: "neutral" },
    {
      label: "Water balance",
      value: `${(d.water_balance_mm ?? 0) > 0 ? "+" : ""}${formatNumber(d.water_balance_mm)} mm · ${d.water_balance_status}`,
      tone: deficit ? "bad" : d.water_balance_status === "Surplus" ? "good" : "warn",
    },
    { label: "Mandals", value: String(mandalCount), tone: "neutral" },
    ...(verifyCount > 0 ? [{ label: "To verify", value: String(verifyCount), tone: "bad" as const }] : []),
  ];

  const action = deficit
    ? "Regulate new bore-well permits, promote less water-intensive cropping, and prioritise recharge structures; confirm with official APWRIMS data before action."
    : verifyCount > 0
      ? "Dispatch field verification to flagged mandals and reconcile against official APWRIMS data; monitor recharge through the monsoon."
      : "Routine monitoring; revisit after the next monsoon and confirm with official APWRIMS data.";

  const plain = `${name} situation brief\n${headline}\n\n${paragraph}\n\nRecommended: ${action}\n\n(Prototype — TerraClimate ${districtGeometry.balance_year} balance + NASA GRACE-DA + CHIRPS. Not official.)`;

  return { district: name, headline, paragraph, signals, action, plain };
}
