"""Phase 3 — weekly hands-off pipeline.

Runs on a schedule (cron / GitHub Action). No manual week-by-week feeding:
it pulls the latest open satellite data, rebuilds the per-mandal features, and
re-predicts groundwater levels (metres) with the trained model.

Steps (each isolated; a failure is logged but doesn't abort the rest):
  1. Pull latest NASA GRACE-DA rasters
  2. Pull latest CHIRPS rainfall
  3. (Refresh TerraClimate balance — monthly cadence)
  4. Rebuild per-mandal feature table
  5. Predict levels -> outputs/mandal_levels_current.json

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
            print(f"   [!] required step failed (rc={r.returncode})")
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
    ("fetch GRACE-DA",       [PY, os.path.join(SCRIPTS, "download_nasa_grace_da.py")]),
    ("fetch CHIRPS rain",    [PY, os.path.join(SCRIPTS, "fetch_chirps_rainfall.py")]),
    ("refresh TerraClimate", [PY, os.path.join(SCRIPTS, "fetch_terraclimate_balance.py")]),
    ("build mandal features",[PY, os.path.join(HERE, "build_mandal_features.py")]),
    ("predict levels",       [PY, os.path.join(HERE, "predict_levels.py"),
                              "--features", os.path.join(HERE, "data", "mandal_features_current.csv")]),
    # Propagate fresh predictions into app/data/*.json — the files the Next.js app
    # actually imports. Without this the weekly refresh never reaches the UI.
    ("publish to app/data",  [PY, os.path.join(HERE, "build_real_app_data.py")]),
]


def main():
    print(f"=== Phase 3 weekly run · {datetime.datetime.now().isoformat(timespec='seconds')} ===")
    log = [step(n, a) for n, a in STEPS]
    run = {"ran_at": datetime.datetime.now().isoformat(timespec="seconds"), "steps": log}
    os.makedirs(os.path.join(HERE, "outputs"), exist_ok=True)
    json.dump(run, open(os.path.join(HERE, "outputs", "weekly_run_log.json"), "w"), indent=2)
    ok = sum(1 for s in log if s["ok"])
    print(f"\n=== done · {ok}/{len(log)} steps ok · log -> outputs/weekly_run_log.json ===")


if __name__ == "__main__":
    main()
