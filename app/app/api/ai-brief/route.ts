import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { mandals, districtRollups, titleCase } from "../../../lib/data";
import type { MandalFusionSeed } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const f = (n: number | null | undefined) => (n === null || n === undefined ? "n/a" : Math.round(n * 10) / 10);

/* ---- auditable context assembled from the REAL modelled dataset (no invention) ---- */
function statewideContext(): string {
  const rollups = districtRollups();
  const byBucket: Record<string, number> = {};
  for (const m of mandals) byBucket[m.status_bucket] = (byBucket[m.status_bucket] ?? 0) + 1;
  const stress = mandals.filter((m) => m.status_bucket === "Stress").sort((a, b) => (b.estimate_mbgl ?? 0) - (a.estimate_mbgl ?? 0));
  const over = mandals.filter((m) => m.sensor_satellite_agreement === "over_extraction").sort((a, b) => (b.trend_m_per_yr ?? 0) - (a.trend_m_per_yr ?? 0));
  const drought = mandals.filter((m) => m.sensor_satellite_agreement === "drought_decline").length;
  const deepestD = [...rollups].sort((a, b) => (b.avg_estimate_mbgl ?? 0) - (a.avg_estimate_mbgl ?? 0)).slice(0, 5);
  return [
    `STATEWIDE — Andhra Pradesh groundwater (modelled estimate β, calibrated to APWRIMS, as of May 2026):`,
    `Mandals with estimates: ${mandals.length} across ${rollups.length} districts.`,
    `Status counts: ${Object.entries(byBucket).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Pumping-pressure hypotheses to verify (falling despite a healthy water balance): ${over.length}. Climate-stress (drought-consistent) declines: ${drought}.`,
    `Deepest districts (avg level, m below ground): ${deepestD.map((d) => `${titleCase(d.district_name)} ${f(d.avg_estimate_mbgl)}`).join("; ")}.`,
    `Most-stressed mandals (level m, YoY m/yr +=deepening): ${stress.slice(0, 8).map((m) => `${titleCase(m.mandal_name)}/${titleCase(m.district_name)} ${f(m.estimate_mbgl)}m ${f(m.trend_m_per_yr)}`).join("; ")}.`,
    `Pumping-pressure hypotheses (verify): ${over.slice(0, 6).map((m) => `${titleCase(m.mandal_name)}/${titleCase(m.district_name)} ${f(m.estimate_mbgl)}m falling ${f(m.trend_m_per_yr)}/yr`).join("; ")}.`,
    `Validation: forecast MAE ~1.3 m (R² 0.90); independent CGWB/June-2026 district snapshot MAE 0.82 m (r 0.98). Absolute truth has ~3-6 m irreducible cross-network uncertainty.`,
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
function findMandal(q: string): MandalFusionSeed | undefined {
  const ql = q.toLowerCase();
  return mandals.find((m) => ql.includes(m.mandal_name.toLowerCase()) && m.mandal_name.length > 3);
}
function deterministicAnswer(question: string, district: string): string {
  const q = (question || "").toLowerCase();
  if (q) {
    const m = findMandal(q);
    if (m) {
      return `${titleCase(m.mandal_name)} (${titleCase(m.district_name)}): estimated groundwater level ${f(m.estimate_mbgl)} m below ground (band ${f(m.estimate_band_p10)}–${f(m.estimate_band_p90)} m), year-on-year ${(m.trend_m_per_yr ?? 0) > 0 ? "deepening" : "recovering"} ${f(Math.abs(m.trend_m_per_yr ?? 0))} m/yr. Status: ${m.status}. Based on ${m.sensor_count} months of APWRIMS readings. Modelled estimate (β), not an official result.`;
    }
    if (/(over.?extract|pumping|despite)/.test(q)) {
      const over = mandals.filter((x) => x.sensor_satellite_agreement === "over_extraction").sort((a, b) => (b.trend_m_per_yr ?? 0) - (a.trend_m_per_yr ?? 0)).slice(0, 6);
      return `Top pumping-pressure hypotheses to verify (water table falling despite a healthy water balance — consistent with, but not proof of, extraction outpacing recharge):\n` + over.map((m) => `• ${titleCase(m.mandal_name)} (${titleCase(m.district_name)}) — ${f(m.estimate_mbgl)} m, falling ${f(m.trend_m_per_yr)} m/yr`).join("\n");
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
You are given an auditable CONTEXT of pre-computed values from a model that estimates mandal groundwater LEVEL in metres below ground (mbgl) by fusing the APWRIMS sensor network with NASA satellite rainfall.
Rules:
- Use ONLY numbers present in the CONTEXT. Never invent or extrapolate a figure not given.
- Estimates are modelled (β), calibrated to APWRIMS, NOT official APWRIMS results. Say so if asked for certainty.
- "Pumping-pressure (verify)" = water table falling despite a healthy climatic water balance — a hypothesis consistent with extraction outpacing recharge, to be field-verified, not a proven cause. "Climate-stress" = falling alongside a rainfall deficit. Always frame these as hypotheses, not attributions.
- Be concise, concrete and action-oriented for irrigation planning. Plain text, no markdown headers, max ~2 short paragraphs or a short list.`;

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
      : `CONTEXT:\n${context}\n\nWrite a short situation brief${district ? ` for ${titleCase(district)}` : " for Andhra Pradesh"} and one irrigation-planning recommendation.`;
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
