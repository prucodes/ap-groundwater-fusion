"""A mandal whose water table is deepening must never be labelled recovering,
whatever the state of its climate-balance data."""
import json
from pathlib import Path

RECORDS = Path(__file__).resolve().parents[1] / "app" / "data" / "mandal_groundwater_records_v2.json"
DECLINING_M_PER_YEAR = 0.3  # the publisher's threshold for "declining"


def test_no_deepening_mandal_is_labelled_stable_or_recovering():
    offenders = [
        r["identity"]["mandalId"]
        for r in json.loads(RECORDS.read_text())["records"]
        if (r["assessment"]["measuredTrendMPerYear"] or 0) > DECLINING_M_PER_YEAR
        and r["assessment"]["contextAgreement"] == "stable_or_recovering"
    ]
    assert not offenders, f"{len(offenders)} deepening mandals labelled stable_or_recovering, e.g. {offenders[:3]}"
