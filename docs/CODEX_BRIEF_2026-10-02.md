# Codex brief: what was built, film and video, redesign merge, visual polish (2026-10-02, updated 2026-10-03)

Written by Claude Code for Codex. Everything described here is on `main` (PRs #33–#38,
last at `53c9452`) and live on GitHub Pages. Start every task on a fresh branch off
`main`, and never edit inside the worktree `.claude/worktrees/agri-water-context`.
Ask the user before committing, pushing or merging.

The site is reviewed by the Chief Minister's office, the CMO and IAS officers
(including RTGS). The bar is high, and so is the cost of a wrong or overclaimed
figure. Polish how things look; never change what they say without asking.

## 0. Update, 3 October 2026: Drought Watch, El Niño outlook, This Week

All three have shipped to `main` (PR #34 and the PR after it). In Task 4 (visual
polish), treat them like any other screen, under these rules:

- **Drought Watch (`/drought`)**: components in `app/components/drought/`, styles in
  `Drought.module.css`, data from `phase3_levels/build_drought_watch.py`. Each mandal is
  read through the national *Manual for Drought Management 2020* (Table 3.11 Trigger 1,
  Tables 3.1/3.4/3.6/3.8/3.9, the Step 2 severity rule). **Do not change the rules, the
  thresholds, the "interpretations" list or any wording that says "not a declaration".**
  You may polish layout, colour, motion and phone layout. Tests:
  `app/e2e/governance-drought.spec.ts`.
- **El Niño outlook on `/monsoon` (`#enso-outlook`)**: `app/components/monsoon/EnsoOutlook.tsx`
  and its CSS module, data `app/data/enso_outlook.json` from `phase3_levels/fetch_enso_outlook.py`
  (NOAA CPC). The synopsis is quoted word for word: never paraphrase it. The forecast half
  (dark) and the state's own record (light) must stay visibly separate. No `<title>`
  inside SVGs (desktop-layout test).
- **This Week (`/changes`)**: `app/app/changes/`, data `app/data/weekly_changes.json` from
  `phase3_levels/build_weekly_changes.py`. Every value is read from a published file and
  keeps its own date.
- **Guards (do not touch)**: `check_not_shrinking` in `fetch_apwrims_context.py` and
  `check_past_weeks` in `build_drought_watch.py`. On 3 Oct 2026 the APWRIMS portal dropped
  September for all 28 districts; these guards stop that being published.
- The weekly workflow now opens a GitHub issue when a refresh fails or keeps a feed
  (`phase3_levels/refresh_health.py`).

### Added later on 3 October: the State's own data (AI Living Labs data lake, AWARE)

What landed (PRs #36–#38):

- **Official mandal outlines on every map**: 595 of 670. The data lake gives each
  boundary's vertices unordered; `phase3_levels/build_official_boundaries.py` rebuilds the
  ring and keeps it only if it is within 3% of the official area, does not lie over
  official neighbours (worst first), and touches the mandal it replaces. Names repeat
  across districts: 16 records landed 10–580 km from their mandal and are withheld,
  outline and codes. Spikes and crumbs are removed. Result: `app/data/ap_map_display.json`,
  same order and names as `ap_map_geometry.json`, each feature with `src`
  (`official`/`prototype`), `lgd`, `ac`, `acCode`, `pc`, `div`, `officialKm2`, `verdict`.
- **The State network's latest reading** (early September, 1,746 stations): mandal pages
  (`components/MandalStateReading.tsx`, server only), the overview strip and the Monsoon
  page. Data `gw_state_snapshot.json` (server only) and `gw_state_summary.json` (client-safe),
  from `build_datalake_snapshot.py`. Its May value equals our APWRIMS May in 585 of 587
  mandals: same department series, one month newer. It also carries the department's own
  depth bands (`ground_water_category`) and AWARE's module counts (groundwater, dry spell
  and El Niño modules issue nothing).
- **Constituencies page** (`/constituencies`): all 175 assembly and 25 parliamentary seats,
  164 drawn with the State's own outline (`build_official_regions.py` →
  `official_regions.json`), the rest as the union of their mandals. A mandal with no
  constituency on its State record is placed by location (40 of them); 11 city seats have
  no mandal of their own on our map and say so. `components/constituencies/`, data
  `constituencies.json` from `build_constituencies.py` (runs weekly).
- **District outlines were rebuilt but are not drawn**: next to prototype districts they
  left seams. The district map is unchanged on purpose.
- Fixed: Monsoon Watch areas counted only the first part of split mandals; and
  `prefers-color-scheme` rules gave light pages dark "no data" cells. **This app themes
  only through `data-theme`; never key colours to `prefers-color-scheme`.**

Rules for these:

- **Maps draw `ap_map_display.json`; the pipeline and model read `ap_map_geometry.json`.**
  Never point the pipeline at the display file, and never point a map at the raw file
  (import `mapGeometry` from `lib/data.ts`). The model is re-tested on official outlines
  before it moves.
- Data-lake files in `app/data` are builder output: re-run the builder, never hand-edit.
  The builders need `data/raw/datalake/`, which only the user can pull
  (`phase3_levels/fetch_datalake.py`, their login via getpass). Never add credentials
  anywhere; never commit `data/raw/datalake/`.
- Keep the wording that carries meaning: "one reading, not a monthly mean", "not merged
  into it", "the model does not use it", "placed by location", "No mandal of its own on
  this map", whose outline is drawn, and the "N of 175" coverage line.
- Tests: `app/e2e/governance-constituencies.spec.ts`, `tests/test_official_data.py`
  (includes "no official outline is drawn far from the mandal it replaces").

## 1. What was built

### New data, refreshed every Monday

APWRIMS publishes more than groundwater. Three of its public dashboards are now
ingested by `phase3_levels/fetch_apwrims_context.py`. It sends about twenty
requests, verifies TLS, needs no login, and keeps the previous section if a feed
fails.

- **Soil moisture.** NRSC VIC land-surface model, per mandal, at 5, 30, 100 and
  150 cm. Each mandal is compared with its own values on the same date in every
  year since 2014. The figures are **modelled**, not measured.
- **Gauge rainfall.** AP Directorate of Economics and Statistics mandal rain
  gauges, for the water year from 1 June, against the department's normal. Each
  mandal gets the IMD departure bands: excess, normal, deficient, scanty, no
  rain. **Measured.**
- **Reservoirs.** 113 major and medium reservoirs, with storage now and a year
  ago, river basin, and the release into each canal. **Measured** at the dam;
  where the water goes is not known.

It writes three outputs:
- `app/data/water_context.json` (476 KB): the full record, imported only by
  server code;
- `app/data/water_context_summary.json` (16 KB): state and district figures,
  safe in client code;
- `app/data/water_context_mandals.json` (28 KB): per-mandal values for the
  maps.

Each run also writes a receipt, `data/refresh_receipts/apwrims_context.json`.

### The three-signal count, the main new idea

For each mandal, the site counts how many of three stated tests point to
stress:
- the groundwater shortfall is flagged;
- gauge rain is 20% or more below normal;
- soil moisture is in the driest quarter of years for the date.

It is a count, not a score. It uses only boundaries that join to exactly one
record. Currently all three agree in **21 of 524** mandals. The rules are in
`AGREEMENT_RULES` in `app/lib/agriculture.ts`, together with `agreementOf`; do
not re-derive them anywhere else.

### Rainfall record moved to CHIRPS v3

CHIRPS v2 production ends after December 2026. The whole record was rebuilt on
v3, from 1981. `phase3_levels/fetch_chirps_history.py` refuses to mix products,
guarded by `mandal_rain_history_chirps_manifest.json`. The model was re-run and
still clears its release gates:
- 3-month forecast error: 1.797 m (1.774 m on v2);
- nowcast error: 1.010 m (1.007 m on v2).

v3 reads June–August 2026 at **−41.5%**, the driest in 46 years. v2 read
−28.4%.

### IMD, wired but dormant

`phase3_levels/fetch_imd_context.py` reads district forecasts, warnings,
district rainfall and river-basin forecasts. It does nothing without the
`IMD_API_KEY` secret. With a key it writes only a cache that git ignores
(`data/private/`). It publishes to `app/data/imd_context.json` only when the
`IMD_PUBLISH` variable is `1`, because IMD's terms restrict redistribution. No
page reads IMD data yet.

### App modules

| Module | What it is | Client-safe? |
|---|---|---|
| `app/lib/waterContext.ts` | the full water context | **No**, server only |
| `app/lib/agricultureServer.ts` | memoised agriculture evidence, with water | **No**, server only |
| `app/lib/waterSummary.ts` | `waterSummary`, `waterForDistrict()` | Yes |
| `app/lib/waterMandals.ts` | map layers `gauge_rain_dev` and `soil_pct`: fixed scales, colours, legends, text | Yes |
| `app/lib/agriculture.ts` | agreement rules, counts and filters; soil, rain and signal columns in the CSV | Yes |
| `app/lib/irrigation.ts` | `seasonContext()`, plus season fields in the AWARE preview (tier logic unchanged) | Yes |
| `app/lib/brief.ts` | `seasonSentence()`: a ready-made sentence, **not rendered anywhere yet** | Yes |
| `app/lib/data.ts` | water types only, no water JSON imports | Yes |

A `"use client"` file that imports a server-only module ships half a megabyte
to every visitor. `tests/test_weekly_refresh_covers_published_data.py` fails if
that happens.

### New and changed screens

- **Overview** (`app/components/OverviewCockpit.tsx`, a client component now
  wrapped by a server `page.tsx`):
  - a "This water year so far" strip: gauge rain, soil, reservoirs, and the
    three-signal count;
  - Gauge rain and Soil views on the map.
- **Agriculture** (`AgricultureWorkspace.tsx`):
  - `WaterContextStrip`: three cards for gauge rainfall (with a category bar and
    key), soil moisture and reservoir storage (with basin bars and the largest
    canal releases);
  - a "Three signals agree" tile with "Show them on the map";
  - agreement dots in the review table, the side panel and the map tooltip;
  - filters "all three" and "two or more";
  - three figures in the governance brief;
  - a readiness source checklist.
- **Monsoon:**
  - satellite rain, gauge rain and reservoir storage tiles;
  - source ribbon;
  - a "Since this edition" note under the film, listing figures that have moved
    since it was made.
- **Climate:** a "This water year by district — driest first" table.
- **Map:** "Gauge rain vs normal" and "Soil moisture" views with fixed-scale
  legends (`MandalStatusMap.tsx`).
- **Every mandal page:** a "This season" card (`MandalSeasonContext.tsx`) with
  gauge rain, soil by depth, the three tests and the district's reservoirs.
- **Irrigation:** a "This season" column.
- **Other pages:** Snapshot, Methodology (an agreement card and the CHIRPS v3
  note), Readiness (three new sources and gate 04), Reports (a season CSV),
  Estimates and Scenario labels, the sidebar data dates and the AI brief route.
- **Name:** the site is now "AP Water Intelligence — Groundwater, Monsoon &
  Agriculture (Prototype)"; the sidebar and mobile header say "AP Water
  Intelligence".

### Tests

- New Python tests:
  - `tests/test_water_context.py` (22): parsing, categories, baselines, digests
    and unique-boundary joins;
  - `tests/test_chirps_product.py` (6): the v3 product guard;
  - `tests/test_imd_context.py` (8): dormant without a key, how the key is sent,
    parsers, private by default.
- New browser tests: `app/e2e/governance-water-context.spec.ts` (7).
- Updated:
  - the refresh-coverage test, which now scans all of `app/lib`,
    `app/components` and `app/app`, and blocks client leaks;
  - `test_monsoon_film.py`: the film is checked against its own recorded
    snapshot, and the page must disclose what has moved since.

Current state: 295 Python tests, the type check and 132 Playwright tests pass.

To run them:
```sh
python3 -m pytest -q                                   # repository root
cd app && npm run typecheck && PAGES_BASE_PATH= npm run build:static
node scripts/serve-static.mjs --port 3217 --bind 127.0.0.1 --directory out   # from app/
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3217 npx playwright test                # from app/, never the root
```
Port 3100 is taken on this machine.

## 2. Task 1: re-narrate and re-render the Monsoon film. Human review is required.

**Why.** The film (`app/public/films/monsoon/`) is a fixed August-2026 edition.
It speaks CHIRPS v2 figures:
- "rainfall was 28.4 percent below" its average;
- "6 of 7 El Nino summer monsoons" had below-average rain.

The site now reads −41.5% and 5 of 7. Until the film is regenerated, the Monsoon
page shows the "Since this edition" note (`app/components/MonsoonFilm.tsx`).

**Assess first, and show the user before rendering:**
1. Which narration lines change. Run `scripts/prepare_monsoon_film.py` without
   `--voice` and diff each scene's `voice` in
   `app/public/films/monsoon/manifest.json`. Expect changes in `ap-history`
   (5 of 7) and `rain` (41.5 percent below). Check that `mandals` (62.7%) and
   `well` (Orvakal) are unchanged.
2. Whether to add one line of corroboration from the state's own gauges.
   `water_context.json` holds the water-year-to-date gauge figures. That changes
   the script, so it needs the user's approval. Every spoken number must be read
   from `app/data`, never typed. The tests enforce this.
3. Pronunciations, caption timing, and that each scene's speech fits its
   duration (`test_monsoon_film.py` checks the timeline).
4. Size. The renders are about 82 MB (landscape) and 90 MB (portrait), both
   committed to git. Ask the user whether to keep committing them or move them
   to Git LFS or external hosting.

**Then render**, following `docs/monsoon_film_production.md`:
```sh
PYTHONPATH=.video-python python3 scripts/prepare_monsoon_film.py --voice   # edge-tts
python3 -m http.server 4178 --bind 127.0.0.1 --directory app/public
node scripts/render_monsoon_film.mjs
node scripts/render_monsoon_film.mjs --portrait
```

**Verify:**
- every scene check in `dist/monsoon-film` passes;
- `python3 -m pytest` passes;
- the Playwright `film` project passes;
- the "Since this edition" note no longer appears on `/monsoon/`.

The note disappears by itself once the `narrated` figures in
`app/data/monsoon_film.json` equal the live ones.

## 3. Task 2: the 60-second El Niño video

`docs/el_nino_60s_script.md` carries the v3 figures:
- −13.0% usually, −41.5% this year;
- below normal in 5 of 7 years;
- Spearman ρ −0.47 against the June–August ONI (p = 0.001).

`tests/test_elnino_script.py` requires the on-screen cards to match
`app/data/monsoon_watch.json`. Assess `scripts/build_elnino_video.py`: its inputs,
assets and voice. Build the video, then check the card text, the words-per-minute
limits and the sources table. Same human-review gate as the film.

## 4. Task 3: merge your redesign with `main`. This is the biggest risk.

Your uncommitted redesign on `codex/groundwater-redesign` was based on `70e3f9e`,
behind `main`. At last check it touched these same files:
- `README.md`
- `app/app/methodology/page.tsx`, `app/app/reports/page.tsx`
- `app/components/DataProvenanceDates.tsx`
- `app/lib/data.ts`
- `phase3_levels/build_levels_engine.py`
- the generated data files

Run `git diff --name-only main...` for the current overlap. Since that check, `main`
also changed these, which your redesign will meet:
- `app/lib/data.ts`: `mapGeometry` now imports `ap_map_display.json`; new helpers
  `boundarySummary`, `boundaryLabel`, `geometryForMandal`. Your `AtlasMap` must draw
  `mapGeometry`, not a raw geometry import.
- `app/lib/types.ts`: `MapMandal` gained `src`, `lgd`, `ac`, `acCode`, `pc`, `div`,
  `officialKm2`, `verdict`; `MapGeometry` gained `official_*` fields.
- `app/components/AppShell.tsx`: nav items This Week, Drought Watch, Constituencies.
- `app/components/MandalDetail.tsx` (adds `MandalStateReading`, `MandalDroughtCheck`),
  `OverviewCockpit.tsx` (State wells and drought cells), `MapLegend.tsx`,
  `MandalStatusMap.tsx` (outline labels), `app/app/monsoon/page.tsx` (`EnsoOutlook`, State
  wells stat), `methodology` and `readiness` pages (new sources; the ledger now has nine).

Steps:
1. Commit the redesign on its own branch.
2. Merge `main` into it.
3. For generated data files, take `main`'s copy and re-run the pipeline steps.
4. Merge code by hand.

Then wire the new data into your redesigned pages (atlas `EvidencePanel`,
`WaterWorkspace`, `ReviewQueue`, `AtlasMap`), using the modules in section 1.
Do not bring back CHIRPS v2, or "Not connected" for soil, gauges or reservoirs.
Crop data and canal delivery to mandals are still genuinely not connected.

## 5. Task 4: visual polish for the CM review

Do this after Task 3, in your redesign's visual language. Do not restyle
`main`'s current look separately. The aim: a senior official understands each
page's answer in five seconds, and an analyst can still find every caveat.

**Already fixed on this branch; don't redo:**
- the brand in the sidebar and mobile header;
- the Overview map views wrapping onto two lines;
- the unlabelled rain-category bar (it now has a key);
- the mandal card's half-empty reservoir row;
- "2/3" breaking across lines;
- the Agriculture section badge, now "Groundwater readings · Aug 2026".

**Found in a screenshot check on 2026-10-02** (1440 and 390 px, light and dark):
1. **Overview leads with model internals.**
   - The KPI row (median modelled nowcast, deepest modelled mandal, median
     model band, outside the model band) is analyst language.
   - Two identical alarm-pink panels follow ("Monsoon watch" and "This water
     year so far").
   - The single strongest governance figure, "Three signals agree: 21 mandals",
     sits at the bottom left of the second panel.

   Consider:
   - one "season at a glance" band led by that count;
   - red used only on figures that are bad, not on whole panels;
   - the KPI row moved under the model-evaluation disclosure.
2. **Names disagree.** The Overview hero still reads "AP Groundwater
   Verification Cockpit", and every hero eyebrow says "Andhra Pradesh
   Groundwater Assessment". Propose wording to the user; don't rename on your
   own.
3. **Monsoon "This season so far":** seven tiles in a four-column grid leave a
   gap, and "State storage estimate — Under review" uses headline-figure styling
   for a non-figure. Make it a status chip.
4. **Map page:** the card title ("Andhra Pradesh — Mandal Fusion Status") and
   the "Latest observation period Aug 2026" chip stay the same when the Gauge
   rain or Soil view is selected. Only the legend changes. The title and date
   should follow the view.
5. **Dark theme:**
   - a light gradient band shows above the hero, and in the top gutter of
     mandal pages;
   - no-data mandals render near-white on dark maps. Use a dark-theme no-data
     token.
6. **Text density.** Many notes are grey 10–11.5 px. For laptops and
   projectors, use at least 12 px body text with 4.5:1 contrast. Move long
   caveats behind a disclosure, keeping their words exactly.
7. **Phone (390 px):** the Overview map views scroll sideways with no cue, and
   "Soil" is off screen. Use a select, a fade edge or wrapping.
8. **One colour language.** Each signal uses its own colours:
   - groundwater flags: red, amber, green and grey;
   - rain bands: maroon, red, amber, green and blue;
   - soil: blue bars;
   - agreement: red and green dots.

   Define one documented stress palette. Add a shape or pattern cue so that
   red–green colour blindness loses nothing.
9. **Agreement dots** are 8 px. Make them legible, explain them at first use,
   and keep "a count, not a score".
10. **Presentation conditions.** Check 1920×1080 and 1280×720 at 125–150% zoom,
    as on a projector, and that the Agriculture brief and Snapshot print
    cleanly.
11. **New screens from 3 October** (Drought Watch, This Week, Constituencies, the
    El Niño outlook, the mandal "State network" card): bring them into the same
    visual language. On Constituencies, the selected seat's label can clip at the
    map edge, and the seats with no mandal of their own read as blank grey; give
    them a hatch and a legend entry. The sidebar's Data Status could list
    "State wells · 9 Sep 2026" beside the other feeds.

**Rules for this task:**
- Do not change any number, date, unit, Measured/Modelled tag, source link or
  caveat wording without the user's approval. The hierarchy may change; the
  meaning may not.
- Do not grow the client bundle. The largest chunk is 3.51 MB; check it after
  `build:static`. Do not import server-only modules into client files.
- Watch per-page weight. A component that renders the full mandal list into
  each of the roughly 670 mandal pages once made the export 1.1 GB.
- Keep `pytest`, `typecheck` and every Playwright project green. If a layout
  test pins old structure, change it only with a stated reason.
- Respect `prefers-reduced-motion`, visible keyboard focus and the existing
  ARIA labels.
- Show the user before-and-after screenshots (1440 and 390 px, light and dark)
  before committing.

## 6. Task 5: optional, and ask the user first

- **EOS-04 500 m soil-moisture check** for one district. ISRO Bhoonidhi is open
  data but needs a login, and its API needs a whitelisted static IP. Download the
  rasters by hand, take zonal statistics on the prototype mandal polygons, and
  compare with APWRIMS's NRSC model values. This checks the modelled soil signal
  before officials lean on it.
- **A one-page CM brief (PDF)** generated from `app/data`:
  - the situation;
  - the mandals where three sources agree;
  - what each department must supply: crop-sown aggregates, the canal
    command-area map, an IMD key.

  `seasonSentence()` in `app/lib/brief.ts` is ready to use. Every number must be
  read from the data files.
- **Telugu versions** of the one-pager and the film narration. edge-tts has
  Telugu voices. A Telugu speaker must review every line before anything is
  published.
- **A one-page brief per constituency** (175 printable pages from
  `constituencies.json`: the seat's mandals, groundwater status, State wells since May,
  drought-manual reading, rain), for MLA and collector meetings. Every number read from
  the data files; same caveats as the page.

## 7. Guardrails

- Never push to `main` while the weekly refresh runs (Mondays from 02:00 UTC,
  about 20 minutes). Its own push fails if `main` moves under it.
- A public portal is not authorisation. Never get past a login: APWRIMS's
  crop-sown and crop-stress dashboards sit behind one, and access to them is the
  thing to ask the state for.
- Keep "measured" and "modelled" labels on every figure, and each figure's own
  date.
- Never put a key or token in the repository, a commit message or a chat.
- The AI Living Labs data lake is pulled only by the signed-in user. Never script around
  its login, never store a password or refresh token, never commit `data/raw/datalake/`.
- The State readings are a single snapshot; the model never uses them, and they are never
  merged into the monthly series.
