# NWIC/AP Groundwater Access Notes

## Goal

Identify a reliable public access path for NWIC or Andhra Pradesh groundwater metadata and observations without hardcoding unverified URLs or scraping brittle dynamic dashboards.

## Current Position

This repository does not yet include official NWIC/AP groundwater data. The V0 mock readings remain `data_label=mock`, and official readings must come from APWRIMS/AP government or a verified public government data service before they can be labeled `measured`.

An attempted static probe of the India-WRIS portal path did not return a stable downloadable response in this environment. Because of that, this repo does not hardcode an endpoint or scrape a dynamic dashboard route.

## Recommended Public Access Review Path

1. Check official India-WRIS/NWIC water-data portals for a groundwater module, data catalog, or documented download/API route.
2. Prefer published CSV, GeoJSON, API, or data-catalog downloads over browser-only dashboard extraction.
3. Record any accepted public source in `data/source_manifest.csv` with its URL, license/terms, fetch date, `data_label`, and `official_flag`.
4. If access requires login, API key, or manual export, store only the instructions and metadata in this repo until the data is supplied through an approved route.

## Manual Steps To Verify Next

1. Open the official India-WRIS/NWIC portal in a browser.
2. Navigate to the groundwater section or data catalog.
3. Filter state to Andhra Pradesh.
4. Check whether station metadata and groundwater-level readings can be exported as CSV, Excel, GeoJSON, or through a documented API.
5. If the portal requires login/API approval, request access through the official channel and record the process in this document.
6. After receiving a stable official download/API path, add the source to `data/source_manifest.csv` before ingesting records.

## Manual Information To Capture

When a public NWIC/AP groundwater access path is confirmed, capture:

- portal or catalog URL
- API endpoint or manual download path
- required filters for Andhra Pradesh
- whether station metadata and readings are separate downloads
- fields provided for station ID, station name, latitude, longitude, district, mandal, village, date/time, and groundwater level
- license or terms of use
- update frequency
- whether the data is official enough to label as `measured`

## Guardrails

- Do not hardcode fake URLs.
- Do not scrape dynamic dashboard calls unless there is a documented stable API.
- Do not mark public data official unless the source and terms clearly support that use.
- Do not mix NWIC/AP public data with APWRIMS official data without source labels.
