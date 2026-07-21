# Living Water Table — Phase 1 architecture

## Scope and status

Phase 1 adds an isolated experimental route at `/living-water-table`. It proves
the rendering architecture, deterministic Phase 0 V2 data join, scientific
encoding, selection model, quality controls and accessible fallback. It does not
change the Phase 0 model, metrics, forecasts, active generated assets or
operational maps.

Mockup 3 is the primary composition reference. Mockup 1 informed the selected
mandal card and extensible right rail. Mockups 2 and 4 remain future references
only. No numbers or scientific claims were copied from any mockup.

## Dependencies and compatibility spike

The repository already used `three` 0.184 through the decorative sidebar
globe. The Phase 1 spike added:

- `@react-three/fiber` 9.6.1 for the React 19 canvas and scene lifecycle.

Its published peer range supports React 19 and the installed Three.js version.
The spike also evaluated Drei 10.7.7, but the final route removed it: the
OrbitControls module already shipped with Three.js supplies the one needed
helper without Drei's broader dependency tree.
The spike rendered a real AP geometry part through a client-only import,
mounted OrbitControls, passed TypeScript and passed a Next.js 16 production
build. The temporary spike component was removed after it was folded into the
final scene.

No helper suite, mapping framework, post-processing package, texture pack,
physics package or state-management library was added.

## Isolation and scene hierarchy

The route server component renders `LivingWaterTableClient`, which dynamically
loads the route client page with SSR disabled. The client page then dynamically
loads `LivingWaterTableScene` only when the 3D path is active. Existing routes
do not import the WebGL runtime, and an explicitly selected 2D fallback does not
need to mount a Canvas.

```text
LivingWaterTablePage (DOM state, URL state and disclosures)
├── SceneErrorBoundary
│   └── Canvas (render on demand)
│       ├── restrained fixed grid and lights
│       ├── GroundwaterMapMesh
│       │   ├── one merged, uniformly shallow AP surface
│       │   ├── one batched mandal-boundary line layer
│       │   ├── one batched district-boundary line layer
│       │   └── one selected-boundary overlay
│       ├── CameraRig / OrbitControls
│       ├── ContextLifecycle
│       └── one-shot PerformanceProbe
├── DOM legend, tooltip and controls
├── DOM selected-mandal panel
└── WebGLFallback (when required)
```

A future selected-mandal cross-section can attach as a sibling group under the
Canvas, driven by the existing stable selected record ID. It does not require a
rewrite of the statewide surface.

## Authoritative data

The route imports only:

- `app/data/mandal_groundwater_records_v2.json`
- `app/data/dataset_manifest.json`
- `app/data/model_card.json`
- `app/data/ap_map_geometry.json`
- `app/data/ap_district_geometry.json`

The observation-series asset is not loaded because Phase 1 has no time-series
chart or playback. Measured values and observation counts needed by the detail
panel already exist in each V2 record. No legacy V1 asset is imported.

## Deterministic join

The active simplified geometry does not carry a stored `boundaryId`. Phase 0
stable boundary IDs encode the normalized district, normalized mandal and the
canonical geometry ordinal. Phase 1 derives that full ID for each geometry
feature and joins through an exact `Map<boundaryId, record>` lookup.

The join fails closed when it finds:

- An unsupported V2 contract or manifest version.
- Duplicate V2 boundary IDs.
- A missing record or geometry.
- District or mandal identity drift after ID matching.
- An invalid coordinate ring.
- Coverage counts inconsistent with the canonical manifest.

Current reconciliation is 670 geometry features to 670 V2 records, with zero
unmatched or duplicate identities. All 679 polygon parts and 7,411 source
vertices are retained. The simplified mandal asset has disconnected rings but
does not encode explicit hole relationships; Phase 1 preserves every supplied
ring and does not invent hole semantics.

## Scientific encoding

Geometry uses a fixed 0.09 scene-unit presentation height for every polygon.
Groundwater metres never control geometry height.

Only a record with `coverageStatus=modelled` and a finite, non-negative V2
nowcast receives a depth category:

| Category | V2 nowcast depth |
| --- | --- |
| Near surface | <2 m bgl |
| Very shallow | 2–<10 m bgl |
| Shallow | 10–<20 m bgl |
| Moderate | 20–<30 m bgl |
| Deep | 30–<40 m bgl |
| Very deep | 40–<60 m bgl |
| Extremely deep | ≥60 m bgl |

The scale is fixed and visible. Larger m bgl means a deeper level, not greater
groundwater volume.

Coverage states are not filled with synthetic depths:

- `modelled`: depth-category colour from the V2 nowcast.
- `measured_only`: gold neutral treatment; measured fields only.
- `boundary_only`: subdued slate boundary with no groundwater value.
- `no_data`: darker neutral treatment.
- `excluded`: separate violet neutral treatment.
- Invalid model values: fail-visible red neutral treatment.

The selected boundary receives only an outline and slight fixed edge lift.

## Interaction and URL state

The route provides constrained orbit, bounded zoom, limited pan, reset,
pointer hover and click selection. The selected mandal ID and quality choice
are stored as query parameters. Invalid IDs are removed safely. A native,
keyboard-accessible mandal selector is the non-canvas selection path.

No camera matrix, forecast, scenario or playback state is serialized.

## Performance strategy

- One merged non-indexed surface contains all mandal top and side triangles.
- A per-vertex `featureIndex` attribute maps ray intersections back to V2 IDs.
- Mandal and district lines are each batched into one geometry.
- Selection changes build only a small outline; statewide topology is stable.
- Materials are shared by the merged vertex-colour surface.
- `frameloop="demand"` prevents idle animation.
- There is no per-frame React state update.
- DPR is capped at 1.65 for Standard and 1.15 for Reduced.
- Antialiasing is disabled in Reduced.
- Owned geometries and context listeners are disposed on replacement/unmount.

The active source contains 670 features, 679 polygon parts and 7,411 source
vertices. Runtime draw-call, triangle, GPU-geometry and initial-load readings
are captured once by the scene and displayed in the state panel. FPS is not
claimed unless measured in a usable browser session.

## Quality profiles and motion

- **Standard:** higher DPR cap, antialiasing and fuller grid detail.
- **Reduced:** lower DPR, no antialiasing, low-power preference and reduced grid
  detail.
- **Auto:** selects Reduced for compact, low-concurrency, data-saver or
  touch-first devices; otherwise Standard.

`prefers-reduced-motion` is reported and respected. The scene has no constant
animation in either motion mode.

## WebGL fallback and errors

Capability failure, a fatal scene error, or `webglcontextlost` activates the
same-page 2D SVG fallback. It renders all joined boundaries with the same colour
and coverage rules, keeps selection usable and exposes a controlled Retry 3D
action. Users may explicitly choose the fallback with `?view=2d`.

Schema, manifest and join failures occur before scene rendering and provide
specific development errors. Production scene errors are reduced to an
understandable fallback reason rather than a stack trace.

## Accessibility

Phase 1 provides a semantic heading, text summary, described DOM legend,
keyboard mandal selector, accessible DOM detail panel, visible focus styles,
selection status updates, sufficient dark-theme contrast, non-colour coverage
labels and reduced-motion behavior.

The 3D canvas itself is not fully screen-reader navigable. The selector, detail
panel, state summary and 2D fallback are the accessible alternatives. This is a
known limitation, not a claim of full canvas accessibility.

## Lifecycle cleanup

React Three Fiber owns renderer teardown. Phase 1 additionally:

- Disposes merged surface, mandal, district and selection geometries.
- Lets R3F dispose declarative materials and helpers.
- Removes the WebGL context-loss listener.
- Removes device media-query and resize listeners.
- Uses no timers, texture loaders, portals or custom animation frames.
- Dynamically unmounts the entire WebGL subtree when the route is left.

Repeated route navigation must be rechecked in a real browser whenever the
scene architecture changes.

## Disclosures

This visual is an analytical prototype using public prototype boundaries and
temporary stable IDs. Colours represent modelled depth to water only for V2
records with a nowcast. GRACE-DA is regional model-assimilated context, not
direct mandal-level groundwater-depth measurement. The view does not represent
groundwater volume, precise subsurface geology or official field measurements,
and does not replace APWRIMS outputs.

## Explicitly deferred

Phase 1 does not include:

- Aquifer Glass or a subsurface cross-section.
- Animated, refractive or realistic water.
- Historical playback.
- Forecasting or scenario comparison.
- Extraction Stress mode or stress towers.
- Satellite beams, particles, bloom, reflections or cinematic effects.

Those layers may be added later behind separate data contracts and scene groups
without changing the Phase 1 stable-ID join or coverage-state rules.
