# Phase 2A Prototype UI — Limitations

This document records the known limitations of the Phase 2A static prototype dashboard so the prototype is never mistaken for an operational system.

## Data limitations

- **Sensor / groundwater readings are seed/mock**, not official data. They are authored in APWRIMS export format (`data_label=mock`, `source_system=APWRIMS-like mock`) to exercise the pipeline shape. They are not official APWRIMS / AP government readings.
- **Seed readings were tuned for demonstration.** Depths and a second station per coastal mandal were authored so the dashboard shows a realistic mix of agreement (shallow coastal mandals vs the wet NASA signal) and disagreement (deep Rayalaseema mandals). This is illustrative, not measured ground truth.
- **NASA GRACE-DA percentiles are real but coarse.** They are sampled from genuine NASA/NDMC GRACE-DA GeoTIFFs at ~0.25° (~25 km) resolution. Multiple mandals/stations inside one grid cell receive the same percentile. They are percentiles (0–100), **not groundwater depth (mbgl)**, and must never be converted to depth.
- **CHIRPS rainfall is real but a context signal.** Monthly rainfall (mm) is pulled from CHIRPS (UCSB, open, ~0.05° satellite-gauge blend) for the latest available month and sampled at station points. It is a recharge/supply indicator only — **not groundwater depth** — and there is a few-weeks data latency. The fetch is graceful: if no month is reachable it records `manual_required` and the UI omits the rainfall signal. Requires internet for the download step.
- **Mandal boundaries are public prototype polygons** (`boundary_source=public_prototype`, `official_flag=false`), simplified further for display. They are not official APWRIMS/APSAC/RTGS boundaries.
- **Public NWIC measured-data lane is not populated** (`fetch_status=manual_required`); no stable public URL was available, so that lane is built but empty.
- **Single sample date.** Each mandal carries one NASA sample and 1–2 seed readings. There is no real time series; the per-mandal trend charts are explicitly labelled *illustrative — prototype*, generated deterministically from the mandal id, and are not measured history.

## Fusion / methodology limitations

- The fusion is a **V0 rule-based heuristic** (depth band × percentile band → agreement → confidence). It is not a calibrated hydrogeological model and does not account for aquifer type, recharge, abstraction, season, or terrain.
- Confidence requires ≥2 recent stations; with sparse seed data this is a coarse proxy for data sufficiency, not statistical confidence.
- "Agreement" between a point sensor reading and a 25 km satellite-model percentile is indicative only.

## UI / engineering limitations

- **Static prototype**: no backend, no database, no authentication. All data is read from generated JSON in `app/data/`.
- **Maps** use Leaflet with CARTO/OpenStreetMap basemap tiles and the simplified prototype boundaries as a GeoJSON overlay. The basemap **requires internet** to fetch tiles; offline, the boundary overlay still renders on a blank background. Boundaries remain `public_prototype` (not official APWRIMS/APSAC/RTGS). Tiles © OpenStreetMap © CARTO.
- **Dark mode** is a full theme toggle (persisted, deep-linkable via `?theme=dark`); the basemap swaps to dark tiles. A few decorative SVG fills are tuned for light first.
- **Animations are presentation-only.** The revolving satellite and rotating globe use CSS animations; they do not render under headless screenshot tools (which freeze at the first frame) but run normally in real browsers. All motion respects `prefers-reduced-motion`.
- Detail-page time-series and the "satellite vs sensor" chart are illustrative, not analytical.
- Not accessibility-audited beyond basic semantics; not localized.

## Before any official use

Official APWRIMS / AP government groundwater export, official APWRIMS/APSAC/RTGS mandal boundaries, and official mandal/district admin IDs are all required before any result may be treated as official. Until then every output remains a **prototype**.
