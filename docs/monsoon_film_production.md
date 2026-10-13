# Monsoon film production

The October 2026 review edition explains El Nino, the India connection,
AP rainfall history, measured groundwater changes, NOAA's attributed Pacific
outlook, the historical-winter summer projection, drought-manual screening,
village preparedness and city actions. It never forecasts AP rainfall or makes
an official drought declaration. September CHIRPS is not yet published in the
checked-in source: the rainfall chapter still covers June-August 2026.

## Review gate

**Not approved for publication.** Microsoft Edge synthesis with
`en-IN-PrabhatNeural` returned HTTP 403 on both the film and a short test using
edge-tts 7.2.8. A matching compatibility issue is recorded at
https://github.com/rany2/edge-tts/discussions/489. No access-control workaround
was attempted. The user explicitly approved macOS `Rishi` (Indian English) for
a temporary review cut only. Both videos and the player visibly identify it as
a review cut. `review.publishApproved` remains false. Open the PR as a draft;
do not merge/deploy until the intended narration and native-speaker review are complete.

The Telugu edition is deferred: the requested neural voice's quality could
not be assessed while synthesis is unavailable. Do not equate a successful
technical render with approval of pronunciation or translation. English and
Telugu each require a native speaker's review before publication.

## Assets and implementation

- `app/public/films/monsoon/film.js`: deterministic Canvas and Three.js animation.
- `studio.html`: narrated browser preview; serve over HTTP rather than opening as a file.
- `manifest.json`: dated measurements, geometry, timing and source provenance.
- `pacific-to-ap-landscape.mp4` and `pacific-to-ap-portrait.mp4`: H.264/AAC, 30 fps,
  1920 x 1080 and 1080 x 1920. Fast-start metadata supports progressive playback.
- `MonsoonFilm.tsx`: native video controls, responsive format selection, captions,
  chapter navigation, downloads, transcript and source links.
- `scripts/prepare_monsoon_film.py`: data snapshot and synthetic English narration.
- `scripts/render_monsoon_film.mjs`: frame verification, posters and MP4 encoding.
- `PacificEnso.tsx` and `PacificEnso.module.css`: a separate monthly NOAA evidence
  explorer with map layers, geographic labels, AP outline and anomaly timeline.
  It does not repeat the narrated film or present temperature fields as wind data.

NASA Blue Marble is the Earth texture. NOAA ERSST v5 monthly anomaly images are
reprojected onto the globe. Wind trails and the ocean cross-section are schematic,
not measured wind vectors. AP shapes use `ap_map_display.json`: rebuilt State
outlines where available, with prototype fallback, not certified boundaries;
their uniform extrusion does not represent elevation or water depth. Unmatched
mandals remain grey. District history and current groundwater change have different
units and observation windows, displayed separately.

The aquifer scene is an AI illustration, not Orvakal imagery. Measured depths are
shown on a separate numerical scale. Animated flow paths are conceptual. The
preparedness village and urban scene are also illustrative, not real surveyed
settlements or completed public works. The village scene remains immediately
before the city scene and proposed state review. Exact chapter times are generated
in `chapters.json`, not manually copied into production notes.

Globe motion follows speech-derived timings for Andhra Pradesh, the Pacific,
Indonesia and South America. The renderer checks each location's front-facing
projection and frame bounds at its narrated cue in both formats. The normal-state
caption follows the spoken passage. In the local review voice, location words
start separate audio chunks, so their cues use actual audio durations rather
than guessed fractions of a scene. Cold upwelling is shown in the ocean
cross-section, not as horizontal motion along the coast.

Groundwater particles follow distance-parameterized fracture paths. Rain ends at
the surface with small splash rings; separate paths depict soil infiltration.
Pumping is upward inside the illustrated borewell, never rain poured down it.
These movements are conceptual, not calibrated groundwater simulation.

The intended narration uses `en-IN-PrabhatNeural` at normal rate. The temporary
offline review uses macOS Rishi at 165 words/minute, with no playback speed-up.
The spoken alias "El Neen-yo" guides the English synthesizer; captions retain the
ordinary spelling. Indonesia is passed as the standard word to this voice.
The narration remains synthetic; accent and pronunciation should be reviewed by
the intended audience before public distribution.

The visual direction also references NASA SVS's
[ocean and atmosphere transition explainer](https://svs.gsfc.nasa.gov/5213/) and
[2015 El Nino ocean-current visualization](https://svs.gsfc.nasa.gov/12601/).
These were conceptual references, not footage copied into this film. Our wind
paths and waves remain schematic, not a physical simulation.

## Preparedness sources

Repairing leaks, efficient irrigation and appropriate rainwater collection are
supported by [NIDM's drought advice](https://www.nidm.gov.in/PDF/IEC/CZ_NIDM25.pdf).
Drinking-water contingency planning follows the emphasis in the
[drought management manual](https://nidm.gov.in/PDF/manuals/Drought_Manual.pdf).
Irrigation scheduling, suitable drip irrigation and mulching are described by
[ICAR](https://icar.gov.in/sites/default/files/2025-11/December_2025%20Indian%20Farming.pdf).
Collection and local planning also draw on
[Jal Shakti's Catch the Rain programme](https://jsactr.mowr.gov.in/website/index.aspx).
Actions require local suitability and technical advice. Collected rainwater is
not automatically safe to drink; the film explicitly says to treat it before drinking.
No claim is made that an upcoming event will be the strongest, or that these
actions guarantee protection from drought.

City actions draw on [MoHUA's AMRUT 2.0 guidelines](https://www.mohua.gov.in/upload/uploadfiles/files/AMRUT-Operational-Guidelines.pdf):
reduce water losses, reuse appropriately treated water for non-drinking needs,
protect water bodies and rainwater systems, and plan essential supplies. Cities
cannot stop El Nino; these are measures to reduce local water stress. No current
city performance, savings target or funded project is asserted.

## Regeneration

From the repository root, with ffmpeg, ffprobe, the project's Python dependencies,
edge-tts and the app's Playwright Chromium installed:

```sh
PYTHONPATH=.video-python python3 scripts/prepare_monsoon_film.py --voice
node app/scripts/serve-static.mjs --port 4179 --bind 127.0.0.1 --directory app/public
```

For explicitly authorised offline review only, prepare with
`python3 scripts/prepare_monsoon_film.py --local-review-voice` instead.
The range-capable server is required for reviewing the finished film:
`python3 -m http.server` ignores Range requests, and Chromium will not let you seek in a video
served without them.

In another terminal:

```sh
FILM_BASE_URL=http://127.0.0.1:4179 node scripts/render_monsoon_film.mjs
FILM_BASE_URL=http://127.0.0.1:4179 node scripts/render_monsoon_film.mjs --portrait
python3 -m pytest
```

The renderer currently uses macOS Metal. For another host, adjust its Chromium
graphics backend. Each scene is checked at 15%, 55% and 90% for text overflow,
nonblank canvas pixels, and motion where expected. Preview frames and results
are saved under `dist/monsoon-film`. The player browser tests are in
`app/e2e/monsoon-film.spec.ts` and run under Playwright's `film` project.

Preparation hashes all seven source JSON files and the current site colour tokens.
The renderer re-reads sources before and after encoding and refuses source drift.
Sequential maps use `SEQ_RAMP`; drought screening uses `CATEGORY_META`; the
background follows `--band-navy`. Numbers do not count through fabricated values.
Each source file's hash is retained in the manifest. The per-format render record
binds the MP4 to its source hash, duration and narration. Weekly data changes must
not fail fixed-edition consistency tests; the page instead reports changed evidence.

ONI (+2.16 C, JAS 2026, ERSST v6) and forecast RONI (+2.74 C median peak,
OND 2026, issued October 8) are explicitly different indices. The monthly globe
uses ERSST v5 and is labelled separately. The summer projection starts in
September; its published 2019-2026 backtest used August starts. The exact
32.5% beyond-record success rate and 1.63 m median error are displayed, not a
claim of forecast certainty. Population is the 2020 WorldPop estimate, not
today's census or a count of people certain to be affected.

## Generated imagery

All three images were generated with the built-in image-generation tool, not the API
fallback. Files are copied into the project; the original generations are preserved.

Aquifer asset: `app/public/films/monsoon/aquifer-cinematic.png`.
Generation brief: a cinematic photorealistic geological cutaway of rural South
Indian hard-rock farmland, irregular natural terrain, visible soil and fractured
granite, a borewell, and water in thin rock fractures rather than an underground
lake. Detailed natural materials, warm side lighting, dark background, no text,
no named real site. Labels and quantitative scales are added by code.

Preparedness asset: `app/public/films/monsoon/preparedness-cinematic.png`.
The final generation prompt is recorded in `monsoon_preparedness_prompt.txt`.

City asset: `app/public/films/monsoon/urban-water-cinematic.png`.
The exact generation prompt is recorded in `monsoon_urban_image_prompt.txt`.

## Verification

The new review cut has 20 chapters, under the 210-second limit, in 1920 x 1080
and 1080 x 1920, H.264/AAC at 30 fps. Exact duration and per-format provenance
are in the generated manifest and render records. Key-frame evidence and final
test results are recorded in the PR; older edition verification counts are not
evidence for this edition.

## Briefing assessment

The film is suitable as a prototype opening explainer for a leadership review:
it links climate context to dated local observations, preserves uncertainty, and
ends with a proposed verify/prioritise/assign action sequence. It is not an
official decision brief. Before a CM/CMO presentation, responsible departments
should validate the source extracts, reporting period, boundary joins and local
figures. An approved action sheet should identify supply priorities, accountable
owners, review dates and budget implications. A domain reviewer should check
the narration and a human listener should approve pronunciations. Adding more
animation would not resolve these evidence and governance requirements.

## Publication

Merging this work into `main` triggers the repository's GitHub Pages workflow.
It validates the data contract and builds the static site with the
`/ap-groundwater-fusion` base path. Confirm that the deployment succeeds and that
both video formats play on the published Monsoon Watch page before announcing
the release. The film is an October 2026 edition with September well data; refreshing dashboard data
requires regenerating and rechecking the film.
