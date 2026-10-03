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
# Every directory the site's source lives in. Data files are not only imported
# by data.ts: a large file belongs in its own module so client bundles do not
# carry it, and a component may read its own file.
SOURCE_DIRS = [os.path.join(ROOT, "app", name) for name in ("lib", "components", "app")]

# Files the pipeline deliberately never regenerates. Each needs a reason, because
# "it is static" is exactly what was believed about the files that went stale.
STATIC_BY_DESIGN = {
    "ap_map_geometry.json": "mandal boundary polygons; changes only when the state redraws them",
    "ap_district_geometry.json": "district polygons and their layer ranges",
    "dashboard_summary.json": "a July 2026 snapshot; the UI derives its live figures in data.ts instead",
    "source_readiness.json": "hand-maintained description of which sources are live",
    "ap_temperature.json": (
        "the long temperature record; built by phase3_levels/build_temperature_record.py "
        "from 250 MB of sources that gain a month at a time, so it refreshes monthly "
        "alongside the Pacific panel rather than weekly"
    ),
    "enso_pacific.json": (
        "the Pacific panel's month frames; built by phase3_levels/build_enso_pacific.py "
        "from a 159 MB source that gains one month at a time, so it is run deliberately "
        "rather than weekly, like the boundary alias table"
    ),
    "monsoon_film.json": (
        "the narrated film's chapters and the figures it speaks; a fixed edition, rebuilt "
        "only when the film is re-narrated and re-rendered (scripts/prepare_monsoon_film.py), "
        "and the Monsoon page names any live figure that has moved since"
    ),
}


def imported_data_files():
    found = set()
    for base in SOURCE_DIRS:
        for folder, _, names in os.walk(base):
            for name in names:
                if name.endswith((".ts", ".tsx")):
                    source = open(os.path.join(folder, name)).read()
                    found |= set(re.findall(r'from "(?:\.\./)+data/([A-Za-z0-9_]+\.json)"', source))
    return found


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


def test_the_water_context_is_both_fetched_and_committed():
    weekly = open(os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")).read()
    assert "fetch_apwrims_context.py" in weekly
    for name in ("water_context.json", "water_context_summary.json", "water_context_mandals.json"):
        assert name in committed_data_files()
        assert name in imported_data_files()


def test_the_drought_watch_is_both_built_and_committed():
    weekly = open(os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")).read()
    assert "build_drought_watch.py" in weekly
    for name in ("drought_watch.json", "drought_watch_summary.json"):
        assert name in committed_data_files()
        assert name in imported_data_files()


def test_the_full_drought_watch_stays_out_of_client_components():
    """Every mandal's indicators and weekly series: the Drought Watch page and mandal
    pages render it on the server; client code gets the summary."""
    offenders = []
    for base in SOURCE_DIRS:
        for folder, _, names in os.walk(base):
            for name in names:
                if not name.endswith((".ts", ".tsx")):
                    continue
                source = open(os.path.join(folder, name)).read()
                client = source.lstrip().startswith(('"use client"', "'use client'"))
                if client and ("lib/droughtWatch" in source or "drought_watch.json" in source or "MandalDroughtCheck" in source):
                    offenders.append(os.path.relpath(os.path.join(folder, name), ROOT))
    assert not offenders, f"client components import the full drought watch: {offenders}"


def test_the_full_water_context_stays_out_of_client_components():
    """At half a megabyte it would ride along to every visitor of a client page."""
    offenders = []
    for base in SOURCE_DIRS:
        for folder, _, names in os.walk(base):
            for name in names:
                if not name.endswith((".ts", ".tsx")):
                    continue
                source = open(os.path.join(folder, name)).read()
                client = source.lstrip().startswith(('"use client"', "'use client'"))
                if client and ("lib/waterContext" in source or "water_context.json" in source):
                    offenders.append(os.path.relpath(os.path.join(folder, name), ROOT))
    data_ts = open(DATA_TS).read()
    assert "water_context" not in "".join(re.findall(r'^import .*$', data_ts, re.M)), \
        "data.ts reaches client bundles; it must not import the water-context files"
    assert not offenders, f"client components import the full water context: {offenders}"
