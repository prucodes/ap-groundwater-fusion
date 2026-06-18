# Go-Live & Handoff Checklist — AP Groundwater Fusion Layer

Status: **prototype, demo-ready** (passed an external audit). This document lists
everything required to take it from prototype to a hosted, auto-refreshing product
with real data, and to hand it off to the receiving team.

Legend: 🔴 blocker for real live data · 🟡 needed for a clean hosted deploy · 🟢 nice-to-have / post-live.

---

## 0. TL;DR — the only true blockers

1. 🔴 **Official APWRIMS data access** (replaces the short-lived browser-session sample).
2. 🔴 **Official mandal boundaries + admin IDs** (replaces the public-prototype geometry).
3. 🟡 **A host + deploy hook** (or auto-deploy on push).

Everything else is configuration or polish. Architecture, pipeline, tests, and
provenance are already in place.

---

## 1. Credentials & secrets

Set these in the **host's secret store** and as **GitHub Actions secrets** (for the
weekly refresh) — never in the repo (the repo is verified clean of secrets).

| Secret / env var | Used by | Status | Priority |
|---|---|---|---|
| `APWRIMS_COOKIE` | `phase3_levels/fetch_apwrims_history.py` | short-lived session cookie today; replace with official API/token | 🔴 |
| `EARTHDATA_USER` / `EARTHDATA_PASS` | NASA GRACE-DA fetch (`.netrc` step in workflow) | free NASA Earthdata account | 🟡 |
| `DEPLOY_HOOK_URL` | `.github/workflows/phase3_weekly_levels.yml` redeploy step | host deploy webhook | 🟡 |
| `ANTHROPIC_API_KEY` | `app/app/api/ai-brief/route.ts` | optional — page degrades gracefully without it | 🟢 |
| `ALLOW_INSECURE_TLS` | public-data fetchers | leave **unset** in prod (verified TLS); only `=1` for local cert-store issues | 🟢 |

---

## 2. Data sources & auth

| Source | Provides | Fetcher | Auth |
|---|---|---|---|
| APWRIMS (AP-GWD) | ground-truth groundwater depth | `phase3_levels/fetch_apwrims_history.py` | 🔴 official access (cookie today) |
| NASA GRACE-DA | groundwater storage percentile | `scripts/download_nasa_grace_da.py`, `phase3_levels/refresh_nasa_grace.py` | 🟡 Earthdata login (likely) |
| CHIRPS | rainfall / recharge | `scripts/fetch_chirps_rainfall.py` | 🟢 public |
| TerraClimate | ET vs rainfall (water balance) | `scripts/fetch_terraclimate_balance.py` | 🟢 public |
| NASA POWER | rainfall fallback | `phase3_levels/fetch_nasa_power_rainfall.py` | 🟢 public API |
| CGWB / India-WRIS | independent validation network | `phase3_levels/fetch_cgwb_indiawris.py` | 🟢 public portal |
| Open-Elevation | terrain features | `phase3_levels/enrich_terrain.py` | 🟢 public |

> All non-APWRIMS sources are open; confirm each provider's **rate limits and
> attribution/licensing terms** before automated production use.

---

## 3. Replace prototype data with official data

- 🔴 Official **APWRIMS groundwater export/API** → swap the session-sample CSV.
- 🔴 Official **APWRIMS/APSAC/RTGS mandal boundaries** → replace `app/data/ap_map_geometry.json` (currently `boundary_source=public_prototype`).
- 🔴 Official **mandal admin IDs / codes** → wire into the join + records.
- 🟡 Once official inputs land, deliberately review and lift the **"prototype / not official"** caveats and set `official_flag=true` where justified.

---

## 4. Auto-refresh pipeline (built — needs hardening)

The weekly GitHub Action `.github/workflows/phase3_weekly_levels.yml` runs Mondays
and chains: fetch (GRACE-DA / CHIRPS / TerraClimate) → `build_mandal_features.py`
→ `predict_levels.py` → `build_real_app_data.py` → commit `app/data` + `dataset_manifest.json` → redeploy.

- 🔴 **APWRIMS cookie is short-lived** — until official API access exists, a human must refresh `APWRIMS_COOKIE` or the APWRIMS step fails. Replacing it with a token is the durable fix.
- 🟡 Add the **Earthdata `.netrc` step** + secrets (placeholder already in the workflow).
- 🟡 **Gate publish on CI**: run `python3 -m pytest -q` and `python3 scripts/validate_fusion_outputs.py` **before** the commit/deploy step, so a bad fetch can't publish bad data.
- 🟢 **Failure alerting**: notify (Slack/email) on a failed weekly run or stale data.
- ℹ️ **Cadence reality:** APWRIMS readings are ~monthly, so the meaningful refresh is **monthly** even though the job runs weekly (it re-publishes the latest available). The UI shows a "Data as of {month}" stamp.

### Manual pipeline run (for the team)
```bash
# 1. provide credentials
export APWRIMS_COOKIE='JSESSIONID=...; ...'      # authorized session only
# export EARTHDATA_USER=... EARTHDATA_PASS=...   # if GRACE needs it

# 2. refresh + rebuild app data
python3 phase3_levels/fetch_weekly.py            # fetch + features + predict + publish
# (or run build_real_app_data.py alone to re-publish from existing outputs)
python3 phase3_levels/build_real_app_data.py

# 3. verify before shipping
python3 -m pytest -q
python3 scripts/validate_fusion_outputs.py

# 4. build the app
cd app && npm ci && npm run build
```

---

## 5. Hosting / deploy

- 🟡 Pick a host: **Vercel / Netlify / Render** (auto-deploy on push, easiest) or
  self-host the **standalone** output — run `node .next/standalone/server.js`
  (note: `next start` is *not* used with `output: "standalone"`).
- 🟡 Configure a **custom domain + HTTPS**.
- 🟡 Set `DEPLOY_HOOK_URL` (or rely on host auto-deploy) so the monthly data commit goes live.
- 🟢 Decide data delivery: keep **commit-data → redeploy** (simple, current) or serve
  `app/data` from **object storage / an API route** so fresh data shows without a rebuild.
- 🟢 **Self-host Google Fonts** for fully offline/reproducible builds (build currently fetches them).
- ℹ️ Node 18+ recommended; `npm ci` for reproducible installs. Build produces ~660 static pages.

---

## 6. Security & production hardening

- 🟡 Secrets only in host/CI secret stores (repo is clean; `.gitignore` excludes caches/models/rasters).
- 🟢 **AI endpoint**: current rate limit is **in-memory (per-process)** — add a
  distributed limiter (Redis) or a shared-secret/same-origin check if it'll be public at scale.
- 🟢 Rotate/destroy the APWRIMS session cookie once official access lands.
- 🟢 Add basic **error monitoring** (e.g. Sentry) and request logging on the host.

---

## 7. Quality gates already in place (keep running)

- `tests/` — **51 tests** incl. `test_phase3_audit.py` guardrails: NASA-field == GRACE,
  measured-vs-NASA separation, secret scanning, env-gated TLS, repo-wide overclaim/attribution
  scan, boundary coverage, dashboard schema, manifest-hash integrity, CSV provenance banners.
- `scripts/validate_fusion_outputs.py` — output validation.
- `app/data/dataset_manifest.json` — sha256 of every generated data file.
- Wire these into CI as the **publish gate** (see §4).

---

## 8. Known limitations to communicate at handoff

- Estimates are **modelled gap-fill/forecast for the 639 mandals with APWRIMS history**
  (temporal hold-out, ±1.3 m); ~20 mandals have no sensor series (shown grey).
- Spatial estimation of **sensorless** mandals is a **research backtest, not deployed**.
- GRACE-DA is **district-scale context** (effective resolution coarse), not mandal depth.
- Pumping vs drought signals are **verify-first hypotheses**, not attributions.
- Confidence bands are model-derived, **not yet calibrated** for empirical p10–p90 coverage.

---

## 9. Deferred engineering (optional, post-live)

- 🟢 **Consolidate** the legacy V0 (`scripts/`) and Phase-3 (`phase3_levels/`) pipelines
  into one documented path (currently Phase-3 is live, V0 is reference-only).
- 🟢 **Automated responsive + accessibility tests** (Playwright + axe harness); explicit
  viewport is already set, but there's no visual-regression suite.
- 🟢 **Recalibrate** the model on official APWRIMS data; calibrate confidence bands;
  validate spatial coverage if statewide sensorless estimates are wanted.
- 🟢 **Phone hamburger drawer** (sidebar collapses to an icon rail today; usable but dense on small phones).

---

## 10. Ownership / runbook (fill in at handoff)

- [ ] Repo owner / maintainer: ______
- [ ] Hosting account & who has access: ______
- [ ] Secret store location & rotation owner: ______
- [ ] Who refreshes `APWRIMS_COOKIE` until official access lands: ______
- [ ] Monthly-refresh failure escalation contact: ______
- [ ] APWRIMS data authorization / MoU owner on AP-WRD side: ______
