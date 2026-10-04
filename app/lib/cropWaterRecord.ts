import recordJson from "../data/crop_water_record.json";
import scorecardJson from "../data/crop_water_scorecard.json";
import type { CheckRecord, RecordReading } from "./cropWater";

type Scorecard = { frozen: number; scored: number; firstFrozen: string | null; nextDue: string | null; record: Record<string, RecordReading>; fieldScale?: { scored: number; record: Record<string, RecordReading> } };

/** The crop water check's track record (phase3_levels/build_crop_water_record.py), trimmed to
 * what the pages draw: the rainfed reading that carries the verdict, and the all-cropland reading
 * beside it; with the live scorecard of the real weekly calls (phase3_levels/score_field_calls.py).
 * The pooled comparison and the list of check weeks stay in the file for anyone who wants them. */
export function checkRecord(): CheckRecord {
  const raw = recordJson as unknown as CheckRecord;
  const live = scorecardJson as unknown as Scorecard;
  const record = Object.fromEntries(Object.entries(raw.record).map(([key, entry]) => [key, { rainfed: entry.rainfed, allCropland: entry.allCropland, ...(entry.sentinel ? { sentinel: entry.sentinel } : {}) }]));
  return {
    generatedAt: raw.generatedAt, question: raw.question, outcome: raw.outcome, acrossCaveat: raw.acrossCaveat,
    weather: raw.weather, seasons: raw.seasons, checks: raw.checks, rules: raw.rules, rainfed: raw.rainfed, sentinel: raw.sentinel ?? null, record,
    live: {
      frozen: live.frozen, scored: live.scored, firstFrozen: live.firstFrozen, nextDue: live.nextDue, record: live.scored ? live.record : {},
      fieldScored: live.fieldScale?.scored ?? 0, fieldRecord: live.fieldScale?.scored ? live.fieldScale.record : {},
    },
  };
}
