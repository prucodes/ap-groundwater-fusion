"""List mandals whose measured specific yield contradicts their aquifer label.

`aquifer_type` is assigned from a hard-coded list of districts: every mandal in
Palnadu is called alluvial because Palnadu is a delta district. But the project
already carries a per-mandal specific yield derived from CGWB aquifer mapping,
and for 259 of 688 mandals the two disagree -- Macherla and Gurazala sit in the
Nallamala hard rock at 0.018, and are labelled alluvial.

The label is NOT corrected from this. Reclassifying was measured and did not
earn its place: average error moved 1.0091 -> 1.0064 m, inside the noise,
while the spread of band coverage across cohorts got worse, 4.1 -> 6.9 points,
because the honest grouping leaves a coastal cohort too small to calibrate on.
The model already reads specific yield as a number, so the label carries little
it does not have.

What the disagreement does mean is that the cohort figures the product
publishes describe districts, not aquifers. This writes the list so a person
can check it against NRSC/Bhuvan ground water prospects or CGWB NAQUIM sheets,
which are the authority and are not open to an unregistered fetch.
"""
import csv
import os
import sys

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from build_levels_engine import build_frame  # noqa: E402

OUT = os.path.join(HERE, "data", "mandal_aquifer_review.csv")
# The district proxy values the engine falls back to when no measured yield
# exists; a mandal still sitting on one of these has nothing to disagree with.
PROXY = {"hard_rock": 0.020, "alluvial": 0.110, "coastal": 0.080}
# Literature ranges: weathered and fractured crystalline rock drains at a few
# per cent, alluvium at ten or more.
HARD_ROCK_BELOW = 0.04
ALLUVIAL_ABOVE = 0.09


def implied(specific_yield):
    if specific_yield < HARD_ROCK_BELOW:
        return "hard_rock"
    if specific_yield > ALLUVIAL_ABOVE:
        return "alluvial"
    return "coastal"


def main():
    df = build_frame()
    per = df.drop_duplicates("mkey")[["mkey", "district", "mandal", "aquifer_type", "specific_yield"]].copy()
    per["on_district_proxy"] = [
        abs(row.specific_yield - PROXY[row.aquifer_type]) < 1e-9 for row in per.itertuples()
    ]
    measured = per[~per.on_district_proxy].copy()
    measured["implied_by_yield"] = measured.specific_yield.map(implied)
    clash = measured[measured.implied_by_yield != measured.aquifer_type].sort_values(
        ["implied_by_yield", "specific_yield"]
    )
    with open(OUT, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["mandal_uuid", "district", "mandal", "labelled_aquifer",
                         "specific_yield", "implied_by_yield"])
        for row in clash.itertuples():
            writer.writerow([row.mkey, row.district, row.mandal, row.aquifer_type,
                             round(row.specific_yield, 4), row.implied_by_yield])
    print(f"{len(clash)} of {len(per)} mandals carry a label their own measured yield contradicts")
    print(f"  {int(per.on_district_proxy.sum())} more have no measured yield at all and sit on the district proxy")
    print(f"  -> data/mandal_aquifer_review.csv")
    for (labelled, suggests), group in clash.groupby(["aquifer_type", "implied_by_yield"]):
        print(f"     labelled {labelled:<10} yield says {suggests:<10} {len(group):>4} mandals")


if __name__ == "__main__":
    main()
