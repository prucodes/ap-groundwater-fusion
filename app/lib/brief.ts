import { districtGeometry, districtRollups, formatNumber, titleCase } from "./data";
import { waterForDistrict, waterSummary } from "./waterSummary";

const signedPct = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(0)}%`;
const RAIN_WORD: Record<string, string> = { excess: "excess", normal: "normal", deficient: "deficient", scanty: "scanty", noRain: "no rain" };

/** This water year in the district, in one sentence, from the state's own gauges,
 *  the NRSC soil model and reservoir telemetry. Context only: it does not move the
 *  district's review category. */
function seasonSentence(district: string): { sentence: string; signals: BriefSignal[] } {
  const w = waterForDistrict(district);
  if (!w) return { sentence: "", signals: [] };
  const parts: string[] = [];
  const signals: BriefSignal[] = [];
  if (w.rain && waterSummary.rain) {
    parts.push(`its rain gauges recorded ${formatNumber(w.rain.actualMm)} mm against a normal of ${formatNumber(w.rain.normalMm)} mm since 1 June (${signedPct(w.rain.deviationPct)}, ${RAIN_WORD[w.rain.category ?? ""] ?? "uncategorised"})`);
    signals.push({ label: "Gauge rain (season)", value: `${signedPct(w.rain.deviationPct)} · ${RAIN_WORD[w.rain.category ?? ""] ?? "—"}`, tone: w.rain.deviationPct <= -20 ? "bad" : w.rain.deviationPct >= 20 ? "good" : "neutral" });
  }
  if (w.soil && waterSummary.soil) {
    parts.push(`modelled soil moisture at ${waterSummary.soil.depthCm} cm sits below its usual level for the date in ${w.soil.belowOwnMedian} of ${w.soil.withBaseline} mandals`);
    signals.push({ label: `Soil moisture ${waterSummary.soil.depthCm} cm`, value: `${formatNumber(w.soil.medianPct)}% median · ${w.soil.belowOwnMedian}/${w.soil.withBaseline} below usual`, tone: w.soil.belowOwnMedian > w.soil.withBaseline / 2 ? "warn" : "neutral" });
  }
  if (w.reservoirs && w.reservoirs.storagePct !== null) {
    parts.push(`its ${w.reservoirs.count} reservoir${w.reservoirs.count === 1 ? "" : "s"} hold ${formatNumber(w.reservoirs.storagePct)}% of capacity against ${formatNumber(w.reservoirs.lastYearPct)}% a year ago`);
    signals.push({ label: "Reservoir storage", value: `${formatNumber(w.reservoirs.storagePct)}% · ${formatNumber(w.reservoirs.lastYearPct)}% last year`, tone: (w.reservoirs.storagePct ?? 0) < (w.reservoirs.lastYearPct ?? 0) - 10 ? "warn" : "neutral" });
  }
  return { sentence: parts.length ? ` This water year, ${parts.join("; ")}.` : "", signals };
}

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
  const season = seasonSentence(d.d);
  const paragraph =
    `Across ${mandalCount} mandals, the NASA groundwater percentile averages ${formatNumber(gw)} (${wet} at regional scale), ` +
    `with ${bal}.` +
    verifyText +
    season.sentence;

  const signals: BriefSignal[] = [
    { label: "NASA GW %ile", value: formatNumber(gw), tone: "neutral" },
    { label: "Rainfall (CHIRPS, month)", value: `${formatNumber(d.rainfall_mm)} mm`, tone: "neutral" },
    ...season.signals,
    {
      label: "Water balance",
      value: `${(d.water_balance_mm ?? 0) > 0 ? "+" : ""}${formatNumber(d.water_balance_mm)} mm · ${d.water_balance_status}`,
      tone: deficit ? "bad" : d.water_balance_status === "Surplus" ? "good" : "warn",
    },
    { label: "Mandals", value: String(mandalCount), tone: "neutral" },
    ...(verifyCount > 0 ? [{ label: "To verify", value: String(verifyCount), tone: "bad" as const }] : []),
  ];

  const action = deficit
    ? "Review measured groundwater histories and field-verify priority mandals; treat the climate deficit as context, not a pumping directive."
    : verifyCount > 0
      ? "Field-verify flagged mandals and reconcile against official APWRIMS data."
      : "Continue routine monitoring and confirm with official APWRIMS data.";

  const sources = [`TerraClimate ${districtGeometry.balance_year} balance`, "NASA GRACE-DA", "CHIRPS v3"];
  if (season.signals.length) sources.push(`APWRIMS gauges, NRSC soil model and reservoir telemetry (to ${waterSummary.rain?.end ?? waterSummary.soil?.asOf ?? "date unconfirmed"})`);
  const plain = `${name} situation brief\n${headline}\n\n${paragraph}\n\nRecommended: ${action}\n\n(Prototype — ${sources.join(" + ")}. Not official.)`;

  return { district: name, headline, paragraph, signals, action, plain };
}
