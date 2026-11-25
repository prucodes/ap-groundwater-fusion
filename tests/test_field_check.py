"""The field check is planned from published data and scores readings against estimates written down first."""
import csv
import importlib.util
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLAN = json.load(open(os.path.join(ROOT, "app", "data", "field_check.json")))


def builder():
    spec = importlib.util.spec_from_file_location("field_check", os.path.join(ROOT, "phase3_levels", "build_field_check.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_plan_is_ten_rural_mandals_of_ten_wells_in_two_terrains():
    assert len(PLAN["mandals"]) == 10
    assert {m["district"] for m in PLAN["mandals"]} == {d["district"] for d in PLAN["districts"]}
    assert all(m["observationWells"] + m["privateWellsToAdd"] >= PLAN["wellsPerMandal"] for m in PLAN["mandals"])
    assert not any("URBAN" in m["mandal"].upper() for m in PLAN["mandals"])
    assert {m["aquifer"] for m in PLAN["mandals"]} == {"hard_rock", "alluvial"}
    # Every district holds a mandal the summer priority list names, so the pilot also tests that list.
    assert all(any(m["band"] for m in PLAN["mandals"] if m["district"] == d["district"]) for d in PLAN["districts"])


def test_the_predictions_are_written_down_and_fingerprinted_before_any_reading():
    p = PLAN["predictions"]
    assert p["dugAfterThreeM"] < p["dugMandalOnlyM"] and p["boreAfterThreeM"] <= p["boreMandalOnlyM"]
    assert len(PLAN["planSha256"]) == 64 and PLAN["rounds"][0] == "2026-12-01"
    assert PLAN["results"] is None or PLAN["status"] == "readings coming in"


def test_a_well_is_scored_on_its_own_offset_only_after_three_earlier_readings(tmp_path):
    b = builder()
    mandal = {"district": "SRI SATHYA SAI", "mandal": "Rolla", "index": 5, "aquifer": "hard_rock"}
    villages = {"villages": [{"district": "SRI SATHYA SAI", "mandal": "ROLLA", "village": "Rolla", "wellType": "Dug well", "offsetM": 1.0}]}
    hand = {5: {"2026-12": 10.0, "2027-01": 10.0, "2027-02": 10.0}}
    path = tmp_path / "round.csv"
    with open(path, "w", newline="") as handle:
        w = csv.DictWriter(handle, fieldnames=b.READING_FIELDS)
        w.writeheader()
        for day, depth in [("2026-12-01", 12.5), ("2026-12-15", 12.5), ("2026-12-29", 12.5), ("2027-01-12", 12.5), ("2027-03-09", 13.0), ("2027-03-23", "dry")]:
            w.writerow({"round_date": day, "district": "SRI SATHYA SAI", "mandal": "Rolla", "village": "Rolla", "well_id": "R1",
                        "well_type": "dug", "owner": "private", "mp_height_m": "0.5", "water_below_mp_m": "dry" if depth == "dry" else str(depth + 0.5)})
    readings = b.read_readings(str(tmp_path))
    assert [r["depthM"] for r in readings][:2] == [12.5, 12.5], "depth below ground is the reading less the measuring point's height"
    out = b.score(readings, [mandal], villages, hand)
    assert out["awaitingMandalFigure"] == 1, "March is not yet published, so its reading waits"
    assert out["dryReadings"] == 1 and out["readingsFiled"] == 6, "a dry well is kept and counted, never scored as a depth"
    assert out["all"]["mandalOnly"] == {"readings": 4, "maeM": 2.5}
    assert out["all"]["villageOffset"] == {"readings": 4, "maeM": 1.5}
    assert out["all"]["ownThree"] == {"readings": 1, "maeM": 0.0}, "only the fourth reading has three before it"
