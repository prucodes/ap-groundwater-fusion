# Fusion Methodology

## V0 Aggregation

The V0 fusion engine aggregates station readings by district and mandal. It calculates the latest sensor date, sensor count, median groundwater depth, and average groundwater depth from station data.

Satellite/model percentile inputs are joined as supporting context. They indicate relative dry, normal, or wet conditions but do not provide exact groundwater depth.

## Agreement Logic

V0 compares station groundwater depth direction with satellite/model percentile direction:

- Deep groundwater and low percentile satellite/model values indicate directional agreement on stress.
- Shallow groundwater and high percentile satellite/model values indicate directional agreement on normal or wet conditions.
- Deep groundwater with high satellite/model percentile, or shallow groundwater with low percentile, is a mismatch that should be verified.
- Missing satellite/model values produce an insufficient satellite context note.

## Confidence Logic

- High confidence: enough recent sensors plus directional satellite/model agreement.
- Medium confidence: some sensors plus partial agreement or missing satellite/model context.
- Low confidence: few or stale sensors.
- Verify: sensor readings and satellite/model signal strongly disagree.

## Official Claim Rule

No official claim is allowed if either condition is true:

- `boundary_official_flag = false`
- official APWRIMS/AP government groundwater data is not present

Mock and public-prototype outputs must include data-quality notes that identify their limitations.

## Recommended Actions

Recommended actions should be concise and operational:

- Continue routine monitoring.
- Review recent station readings and nearby field reports.
- Prioritize field verification.
- Escalate for APWRIMS/AWARE review when confidence is high and stress is indicated.

