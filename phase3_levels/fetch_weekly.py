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


def step(name, args, cwd=ROOT, required=False):
    started = datetime.datetime.now()
    print(f"\n→ {name}")
    try:
        r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=1800)
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
    # The fetch steps above only land rasters on disk. These two resample them
    # into the per-district / per-mandal context the publisher actually reads —
    # without them the new rasters are downloaded and then ignored.
    ("resample GRACE at districts", [PY, os.path.join(HERE, "refresh_nasa_districts.py")], False),
    ("rebuild mandal rainfall/balance heat", [PY, os.path.join(SCRIPTS, "build_mandal_heat.py")], False),
    ("build holdout-safe nowcasts", [PY, os.path.join(HERE, "build_levels_engine.py")], True),
    ("evaluate model tasks", [PY, os.path.join(HERE, "evaluate_phase0.py")], True),
    ("publish V2 app data",  [PY, os.path.join(HERE, "build_real_app_data.py")], True),
    ("validate V2 contract", [PY, os.path.join(HERE, "validate_phase0.py")], True),
]


def main():
    print(f"=== Phase 3 weekly run · {datetime.datetime.now().isoformat(timespec='seconds')} ===")
    log = []
    failed_required = False
    for name, args, required in STEPS:
        result = step(name, args, required=required)
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
