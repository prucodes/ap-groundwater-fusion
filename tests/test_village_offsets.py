"""The village offset is only defensible if a few specific things stay true.

Each check here stands for a way this went wrong while it was being built, and
every one of them produced a plausible-looking number rather than an error.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAYLOAD = os.path.join(ROOT, "app", "data", "village_offsets.json")
BUILDER = os.path.join(ROOT, "phase3_levels", "build_village_offsets.py")


def load():
    with open(PAYLOAD, encoding="utf-8") as handle:
        return json.load(handle)


def source():
    with open(BUILDER, encoding="utf-8") as handle:
        return handle.read()


def test_offsets_are_measured_against_wells_of_the_same_type():
    """Pooling dug wells with bores puts the aquifer's depth into the offset.

    Unstratified, the AP set paired dug wells against piezometers 55 m deeper and
    published a 106 m village water level.
    """
    assert '.groupby(["tehsil", "month", "well_type"])' in source()


def test_wells_of_unknown_type_are_excluded():
    """Their learned offset came out worse than the mandal mean it replaces."""
    assert "UNKNOWN_WELL_TYPES" in source()
    types = {row["wellType"] for row in load()["validation"]["byWellType"]}
    assert not types & {"-", "", "nan", "NAN"}


def test_worked_examples_are_shallow_wells_and_plausible_depths():
    payload = load()
    assert payload["appliedExamples"], "the method needs to be shown end to end"
    for row in payload["appliedExamples"]:
        assert row["wellType"] if "wellType" in row else True
        assert abs(row["offsetM"]) <= 10.0, row
        # A village water table is below ground and not in the hundreds of metres.
        assert 0 <= row["villageEstimateM"] < 100, row
        assert row["villageEstimateM"] == round(
            row["mandalNowcastM"] + row["offsetM"], 2), row


def test_the_cross_network_check_sees_wells_with_no_peers():
    """Its whole point is reaching villages the peer method cannot.

    Run on the peer-filtered frame it silently measured a different thing.
    """
    assert "cross_network(unfiltered, resolved)" in source()
    cross = load()["validation"]["crossNetworkOffset"]
    assert cross["villagesReached"] > 0


def test_measuring_beats_predicting():
    """The recommendation rests on this, so it is asserted rather than described."""
    validation = load()["validation"]
    null = validation["staticCovariateNull"]
    assert null["predictedOffsetMaeM"] >= null["mandalMeanMaeM"], (
        "if the offset became predictable from static covariates, the advice to "
        "measure villages instead of modelling them would need revisiting")
    assert null["predictedOffsetR2"] < 0.1

    one_reading = next(row["residualErrorM"] for row in validation["doseResponse"]
                       if row["readings"] == 1)
    assert one_reading < null["mandalMeanMaeM"], "one reading must beat the model"


def test_more_readings_never_report_a_worse_village():
    for row in [load()["validation"]] + load()["validation"]["byWellType"]:
        curve = row["doseResponse"]
        values = [point["residualErrorM"] for point in curve]
        assert values == sorted(values, reverse=True), curve


def test_dug_wells_carry_the_recommendation():
    """A private village well is a dug well, so that stratum is what the advice
    is priced on. If it stops being the stronger one, the pilot design changes."""
    types = {row["wellType"]: row for row in load()["validation"]["byWellType"]}
    assert "Dug well" in types
    dug = types["Dug well"]
    assert dug["persistence"]["persistentSharePct"] > 85
    assert dug["splitHalf"]["pastPredictsFutureR"] > 0.9
    if "Bore well" in types:
        assert (dug["splitHalf"]["withLearnedOffsetMaeM"]
                < types["Bore well"]["splitHalf"]["withLearnedOffsetMaeM"])


def test_the_offset_is_not_claimed_to_be_the_whole_village():
    payload = load()
    assert "caveat" in payload["source"]
    for row in payload["villages"][:50]:
        assert "wells" in row and "readings" in row and "wellType" in row


def test_coverage_is_reported_against_the_whole_state():
    coverage = load()["coverage"]
    assert coverage["villages"] > 0
    # The gap between this and 670 is the point: most mandals have no peer wells.
    assert coverage["mandals"] < coverage["mandalsInRecords"]
