"""Every file the site reads must survive the weekly refresh.

Two separate refreshes have already served stale data because a file the UI
imports was rebuilt by the pipeline and then not committed: the workflow's
`git add` list is written by hand, and adding a data file to the app is done in
a different file by a different change. This test ties the two together.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_TS = os.path.join(ROOT, "app", "lib", "data.ts")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")

# Files the pipeline deliberately never regenerates. Each needs a reason, because
# "it is static" is exactly what was believed about the files that went stale.
STATIC_BY_DESIGN = {
    "ap_map_geometry.json": "mandal boundary polygons; changes only when the state redraws them",
    "ap_district_geometry.json": "district polygons and their layer ranges",
    "dashboard_summary.json": "a July 2026 snapshot; the UI derives its live figures in data.ts instead",
    "source_readiness.json": "hand-maintained description of which sources are live",
}


def imported_data_files():
    source = open(DATA_TS).read()
    return set(re.findall(r'from "\.\./data/([A-Za-z0-9_]+\.json)"', source))


def committed_data_files():
    workflow = open(WORKFLOW).read()
    block = workflow[workflow.index("git add"):workflow.index("git commit")]
    return set(re.findall(r"app/data/([A-Za-z0-9_]+\.json)", block))


def test_every_imported_data_file_is_committed_or_declared_static():
    missing = imported_data_files() - committed_data_files() - set(STATIC_BY_DESIGN)
    assert not missing, (
        "app/lib/data.ts imports these, but the weekly refresh neither commits them nor "
        f"declares them static, so a rebuild would be discarded: {sorted(missing)}"
    )


def test_the_static_list_does_not_grow_stale_claims():
    """A file named static must still be imported; otherwise the reason is dead."""
    unused = set(STATIC_BY_DESIGN) - imported_data_files()
    assert not unused, f"declared static but no longer imported: {sorted(unused)}"


def test_the_monsoon_watch_is_both_built_and_committed():
    weekly = open(os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")).read()
    assert "build_monsoon_watch.py" in weekly
    assert "fetch_enso_index.py" in weekly
    assert "monsoon_watch.json" in committed_data_files()
