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


# A paragraph may set a figure beside one of those bodies only when it declares the file in
# this repository the figure comes from: <p data-sourced="path [path ...]">. Every declared
# file must exist; the paragraph is then sourced, not hearsay, and the scan skips it.
SOURCED = re.compile(r'<p data-sourced="([^"]+)">(.*?)</p>', re.S)


def without_sourced(source):
    for match in SOURCED.finditer(source):
        for path in match.group(1).split():
            assert os.path.exists(os.path.join(ROOT, path)), f"data-sourced names a file that is not here: {path}"
    return SOURCED.sub("", source)


def page_sources():
    for base, _, files in os.walk(os.path.join(APP, "app")):
        if "node_modules" in base:
            continue
        for name in files:
            if name.endswith((".tsx", ".ts")):
                path = os.path.join(base, name)
                yield path, without_sourced(strip_comments(open(path).read()))


def test_the_scanner_ignores_comments_but_still_sees_published_text():
    """Guards the guard: the comment recording this fix must not trip it, and a
    real claim in rendered text must."""
    assert "IMD" not in strip_comments('/* was: IMD outlook 92% of LPA */\nconst a = 1;')
    assert "IMD" in strip_comments('<span>IMD projects 92% of LPA</span>')


def test_a_sourced_paragraph_must_name_files_that_exist():
    assert "IMD" not in without_sourced('<p data-sourced="tests/test_no_unsourced_forecasts.py">IMD grid 78%</p>')
    try:
        without_sourced('<p data-sourced="no/such/file.csv">IMD grid 78%</p>')
    except AssertionError:
        return
    raise AssertionError("a paragraph citing a missing file was let through")


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
