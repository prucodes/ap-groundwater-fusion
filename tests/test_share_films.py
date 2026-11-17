"""The films as files to forward (phase3_levels/build_share_films.py).

The copy a reader downloads carries each frame's date and the source burned in. It is
made from the committed film, so the thing to guard is the two drifting apart: a film
rebuilt without its copy would hand out last month's pictures under this month's link.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "phase3_levels"))

import build_share_films as share  # noqa: E402

PUBLIC = os.path.join(ROOT, "app", "public")
DATA = os.path.join(ROOT, "app", "data")
FILM_DATA = {"grace": ("grace_film.json", "months"), "rain": ("rain_film.json", "days"), "clouds": ("cyclone_clouds.json", "frames")}


def manifest():
    return json.load(open(share.MANIFEST))


def test_every_film_with_a_download_has_a_copy_made_from_the_film_as_committed():
    made = manifest()
    assert set(made) == set(share.FILMS)
    for name, entry in made.items():
        film, copy = os.path.join(PUBLIC, entry["film"]), os.path.join(PUBLIC, entry["share"])
        assert os.path.exists(copy), f"{name}: {entry['share']} is missing; run phase3_levels/build_share_films.py {name}"
        assert share.sha256(film) == entry["sha256"], (
            f"{name}: {entry['film']} was rebuilt after its share copy; run phase3_levels/build_share_films.py {name}")
        assert os.path.getsize(copy) < 16 * 1024 * 1024, f"{name}: over WhatsApp's 16 MB video limit"


def test_the_copy_is_where_the_page_looks_for_it():
    # FilmDownload.tsx finds the copy by name: the film's path with -share before .mp4.
    for name, entry in manifest().items():
        data = json.load(open(os.path.join(DATA, FILM_DATA[name][0])))
        assert entry["film"] == data["video"]
        assert entry["share"] == data["video"].replace(".mp4", "-share.mp4")


def test_the_copy_has_a_frame_for_every_date_the_film_lists():
    for name, entry in manifest().items():
        file, key = FILM_DATA[name]
        listed = json.load(open(os.path.join(DATA, file)))[key]
        listed = listed if isinstance(listed, int) else len(listed)
        assert abs(entry["frames"] - listed) <= 1, f"{name}: {entry['frames']} frames for {listed} dates"


def test_figures_are_written_as_the_page_writes_them():
    # The page rounds halves up (JavaScript); Python's own round() would send 2.5 to 2.
    assert share.half_up(2.5) == 3 and share.half_up(-2.5) == -3 and share.half_up(0.4) == 0
    assert share.signed_cm(-8.84) == "−9 cm" and share.signed_cm(3.2) == "+3 cm" and share.signed_cm(0) == "0 cm"
    assert share.month_name("2015-08") == "August 2015" and share.short_day("2026-06-01") == "1 Jun"


def test_the_outline_is_read_as_the_page_draws_it():
    lines = share.outline_points("M10,20L30,40L50,60ZM1.5,2.5L3,4", 2)
    assert lines[0] == [(20.0, 40.0), (60.0, 80.0), (100.0, 120.0), (20.0, 40.0)]
    assert lines[1] == [(3.0, 5.0), (6.0, 8.0)]
    for file in ("grace_film.json", "rain_film.json", "cyclone_clouds.json"):
        outline = json.load(open(os.path.join(DATA, file)))["outline"]
        assert sum(len(line) for line in share.outline_points(outline, 1)) > 100
