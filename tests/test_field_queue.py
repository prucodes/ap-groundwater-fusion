"""The queue tells a department where to spend its time, so its ordering has to be
defensible and its reasons have to stay out of its arithmetic.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAYLOAD = os.path.join(ROOT, "app", "data", "field_queue.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_field_queue.py")
RUNNER = os.path.join(ROOT, "phase3_levels", "fetch_weekly.py")
WORKFLOW = os.path.join(ROOT, ".github", "workflows", "phase3_weekly_levels.yml")


def load():
    with open(PAYLOAD, encoding="utf-8") as handle:
        return json.load(handle)


def read(path):
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def test_the_queue_is_in_the_order_it_claims():
    rows = load()["queue"]
    assert [r["rank"] for r in rows] == sorted(r["rank"] for r in rows)
    scores = [r["index"] for r in rows]
    assert scores == sorted(scores, reverse=True), scores[:6]


def test_the_score_is_the_product_of_the_three_ranks():
    for row in load()["queue"]:
        parts = row["rankParts"]
        expected = 100 * parts["uncertainty"] * parts["people"] * parts["irrigated"]
        assert abs(row["index"] - expected) < 0.2, row


def test_ranks_are_ranks_and_not_raw_values():
    """Multiplying metres by people by square kilometres would rank by population
    alone, so each goes in as its position among all mandals."""
    for row in load()["queue"]:
        for share in row["rankParts"].values():
            assert 0.0 <= share <= 1.0, row


def test_the_reasons_stay_out_of_the_score():
    """Below sea level and the assessment disagreement are arguments for visiting,
    not extra points. If they were scored, every flagged row would outrank its
    neighbours on the same three parts."""
    rows = load()["queue"]
    flagged = [r for r in rows if r["belowSeaLevel"] or r["disagrees"]]
    assert flagged, "no flagged rows to check"
    for row in flagged:
        parts = row["rankParts"]
        assert abs(row["index"] - 100 * parts["uncertainty"] * parts["people"] * parts["irrigated"]) < 0.2


def test_every_row_shows_what_put_it_there():
    for row in load()["queue"]:
        assert row["intervalWidthM"] > 0
        assert row["people"] > 0
        assert row["irrigatedKm2"] >= load()["minIrrigatedKm2"]
        assert row["irrigatedKm2"] <= row.get("areaKm2", 1e9) if "areaKm2" in row else True


def test_it_does_not_rank_on_stress():
    """An over-exploited mandal is already watched; the queue is about what a
    reading would settle. The stage of extraction travels as a label only."""
    assert "It does not rank on stress" in read(BUILDER)
    rows = load()["queue"]
    stages = [r["stagePct"] for r in rows if r["stagePct"] is not None]
    if len(stages) > 4:
        # the published order must not simply be the stage of extraction
        assert stages != sorted(stages, reverse=True)


def test_it_does_not_claim_to_be_a_sampling_design():
    data = load()
    assert "not a sampling design" in data["caveat"] or "not a sampling design" in read(BUILDER)
    assert "modelled estimate" in data["populationCaveat"]


def test_the_weekly_refresh_builds_and_commits_it():
    assert "build_field_queue.py" in read(RUNNER)
    assert "app/data/field_queue.json" in read(WORKFLOW)


def test_it_is_built_after_the_lists_it_draws_from():
    """It reads the seawater watch and the assessment trajectory, so it has to run
    after both or it ranks against last week's reasons."""
    runner = read(RUNNER)
    assert runner.index("build_assessment_trajectory.py") < runner.index("build_field_queue.py")
    assert runner.index("build_seawater_watch.py") < runner.index("build_field_queue.py")
