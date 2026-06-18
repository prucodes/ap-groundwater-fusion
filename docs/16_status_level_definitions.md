# Groundwater Status Level Definitions

Single source of truth for the status "levels" shown on the map and tables. The
buckets are assigned in `scripts/fusion_engine_v0.py` (`confidence_and_action`,
`depth_class`) and `scripts/export_dashboard_seed_data.py` (`status_bucket`), and
rendered in `app/components/StatusLegend.tsx` / `app/lib/data.ts` (`STATUS_META`).

## The five levels

| Level | Colour | Meaning | Assignment criteria |
|---|---|---|---|
| **Stress** | red-orange `#e07b39` | Deep or fast-declining water table — act first | Median depth **≥ 15 m** below ground **and** satellite agrees (dry), or a fast-falling trend |
| **Watch** | amber `#d79b2e` | Moderate decline, rainfall deficit, or deepening | Median depth **6–15 m**, "monitor" signal |
| **Normal** | green `#5e9b6b` | Shallow / stable — routine monitoring | Median depth **≤ 6 m**, stable or recovering |
| **Verify** | red `#c65a46` | Sensor reading **diverges from the model** — field-check before acting | Latest sensor reading vs model estimate gap **≥ 8 m** (with enough history). Set in `phase3_levels/build_real_app_data.py` via `obs_model_gap_m` |
| **Low Confidence** | purple `#7a6fa6` | Sparse / stale sensor history | **< 2** stations in the mandal, or no reading in the last **90 days** |
| *Insufficient Data* | grey `#98a2b3` | No estimate yet | Unmatched / empty APWRIMS history |

## Supporting classifications

**Depth class** (`depth_class`, mbgl = metres below ground level):
- `deep` ≥ 15 m · `moderate` 6–15 m · `shallow` ≤ 6 m

**Confidence** (`confidence_and_action`): High ≈ 85 (≥2 stations, reading within
90 days, sensor & satellite agree) · Medium ≈ 65 · Low ≈ 35 (sparse/stale) ·
Verify ≈ 40 (disagreement).

**Water-balance status** (annual rainfall − actual ET, mm/yr): Surplus ≥ 250 ·
Balanced ≥ 50 · Deficit < 50.

**Decline signal** (a hypothesis for *why* a level is falling — to verify in the
field, not an attribution): Pumping-pressure / verify (falling despite a healthy
water balance) · Climate-stress / verify (falling with a rainfall deficit) ·
Stable / recovering.

> Thresholds are prototype/illustrative, not official APWRIMS/CGWB cutoffs. Update
> here and in the two scripts together if they change.
