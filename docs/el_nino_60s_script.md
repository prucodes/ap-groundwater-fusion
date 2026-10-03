# El Niño in 60 seconds — Andhra Pradesh

A shooting script for a one-minute vertical video (1080×1920). It follows the
arc of the explainer reels that circulate on WhatsApp — the hook, the "giant
fan", the fan stopping, the catastrophe — and then does the thing none of them
do, which is land it in Andhra Pradesh with figures this project measured.

**Why it exists.** A reel from `@historydefines` was proposed for the site. It
cannot be published: it is someone else's copyrighted work, it carries a social
register ("Super El Niño 🤯") that sits badly beside a page stating that no
forecast is published here, and its on-screen "3.4 °C" is the *name* of the
Niño 3.4 region rather than the index this site publishes at +1.80 °C. Put side
by side, the two numbers only confuse. This script is the replacement: same
shape, our footage, our numbers, our licence.

**Every visual is a screen recording of our own site or an openly licensed
source.** Nothing here needs a licence we do not have. Timings assume ~170 words
per minute, the pace of the reference; total narration is 164 words and no
line runs faster than 171.

---

## The script

| # | Time | Narration (VO) | On-screen text | Visual |
|---|---|---|---|---|
| 1 | 0:00–0:06 | Imagine a fan the width of the Pacific, running for as long as anyone has farmed. | **A fan the width of an ocean** | Slow push in on the Pacific from space. Arrows sweep east to west along the equator. |
| 2 | 0:06–0:16 | Trade winds drag warm water away from South America and pile it up near Indonesia, where it falls as rain. Cold water rises behind it, off Peru. | *trade winds · east to west* | Warm pool builds in the west, orange. Upwelling animates off Peru, blue. |
| 3 | 0:16–0:22 | Every few years the fan slows. The warm water slides back east. That is an El Niño. | **The fan slows** | Arrows falter, stall, reverse. The orange pool slides east across the basin. |
| 4 | 0:22–0:29 | The rain does not disappear. It moves. And when it moves off Asia, it takes the Indian monsoon with it. | *the rain moves* | Pull back to the globe. The rain band shifts away from South Asia. |
| 5 | 0:29–0:39 | In 1877 the strongest El Niño ever recorded did exactly this. The monsoon failed. Across the Madras Presidency and the Deccan, famine killed more than eight million people. | **1877** · *Madras Presidency* | Archive map of the Madras Presidency. Hold. No imagery of famine victims. |
| 6 | 0:39–0:46 | An El Niño is running now. It is the warmest June to August in the record since 1950. | **+1.80 °C** *· NOAA, JJA 2026* | Cut to the live site: the ocean-state card and its two-year index line. |
| 7 | 0:46–0:53 | Across forty-five years an El Niño costs Andhra Pradesh thirteen percent of its monsoon rain. This year, forty-two. | **−13.0% usually · −41.5% this year** | The 46-column rainfall chart, El Niño years in red, this year outlined. |
| 8 | 0:53–1:00 | Today the water table is lower than it was in May across sixty-three percent of mandals. That has never happened. | **62.7% of mandals** *· 8,013 million m³ short* | The recharge map fills in, mandal by mandal. Hold on the red. |

---

## Sources, line by line

Anything a reviewer will ask about.

| Line | Claim | Source |
|---|---|---|
| 1 | — | No factual claim; it is the hook |
| 2 | Trade winds, warm pool, Peruvian upwelling | Standard ENSO description; NOAA Climate.gov ENSO explainer |
| 3 | "Every few years" | CPC: El Niño recurs irregularly at 2–7 year intervals |
| 4 | An El Niño shifts tropical rainfall away from South Asia and weakens the Indian monsoon | Standard ENSO–monsoon description (Walker circulation); and measured for this state at line 7 below, which is the version this project can stand behind |
| 5 | 1877–78 the strongest El Niño on record | Journal of Climate 31(23), *Climate and the Global Famine of 1876–78* |
| 5 | "more than eight million" | Great Famine of 1876–78: excess mortality estimated 5.6–9.6 m, careful recent demographic estimate 8.2 m. **Say "more than eight million", not a precise figure, and not the "3% of the world" the reference reel uses** — that is a contested global total across India, China and Brazil |
| 5 | Region | The famine covered ~670,000 km² and 58.5 m people across the Madras and Bombay Presidencies, Mysore, Hyderabad and the Deccan — which includes what is now Rayalaseema. Do not claim a district-level ranking; it is not sourced here |
| 6 | +1.80 °C, warmest JJA since 1950 | NOAA CPC Oceanic Niño Index, fetched weekly by `phase3_levels/fetch_enso_index.py` |
| 7 | −13.0% across 45 years | CHIRPS v3 1981–2025, 7 El Niño monsoons, below normal in 5 of 7; Spearman ρ −0.47 against the June–August ONI, p = 0.001 (CHIRPS v2 read −15.2%, 6 of 7, ρ −0.51) |
| 7 | −41.5% this year | CHIRPS v3 June–August 2026, driest of 46 (v2 read −28.4%, 2nd driest). The state's own rain gauges (AP DES, via APWRIMS) read −50% for the same months, so the satellite figure is, if anything, conservative |
| 8 | 63% of mandals, 8,013 million m³ | APWRIMS monthly readings, May → August 2026, each mandal against its own ten-year normal |

---

## Rendering it

`python3 scripts/build_elnino_video.py --out dist/el_nino_60s.mp4` draws the
whole film and writes a 1080×1920 MP4. It fetches two public sources once and
caches them: NASA's Blue Marble for the Earth, and **NOAA's ERSST v5** for the
sea surface. The equirectangular imagery is re-centred so the Pacific is one
basin rather than split down both edges.

**The warm water on screen is measured, not painted.** Anomalies are computed
from ERSST against a 1991–2020 climatology taken from the same file, coloured on
the diverging ramp these maps are always drawn with, and made fully transparent
below 0.35 °C so the ocean shows through where nothing is happening. Twelve
consecutive months — September 2025 to August 2026 — step past during *the fan
slows*, with the month stamped on screen, so a viewer watches this El Niño
actually arrive rather than being shown an illustration of one. ERSST's own
licence field reads "No constraints on data access or use". The last three scenes are drawn from
`app/data/monsoon_watch.json` and `ap_map_geometry.json`, so the figures on
screen are the published ones and move with the weekly refresh.

**It has no narration.** Nothing here can synthesise speech, so the film is
silent and the captions carry the script's words verbatim — which is how these
are watched. Recording a voice over it is the one step left to a person, and
the table above is what they read.

`dist/` is gitignored: the generator rebuilds the film, and an 8 MB MP4
regenerated on every refresh does not belong in the history.

## Production notes

**Footage.** Lines 6–8 are screen recordings of
`prucodes.github.io/ap-groundwater-fusion/monsoon/` — the ocean-state card, the
rainfall columns, the recharge map. Lines 1–4 need a Pacific animation: NOAA
Climate.gov and NASA SVS both publish ENSO visualisations that are public
domain, and either is safe to use with attribution. Line 5 wants an archive map,
not photographs.

**Register.** The reference reel is built on astonishment. Lines 1–4 can carry
that. From line 5 the register has to change, and lines 6–8 should be flat and
declarative: these are measured figures on a government-facing product, and
overselling them is what the site spends its whole surface not doing.

**What not to do.** Do not put a forecast in this video. The site publishes
none, the model was measured to get *worse* when the index was added to it, and
a video promising what happens next would contradict the page it links to. The
last line states what has already happened. That is enough.

**Spoken figures round; on-screen figures do not.** The narration says
"sixty-three percent" where the card reads 62.7%, which is how a person speaks
and how a record should be written. Never round on screen, and never round in a
direction that flatters the finding.

**The numbers move.** Lines 6–8 come from the weekly refresh. Re-read them off
the live page on the day of recording rather than from this file, and put the
reading date in the end card.

**End card.** The URL, the date the figures were read, and one line:
*measured from Andhra Pradesh's own wells — no forecast.*
