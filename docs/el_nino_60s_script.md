# El Niño in 60 seconds — Andhra Pradesh

October 2026 review edition. Original NASA/NOAA-based animation, not footage
from the forwarded reel. Keep the explanation brief and the findings flat.
This caption-led cut is separate from the narrated 3:15 film. Native-speaker
and domain review are required before publication.

## The script

| # | Time | Narration (VO) | On-screen text | Visual |
|---|---|---|---|---|
| 1 | 0:00–0:06 | Imagine a fan the width of the Pacific, moving warmth across an ocean from east to west. | **A fan the width of an ocean** | NASA Earth texture; schematic westward trade winds. |
| 2 | 0:06–0:16 | Trade winds push warm surface water away from South America towards Indonesia. Warm water supports rising moist air and rainfall. Colder water rises near the coast of Peru. | *trade winds · east to west* | Separate warm-water motion, atmospheric rain and cold upwelling. |
| 3 | 0:16–0:22 | Every few years those winds weaken. Warmth spreads east across the Pacific. This pattern is called El Niño. | **Winds weaken. Warmth spreads east.** | ERSST sequence September 2025–September 2026; interpolated frames labelled. |
| 4 | 0:22–0:29 | Tropical rainfall shifts. India's summer monsoon can weaken, but the Indian Ocean and local weather also influence the outcome. | *A connection, not a guarantee* | South Asia; schematic circulation, not a measured wind field. |
| 5 | 0:29–0:39 | Major events in nineteen ninety seven and twenty fifteen show that this pattern recurs. Their effects differed between places. A Pacific index alone cannot determine local rainfall. | **1997–98 / 2015–16** | Restrained historical timeline over the globe, no disaster superlatives. |
| 6 | 0:39–0:46 | NOAA's July to September index reads plus two point one six degrees Celsius, classified as a very strong El Niño. | **+2.16 °C** · NOAA CPC ONI, Jul–Sep 2026 | Exact dated ONI; do not confuse it with monthly ERSST v5 or forecast RONI. |
| 7 | 0:46–0:53 | El Niño summers averaged thirteen percent below normal in Andhra Pradesh. June–August rainfall was forty-one point five percent below. | **−13.0% historical mean · −41.5% Jun–Aug 2026** · CHIRPS v3 | June–September history and June–August 2026 observations labelled as different windows. |
| 8 | 0:53–1:00 | By September, fifty-four point three percent of compared mandals had deeper groundwater than in May. These are observations, not rainfall predictions. | **54.3% · 315 of 580** · APWRIMS, May–Sep 2026 | AP display outlines; missing or ambiguous joins remain grey. Close with the evidence distinction below. |

### The figures on screen, as read

From `app/data/monsoon_watch.json` as generated on 2026-10-12.
Groundwater: May–September 2026. CHIRPS v3.0 rain: June–August 2026;
September is explicitly not yet published in this snapshot.

| Figure | Value |
|---|---|
| Ocean Niño Index, JAS 2026 | +2.16 |
| Mandals lower than in May | 54.3% |
| Rain this year | −41.5% |
| An El Niño monsoon, usually | −13.0% |
| Compared mandal count | 315 of 580 |

---

## Sources, line by line

| Line | Claim | Source |
|---|---|---|
| 1 | Trade winds as a visual analogy | NOAA ENSO explanation; schematic, not measured winds |
| 2 | Warm-water movement, convection and Peruvian upwelling | NOAA ENSO explanation; NASA Blue Marble imagery |
| 3 | Recurring ocean–atmosphere pattern | NOAA ENSO; ERSST v5 monthly reconstruction, 1991–2020 anomaly baseline |
| 4 | Probabilistic monsoon connection | NOAA Climate.gov ENSO and the Indian monsoon explanation |
| 5 | Selected historical events, not a ranking of disasters | NOAA historical ENSO record, 1997–98 and 2015–16 |
| 6 | Observed ONI +2.16 °C, JAS 2026 | NOAA CPC ONI (ERSST v6), `monsoon_watch.json → enso`; not the separate ERSST v5 monthly map value |
| 7 | Historical mean −13.0%; current −41.5% | CHIRPS v3.0 project analysis; June–September 1981–2025, 5 of 7 El Niño monsoons below normal; June–August 2026 is rank 1 driest of 46 years |
| 8 | 54.3%, 315 of 580 deeper than May | APWRIMS project series, May–September 2026; source-series count, not a land-area share |

## Rendering and review

`python3 scripts/build_elnino_video.py --out dist/el_nino_60s.mp4`
reads this script directly, checks its five headline figures against current
`app/data`, and refuses a stale script. It uses `ap_map_display.json`, including
rebuilt State geometry and prototype fallback, not certified official boundaries.
Re-read sources on the rendering day; do not silently replace captions while
retaining an older voice recording. The 60-second generator remains caption-led.

NASA Blue Marble and NOAA ERSST v5 are the visual sources. The ERSST sequence
now runs through September 2026. Observed monthly fields are dated; intermediate
animation is explicitly interpolated. Wind paths are schematic. No footage or
audio is copied from the attached reference video.

**Stance.** An attributed NOAA Pacific forecast and a past-winter summer
groundwater projection are allowed with their dates, uncertainty and track record.
Neither is an Andhra Pradesh rainfall forecast. Never forecast AP rainfall or
present the manual screening as a drought declaration. The longer film supplies
the new outlook details; this minute stays with explanation and observations.

**Precision.** On-screen figures are exact source values; animation must not
count through invented values. Spoken numbers may round only without flattering
the finding. Here the percentages are spoken exactly. Historical association
does not mean El Niño caused the whole observed shortfall.

**End card.** Read 2026-10-12. Observed AP wells. Pacific outlook and summer
projection are separate evidence — neither forecasts AP rainfall.
