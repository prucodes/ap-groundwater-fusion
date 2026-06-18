# Public Measured Groundwater Import Notes

## Source Assumptions

Phase 1D targets public measured groundwater-level data from NWIC / National Water Data Portal / India-WRIS / Andhra Pradesh public resources. The known candidate is:

- Title: `Ground Water Level Manual Quarterly Andhra Pradesh Ground Water Departments`
- Resource ID: `305c8531-759d-4fb9-abf6-7cf4341ec318`

These records can be labeled `measured_public` when downloaded from a stable public source. They must not be labeled `official_apwrims`.

## CKAN And Manual Fallback

The fetch script tries CKAN-style metadata endpoints first. If metadata hangs, requires login, exposes only a dashboard, or does not provide a stable CSV/XLS/XLSX/JSON URL, the script writes `fetch_status=manual_required`.

Manual fallback means a reviewer should open the NWIC/NWDP resource page, download a stable file, and place it in:

`data/raw/nwic/andhra_pradesh_groundwater/`

No dashboard scraping is allowed.

## MBGL Interpretation

The standardizer assumes groundwater values represent depth to water in meters below ground level (`mbgl`) only when column mapping and source metadata support that interpretation. Ambiguous depth/level fields should be mapped explicitly with `--depth-field` and reviewed.

## Date Alignment

Public manual groundwater readings may be quarterly and may not align with NASA/NDMC current raster dates. Reports should show groundwater date ranges and NASA sample/fetch dates side by side.

## Official APWRIMS Requirement

Public measured data is useful for prototype validation but does not replace official APWRIMS/AP government exports. Official APWRIMS readings, official APWRIMS/APSAC/RTGS boundaries, and APWRIMS admin IDs remain required for official mandal-level claims.

