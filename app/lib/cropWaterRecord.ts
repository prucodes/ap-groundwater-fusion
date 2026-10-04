import recordJson from "../data/crop_water_record.json";
import type { CheckRecord } from "./cropWater";

/** The crop water check's track record (phase3_levels/build_crop_water_record.py), trimmed to
 * what the Agriculture page draws: the verdict and the comparison inside each mandal. The pooled
 * comparison and the list of check weeks stay in the file for anyone who wants them. */
export function checkRecord(): CheckRecord {
  const raw = recordJson as unknown as CheckRecord;
  const record = Object.fromEntries(Object.entries(raw.record).map(([key, entry]) => [key, { within: entry.within, verdict: entry.verdict }]));
  return {
    generatedAt: raw.generatedAt, question: raw.question, outcome: raw.outcome, acrossCaveat: raw.acrossCaveat,
    weather: raw.weather, seasons: raw.seasons, checks: raw.checks, rules: raw.rules, record,
  };
}
