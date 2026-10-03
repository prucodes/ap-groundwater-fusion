"""The movie's narration and charts must share the same dated source snapshot."""
import copy
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("prepare_monsoon_film", ROOT / "scripts/prepare_monsoon_film.py")
film = importlib.util.module_from_spec(spec)
spec.loader.exec_module(film)


def inputs():
    return tuple(json.loads((ROOT / "app/data" / name).read_text()) for name in (
        "monsoon_watch.json", "ap_map_geometry.json", "enso_pacific.json"))


def test_movie_narration_tracks_changed_measurements():
    watch, geo, pacific = inputs()
    changed = copy.deepcopy(watch)
    changed["rainfall"]["anomalyPct"] = 12.3
    changed["recharge"]["fallingPct"] = 42.1
    data = film.snapshot(changed, geo, pacific)
    scenes = {s["id"]: s for s in data["scenes"]}
    assert "12.3 percent above" in scenes["rain"]["voice"]
    assert "42.1 percent" in scenes["mandals"]["voice"]
    assert data["sourceHash"] != film.snapshot(watch, geo, pacific)["sourceHash"]


def test_movie_preserves_historical_windows_and_missing_map_data():
    data = film.snapshot(*inputs())
    assert data["history"]["lastYear"] < data["season"]["year"]
    assert data["history"]["elNinoYears"] == len(data["history"]["elNinoYearDetail"])
    assert any(s["shortfall"] is None for s in data["shapes"])
    assert data["example"]["beforeDepthM"] >= 0
    scenes = {s["id"]: s for s in data["scenes"]}
    assert "Conditional" in scenes["outlook"]["source"]
    assert "not predictions" in scenes["districts"]["voice"]


def test_movie_geography_and_illustration_disclosures():
    data = film.snapshot(*inputs())
    assert len(data["shapes"]) == len(inputs()[1]["mandals"])
    names = {d["district"] for d in data["districtShapes"]}
    assert {"NANDYAL", "ANNAMAYYA", "CHITTOOR"} <= names
    assert sum(s["example"] for s in data["shapes"]) == 1
    for scene in data["scenes"]:
        if scene["id"] in ("recharge", "well", "outlook", "prepare", "cities"):
            assert "AI" in scene["source"]
        if scene["id"] == "nino":
            assert "schematic" in scene["source"]


def test_preparedness_is_conditional_and_locally_qualified():
    data = film.snapshot(*inputs())
    scene = next(s for s in data["scenes"] if s["id"] == "prepare")
    assert "possible dry spell" in scene["voice"]
    assert "where suitable" in scene["voice"]
    assert "local teams" in scene["voice"]
    assert "strongest" not in scene["voice"]
    assert any("nidm.gov.in" in source["url"] for source in data["sources"])


def test_pronunciation_changes_speech_not_captions():
    text = "El Nino changes winds near Indonesia."
    assert film.speech_text(text) == "El Neen-yo changes winds near Indonesia."
    assert film.speech_text("El Niño") == "El Neen-yo"
    assert film.TEMPO == 1.0


def test_city_actions_and_state_review_are_not_official_directives():
    timeline = film.snapshot(*inputs())["scenes"]
    scenes = {s["id"]: s for s in timeline}
    assert [s["id"] for s in timeline][-3:] == ["prepare", "cities", "close"]
    assert "village contingency plan" in scenes["prepare"]["voice"]
    assert "drip irrigation and mulch" in scenes["prepare"]["voice"]
    assert "cannot stop El Nino" in scenes["cities"]["voice"]
    assert "non-drinking" in scenes["cities"]["voice"]
    assert "not completed works" in scenes["cities"]["source"]
    assert "not an official directive" in scenes["close"]["source"]


def test_narrated_locations_have_speech_derived_cues():
    manifest = json.loads((ROOT / "app/public/films/monsoon/manifest.json").read_text())
    scenes = {s["id"]: s for s in manifest["scenes"]}
    assert [c["label"] for c in scenes["normal"]["locationCues"]] == ["INDONESIA", "SOUTH AMERICA"]
    assert [c["label"] for c in scenes["connection"]["locationCues"]] == ["ANDHRA PRADESH", "PACIFIC OCEAN"]
    for scene in (scenes["normal"], scenes["connection"]):
        cues = scene["locationCues"]
        assert 0 < cues[0]["time"] < cues[1]["time"] < scene["duration"]
    assert scenes["normal"]["locationCues"][0]["lon"] == 120
    assert scenes["normal"]["locationCues"][1]["lon"] == -78


def test_published_movie_snapshot_and_timeline_are_consistent():
    """The film is a fixed edition: it must say what its own snapshot recorded.

    It cannot be required to equal the live Monsoon Watch, which the weekly
    refresh rewrites every Monday; that would fail every refresh until someone
    re-narrated and re-rendered the film. Where the live record has moved, the
    page says so beside the film (test below).
    """
    manifest = json.loads((ROOT / "app/public/films/monsoon/manifest.json").read_text())
    metadata = json.loads((ROOT / "app/data/monsoon_film.json").read_text())
    assert metadata["sourceHash"] == manifest["sourceHash"]
    assert metadata["snapshot"] == manifest["snapshot"]
    assert metadata["narrated"] == film.narrated_figures(manifest)
    assert [c["text"] for c in metadata["chapters"]] == [s["voice"] for s in manifest["scenes"]]
    said, scenes = metadata["narrated"], {s["id"]: s["voice"] for s in manifest["scenes"]}
    direction = "below" if said["rainAnomalyPct"] < 0 else "above"
    assert f"{abs(said['rainAnomalyPct'])} percent {direction}" in scenes["rain"]
    assert f"{said['elNinoBelowNormal']} of {said['elNinoYears']} El Nino" in scenes["ap-history"]
    assert f"{said['fallingPct']} percent" in scenes["mandals"]
    for current, following in zip(manifest["scenes"], manifest["scenes"][1:]):
        assert abs(current["start"] + current["duration"] - following["start"]) < .003
        assert current["speechDuration"] + .35 <= current["duration"]
    last = manifest["scenes"][-1]
    assert abs(last["start"] + last["duration"] - manifest["duration"]) < .003


def test_the_page_says_where_the_live_record_has_moved_from_the_film():
    """A fixed edition is honest only if the page names what has changed since."""
    page = (ROOT / "app/app/monsoon/page.tsx").read_text()
    component = (ROOT / "app/components/MonsoonFilm.tsx").read_text()
    assert "<MonsoonFilm live=" in page, "the page must hand the film today's figures"
    assert "Since this edition:" in component
    for figure in ("rainAnomalyPct", "rainProduct", "elNinoBelowNormal", "fallingPct"):
        assert figure in component, f"a change in {figure} would go unmentioned"
