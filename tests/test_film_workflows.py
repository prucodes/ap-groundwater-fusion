"""The films are recorded wherever the site is published.

The pages play their films live, but a download row only appears when the deploy has
recorded the MP4s. Two workflows publish the site (a push to main, and the Monday
refresh, which deploys its own build); a film step in only one of them would give a
download row that comes and goes with which workflow ran last.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKFLOWS = os.path.join(ROOT, ".github", "workflows")
SCRIPT = "scripts/render-film.mjs"
FILMS = {"weekly": "Record the weekly film", "methodology": "Record the method film"}


def read(name):
    return open(os.path.join(WORKFLOWS, name)).read()


def test_both_publishing_workflows_record_every_film_after_the_build_and_before_the_upload():
    for name in ("pages.yml", "phase3_weekly_levels.yml"):
        text = read(name)
        build, upload = text.index("npm run build:static"), text.index("actions/upload-pages-artifact")
        assert "ffmpeg" in text[build:upload], f"{name}: the recorder needs ffmpeg installed"
        for film in FILMS:
            at = text.index(f"{SCRIPT} --film {film}")
            assert build < at < upload, f"{name}: the {film} film must be recorded from the built site, before it is uploaded"


def test_a_film_never_blocks_a_publish_but_does_fail_a_pull_request():
    pages, weekly = read("pages.yml"), read("phase3_weekly_levels.yml")
    for step in FILMS.values():
        body = pages[pages.index(f"- name: {step}"):]
        assert "continue-on-error: ${{ github.event_name != 'pull_request' }}" in body[:body.index("run:")], step
        body = weekly[weekly.index(f"- name: {step}"):]
        assert "continue-on-error: true" in body[:body.index("run:")], step


def test_a_reused_recording_is_keyed_on_everything_its_film_shows():
    pages = read("pages.yml")
    needs = {
        "weekly-film": ("app/data/**", "app/lib/**", "app/components/film/**", "app/app/weekly-film/**"),
        # What lib/methodFilm.ts reads: the model card, the season's recharge, the gauge network.
        "method-film": ("app/data/model_card.json", "app/data/monsoon_watch.json", "app/data/water_context.json", "app/lib/**", "app/components/film/**"),
    }
    for name, needed in needs.items():
        key = re.search(rf"key: {name}-\$\{{\{{ hashFiles\((.*?)\) \}}\}}", pages).group(1)
        for path in (*needed, f"app/{SCRIPT}"):
            assert f"'{path}'" in key, f"a change under {path} must record the {name} again"
        for path in key.replace("'", "").split(", "):
            assert os.path.exists(os.path.join(ROOT, path.split("/**")[0])), f"{path} no longer exists"


def test_the_method_film_reads_only_what_its_cache_key_names():
    source = open(os.path.join(ROOT, "app", "lib", "methodFilm.ts")).read()
    imports = set(re.findall(r'from "\./(\w+)"', source))
    assert imports == {"creator", "data", "waterContext"}, (
        f"lib/methodFilm.ts now reads {sorted(imports)}; add the data it brings to the method-film cache key in pages.yml")


def test_the_recorder_and_the_player_agree_on_where_films_go():
    script = open(os.path.join(ROOT, "app", SCRIPT)).read()
    player = open(os.path.join(ROOT, "app", "components", "film", "FilmPlayer.tsx")).read()
    assert 'join(directory, "films", filmName)' in script and "manifest.json" in script
    assert "/films/${name}/manifest.json" in player and "/films/${name}/${file.file}" in player
    # Each film's folder is named once in the recorder and once where the film is mounted.
    for film, component in (("weekly", "WeeklyFilmPlayer.tsx"), ("methodology", "MethodFilm.tsx")):
        assert f"{film}: {{ route:" in script
        assert f'name="{film}"' in open(os.path.join(ROOT, "app", "components", "film", component)).read()
    # The three shapes are named once in each; a shape added to one must be added to the other.
    for shape in ("landscape", "square", "portrait"):
        assert f"{shape}: [" in script and f"{shape}: [" in player
