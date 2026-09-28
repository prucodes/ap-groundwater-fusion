"""The site may publish what it measured. It may not publish someone else's
forecast that nothing here sources.

The scenario planner carried "IMD outlook - 92% of LPA" and modelled a -8%
monsoon on the strength of it. No file in this repository held that figure, no
fetcher retrieved it, and it disagreed with the deficit the site measures and
publishes on the Monsoon Watch page. A reader comparing the two pages had no way
to tell which to believe.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app")

# Bodies that issue forecasts this project does not fetch. Naming one beside a
# number is a claim about their forecast, and nothing here can stand behind it.
UNSOURCED_FORECASTERS = ("IMD", "India Meteorological", "ECMWF", "NCEP", "Skymet")


def strip_comments(source):
    """Comments are documentation, not published text. A note recording that a
    claim WAS removed must not read as the claim still being there."""
    source = re.sub(r"/\*.*?\*/", "", source, flags=re.S)
    return re.sub(r"(?<![:\w])//[^\n]*", "", source)


def page_sources():
    for base, _, files in os.walk(os.path.join(APP, "app")):
        if "node_modules" in base:
            continue
        for name in files:
            if name.endswith((".tsx", ".ts")):
                path = os.path.join(base, name)
                yield path, strip_comments(open(path).read())


def test_the_scanner_ignores_comments_but_still_sees_published_text():
    """Guards the guard: the comment recording this fix must not trip it, and a
    real claim in rendered text must."""
    assert "IMD" not in strip_comments('/* was: IMD outlook 92% of LPA */\nconst a = 1;')
    assert "IMD" in strip_comments('<span>IMD projects 92% of LPA</span>')


def test_no_page_attributes_a_number_to_a_forecaster_we_do_not_fetch():
    offenders = []
    for path, source in page_sources():
        for body in UNSOURCED_FORECASTERS:
            for match in re.finditer(re.escape(body), source):
                window = source[match.start(): match.start() + 160]
                # A bare mention is fine; a mention next to a figure is a claim.
                if re.search(r"\d+\s*(%|percent|mm)", window):
                    offenders.append(f"{os.path.relpath(path, ROOT)}: {window[:90]!r}")
    assert not offenders, (
        "a forecast figure is attributed to a body this project does not fetch:\n  "
        + "\n  ".join(offenders)
    )


def test_the_scenario_preset_uses_the_measured_deficit():
    source = strip_comments(open(os.path.join(APP, "app", "scenario", "page.tsx")).read())
    assert "monsoonWatch.rainfall" in source or "monsoonWatch" in source, (
        "the scenario presets should read the measured rainfall anomaly, not a literal"
    )
    assert "92% of LPA" not in source
