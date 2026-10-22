# Groundwater intelligence review and model proposal

Assessment date: 22 October 2026. Evidence snapshot: model card generated 19 October and forecast bias experiment generated 8 October 2026. The accuracy pass corrects validation and interpretation; it does not retrain or replace the published groundwater predictor.

The best next experiment is a conservatively weighted ensemble of the existing boosted-tree predictor, persistence and a seasonal baseline, with weights learned from information available at the prediction date. Prioritize dry-monsoon errors and deep hard-rock settings. A larger neural network is an optional challenger after the benchmark is trustworthy, not an assumed improvement.

## What changed in this pass

- Village split-half validation now sorts parsed calendar dates rather than month-name strings. Earlier and later observations were previously mixed. The same bug also affected each village record’s latest-reading label.
- The pooled earlier/later mean-offset correlation changes from 0.986 to 0.841. Mean-offset MAE changes from 0.645 to 1.833 m. Those are corrected evaluations, not degradation caused by a model update.
- A separate forward test estimates offsets using the first k observations, then evaluates individual observations after the first eight. Every k uses the same wells and future observations; wells receive equal weight. Three early dug-well readings give 1.975 m MAE across 441 wells, with contemporaneous observed peer levels. This excludes future mandal-model and reference errors and does not establish representative village depth.
- The district widget and nine-page brief now separate these targets and cohorts. Removed the unsupported promise that three readings achieve village accuracy better than the mandal nowcast, the claimed accuracy ceiling, and causal attribution of forecast failures to pumping.
- Rainfall maps describe in-sample association. R² of 0.40 is not a majority of variation, and weak association does not show rain is unimportant.
- Storage/rainfall displays identify positive storage-change proxies, mismatched rainfall/level windows, assumed specific yield, and clipping of negative changes. Ratios above 100% do not identify canal contributions. Map values and numerical classifications are preserved.
- Coastal screening describes area-average elevation minus mandal depth, not surveyed well head. Removed claims that salinity-category agreement validates the method or that a 20 m depth cutoff diagnoses confinement.
- Field priorities count overlapping flags once (10 unique mandals, previously displayed as 12), and display the full interval width without an erroneous ± sign. The ranking remains a heuristic rather than proven information gain.
- Mandal seasonal recovery and State-feed comparisons explain net flows, different dates and station aggregation. District trend labels describe a fitted trend rather than uninterrupted annual decline.
- ENSO historical composites identify warm-index seasons selected by a single ONI threshold. These differ from confirmed episodes and from the RONI-based outlook. A historical statement about all very-warm cases is now computed from the data rather than hard-coded.

## Where performance is strong and weak

MAE is mean absolute error in metres; lower is better. Rows below answer different questions and must not be pooled into one accuracy percentage.

| Task and validation | Model MAE | Matched baseline | Interpretation |
| --- | ---: | ---: | --- |
| Nowcast, fixed temporal holdout Jan 2024–Sep 2026; 22,448 rows | 1.024 | Last reading 1.150 | About 10.9% improvement |
| Nowcast, monthly rolling origins; 16,328 rows | 0.907 | Last reading 1.045 | About 13.3% improvement |
| Three-month forecast, model-card rolling test; 20,958 rows | 1.899 | No change 2.221; seasonal 2.352 | Useful aggregate skill; not the exact deployed blend’s score |
| Six-month forecast, rolling test | 2.487 | Seasonal 2.350 | Does not earn release |
| Whole-mandal spatial holdout; 82,332 rows | IDW 4.942 | State average 6.871 | Local estimates remain much less reliable without local history |
| Temporal nowcast at depth ≥30 m | 3.912 | Last reading 4.032 | Small improvement and large absolute errors |

The nominal 80% nowcast band covers 81.11% of the fixed-holdout observations, with mean full width 3.10 m. This does not establish equivalent coverage for three-month forecasts, every aquifer, or village estimates. Three months is the released forecast horizon under the separate release record.

The existing bias experiment is particularly useful. Over 44,969 historical cases, its blend scores 2.173 m MAE; during dry monsoon targets it scores 2.261 m versus 1.808 m for no change, with mean forecast-minus-observed depth of −1.212 m. That means depths were predicted too shallow in this subset. In the recent window the gap is smaller but remains: 1.761 versus 1.682 m. These are diagnostic subsets selected using realized future rain; that rain cannot be used to choose a model prospectively.

An existing shifted-anchor blend improves the long historical average to 2.135 m but worsens the recent window from 1.806 to 1.843 m. Releasing it on the long average alone would conceal that tradeoff. These experiment scores must remain separate from the newer model-card run.

## Proposed model and evaluation

1. **Reproduce the exact deployed predictor.** Backtest its blend, anchor adjustment, missing-input behavior and interval calibration together. Record prediction date, target date, observation availability, input hashes and model version. A training row is usable only after its target and required inputs would have arrived. Keep all mandals for a date in the same temporal fold.
2. **Run a small challenger set.** Compare the existing squared-error model with a median-loss boosted-tree model, a hierarchical seasonal trend model, and a regularized ensemble of those plus persistence/seasonal baselines. Learn ensemble weights on inner chronological folds using past depth, season, aquifer and available rain anomalies. Share information across locations; avoid many poorly supported per-mandal models. Existing anomaly and anchor variants remain comparison candidates, not presumed new discoveries.
3. **Calibrate uncertainty separately.** Compare the existing conformal bands with rolling residual calibration by season and aquifer, pooling sparse groups. Sequential predictive conformal inference is a research candidate that accounts for temporal dependence; its theoretical results do not guarantee coverage on this dataset. Evaluate empirical coverage, interval width and pinball loss on untouched dates. See [SPCI, Xu and Xie, 2023](https://proceedings.mlr.press/v202/xu23r.html). Median and tail quantile fits can also be evaluated separately, as illustrated in the [scikit-learn quantile regression example](https://scikit-learn.org/stable/auto_examples/ensemble/plot_gradient_boosting_quantile.html).
4. **Keep spatial and village estimation separate.** Use located wells, well type, screen depth, surveyed elevation and aquifer boundaries. Test spatial residual interpolation and hierarchical well offsets with both future-date and held-out-location evaluation. Evaluate the complete final depth prediction against new observations; adding offset MAE to mandal MAE is not a valid combined error estimate.

Proposed release gate: at least 5% lower MAE than the exact current pipeline and both simple baselines on matched recent test cases; no material deterioration in dry-monsoon or hard-rock/deep-water cohorts; reduced shallow bias in stress periods; acceptable nominal-band coverage without excessive width. Prespecify tolerances and minimum cohort sizes before tuning. Report uncertainty in improvements using date/region blocks, because thousands of mandal rows are not thousands of independent monsoons. Where evidence is too thin, retain the current model or a validated baseline and label the limitation.

Keep the final evaluation period untouched by feature selection. Run a candidate in shadow mode before publication; two or three updates check operations, but a full seasonal cycle provides stronger evidence about monsoon performance. Six- and twelve-month horizons need their own gates.

## Data and application improvements

The highest-value data acquisition is well-level history with location, well construction, measurement datum and quality flags. Pumping observations or field-calibrated feeder proxies, canal deliveries and reservoir releases are candidates for explaining departures from seasonal behavior. Their value must be measured through one-input-at-a-time comparisons. Future rainfall inputs require archived ensemble hindcasts available at each historical origin; actual future rain would leak the answer.

Water-level fluctuation alone does not separate recharge from other processes; specific-yield uncertainty also affects storage estimates. That limitation should carry through any proposed physical water-balance model. See the [USGS discussion of water-table-fluctuation limitations](https://water.usgs.gov/ogw/gwrp/methods/wtf/issues_limititations.html). Coastal interpretation additionally requires aquifer geometry, hydraulic connections and water-quality evidence, as described in the [USGS coastal groundwater assessment](https://pubs.usgs.gov/circ/2003/circ1262/).

For users, attach a compact evidence panel to important insights: measured or modelled, source and date, forecast horizon, matched baseline skill, uncertainty and the rule that produced the flag. Keep rainfall association, water-level response and causal attribution distinct. Show depletion probabilities only after probability calibration; do not invent probabilities from three quantiles. Generated narrative should summarize verified figures rather than create predictions or causes.

Implementation order: first the benchmark and prediction ledger; then affordable challengers and cohort bias checks; then uncertainty calibration and shadow comparison; finally finer-scale modelling once well-level data and prospective field validation exist. No numerical accuracy gain is promised before those experiments pass.

## Reproducible evidence

- `app/data/model_card.json`
- `reports/forecast_bias_experiment.json`
- `app/data/village_offsets.json` and `app/data/village_offsets_summary.json`
- `phase3_levels/build_levels_engine.py`, `train_multihorizon.py`, `build_forecast.py`, `build_village_offsets.py`

The CGWB raw CSV remains outside Git. Regeneration accepts its local location through `build_village_offsets.py --src`.
