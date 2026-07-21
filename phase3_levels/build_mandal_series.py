"""Publish V2 observation histories for every observation-bearing boundary.

The canonical Phase 0 publisher owns identity reconciliation so this entry point
delegates to it instead of maintaining a second, mandal-name-only join.
"""
import json
import os

from build_phase0_foundation import main as publish_phase0

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", "app", "data"))


def main():
    publish_phase0()
    path = os.path.join(APP, "mandal_observation_series_v2.json")
    payload = json.load(open(path))
    print(f"verified {len(payload['series'])} V2 observation histories -> {path}")


if __name__ == "__main__":
    main()
