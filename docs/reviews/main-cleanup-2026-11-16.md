# Main application cleanup — 16 November 2026

Implemented on `codex/main-groundwater-cleanup`, based on main c726fc2. Claude’s Monsoon chapter folds and the held-forecast-horizon fix are preserved.

- Methodology: compact source-date disclosure and reading guide; detailed calculations, independent validation, crop-water record, privacy and reuse sections expand individually. Fragment links reveal the enclosing sections; print retains the evidence.
- Overview: four headline indicators and map remain the main view. Repeated seasonal numbers and diagnostics are folded. The competing top-mandals table is replaced with a link to the complete field-team register. Current summaries use dated telemetry snapshots rather than the historical September AWARE mean.
- Welcome: Narada’s question dissolves and collapses after 20 seconds of active reading time. Pointer/focus, hidden-page state and pause/reduced-motion preferences prevent the timer running. Read the quote restores it and keeps it available until manually hidden.
- This Week: all qualifying field-team rows are retained, with eight initially visible. Source comparisons explicitly have different periods; same-period changes are labelled revisions.
- Old Watchlist/Alerts/Snapshot URLs forward to This Week/Digest. Shared URL fragments are handled without concatenating duplicate fragments. Analyst CSV downloads remain in Reports.
- Navigation: Watches, Outlooks and Places fold; specialist 3D/Compare/In Numbers views remain in Evidence & tools, with contextual links. Compact sidebar keeps icons reachable.
- Cyclones: current event precedes expandable completed-event analysis. Agriculture’s current crop check precedes the older seasonal district brief. District research is expandable.
- Sensor summary: compact and full files agree, guarded by a regression test. Forecast metadata explicitly distinguishes evaluation records from publication status; manifest hashes are updated.
- Three verified duplicate public images removed; the assets/ copies used by CSS remain.

The retained-history seasonal baseline was not replaced. The audit shows 50 flags change under unfiltered-history selection; the application continues to disclose baseline review pending. A methodological baseline change needs its own versioned data, validation and film update. Raw histories, audit receipts and frozen forecasts were preserved.

Validation: static export and TypeScript passed; Python suite 630 passed, 2 skipped; 89 distinct focused and existing browser regressions passed (39 initial checks, 49 broader checks, and the final updated Overview assertion). Visual checks covered Overview, Methodology, queue forwarding, complete field rows and quote collapse/restoration. Methodology shrank from about 8,800 to 3,100 pixels; Overview from about 3,000 to 2,000 at the reviewed desktop width.
