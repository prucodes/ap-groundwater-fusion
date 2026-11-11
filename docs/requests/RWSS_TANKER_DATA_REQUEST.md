# Data request: habitations supplied by tanker, for a backtest

**To:** Rural Water Supply and Sanitation Department, Andhra Pradesh (Engineer-in-Chief's office, or the
district Superintending Engineers)
**From:** AP Water Intelligence (prototype; APWRIMS data used as a research sample, authorisation pending)

## Why

The site ranks mandals for summer drinking-water planning. It uses each mandal's water table against its own
deepest May on record, plus four other signs: cyclone rain, monsoon recharge, village tanks and water quality.
Before anyone relies on that ranking, it should be tested against what actually happened: where water had to
be carried by tanker. Only the Department holds that record. Public reports give totals only. For example, in
March 2026 the Department identified 2,106 vulnerable habitations across 251 mandals.

## What we would do with it

For each past summer from 2019 to 2026, we would run the ranking on the data available the October before. We
would then count how many of the habitations that needed tankers fell in mandals it had named "plan first" or
"plan next", against the share of all habitations in those mandals. The result would be published on the site
as it stands, whether it is good or bad. No habitation-level detail would be published, only mandal counts.

## What we need

For each summer (March to June) from 2019 to 2026, one row per habitation supplied by tanker:

| Field | Example |
|---|---|
| District | (as held) |
| Mandal | (as held) |
| Habitation name or LGD code | (as held) |
| First and last date of tanker supply | 2026-03-18, 2026-06-10 |
| Trips or litres per day, if recorded | 6 trips |
| Reason recorded (source failed, quality, other) | source dried up |

A spreadsheet in any layout works. If habitation level cannot be shared, **mandal-level counts per summer** of
habitations supplied by tanker are enough for the backtest.

## Contact

Through the user's existing channel with the Groundwater and Water Audit Department.
