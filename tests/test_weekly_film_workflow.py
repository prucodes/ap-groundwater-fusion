"""The weekly film is recorded wherever the site is published.

The page plays the film live, but its download row only appears when the deploy has
recorded the MP4s. Two workflows publish the site (a push to main, and the Monday
refresh, which deploys its own build); a film step in only one of them would give a
download row that comes and goes with which workflow ran last.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS = os.path.join(ROOT, ".github", "workflows")
SCRIPT = "scripts/render-weekly-film.mjs"


def read(name):
    return open(os.path.join(WORKFLOWS, name)).read()


def test_both_publishing_workflows_record_the_film_after_the_build_and_before_the_upload():
    for name in ("pages.yml", "phase3_weekly_levels.yml"):
        text = read(name)
        build, film, upload = text.index("npm run build:static"), text.index(SCRIPT), text.index("actions/upload-pages-artifact")
        assert build < film < upload, f"{name}: the film must be recorded from the built site, before it is uploaded"
        assert "ffmpeg" in text[build:upload], f"{name}: the recorder needs ffmpeg installed"


def test_the_film_never_blocks_a_publish_but_does_fail_a_pull_request():
    pages, weekly = read("pages.yml"), read("phase3_weekly_levels.yml")
    step = pages[pages.index("- name: Record the weekly film"):pages.index("- name: Keep the film's contact sheets")]
    assert "continue-on-error: ${{ github.event_name != 'pull_request' }}" in step
    step = weekly[weekly.index("- name: Record the weekly film"):weekly.index("- name: Disable Jekyll processing")]
    assert "continue-on-error: true" in step


def test_the_reused_recording_is_keyed_on_everything_the_film_shows():
    pages = read("pages.yml")
    key = re.search(r"key: weekly-film-\$\{\{ hashFiles\((.*?)\) \}\}", pages).group(1)
    for needed in ("app/data/**", "app/lib/**", "app/components/film/**", "app/app/weekly-film/**", f"app/{SCRIPT}"):
        assert f"'{needed}'" in key, f"a change under {needed} must record the film again"
    for needed in key.replace("'", "").split(", "):
        assert os.path.exists(os.path.join(ROOT, needed.split("/**")[0])), f"{needed} no longer exists"


def test_the_recorder_and_the_page_agree_on_where_the_film_goes():
    script = open(os.path.join(ROOT, "app", SCRIPT)).read()
    player = open(os.path.join(ROOT, "app", "components", "film", "WeeklyFilmPlayer.tsx")).read()
    assert 'join(directory, "films", "weekly")' in script and "manifest.json" in script
    assert "/films/weekly/manifest.json" in player and "/films/weekly/${file.file}" in player
    # The three shapes are named once in each; a shape added to one must be added to the other.
    for shape in ("landscape", "square", "portrait"):
        assert f"{shape}: [" in script and f"{shape}: [" in player
