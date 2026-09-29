# Is Andhra Pradesh getting hotter? What the long records say

A measurement pass, run before building anything, because the site's own
temperature data could not answer the question and publishing a number from it
would have been worse than publishing nothing.

## Why the existing data could not answer it

`phase3_levels/data/mandal_power_covariates.csv` carries 2 m air temperature per
mandal from NASA POWER, 2014–2025, 653 mandals. It is not shown anywhere and the
model does not use it. Measured over its own 12 years:

| | |
|---|---|
| linear trend | **−0.09 °C per decade** |
| correlation | r = −0.11 |
| significance | **p = 0.74** |

That is indistinguishable from noise, and the sign is negative. Year-to-year
swings are ±0.45 °C, which swamps any trend over twelve years. **Publishing it
would have been actively misleading**: "no detectable trend in 12 years" is a
statement about the length of the record, not about the climate.

## Two long records, masked to the state

Both are gridded monthly products, sampled at the cells whose centres fall
inside Andhra Pradesh's own mandal outlines — not a bounding box, which would
have pulled in Telangana, Karnataka, Tamil Nadu and the Bay of Bengal.

| | GHCN_CAMS | NOAAGlobalTemp |
|---|---|---|
| resolution | 0.5° (**55 cells** in the state) | 5° (4 cells over the region) |
| span | 1948 – 2026-08 | 1850 – 2026-08 |
| kind | station + reanalysis blend, land | station-based anomaly, land + ocean |

## What both agree on

**Andhra Pradesh is warming, and the signal is overwhelming.** GHCN_CAMS
r = +0.91, p = 2.4 × 10⁻³⁰; NOAAGlobalTemp r = +0.81, p = 3.6 × 10⁻¹⁹. Over
78 years this is not in question.

**2024 is the warmest year on record in both**, independently.

**El Niño years are hotter here, after the trend is removed.** This is the
finding most useful to this project, because it is a second cost on top of the
rainfall deficit the site already publishes:

| | El Niño monsoons | La Niña monsoons | difference | p |
|---|---|---|---|---|
| GHCN_CAMS | +0.17 °C | −0.17 °C | **+0.34 °C** | 0.0039 |
| NOAAGlobalTemp | +0.08 °C | −0.06 °C | **+0.14 °C** | 0.0235 |

n = 15 El Niño and 17 La Niña monsoons — real sample sizes, unlike the two
events the groundwater record covers.

## What they do NOT agree on, and it is the headline number

| | trend, 1948–2025 | rise over the record |
|---|---|---|
| GHCN_CAMS | **+0.290 °C/decade** | +2.23 °C |
| NOAAGlobalTemp | **+0.109 °C/decade** | +0.85 °C |

**A factor of 2.7.** Both are individually significant beyond any doubt; they
simply disagree about how much.

NOAAGlobalTemp's +0.85 °C since 1948 sits close to published figures for India
(IMD gives roughly +0.7 °C over 1901–2018). GHCN_CAMS blends station data with
reanalysis, and over regions with thin station coverage the reanalysis component
can carry a trend of its own. On that reasoning the lower figure is the more
likely of the two — but that is reasoning, not measurement, and this project
does not publish reasoning as though it were a number.

## Recommendation

**Publish the two things both records agree on**, which are the decision-useful
ones anyway:

- that 2024 was the warmest year in a 78-year record, and
- that El Niño years run hotter here even after the warming trend is taken out,
  which means this season carries a heat cost on top of the rainfall cost the
  site already measures.

**Do not publish a warming rate** from either product alone. If the rate is
wanted, publish it as a range with both sources named and the disagreement
stated — "between +0.11 and +0.29 °C per decade depending on the product" is
honest and still says the important thing.

**Never publish a projection.** There is no climate model here, and the site's
whole posture — ENSO as context and not a model input, no forecast on the
scenario page — depends on not starting now.

## What would settle it

IMD's own station records for Andhra Pradesh. They are the authoritative source
for India, the state has access to them, and a third independent series would
adjudicate the two gridded products rather than leave a reader to pick. That is
a data request, not a piece of work.

## Reproducing this

Neither record is committed; both are large and this was a measurement pass, not
a pipeline.

- GHCN_CAMS: `https://downloads.psl.noaa.gov/Datasets/ghcncams/air.mon.mean.nc` (178 MB)
- NOAAGlobalTemp: `https://downloads.psl.noaa.gov/Datasets/noaaglobaltemp/air.mon.anom.nc` (74 MB)

The state mask is built by testing each cell centre against the union of the
mandal polygons in `app/data/ap_map_geometry.json`, and the annual means are
weighted by cos(latitude) so northern cells do not count for more than southern
ones.
