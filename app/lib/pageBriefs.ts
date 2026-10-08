/* What each screen is for, in two fixed sentences; the page adds a third, "what it says now",
   written from its own data. One place for the wording keeps the site speaking with one voice.
   Strings only: safe to import from any page, client or server. */

export type PageBrief = { what: string; now?: React.ReactNode; use: string };

export const BRIEFS = {
  "/": {
    what: "The State at a glance: every mandal's groundwater on one map, with the places that need attention first.",
    use: "Start here; open a district or mandal for its record, or This Week for what changed.",
  },
  "/changes": {
    what: "What moved since last Monday's refresh: rain, soil, reservoirs, the drought manual, groundwater and El Niño.",
    use: "Send field teams to the listed mandals and forward the one-page digest.",
  },
  "/map": {
    what: "Every mandal coloured by one measure at a time: groundwater, rain, water balance, crop vegetation or the official category.",
    use: "Switch the layer to compare measures; select a mandal to open its record.",
  },
  "/mandals": {
    what: "One mandal at a time: its readings, satellite context, trend and where the sources agree.",
    use: "Look a mandal up before a visit or a meeting.",
  },
  "/monsoon": {
    what: "Whether this monsoon recharged the ground: each mandal's groundwater against its own past seasons, with El Niño beside it.",
    use: "See where recharge failed this season, and so where the summer starts short.",
  },
  "/drought": {
    what: "Every mandal through the national drought manual's indicators and triggers, with the declaration calendar.",
    use: "Prepare the drought assessment; it reads the manual, it does not declare.",
  },
  "/agriculture": {
    what: "Which crops are short of water this week, mandal by mandal, and how far that call has held up.",
    use: "Aim crop advisories and field checks; work any field through in the crop-water lab.",
  },
  "/summer": {
    what: "Where the water table may stand next May, mandal by mandal, against each mandal's own deepest May on record.",
    use: "Plan bore wells, hand-pump repairs and tankers where it is heading past its record first; it updates every Monday.",
  },
  "/rabi": {
    what: "What the rabi season starts with: water in the reservoirs, moisture in rainfed fields, and the northeast monsoon.",
    use: "Plan irrigated rabi from the reservoirs, and contingency crops where the rainfed seedbed is dry.",
  },
  "/constituencies": {
    what: "Every figure on this site by assembly and parliamentary constituency, with a one-page brief for each.",
    use: "Print the brief before a constituency meeting.",
  },
  "/districts": {
    what: "District roll-ups of groundwater, rain, soil and reservoirs, with a short situation brief for each.",
    use: "Brief a collector, or compare districts before a review.",
  },
  "/crystal": {
    what: "Depth to water, mandal by mandal, as a relief you can turn: every May since 2015, the latest month against its usual, and next May's outlook.",
    use: "Show where the water table stands now against its usual, and where next May may sink past its record.",
  },
  "/methodology": {
    what: "How every figure on this site is made, tested and limited.",
    use: "Check here before quoting a figure.",
  },
  "/readiness": {
    what: "Which sources are live, which are pending, and how fresh each one is.",
    use: "Know which figures rest on this week's data and which on older snapshots.",
  },
  "/estimates": {
    what: "A model's estimate of each mandal's groundwater depth where no recent reading exists, with how far it can be off.",
    use: "Use it only where measured readings are missing; the bands show its uncertainty.",
  },
  "/nasa": {
    what: "NASA's GRACE satellite-model groundwater signal, unfused, with where each value came from.",
    use: "Context for the measured readings, not a substitute for them.",
  },
  "/climate": {
    what: "Rain in against evaporation out: the water budget behind the groundwater.",
    use: "See where the balance has run negative.",
  },
  "/scenario": {
    what: "A what-if: dial the monsoon up or down and see which mandals tip into deficit.",
    use: "Test a planning assumption; it is a scenario, not a forecast.",
  },
  "/irrigation": {
    what: "A preview of monitor, review and field-verify actions in the State's AWARE format, and the export that carries them.",
    use: "For the AWARE team to check the export before it goes live.",
  },
  "/compare": {
    what: "Any two mandals or districts side by side.",
    use: "Settle which of two places needs attention first.",
  },
  "/settings": {
    what: "Appearance, the dataset edition and the data policy.",
    use: "Set the theme, or check which edition of the data is loaded.",
  },
  "/field-report": {
    what: "For teams sent to the listed mandals: record what the fields and wells show, beside what the site called.",
    use: "Write one report per mandal visited and share it; a collector reads them back in one table.",
  },
  "/watchlist": {
    what: "An earlier list of mandals whose evidence needs a field check.",
    use: "The field-teams list on This Week now does this job with six signals; use that.",
  },
  "/alerts": {
    what: "An earlier ranking of mandals for review.",
    use: "The field-teams list on This Week now does this job with six signals; use that.",
  },
  "/snapshot": {
    what: "An earlier one-page printable summary for officials.",
    use: "The weekly digest is now the one printable summary, printed fresh each Monday; use that.",
  },
  "/reports": {
    what: "Earlier exports of the site's figures.",
    use: "The weekly digest is now the one printable summary; the exports here remain for analysts.",
  },
} as const satisfies Record<string, Omit<PageBrief, "now">>;

export function brief(route: keyof typeof BRIEFS, now?: React.ReactNode): PageBrief {
  return { ...BRIEFS[route], now };
}
