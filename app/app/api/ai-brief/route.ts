import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { datasetManifest, mandals, districtRollups, modelCard, titleCase } from "../../../lib/data";
import type { MandalGroundwaterView } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const f = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : Math.round(n * 10) / 10);

/* ---- auditable context assembled from the REAL modelled dataset (no invention) ---- */
function statewideContext(): string {
  const rollups = districtRollups();
  const byBucket: Record<string, number> = {};
  for (const m of mandals) byBucket[m.status_bucket] = (byBucket[m.status_bucket] ?? 0) + 1;
  const stress = mandals.filter((m) => m.status_bucket === "Stress").sort((a, b) => (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0));
  const over = mandals.filter((m) => m.sensor_satellite_agreement === "declining_despite_positive_climate_balance").sort((a, b) => (b.trend_m_per_yr ?? 0) - (a.trend_m_per_yr ?? 0));
  const drought = mandals.filter((m) => m.sensor_satellite_agreement === "declining_without_positive_climate_balance").length;
  const deepestD = [...rollups].sort((a, b) => (b.avg_estimate_mbgl ?? 0) - (a.avg_estimate_mbgl ?? 0)).slice(0, 5);
  const temporal = modelCard.evaluations.temporalNowcast;
  const spatial = modelCard.evaluations.spatialEstimation;
  const cross = modelCard.evaluations.crossNetworkComparison;
  return [
    `STATEWIDE — Andhra Pradesh groundwater prototype:`,
    `Modelled nowcasts: ${datasetManifest.counts.modelledRecordCount}; measured-only: ${datasetManifest.counts.measuredOnlyCount}; boundary-only: ${datasetManifest.counts.boundaryOnlyCount}; districts: ${datasetManifest.counts.districtCount}.`,
    `Latest observation period: ${datasetManifest.periods.latestObservationPeriod ?? "not supplied"}. Model target period: ${datasetManifest.periods.modelTargetPeriodRange.end ?? "not supplied"}.`,
    `Status counts: ${Object.entries(byBucket).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Declines despite positive climate balance (context mismatch to verify): ${over.length}. Declines without positive climate balance: ${drought}. Climate balance is not direct measured recharge.`,
    `Deepest districts (avg level, m below ground): ${deepestD.map((d) => `${titleCase(d.district_name)} ${f(d.avg_estimate_mbgl)}`).join("; ")}.`,
    `Most-stressed mandals (level m, YoY m/yr +=deepening): ${stress.slice(0, 8).map((m) => `${titleCase(m.mandal_name)}/${titleCase(m.district_name)} ${f(m.estimate_mbgl)}m ${f(m.trend_m_per_yr)}`).join("; ")}.`,
    `Context mismatches (verify): ${over.slice(0, 6).map((m) => `${titleCase(m.mandal_name)}/${titleCase(m.district_name)} ${f(m.estimate_mbgl)}m deepening ${f(m.trend_m_per_yr)}/yr`).join("; ")}.`,
    `Rolling temporal holdout (${temporal.eligibleCohort}, ${temporal.evaluationPeriod.start}–${temporal.evaluationPeriod.end}, n=${temporal.sampleCount}): MAE ${f(temporal.model.maeM)} m, R² ${f(temporal.model.r2)}.`,
    `Whole-mandal spatial holdout (${spatial.validation}, ${spatial.mandalCount} mandals): MAE ${f(spatial.reportedMetric.maeM)} m.`,
    `Same-month CGWB/APWRIMS cross-network comparison (n=${cross.sampleCount}): MAE ${f(cross.maeM)} m, correlation ${f(cross.correlation)}. This is network comparability, not model accuracy.`,
    `Forecast release: ${modelCard.forecastRelease.status}; released horizons: none.`,
  ].join("\n");
}

function districtContext(name: string): string | null {
  const r = districtRollups().find((x) => x.district_name.toUpperCase() === name.toUpperCase());
  if (!r) return null;
  const top = [...r.mandals].sort((a, b) => (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0)).slice(0, 6);
  return [
    `DISTRICT FOCUS — ${titleCase(r.district_name)}:`,
    `${r.mandal_count} mandals; ${r.stress_count} in stress; avg estimated level ${f(r.avg_estimate_mbgl)} m; avg YoY ${f(r.avg_trend_m_per_yr)} m/yr; avg water balance ${f(r.avg_water_balance_mm)} mm (${r.deficit_count} in deficit).`,
    `Deepest mandals: ${top.map((m) => `${titleCase(m.mandal_name)} ${f(m.estimate_mbgl)}m (${m.status})`).join("; ")}.`,
  ].join("\n");
}

/* ---- deterministic answerer (used when no API key, or as graceful fallback) ---- */
function findMandal(q: string): MandalGroundwaterView | undefined {
  const ql = q.toLowerCase();
  return mandals.find((m) => ql.includes(m.mandal_name.toLowerCase()) && m.mandal_name.length > 3);
}
function deterministicAnswer(question: string, district: string): string {
  const q = (question || "").toLowerCase();
  if (q) {
    const m = findMandal(q);
    if (m) {
      return `${titleCase(m.mandal_name)} (${titleCase(m.district_name)}): latest measured mandal aggregate ${f(m.display_mbgl)} m below ground for ${m.latest_observation_period || "an unspecified period"}; modelled nowcast ${f(m.estimate_mbgl)} m with model P10–P90 ${f(m.estimate_band_p10)}–${f(m.estimate_band_p90)} m. Year-on-year measured trend ${(m.trend_m_per_yr ?? 0) > 0 ? "deepening" : "recovering"} ${f(Math.abs(m.trend_m_per_yr ?? 0))} m/yr. Coverage: ${m.coverage_status}; ${m.observation_month_count} observation months. No forecast horizon is released. Prototype, not an official result.`;
    }
    if (/(over.?extract|pumping|despite)/.test(q)) {
      const over = mandals.filter((x) => x.sensor_satellite_agreement === "declining_despite_positive_climate_balance").sort((a, b) => (b.trend_m_per_yr ?? 0) - (a.trend_m_per_yr ?? 0)).slice(0, 6);
      return `Largest declines despite a positive climatic water balance (context mismatches to field-verify; no causal attribution):\n` + over.map((m) => `• ${titleCase(m.mandal_name)} (${titleCase(m.district_name)}) — nowcast ${f(m.estimate_mbgl)} m, measured trend ${f(m.trend_m_per_yr)} m/yr deepening`).join("\n");
    }
    if (/(stress|worst|deep|critical|priority)/.test(q)) {
      const s = mandals.filter((x) => x.status_bucket === "Stress").sort((a, b) => (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0)).slice(0, 6);
      return `Most-stressed mandals (deepest / fastest-declining):\n` + s.map((m) => `• ${titleCase(m.mandal_name)} (${titleCase(m.district_name)}) — ${f(m.estimate_mbgl)} m, ${(m.trend_m_per_yr ?? 0) > 0 ? "falling" : "rising"} ${f(Math.abs(m.trend_m_per_yr ?? 0))} m/yr`).join("\n");
    }
  }
  const r = districtRollups().find((x) => x.district_name.toUpperCase() === (district || "").toUpperCase());
  if (r) {
    return `${titleCase(r.district_name)}: ${r.mandal_count} mandals, ${r.stress_count} in stress. Average estimated groundwater level ${f(r.avg_estimate_mbgl)} m below ground, year-on-year ${(r.avg_trend_m_per_yr ?? 0) > 0 ? "deepening" : "recovering"} ${f(Math.abs(r.avg_trend_m_per_yr ?? 0))} m/yr; ${r.deficit_count} mandals in rainfall deficit. Modelled estimate (β), calibrated to APWRIMS — not an official result.`;
  }
  return statewideContext();
}

const SYSTEM = `You are a groundwater intelligence analyst for Andhra Pradesh irrigation/governance officials.
You are given an auditable CONTEXT of measured APWRIMS-format mandal aggregates, modelled temporal nowcasts, and separate regional/climate signals.
Rules:
- Use ONLY numbers present in the CONTEXT. Never invent or extrapolate a figure not given.
- Keep measured values, modelled nowcasts, unreleased forecasts and regional signals distinct.
- Temporal-nowcast error applies only to the stated lag-eligible holdout cohort. Never generalize it to sensorless mandals.
- GRACE-DA is regional model-assimilated context, not direct mandal groundwater depth.
- Rainfall minus actual ET is climate context, not direct measured recharge.
- Context agreement categories are patterns to investigate, never causal attributions.
- No forecast horizon is released. Do not invent a future value.
- Do not recommend permits, pumping restrictions or field orders. Suggest monitoring, history review or field verification.
- Be concise and plain-language. Plain text, no markdown headers, max ~2 short paragraphs or a short list.`;

// Lightweight in-memory rate limiter — guards the (paid) LLM call from cost abuse.
const RL = new Map<string, { n: number; t: number }>();
const RL_MAX = 20; // requests
const RL_WINDOW = 60_000; // per minute, per IP
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = RL.get(ip);
  if (!e || now - e.t > RL_WINDOW) {
    RL.set(ip, { n: 1, t: now });
    return false;
  }
  e.n += 1;
  return e.n > RL_MAX;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate limited — try again shortly" }, { status: 429 });
  }

  let district = "";
  let question = "";
  try {
    const body = await req.json();
    district = String(body.district ?? "");
    question = String(body.question ?? "").slice(0, 500);
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const context = statewideContext() + (district ? `\n\n${districtContext(district) ?? ""}` : "");

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({
      source: "deterministic",
      text: deterministicAnswer(question, district),
      note: "Set ANTHROPIC_API_KEY for the AI-written narrative. Showing a data-grounded answer.",
    });
  }

  try {
    const client = new Anthropic();
    const userContent = question
      ? `CONTEXT:\n${context}\n\nQUESTION: ${question}`
      : `CONTEXT:\n${context}\n\nWrite a short monitoring brief${district ? ` for ${titleCase(district)}` : " for Andhra Pradesh"} and identify any field-verification need.`;
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: SYSTEM,
      messages: [{ role: "user", content: userContent }],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ source: "claude-opus-4-8", text });
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `${err.status}` : "error";
    return NextResponse.json({
      source: "deterministic",
      text: deterministicAnswer(question, district),
      note: `AI call failed (${msg}); showing a data-grounded answer.`,
    });
  }
}
