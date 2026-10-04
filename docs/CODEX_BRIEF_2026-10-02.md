# Codex brief: the redesign merge, film and video, Telugu, a sceptical review, polish (rewritten 3 October 2026)

Written by Claude Code for Codex. This replaces the 2 October brief at the same path.
Everything below is on `main` (through PR #45) and live on GitHub Pages.

Ground rules:
- Start every task on a fresh branch off `main`.
- Never edit inside the worktree `.claude/worktrees/agri-water-context`.
- Ask the user before committing, pushing or merging.

The site is reviewed by the Chief Minister's office, the CMO and IAS officers, including
RTGS. The bar is high, and so is the cost of a wrong or overclaimed figure. Polish how
things look, but never change what they say without asking.

## 0. Since the last brief (do not redo)

| PR | What landed |
|---|---|
| #40 | **Readiness from the State's data.** Counts are read from the published map (595 and 628 of 670). Each mandal names its own outline source, and the Agriculture CSV has an `outline` column. |
| #40 | **Two experiments; neither changes the model.** (1) Rain averaged over the official outlines gives no gain (gate MAE 1.7969 → 1.8001 m). (2) The blend over-forecasts recharge when a forecast is made before a dry monsoon fails (bias −1.08 m); two corrections were tested and rejected. Both are written up on Methodology; scripts are `phase3_levels/experiment_*.py`. |
| #41 | **Design pass.** Quiet caveat line in place of boxed banners; neutral briefing panels in place of the salmon alarm boxes; a 6-column verify table with signal pills; Data readiness as a list. Also: the Constituencies statewide panel, This Week cards, Watchlist ordering and the sidebar State wells date. Seven undefined token names now alias real tokens. |
| #42 | **A confidence note on every released forecast** (`app/lib/forecastReliability.ts`): "Backed by its record" or "Lower confidence". |
| #42 | **A one-page brief for each of the 175 assembly seats** (`/constituencies/<AC code>`): prints on one A4 sheet. |
| #42 | **The CHIRPS v3 record rebuilt** with every part of a split mandal (1981-01 to 2026-08), and the model retrained on it. |
| #42 | **A measured cross-section in the crop-water lab**, replacing the AI artwork. A rendering fix restored spaces lost after `</strong>`. |
| #43 | **Seven reference crops in the crop-water lab**, each drawn by its habit; this brief. |
| #45 | **The crop water check's track record and the new signals where officials look.** Re-run on past kharif weeks (2024, 2025, 2026) against what cropland vegetation did next, with a verdict per crop and stage on the Agriculture page. The verdict compares each mandal with itself in the same season (pooling mandals or seasons misleads, and both are disclosed): none backed, seven weak (mid- and late-season cereals and cotton, 1–4 points lower), twelve not borne out (every initial stage, chilli), two untested. This Week lists "where field teams would learn most" (four or more of six signals). Constituency briefs gain crops short of water, crop vegetation and the groundwater category, still one A4 page for the largest seat. Two weekly cards (crop vegetation, crops short) begin with the next Monday refresh. |
| #44 | **This week in the fields** (Agriculture section 02): an FAO-56 crop water check for every mandal, for a chosen crop and stage, on this week's soil moisture and ECMWF's forecast. Also crop vegetation (NOAA VCI weighted to cropland) and the official CGWB groundwater category, on the Agriculture map, the Map page and every mandal page. The Map page's title and date now follow the view. |

Taken off the to-do list as done: per-constituency briefs, the sidebar State wells date,
the Overview alarm panels, the crop visual, the forecast confidence flag and the
rainfall rebuild.

## 1. Priorities, in order

1. **Merge your redesign with `main`.** This is the biggest risk.
2. **Re-render the Monsoon film and build the 60-second El Niño video.** Each needs human review before publishing.
3. **Telugu versions of the constituency brief and a CM one-pager.** A Telugu speaker reviews every line.
4. **An independent, sceptical review of the whole site.** Report only; change no code.
5. **Remaining visual polish**, in your redesign's language.
6. **Optional, ask first:** the EOS-04 soil-moisture check.

## 2. Task 1: merge your redesign with `main`

Your uncommitted redesign on `codex/groundwater-redesign` was based on `70e3f9e`. It is
now far behind.

Steps:
1. Commit the redesign on its own branch.
2. Merge `main` into it.
3. For generated data files, take `main`'s copy; never hand-merge JSON.
4. Merge code by hand.
5. Run `git diff --name-only main...` for the full overlap.

**Changed on `main` since `7305ab7`** (the previous brief). Expect conflicts in these files:

- **Pages:** `app/app/` `agriculture`, `changes` (and `Changes.module.css`), `constituencies`, `districts`, `estimates`, `map`, `methodology`, `nasa`, `readiness`, `scenario` and `watchlist` pages, plus `globals.css` (print rules at the end).
- **Components:**
  - `AppShell`, `Badges` (new `SignalPill`), `LiveMap`, `MandalDetail`, `MandalSeasonContext`, `MandalTable`, `OverviewCockpit`, `PacificEnso`, `SelectedMandalPanel`, `SourceReadinessPanel`;
  - `agriculture/AgricultureWorkspace`, `CropWaterLab`, `CropField.module.css`, `GovernanceBrief`;
  - `constituencies/ConstituencyExplorer` and `Constituencies.module.css`;
  - `drought/Drought.module.css` and `MandalMatrix`;
  - `living-water-table/SelectedMandalPanel`.
- **Libraries:** `app/lib/agriculture.ts`, `agricultureServer.ts` and `data.ts`.
- **Pipeline:** `phase3_levels/fetch_chirps_history.py` and `fetch_weekly.py`, plus `.github/workflows/phase3_weekly_levels.yml`.

**New on `main`:**
- `app/components/agriculture/LiveCropCheck.tsx` (+ CSS) and `FieldSignalsStrip.tsx`;
- `app/lib/cropWater.ts`, `app/lib/fieldSignals.ts` (client-safe) and `app/lib/fieldSignalsServer.ts` (server only);
- `phase3_levels/fetch_field_signals.py` (weekly), `crop_water.py`, and the static builders `build_soil_water_capacity.py` and `build_cropland_fraction.py`;
- `app/data/field_signals.json` (server only) and `field_signals_mandals.json` (client-safe);
- `tests/test_field_signals.py` and `app/e2e/agriculture-live.spec.ts`;
- `app/lib/fieldPriority.ts` (server only: the six-signal list and crop water by crop), `phase3_levels/build_crop_water_record.py` (by hand, about an hour of paced reanalysis downloads) and `app/data/crop_water_record.json`;
- `app/e2e/governance-field-teams.spec.ts`;
- `app/app/constituencies/[code]/page.tsx`;
- `app/components/constituencies/PrintBrief.tsx` and `ConstituencyBrief.module.css`;
- `app/components/agriculture/FieldSection.tsx` and `FieldSection.module.css`;
- `app/lib/forecastReliability.ts`;
- `phase3_levels/build_forecast_reliability.py` and `experiment_*.py`;
- `tests/test_forecast_reliability.py`;
- `app/e2e/governance-text.spec.ts`.

**Deleted on `main`; do not bring them back:**
- `components/agriculture/NaturalCropScene.tsx` (the WebGL scene);
- `components/agriculture/cropArtwork.ts`;
- six `app/public/assets/agriculture-*-stages` and `agriculture-root-zone` images.

**Contracts the merge must keep:**
- **Maps:** they draw `mapGeometry` from `lib/data.ts`, which is `ap_map_display.json`. The pipeline and model read `ap_map_geometry.json`. Never cross them.
- **Agriculture:** `officialOutline` on each agriculture row, `outlineLabel()` in tooltips, and the `outline` CSV column.
- **Forecasts:** `reliabilityFor(id)` drives the `forecast-trust` note in the mandal panel.
- **Crop numbers:** `CROP_REFERENCE` in `lib/agriculture.ts` is the single source for coefficients, root depths, depletion fractions (p), heights and source labels; `FieldSection` reads it. Never type a crop number in a component. `phase3_levels/crop_water.py` mirrors it, and `tests/test_field_signals.py` fails if they drift.
- **Crop water check:** `lib/cropWater.ts` and `phase3_levels/crop_water.py` are the same FAO-56 water balance, step for step, including left-to-right sums. The page must reproduce the pipeline's `crossCheck` counts exactly (`agriculture-live.spec.ts`). Change one, change both.
- **Field signals:** client code imports only `lib/fieldSignals.ts` (the map layers). `field_signals.json` and `lib/fieldSignalsServer.ts` stay on the server; the Agriculture page gets slim rows (`fieldEvidenceInput({ slim: true })`) and draws its live map after load, so the page stays near 1.5 MB.
- **Constituency pages:** `/constituencies/[code]` uses `generateStaticParams` with `dynamicParams = false`.
- **Text after an inline tag:** a line of text that follows `</strong>` or `</em>` on the next source line loses its leading space in this build. Write `{" "}`; `governance-text.spec.ts` reads the rendered text.
- **Print:** the print rules hide `.mobileBar`, force `main > div` to full opacity and keep the desktop grid. Without them the brief prints blank or on two pages. The brief now has ten table columns and a field band; AC 172 (11 mandals) fits one A4 page with about 80 px to spare, and `governance-constituencies.spec.ts` prints it to PDF and counts the pages. Re-measure before adding anything to the brief.
- **Weekly refresh:** "build forecast reliability" runs after "publish V2 app data", and `app/data/forecast_reliability.json` is in the workflow's commit list.

Then wire `main`'s data into your redesigned pages (atlas `EvidencePanel`,
`WaterWorkspace`, `ReviewQueue`, `AtlasMap`) using the modules in section 8. Do not bring
back CHIRPS v2, or "Not connected" for soil, gauges or reservoirs. Crop-sown data and canal
delivery to mandals are still genuinely not connected.

## 3. Task 2: the Monsoon film and the El Niño video (human review required)

**The film** (`app/public/films/monsoon/`) is a fixed August-2026 edition on CHIRPS v2. The
site now reads:

| Figure | Film says (v2) | Site reads now (v3) |
|---|---|---|
| June–August rain | 28.4% below average | 41.5% below average, driest of 46 years |
| El Niño summer monsoons below average | 6 of 7 | 5 of 7 |
| Mandals with falling water | 62.7% | check against `app/data` |

Until the film is regenerated, the Monsoon page shows a "Since this edition" note.

Assess first, and show the user before rendering:
1. **Narration diff.** Run `scripts/prepare_monsoon_film.py` without `--voice` and diff each scene's `voice` in `manifest.json`. Expect changes in `ap-history` and `rain`. Check that `mandals` and `well` (Orvakal) are unchanged.
2. **Possible new line.** The user may want one line of corroboration from the State's own gauges or wells. That changes the script, so ask. Every spoken number is read from `app/data`, never typed; the tests enforce this.
3. **Timing.** Check pronunciations and caption timing, and that each scene's speech fits its duration (`test_monsoon_film.py`).
4. **Size.** The renders are about 82 MB (landscape) and 90 MB (portrait), committed to git. Ask whether to keep committing them or move them to Git LFS or external hosting.

Then render, following `docs/monsoon_film_production.md`:
```sh
PYTHONPATH=.video-python python3 scripts/prepare_monsoon_film.py --voice   # edge-tts
python3 -m http.server 4178 --bind 127.0.0.1 --directory app/public
node scripts/render_monsoon_film.mjs
node scripts/render_monsoon_film.mjs --portrait
```

Done when:
- every scene check in `dist/monsoon-film` passes;
- `pytest` and the Playwright `film` project pass;
- the "Since this edition" note disappears from `/monsoon/`. It goes by itself once the `narrated` figures in `app/data/monsoon_film.json` equal the live ones.

**The El Niño video.** `docs/el_nino_60s_script.md` carries the current figures:

| Figure | Value |
|---|---|
| June–August rain, El Niño years | −13.0% usually; −41.5% this year |
| El Niño years below normal | 5 of 7 |
| Spearman ρ against the June–August ONI | −0.47 (p = 0.001) |
| Recharge shortfall | 8,029 million m³, in 543 of 593 mandals |

`tests/test_elnino_script.py` requires the on-screen cards to match
`app/data/monsoon_watch.json`. Assess `scripts/build_elnino_video.py` (inputs, assets,
voice), build it, then check the cards, the words-per-minute limits and the sources table.
The same human-review gate applies.

## 4. Task 3: Telugu, for the people who will actually use the briefs

District collectors, MLAs and their staff work in Telugu. Build in this order:

1. **The CM one-pager, in English first.** It does not exist yet. Generate it from `app/data`. Ideally it goes on an A4 print route like the constituency brief, reusing its print CSS. It should carry:
   - the situation: rain, recharge shortfall, the State wells' latest reading;
   - the mandals where all three sources agree;
   - how the forecasts have fared;
   - the most affected seats;
   - what each department must supply: crop-sown aggregates, the canal command-area map, an IMD key.

   `seasonSentence()` in `app/lib/brief.ts` is ready. Every number is read from data files, with the same caveats as the pages.
2. **Telugu versions of the CM one-pager and the constituency brief.** Use a separate static route per language, e.g. `/constituencies/[code]/te`, so each prints on its own. Rules:
   - Keep every number, date and Measured/Modelled tag identical to the English.
   - Mandal and district names in Telugu must come from an authoritative list (LGD or the State's records). Never machine-transliterate names unreviewed.
   - Put the terms in a glossary, `docs/telugu_glossary.md`, for the reviewer: groundwater, recharge, forecast confidence, "not a declaration", "modelled".
   - Load a Telugu face that the CSP allows, e.g. Noto Sans Telugu through `next/font`.
   - Re-check that the largest seat (AC 172, 11 mandals) still prints on one A4 sheet. Telugu runs longer.
3. **Gate.** A Telugu speaker reviews every line before anything is published. Show the user both PDFs side by side first.

## 5. Task 4: the sceptical review (report only)

Before polish, read the site as its harshest reviewer would. Picture a senior IAS officer
who has seen many dashboards and says "this won't cut it".

Write `docs/review_<date>.md`. Change no code in this task.

For every page, at 1440 and 390 px, in light and dark:
- **Five-second test.** Does a senior official get the page's answer in five seconds? What is in the way?
- **Overclaims.** Is anything modelled presented as measured, or a provisional flag presented as a finding? Does every headline figure carry its date and source?
- **Consistency.** Does the same count differ between pages? Examples: mandals compared, flagged, three-source agreement, the "N of 175" seats.
- **Traceability.** Trace each headline figure to its `app/data` file and the upstream source. Report any you cannot trace.
- **Disclaimers.** Are Drought Watch ("not a declaration"), the crop lab ("not advice"), and the forecasts (confidence note, "nothing changes a forecast") stated where an official would read them, not only in a footnote?
- **Missing pieces.** What would the CMO ask for that is missing, and which department holds it?

Rank findings by severity (would embarrass in the room / confusing / cosmetic). Give each
the page, a screenshot path and a proposed fix. The user decides what to act on.

## 6. Task 5: remaining visual polish

Do this after Task 1, in your redesign's visual language. Each item below was still open
on 3 October:

1. **Names disagree.** The Overview hero reads "AP Groundwater Verification Cockpit" (`OverviewCockpit.tsx`). The hero eyebrows read "Andhra Pradesh Groundwater Assessment" (`HeaderHero.tsx`, `LivingWaterTablePage.tsx`). The site is "AP Water Intelligence". Propose wording to the user; don't rename on your own.
2. **The Overview KPI row leads with model internals:** Median Modelled Nowcast, deepest nowcast, band width, outside band. Consider leading with the season and the three-signal count, and moving the KPI row under the model-evaluation disclosure.
3. **Monsoon "State storage estimate — Under review"** (`app/app/monsoon/page.tsx`) uses headline-figure styling for a non-figure. Make it a status chip.
4. **One documented stress palette with a shape or pattern cue,** so red–green colour blindness loses nothing. The palettes today:
   - groundwater flags: red, amber, green, grey;
   - rain bands: maroon, red, amber, green, blue;
   - soil: blue bars;
   - agreement: dots;
   - crop water: comfortable, within 7 days, short now, severe (`CROP_WATER_STATES`);
   - crop vegetation and groundwater category (`VCI_CLASSES`, `GEC_CATEGORIES` in `lib/agriculture.ts`).
5. **Projector check.** Test 1920×1080 and 1280×720 at 125–150% zoom. Check that the constituency brief, the Agriculture brief and Snapshot print cleanly.
6. **Constituencies.** The 11 city seats with no mandal of their own read as blank grey; give them a hatch and a legend entry. The selected seat's label can clip at the map edge.
7. **Dark theme.** No-data mandals render near-white on dark maps; use a dark no-data token. Check for a light gradient band above the hero.
8. **Text density.** Body text should be at least 12 px with 4.5:1 contrast. Move long caveats behind a disclosure with their words unchanged.
9. **Phone.** Check the Overview map-view switcher (sideways scroll with no cue) and the size of the agreement dots; either may already be fixed.
10. **Crop-water lab and This week in the fields (new).** Check all seven crops and the field-week chart at 390 px and in dark theme. The drawings are generated from `CROP_REFERENCE`; do not replace them with artwork. Keep "Soil depth to scale · plants at half scale · not field imagery" and the stand-in notes.

Rules for this task:
- **Meaning.** Do not change any number, date, unit, Measured/Modelled tag, source link or caveat wording without the user's approval. The hierarchy may change; the meaning may not.
- **Bundle size.** Do not grow the client bundle. The largest chunk is 4.15 MB, the shared data chunk, the same as live; the next is 3.52 MB. Check after `build:static`, and never import server-only modules into client files.
- **Page weight.** A component that renders the full mandal list into each of the roughly 670 mandal pages once made the export 1.1 GB.
- **Tests.** Keep `pytest`, `typecheck` and every Playwright project green. Change a layout test only with a stated reason.
- **Accessibility.** Respect `prefers-reduced-motion`, visible keyboard focus and the existing ARIA labels.
- **Theme.** This app themes only through `data-theme`; never key colours to `prefers-color-scheme`.
- **Review first.** Show the user before-and-after screenshots (1440 and 390 px, light and dark) before committing.

## 7. Task 6: optional, ask the user first

**EOS-04 500 m soil-moisture check** for one district. ISRO Bhoonidhi is open data, but it
needs a login, and its API needs a whitelisted static IP.
1. Download the rasters by hand.
2. Take zonal statistics on the mandal polygons.
3. Compare them with APWRIMS's NRSC model values.

This tests the modelled soil signal before officials lean on it.

## 8. Reference: what the site carries now

### Sources, refreshed every Monday

| Source | What it gives | Status |
|---|---|---|
| APWRIMS groundwater | Monthly well depths; the base of the model | Measured |
| APWRIMS soil moisture | NRSC VIC model, per mandal, at 5, 30, 100 and 150 cm. Each mandal is set against its own same-date values since 2014. | Modelled |
| APWRIMS gauge rain | AP DES mandal gauges, water year from 1 June, against the department's normal, in IMD bands | Measured |
| APWRIMS reservoirs | 113 reservoirs, storage now and a year ago, and canal releases. Where the water goes is not known. | Measured |
| CHIRPS v3 rain | 1981 onward, mandal means over every part of a split mandal. Product guard in `fetch_chirps_history.py`. | Satellite estimate |
| NOAA CPC El Niño outlook | Synopsis quoted word for word | Forecast |
| ECMWF IFS via Open-Meteo | Daily reference ET (Penman-Monteith) and rain per mandal, a week back and a week ahead; drives the crop water check | Forecast |
| NOAA STAR VHP × ESA WorldCover | Weekly VCI per mandal, weighted to cropland (2021 cropland map) | Satellite index |
| CGWB / State GWD via INGRES | The Dynamic Ground Water Resources assessment per mandal: category, stage of extraction, draft by use; latest year and the one before. Matched to boundaries by name, neighbourhood and spelling (664 of 670) | Official assessment |
| ISRIC SoilGrids 2.0 | Water-holding capacity by depth per mandal (static; `build_soil_water_capacity.py`) | Predicted |

All APWRIMS feeds come through `fetch_apwrims_context.py`. It needs no login and keeps the
previous section if a feed fails.

**IMD** is wired but dormant. It needs the `IMD_API_KEY` secret, and it publishes only with
`IMD_PUBLISH=1`, because IMD's terms restrict redistribution.

**The State's own data** comes from the AI Living Labs data lake. The user pulls it with
their own login (`fetch_datalake.py`, getpass). It supplies two things:
- 595 of 670 official mandal outlines, through `build_official_boundaries.py`;
- the State network's latest reading, 1,746 stations, through `build_datalake_snapshot.py`.

The rules for it:
- The reading is one snapshot. The model never uses it, and it is never merged into the monthly series.
- Files built from it are builder output: re-run the builder, never hand-edit them.

### Key figures and rules

**Three-signal count.** For each mandal the site counts how many of three tests point to
stress:
- the groundwater shortfall is flagged;
- gauge rain is 20% or more below normal;
- soil moisture is in the driest quarter of years for the date.

It is a count, not a score, and it uses only boundaries that join to exactly one record.
The rules live in `AGREEMENT_RULES` and `agreementOf` in `app/lib/agriculture.ts`; do not
re-derive them elsewhere.

**Forecast confidence.**
- `build_forecast_reliability.py --calibrate` splits the 2018–2026 quarterly backtest by the month a forecast is made and by the rain over the three months before it (deficit ≤ −20%, near normal, surplus ≥ +20%).
- Each cell gets a verdict against assuming no change:
  - beats: 10% or more better;
  - worse: 5% or more worse;
  - level: anything between;
  - untested: fewer than 500 rows or 5 years.
- August 2026's 657 forecasts: 642 level, 15 beats.
- Nothing changes a forecast. An El Niño rule was tested and rejected.

**Drought Watch** (`/drought`) reads each mandal through the national *Manual for Drought
Management 2020*. Do not change its rules, thresholds or "interpretations" list, or any
wording that says "not a declaration".

**El Niño outlook** (`/monsoon#enso-outlook`). The NOAA synopsis is quoted word for word.
The forecast half (dark) and the State's record (light) stay visibly separate.

**Guards (do not touch).** `check_not_shrinking` in `fetch_apwrims_context.py` and
`check_past_weeks` in `build_drought_watch.py`. On 3 October the APWRIMS portal dropped
September for all 28 districts; these guards stopped it being published.

**Crop-water lab.** Seven reference crops: maize, groundnut, cotton, chilli, red gram,
Bengal gram and jowar.
- Coefficients and heights come from FAO-56 Table 12; root depths from Table 22 (Chapter 8).
- Chilli uses the sweet-pepper row.
- Red gram uses the "beans, dry and pulses" row, with ICRISAT's rooting depth (2 m) and height (<https://oar.icrisat.org/10485/>).
- A note beside the crop picker names each stand-in.
- Bengal gram is a rabi crop.
- Paddy is deliberately absent: flooding and percolation need different accounting.

### Modules: what client code may import

| Module | What it is | Client-safe? |
|---|---|---|
| `app/lib/waterContext.ts`, `agricultureServer.ts` | Full water context; agriculture evidence with water | **No** |
| `drought_watch`, `gw_state_snapshot` data | Drought Watch detail; the State wells snapshot | **No** |
| `app/lib/waterSummary.ts`, `waterMandals.ts`, `stateSummary.ts` | Summaries and map layers | Yes |
| `app/lib/agriculture.ts` | Agreement rules, `CROP_REFERENCE`, crop budget, CSV | Yes (imports only types from `lib/data`) |
| `app/lib/forecastReliability.ts` | `reliabilityFor(id)`, `reliabilitySummary()` | Yes |
| `app/lib/cropWater.ts` | The FAO-56 crop water check; mirrors `phase3_levels/crop_water.py` | Yes |
| `app/lib/fieldSignals.ts` | Map layers `vci` and `gec_category` | Yes |
| `app/lib/fieldSignalsServer.ts` | Forecast, weekly series, volumes; `liveField()`, `fieldEvidenceInput()` | **No** |
| `app/lib/brief.ts` | `seasonSentence()` | Yes |

A `"use client"` file that imports a server-only module ships half a megabyte to every
visitor; `tests/test_weekly_refresh_covers_published_data.py` fails if that happens.

### Checks

Current state: 404 Python tests, the type check and 157 Playwright tests pass. One
Playwright test, the 390 px agriculture fade-in check, can time out when the whole suite
runs in parallel; it passes on its own.

```sh
python3 -m pytest -q                                   # repository root
cd app && npm run typecheck && PAGES_BASE_PATH= npm run build:static
node scripts/serve-static.mjs --port 3217 --bind 127.0.0.1 --directory out   # from app/
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3217 npx playwright test                # from app/, never the root
python3 scripts/audit_watch_sources.py --online        # after Monsoon Watch inputs change; expect 0 mismatches
```

Port 3100 is taken on this machine.

## 9. Guardrails

- **Weekly refresh.** Never push to `main` while it runs (Mondays from 02:00 UTC, about 20 minutes). Its own push fails if `main` moves under it.
- **Logins.** A public portal is not authorisation. Never get past a login. APWRIMS's crop-sown and crop-stress dashboards sit behind one, and access to them is what to ask the State for.
- **Labels.** Keep the Measured/Modelled label and the date on every figure.
- **Secrets.** Never put a key, token or password in the repository, a commit message or a chat. Credentials live only as GitHub Actions secrets.
- **Data lake.** Only the signed-in user pulls it. Never script around its login, never store a password or refresh token, and never commit `data/raw/datalake/`.
- **People.** Never scrape personal or farmer-level records.
