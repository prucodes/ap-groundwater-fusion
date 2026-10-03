"""Phase 3 — weekly hands-off pipeline.

Runs on a schedule (cron / GitHub Action). No manual week-by-week feeding:
it pulls the latest open satellite data, rebuilds the per-mandal features, and
re-predicts groundwater levels (metres) with the trained model.

Optional source fetch failures retain the previously validated local asset.
Required modelling, evaluation, publication and contract-validation failures stop
publication:
  1. Pull latest NASA GRACE-DA rasters
  2. Pull latest CHIRPS rainfall
  3. (Refresh TerraClimate balance — monthly cadence)
  4. Build holdout-safe nowcasts -> outputs/mandal_nowcasts_v2.json
  5. Rebuild structured evaluations, V2 records, model card and manifest
  6. Validate the active contract

Wire real fetchers by pointing STEPS at the project's scripts/ (some already
exist: fetch_chirps_rainfall.py, fetch_terraclimate_balance.py).
"""
import json, os, subprocess, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
SCRIPTS = os.path.join(ROOT, "scripts")
PY = sys.executable


DEFAULT_STEP_TIMEOUT = 1800


def step(name, args, cwd=ROOT, required=False, timeout=DEFAULT_STEP_TIMEOUT):
    started = datetime.datetime.now()
    print(f"\n→ {name}")
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=timeout)
        ok = r.returncode == 0
        tail = (r.stdout or r.stderr).strip().splitlines()[-3:]
        for ln in tail:
            print("   " + ln)
        if not ok and required:
            print(f"   [!] required step failed (rc={r.returncode}); publication stopped")
        return {"step": name, "ok": ok, "rc": r.returncode,
                "secs": round((datetime.datetime.now() - started).total_seconds(), 1)}
    except FileNotFoundError:
        print(f"   [skip] not found: {args}")
        return {"step": name, "ok": False, "rc": "missing", "secs": 0}
    except Exception as e:
        print(f"   [err] {e}")
        return {"step": name, "ok": False, "rc": "error", "secs": 0}


# Fetchers that exist in the project are used; others are no-ops until wired.
STEPS = [
    # GRACE-DA publishes to a rolling "current/" URL: same filenames, new content
    # each week. Without --overwrite the downloader reuses the stale local copy
    # forever and the weekly refresh silently never updates.
    ("fetch GRACE-DA",       [PY, os.path.join(SCRIPTS, "download_nasa_grace_da.py"), "--overwrite"], False),
    ("fetch CHIRPS rain",    [PY, os.path.join(SCRIPTS, "fetch_chirps_rainfall.py")], False),
    ("refresh TerraClimate", [PY, os.path.join(SCRIPTS, "fetch_terraclimate_balance.py")], False),
    # The APWRIMS sensor history — the model's training labels. These endpoints
    # need no authentication (verified 2026-08-28), so this runs unattended like
    # the satellite sources. It walks ~670 mandals with a deliberate crawl delay,
    # so it needs well over the default timeout. Optional by design: on any
    # failure it refuses to publish a degraded pull and the previous history is
    # reused, exactly like a failed raster fetch.
    ("fetch APWRIMS sensor history",
     [PY, os.path.join(HERE, "fetch_apwrims_history.py")], False, 5400),
    # The same portal's other public dashboards: NRSC-model soil moisture, DES
    # gauge rainfall, and reservoir storage with the release into each canal.
    # About twenty requests. Optional: a feed that fails keeps its previous
    # section, which carries its own as-of date, so the page shows its age.
    ("fetch APWRIMS water context",
     [PY, os.path.join(HERE, "fetch_apwrims_context.py")], False, 900),
    # IMD district forecasts and warnings. Dormant until the IMD_API_KEY secret
    # exists (it skips and writes nothing), and private until IMD_PUBLISH=1.
    ("fetch IMD forecasts (needs IMD_API_KEY)",
     [PY, os.path.join(HERE, "fetch_imd_context.py")], False, 300),
    # The fetch steps above only land rasters on disk. These two resample them
    # into the per-district / per-mandal context the publisher actually reads —
    # without them the new rasters are downloaded and then ignored.
    ("resample GRACE at districts", [PY, os.path.join(HERE, "refresh_nasa_districts.py")], False),
    ("rebuild mandal rainfall/balance heat", [PY, os.path.join(SCRIPTS, "build_mandal_heat.py")], False),
    # The model's own rainfall input (rain_1m / rain_3m / rain_12m), from NASA
    # POWER. Until 2026-09-19 this was loaded once and stopped at 2025-12, so every
    # 2026 month reached the model with no rainfall. Incremental: most weeks it
    # finds the last complete month already stored and fetches nothing.
    # CHIRPS at 5.5 km is the model's rainfall; this appends the one new month
    # rather than walking the archive. POWER stays as the fallback behind it.
    ("extend CHIRPS rainfall history (model input)",
     [PY, os.path.join(HERE, "fetch_chirps_history.py")], False, 1800),
    ("fetch NASA POWER rainfall (fallback)",
     [PY, os.path.join(HERE, "fetch_nasa_power_rainfall.py")], False, 2700),
    # The ocean state. One small text file from NOAA, no account, no licence --
    # the only climate index in this project that can run unattended. Optional:
    # the monsoon watch's own numbers come from the readings and CHIRPS, so a
    # failed fetch costs the context line and nothing else.
    ("fetch ENSO index", [PY, os.path.join(HERE, "fetch_enso_index.py")], False),
    # What NOAA's forecasters expect next: four small public pages, monthly.
    # Optional: a failure, or a page that has changed shape, keeps last
    # month's outlook, which carries its own issue date.
    ("fetch ENSO outlook", [PY, os.path.join(HERE, "fetch_enso_outlook.py")], False),
    ("build holdout-safe nowcasts", [PY, os.path.join(HERE, "build_levels_engine.py")], True),
    # Rolling-origin forecast validation retrains once per quarterly cut per
    # candidate horizon, which is slow on a 2-core runner.
    ("evaluate model tasks", [PY, os.path.join(HERE, "evaluate_phase0.py")], True, 3600),
    # The released 3-month forecast. Required: the app publishes it, so a
    # silent failure would leave last week's forward numbers on screen.
    ("build released 3-month forecast", [PY, os.path.join(HERE, "build_forecast.py")], True),
    ("publish V2 app data",  [PY, os.path.join(HERE, "build_real_app_data.py")], True),
    # The Crystal 3D view embeds its own dataset, rebuilt here from the measured
    # series just published. Optional: a failure keeps last week's view, and the
    # test suite blocks publication if a new pre-monsoon year went missing.
    ("rebuild Crystal view data", [PY, os.path.join(HERE, "build_crystal_data.py")], False),
    # Whether this season is recharging, measured per mandal against its own
    # past seasons. Built after the app data so it reads the history the site
    # has just published. Optional: it is a standalone page and a front-page
    # strip, and last week's file stays readable if this fails.
    ("build monsoon watch", [PY, os.path.join(HERE, "build_monsoon_watch.py")], False, 1800),
    # Every mandal through the national drought manual's two triggers: weekly
    # gauge rain and dry spells, SPI, NOAA's vegetation index, NRSC soil
    # moisture, the groundwater index, and reservoirs against ten years. After
    # the app data, because the groundwater index reads the published series.
    # Optional: a failure keeps last week's file, which carries its own date.
    ("build drought watch", [PY, os.path.join(HERE, "build_drought_watch.py")], False, 1800),
    # Last of the builders: this week's headlines beside the ones the site was
    # showing (the files at HEAD), each with its own date. Optional.
    ("build weekly changes", [PY, os.path.join(HERE, "build_weekly_changes.py")], False),
    ("validate V2 contract", [PY, os.path.join(HERE, "validate_phase0.py")], True),
]


def main():
    print(f"=== Phase 3 weekly run · {datetime.datetime.now().isoformat(timespec='seconds')} ===")
    log = []
    failed_required = False
    for entry in STEPS:
        # Entries are (name, args, required) with an optional 4th timeout override.
        name, args, required = entry[0], entry[1], entry[2]
        timeout = entry[3] if len(entry) > 3 else DEFAULT_STEP_TIMEOUT
        result = step(name, args, required=required, timeout=timeout)
        result["required"] = required
        log.append(result)
        if required and not result["ok"]:
            failed_required = True
            break
    run = {"ran_at": datetime.datetime.now().isoformat(timespec="seconds"), "steps": log}
    os.makedirs(os.path.join(HERE, "outputs"), exist_ok=True)
    json.dump(run, open(os.path.join(HERE, "outputs", "weekly_run_log.json"), "w"), indent=2)
    ok = sum(1 for s in log if s["ok"])
    print(f"\n=== done · {ok}/{len(log)} steps ok · log -> outputs/weekly_run_log.json ===")
    if failed_required:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
