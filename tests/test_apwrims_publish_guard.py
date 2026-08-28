"""The APWRIMS pull runs unattended in the weekly job, so a degraded fetch must
never replace a good history. These cover the guard that decides that."""
import importlib.util
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = REPO_ROOT / "phase3_levels" / "fetch_apwrims_history.py"

# Import by path: phase3_levels is not a package, and the module must not run
# main() (it would hit the network) — importing only defines the helpers.
_spec = importlib.util.spec_from_file_location("fetch_apwrims_history", MODULE_PATH)
apwrims = importlib.util.module_from_spec(_spec)
sys.modules["fetch_apwrims_history"] = apwrims
_spec.loader.exec_module(apwrims)


def test_refuses_to_replace_a_full_history_with_a_collapsed_pull():
    # The failure that matters: the portal answers but returns almost nothing.
    assert apwrims.publish_refusal(2_000, 90_000, is_subset=False) is not None


def test_refuses_a_partial_district_walk():
    # Walk dies most of the way through: still well under the floor.
    assert apwrims.publish_refusal(60_000, 90_000, is_subset=False) is not None


def test_allows_a_normal_run_that_grows_or_holds_steady():
    assert apwrims.publish_refusal(90_116, 89_443, is_subset=False) is None
    assert apwrims.publish_refusal(90_000, 90_000, is_subset=False) is None


def test_allows_small_shrinkage_within_tolerance():
    # Mandals do get revised/withdrawn; a few percent must not block the job.
    previous = 90_000
    assert apwrims.publish_refusal(int(previous * 0.95), previous, is_subset=False) is None


def test_district_filtered_run_is_exempt():
    # `fetch_apwrims_history.py Bapatla` deliberately writes ~2.6k rows.
    assert apwrims.publish_refusal(2_626, 90_000, is_subset=True) is None


def test_first_ever_run_has_nothing_to_protect():
    assert apwrims.publish_refusal(90_000, 0, is_subset=False) is None


def test_existing_row_count_excludes_header_and_missing_file(tmp_path):
    csv_path = tmp_path / "history.csv"
    assert apwrims.existing_row_count(csv_path) == 0
    csv_path.write_text("district,mandal,date,level\na,b,2026-07,1.0\na,b,2026-06,1.1\n")
    assert apwrims.existing_row_count(csv_path) == 2


FULL_MONTH = 688


def _history(latest_count):
    """Stored history: several complete months plus a newest month of given size."""
    counts = {f"2026-{m:02d}": FULL_MONTH for m in range(4, 7)}
    counts["2026-07"] = latest_count
    return counts


def test_skips_the_crawl_when_the_latest_month_is_stored_in_full():
    assert apwrims.crawl_reason(_history(FULL_MONTH), "2026-07") is None


def test_crawls_when_the_latest_month_is_still_filling_in():
    # The case that motivates checking coverage, not just presence: July landed
    # at 672 of 688 mandals, so re-pulling is how the stragglers arrive.
    assert apwrims.crawl_reason(_history(672), "2026-07") is not None


def test_crawls_when_the_portal_has_a_month_we_lack():
    assert apwrims.crawl_reason(_history(FULL_MONTH), "2026-08") is not None


def test_crawls_when_there_is_no_stored_history():
    assert apwrims.crawl_reason({}, "2026-07") is not None


def test_crawls_when_the_probe_could_not_determine_a_month():
    # Probe failure must fall back to fetching, never to silently doing nothing.
    assert apwrims.crawl_reason(_history(FULL_MONTH), None) is not None


def test_stored_month_counts_tallies_mandals_per_month(tmp_path):
    csv_path = tmp_path / "history.csv"
    csv_path.write_text(
        "district,district_uuid,mandal,mandal_uuid,date,level_mbgl\n"
        "d,du,m1,u1,2026-06,5.0\n"
        "d,du,m2,u2,2026-06,6.0\n"
        "d,du,m1,u1,2026-07,5.5\n"
    )
    assert apwrims.stored_month_counts(csv_path) == {"2026-06": 2, "2026-07": 1}
    assert apwrims.stored_month_counts(tmp_path / "missing.csv") == {}


def test_cookie_is_optional_so_the_job_can_run_unattended():
    # The endpoints need no auth; requiring a cookie would break the weekly run.
    source = MODULE_PATH.read_text()
    assert "sys.exit(" not in source.split("COOKIE = os.environ.get")[1][:400], (
        "fetch_apwrims_history must not hard-exit when APWRIMS_COOKIE is unset"
    )
