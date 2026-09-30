# Monsoon film production

The film explains El Nino, the India connection, AP rainfall history, observed
groundwater changes, conditional risks, village preparedness and city actions. It is a
prototype communication product, not an official forecast or drought declaration.

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
not measured wind vectors. AP shapes use the project's public prototype geometry;
their uniform extrusion does not represent elevation or water depth. Unmatched
mandals remain grey. District history and current groundwater change have different
units and observation windows, displayed separately.

The aquifer scene is an AI illustration, not Orvakal imagery. Measured depths are
shown on a separate numerical scale. Animated flow paths are conceptual. The
preparedness village and urban scene are also illustrative, not real surveyed
settlements or completed public works. The village scene remains at 2:05; the
additional city scene begins at 2:25, followed by the proposed state review at 2:45.

Globe motion follows speech-derived word timings for Andhra Pradesh, the Pacific,
Indonesia and South America. The renderer checks each location's front-facing
projection and frame bounds at its narrated cue in both formats. The normal-state
caption changes with the spoken sentence. Cold upwelling is shown in the ocean
cross-section, not as horizontal motion along the coast.

Groundwater particles follow distance-parameterized fracture paths. Rain ends at
the surface with small splash rings; separate paths depict soil infiltration.
Pumping is upward inside the illustrated borewell, never rain poured down it.
These movements are conceptual, not calibrated groundwater simulation.

Narration uses `en-GB-RyanNeural` at -2% rate, with no post-production speed-up.
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
python3 -m http.server 4178 --bind 127.0.0.1 --directory app/public
```

In another terminal:

```sh
node scripts/render_monsoon_film.mjs
node scripts/render_monsoon_film.mjs --portrait
python3 -m pytest
```

The renderer currently uses macOS Metal. For another host, adjust its Chromium
graphics backend. Each scene is checked at 15%, 55% and 90% for text overflow,
nonblank canvas pixels, and motion where expected. Preview frames and results
are saved under `dist/monsoon-film`. The player browser tests are in
`app/e2e/monsoon-film.spec.ts` and run under Playwright's `film` project.

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

The current export contains 15 scenes and runs 178.440 seconds. Landscape is
1920 x 1080 (81.6 MB); portrait is 1080 x 1920 (90.4 MB). Both are H.264/AAC at
30 fps. All 90 scene samples passed overflow, nonblank-image and applicable
motion checks. Eight narrated-location checks passed across the two formats.
Desktop (1440 px) and phone (390 px) playback, decoded chapter seeking, source
links, captions, downloads and the Pacific explorer were verified. Seven browser
tests, including the three existing Pacific-panel regressions, passed. The Python
suite passed 219 tests and the Next.js production build passed.

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
the release. The film is a dated August 2026 snapshot; refreshing dashboard data
requires regenerating and rechecking the film.
