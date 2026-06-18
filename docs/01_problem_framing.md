# Problem Framing

## Goal

Build a data-first proof of concept for a Mandal-Level Groundwater Fusion Layer for Andhra Pradesh. The PoC combines APWRIMS-like groundwater station readings with NASA GRACE-FO/GRACE-DA groundwater and soil-moisture percentile signals to produce mandal-level assessment outputs.

## Intended Output

Each mandal-level record should include sensor coverage, recent groundwater depth in meters below ground level, satellite/model percentile context, confidence score, mismatch flag, status, and recommended AWARE/APWRIMS-ready action.

## Ground Truth And Support Signals

APWRIMS/piezometer readings are the ground-truth layer for groundwater depth. NASA GRACE-FO/GRACE-DA products are supporting satellite/model signals. They can provide directional context and percentile-based stress signals, but they do not provide exact groundwater depth at mandal scale.

## V0 Non-Goals

- Do not build a flashy dashboard first.
- Do not claim official mandal-level results from mock data.
- Do not claim official mandal-level results from public prototype boundaries.
- Do not convert satellite/model percentiles into groundwater depth.

## Officiality Rule

No output should be presented as official unless official APWRIMS/AP government groundwater readings and official APWRIMS/APSAC/RTGS boundaries are present and explicitly flagged as official.

