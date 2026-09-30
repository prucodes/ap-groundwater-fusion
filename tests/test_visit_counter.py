"""Visit counting may record what a reader did, and nothing about who they are.

GoatCounter sets no cookies and stores no IP address, so the risk here is not
identification: it is the address itself. The app puts a selected mandal, a
quality filter and the theme in the query string, and counting those would both
split one screen into hundreds of dashboard rows and publish which place an
official was looking at. Only parameters that choose what a page shows are kept.

The rest of this guards the two things that are easy to get wrong later: the
opt-out has to be honoured before anything is requested, and the counted path
has to keep the GitHub Pages project prefix, because that prefix is the only
thing separating this project's rows from the other projects reporting into the
same GoatCounter site.
"""
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COUNTER = os.path.join(ROOT, "app", "lib", "visit-counter.ts")
LAYOUT = os.path.join(ROOT, "app", "app", "layout.tsx")
METHODOLOGY = os.path.join(ROOT, "app", "app", "methodology", "page.tsx")
MONSOON = os.path.join(ROOT, "app", "app", "monsoon", "page.tsx")
COMPONENTS = os.path.join(ROOT, "app", "components")

# Parameters the app puts in the address that must never reach the dashboard.
SELECTIONS = ["mandal", "quality", "surface", "theme", "present", "district"]


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


@pytest.fixture(scope="module")
def counter():
    return read(COUNTER)


def test_counts_to_the_project_owner_s_own_endpoint(counter):
    assert counter.count("https://prucodes.goatcounter.com/count") == 1
    assert "gc.zgo.at/count.js" in counter


def test_a_selection_is_never_counted(counter):
    kept = re.search(r"export const SCREEN_PARAMS = \[(.*?)\]", counter, re.S)
    assert kept, "SCREEN_PARAMS should stay a declared list, not be inlined into the script"
    for name in SELECTIONS:
        assert f'"{name}"' not in kept.group(1), f"{name} picks a place or a look, not a screen"


def test_the_pages_prefix_survives_so_projects_stay_apart(counter):
    # location.pathname on Pages is /ap-groundwater-fusion/monsoon/. Anything that trimmed
    # it would merge this project's rows into the other projects on the same site.
    assert "location.pathname + (query" in counter
    assert "basePath" not in counter
    assert not re.search(r"pathname\s*\.\s*(replace|slice|substring|split)", counter)


def test_the_opt_out_is_honoured_before_anything_is_requested(counter):
    optout = counter.index("navigator.globalPrivacyControl")
    assert optout < counter.index("createElement('script')")
    assert optout < counter.index("window.goatcounter = {")
    # count.js checks neither GPC nor Do Not Track, so dropping this check would silently
    # start counting readers who asked not to be.
    assert re.search(r"if \(navigator\.globalPrivacyControl\) return;", counter)


def test_a_reader_who_opted_out_does_not_get_a_broken_page(counter):
    # Components call countEvent unconditionally, so the hook has to exist before any bail-out.
    assert counter.index("window.apgwCount = noop") < counter.index("navigator.globalPrivacyControl")


def test_an_interaction_counts_once_per_visit(counter):
    # A mousemove handler and a slider fire continuously; a per-click figure would be noise.
    assert "if (counted[name]) return;" in counter
    assert "counted[name] = true;" in counter


def test_a_click_before_count_js_arrives_is_not_lost(counter):
    assert "else pending.push(event);" in counter
    assert "pending.splice(0).forEach(send)" in counter


def test_every_page_carries_the_counter(counter):
    layout = read(LAYOUT)
    assert "VISIT_COUNTER_SCRIPT" in layout
    assert layout.index("VISIT_COUNTER_SCRIPT") < layout.index("<AppShell>")


def test_events_are_namespaced_and_labelled():
    calls = []
    files = [os.path.join(COMPONENTS, n) for n in sorted(os.listdir(COMPONENTS)) if n.endswith(".tsx")]
    for path in files + [MONSOON]:
        source = read(path)
        calls += re.findall(r'countEvent\(\s*"([^"]+)"\s*,\s*"([^"]+)"', source)
        calls += re.findall(r'event="([^"]+)" title="([^"]+)"', source)
    assert calls, "no events found; the monsoon page should still be counting its controls"
    labels = {}
    for event, title in calls:
        assert event.startswith("monsoon/"), f"{event} should say which page it belongs to"
        # One event, one label: the dashboard shows the title, so a name that arrives with two
        # different labels reads as two different things.
        assert labels.setdefault(event, title) == title, f"{event} has two labels"
        assert len(title) > 12, f"{event} needs a label a reader of the dashboard can understand"


def test_the_monsoon_page_reports_how_far_down_it_is_read():
    page = read(MONSOON)
    reached = set(re.findall(r'event="(monsoon/reached-[^"]+)"', page))
    # Three markers in reading order make a funnel out of one page view.
    assert reached == {"monsoon/reached-map", "monsoon/reached-heat", "monsoon/reached-flagged"}
    assert page.index("reached-map") < page.index("reached-heat") < page.index("reached-flagged")


def test_the_site_says_what_it_records():
    note = read(METHODOLOGY)
    assert "GoatCounter" in note
    assert "no cookies" in note
    assert "Global Privacy Control" in note
    assert "#toggle-goatcounter" in note
