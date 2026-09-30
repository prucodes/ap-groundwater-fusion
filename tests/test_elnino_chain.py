"""The chain from the Pacific to a well must be made of figures this site publishes.

An explainer is the easiest place for an unsourced number to enter a project.
The ones that circulate stop at the ocean and are pitched at a global audience;
this one exists to reach an aquifer in Andhra Pradesh, and every step of it has
to be a figure already computed, sourced and checkable elsewhere on the site.
"""
import json
import os
import re

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WATCH = os.path.join(ROOT, "app", "data", "monsoon_watch.json")
COMPONENT = os.path.join(ROOT, "app", "components", "MonsoonVisuals.tsx")


@pytest.fixture(scope="module")
def watch():
    with open(WATCH) as handle:
        return json.load(handle)


@pytest.fixture(scope="module")
def chain_source():
    source = open(COMPONENT).read()
    start = source.index("export function ElNinoChain")
    end = source.index("function formatMm")
    return source[start:end]


def test_every_number_in_the_chain_is_read_from_the_data(chain_source):
    """No literal figures. A hard-coded percentage would go stale the week the
    refresh moved it, and nothing would say so."""
    # Strip the layout numbers that are not claims: viewBox paths, indices.
    prose = re.sub(r'<svg.*?</svg>', "", chain_source, flags=re.S)
    prose = re.sub(r"index < steps\.length - 1", "", prose)
    # Any standalone number with a unit next to it in a template literal.
    literals = re.findall(r"\$\{[^}]*\}|(?<![\w.])(\d+(?:\.\d+)?)\s*(?:°C|%|mm|million)", prose)
    bare = [lit for lit in literals if lit and not lit.startswith("${")]
    assert not bare, f"a figure is hard-coded into the explainer: {bare}"


def test_the_chain_covers_ocean_to_aquifer(chain_source):
    for key in ("ocean", "monsoon", "season", "aquifer"):
        assert f'key: "{key}"' in chain_source


def test_the_sources_named_are_the_ones_the_project_fetches(chain_source):
    for source in ("NOAA Oceanic Niño Index", "CHIRPS", "APWRIMS"):
        assert source in chain_source


def test_the_figures_it_reads_all_exist(watch):
    """If the builder drops one of these, the explainer must fail loudly here
    rather than render an empty box on the page."""
    assert watch["enso"] is not None
    assert watch["rainfall"] is not None
    assert watch["elNinoRainfall"]["swMonsoon"] is not None
    sw = watch["elNinoRainfall"]["swMonsoon"]
    for field in ("years", "elNinoYears", "elNinoAnomalyPct", "elNinoBelowNormal",
                  "belowNormalAllYears", "allYears", "firstYear", "lastYear"):
        assert sw[field] is not None
    for field in ("anomalyPct", "rankDriest", "ofYears", "mm", "normalMm", "firstYear"):
        assert watch["rainfall"][field] is not None


def test_the_association_is_not_described_as_a_mechanism():
    """The ocean makes a poor monsoon likelier. It does not tell this site how
    much rain a month will bring, and the page must not imply that it does."""
    page = open(os.path.join(ROOT, "app", "app", "monsoon", "page.tsx")).read()
    start = page.index("From ocean context to local groundwater evidence")
    note = page[start:start + 1400]
    assert "statistical association" in note
    assert "not a mechanism this site models" in note
