# Phase 1C Fusion Summary

- Mandals in fusion output: 10
- Mandals using mock groundwater readings: 10
- Mandals using public prototype boundaries: 10
- Mandals with real NASA satellite-model values: 10

## Confidence Label Distribution

| confidence_label | count |
| --- | --- |
| Verify | 3 |
| Low | 7 |

## Status Distribution

| status | count |
| --- | --- |
| verify | 3 |
| insufficient_or_stale_data | 7 |

## Verify Or Mismatch Cases

| district_name | mandal_name | sensor_satellite_agreement | confidence_label | groundwater_percentile | median_groundwater_mbgl |
| --- | --- | --- | --- | --- | --- |
| ANANTAPUR | DHARMAVARAM | strong_disagreement | Verify | 98.82 | 21.3 |
| ANANTAPUR | TADPATRI | strong_disagreement | Verify | 100.0 | 18.6 |
| CHITTOOR | MADANAPALLE | strong_disagreement | Verify | 91.59 | 16.2 |

## Caveats And Next Official Data Requirements

- Current groundwater readings are mock APWRIMS-format data, not official APWRIMS readings.
- Current boundaries are public prototype boundaries with `boundary_official_flag=false`.
- NASA/NDMC values are satellite/model percentiles, not groundwater depth.
- Official APWRIMS sensor readings, official APWRIMS/APSAC/RTGS mandal boundaries, and APWRIMS admin IDs are required before official mandal-level claims.
