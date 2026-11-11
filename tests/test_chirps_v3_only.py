"""CHIRPS v2 stops after December 2026, and v3 reads wetter, so the two never mix.

Every layer moved to v3 in October 2026 (the mandal rain history, Monsoon Watch,
the drought watch and the monthly rainfall map). This keeps it that way: a fetch
pointed back at v2 would quietly stop finding months in 2027, and a v2 month
appended to the v3 history would shift every normal.
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "phase3_levels", "data", "mandal_rain_history_chirps_manifest.json")
V2_URL = re.compile(r"products/CHIRPS-2\.0")


def test_the_rain_history_is_v3_from_the_first_month():
    manifest = json.load(open(MANIFEST))
    assert manifest["product"].startswith("CHIRPS v3")
    assert "/CHIRPS/v3.0/" in manifest["source"]
    assert manifest["firstMonth"] == "1981-01"


def test_no_fetch_reads_v2():
    tracked = subprocess.run(["git", "ls-files", "*.py", "*.yml"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    fetching = []
    for path in tracked:
        if path.startswith("tests/"):
            continue
        for line in open(os.path.join(ROOT, path), encoding="utf-8", errors="ignore"):
            # A named fallback label is allowed; a fetch from the v2 tree is not.
            if V2_URL.search(line) and "CHIRPS_V2_SOURCE =" not in line:
                fetching.append(f"{path}: {line.strip()}")
    assert not fetching, fetching


def test_published_rainfall_names_v3():
    for name in ("monsoon_watch.json", "drought_watch.json"):
        text = open(os.path.join(ROOT, "app", "data", name)).read()
        assert "CHIRPS v3" in text and "CHIRPS v2" not in text, name
