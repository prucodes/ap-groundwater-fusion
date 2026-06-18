#!/usr/bin/env bash
# Phase 3 — weekly hands-off run. Schedule this; it pulls fresh satellite data
# and re-predicts mandal groundwater levels with zero manual feeding.
set -euo pipefail
cd "$(dirname "$0")/.."                      # project root
# Activate a venv if one exists (adjust path as needed)
[ -f ".venv/bin/activate" ] && source .venv/bin/activate || true
ts="$(date +%Y%m%d_%H%M)"
mkdir -p phase3_levels/outputs/logs
python3 phase3_levels/fetch_weekly.py | tee "phase3_levels/outputs/logs/run_${ts}.log"
