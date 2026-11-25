import checkJson from "../data/field_check.json";
import { titleCase } from "./data";

/* The field check with the Groundwater Department (phase3_levels/build_field_check.py):
   the plan, the predictions written down before the first reading, and the score once
   readings are filed. The page, its one-page sheet and the CSVs all read from here. */

export type FieldMandal = {
  district: string; mandal: string; index: number; aquifer: string; tier: string | null; band: string | null;
  nowM: number | null; mayTypicalM: number | null; mayDryM: number | null; deepestMayM: number | null;
  observationWells: number; privateWellsToAdd: number;
  villages: Array<{ village: string; wellType: string; wells: number; offsetM: number; readings: number; lastRead: string }>;
};
type Block = { readings: number; mandalOnly: { readings: number; maeM: number } | null; villageOffset: { readings: number; maeM: number } | null; ownThree: { readings: number; maeM: number } | null };
export type FieldCheck = {
  generatedAt: string; status: "proposed" | "readings coming in"; plannedAt: string; planSha256: string;
  districts: Array<{ district: string; why: string }>;
  wellsPerMandal: number; rounds: string[]; roundDays: number; readingFields: string[];
  mandals: FieldMandal[];
  predictions: {
    dugMandalOnlyM: number; dugAfterThreeM: number; boreMandalOnlyM: number; boreAfterThreeM: number;
    byAquifer: Record<string, { mandalOnlyM: number; withOffsetM: number }>;
    mayDropListedM: number | null; mayDropOthersM: number | null;
  };
  results: { readingsFiled: number; wells: number; awaitingMandalFigure: number; dryReadings: number; lastRound: string; all: Block | null; by: Record<string, Block> } | null;
};

export const fieldCheck = checkJson as unknown as FieldCheck;

export const TERRAIN: Record<string, string> = { hard_rock: "Hard rock", alluvial: "Alluvial", coastal: "Coastal sediments" };
export const CALL: Record<string, string> = { first: "Plan first", next: "Plan next", watch: "Watch", beyond: "Past its record", dry: "Past it in a dry winter", within: "Within its record" };
export const callOf = (m: FieldMandal) => CALL[m.band ?? m.tier ?? ""] ?? "Not projected";
export const place = (s: string) => (/[a-z]/.test(s) ? s : titleCase(s));
export const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** How a well is read, the same every round: the steps the sheet prints and the page lists. */
export const PROTOCOL: Array<[string, string]> = [
  ["Mark a measuring point", "A painted mark on the well's rim or the top of its casing, used every round. Measure its height above the ground once and photograph it."],
  ["Read before pumping", "At least six hours after a pump last ran, or at dawn for a well in daily use. Write down the hours since pumping."],
  ["Read to the centimetre", "Lower the tape or dip meter to the water and read from the mark. Read twice; if the two differ by more than 2 cm, read a third time and keep the middle one."],
  ["Same wells, same day", "Each well keeps one ID for the whole pilot. Same wells, same order, on the round's date or a day either side."],
  ["Note the well once", "On the first visit: type (dug, bore, piezometer), owner, depth if known, and its GPS position."],
  ["A dry well is a reading", "Write “dry” and the well's depth: that is the outcome the summer outlook is about."],
  ["File the round", "One CSV per district per round, in the reading-sheet columns. It is scored the following Monday."],
];

const cell = (value: string | number | null | undefined) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Every planned mandal and village, as a file a district office can work from. */
export function wellListCsv(f: FieldCheck = fieldCheck) {
  const head = ["district", "mandal", "terrain", "summer_call", "village", "well_type", "observation_wells", "recorded_offset_m", "last_cgwb_reading", "private_wells_to_add_in_mandal"];
  const lines = f.mandals.flatMap(m => m.villages.map(v => [place(m.district), m.mandal, TERRAIN[m.aquifer] ?? m.aquifer, callOf(m), v.village, v.wellType, v.wells, v.offsetM, v.lastRead, m.privateWellsToAdd].map(cell).join(",")));
  return [head.join(","), ...lines].join("\n") + "\n";
}

/** The reading sheet's columns, with one example row. */
export function readingSheetCsv(f: FieldCheck = fieldCheck) {
  const first = f.mandals[0];
  const example: Record<string, string> = {
    round_date: f.rounds[0], district: place(first.district), mandal: first.mandal, village: first.villages[0]?.village ?? "", well_id: "SSS-AMA-01",
    well_type: "dug", owner: "private", latitude: "", longitude: "", mp_height_m: "0.60", water_below_mp_m: "12.35", hours_since_pumping: "10",
    well_depth_m: "18", observer: "", note: "example row: delete before filing",
  };
  return [f.readingFields.join(","), f.readingFields.map(k => cell(example[k] ?? "")).join(",")].join("\n") + "\n";
}
