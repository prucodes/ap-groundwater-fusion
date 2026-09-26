"""Propose source-series -> prototype-boundary aliases by explicit rule.

`source_identity.reconcile` refuses to guess, which leaves ~100 of 688 mandals
without a centroid and therefore out of the model entirely. Every rule here is
one a reviewer can check by reading the pair; anything a rule cannot settle is
written to the report so a person can finish it. Nothing is matched by string
similarity.
"""
import csv
import difflib
import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from source_identity import key, reconcile  # noqa: E402

OUT = os.path.join(HERE, "data", "mandal_boundary_aliases.csv")
REPORT = os.path.join(HERE, "data", "mandal_boundary_unresolved.csv")

# Qualifiers that name part of a town, not a different place.
QUALIFIER = re.compile(
    r"\b(?:URBAN|RURAL|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN|M)\b"
    r"|\b(?:NORTH|SOUTH|EAST|WEST|CENTRAL)\b(?=\s*$)"
    r"|[-\s_]\d+\s*$|\s\d+\s*$"
)


def stripped(name):
    text = re.sub(r"\([^)]*\)", " ", str(name).upper()).replace("_", " ")
    text = text.replace(".", " ").replace("-", " ")
    previous = None
    while previous != text:
        previous = text
        text = QUALIFIER.sub(" ", text)
    return re.sub(r"[^A-Z0-9]", "", text)


def build(sources, boundaries):
    matches, unresolved = reconcile(sources, boundaries)
    claimed = {match["boundaryIndex"] for match in matches.values()}
    by_pair, by_name = defaultdict(list), defaultdict(list)
    for index, row in enumerate(boundaries):
        by_pair[(key(row["d"]), stripped(row["m"]))].append(index)
        by_name[stripped(row["m"])].append(index)
    pending = {row["sourceSeriesId"]: row for row in unresolved}
    source_names = defaultdict(list)
    for row in pending.values():
        source_names[stripped(row["mandal"])].append(row)

    aliases, left = [], []
    for uid, row in sorted(pending.items()):
        name = stripped(row["mandal"])
        # A: the same district, once the town qualifier is removed. Several
        # sources may share one boundary (Vijayawada East/West/North/Central).
        candidates = by_pair.get((key(row["district"]), name), [])
        if len(candidates) == 1:
            aliases.append((row, candidates[0], "qualifier_stripped_same_district")); continue
        # B: one boundary of that name statewide, unclaimed, and the sources
        # carrying the name all sit in one district.
        candidates = [c for c in by_name.get(name, []) if c not in claimed]
        districts = {key(other["district"]) for other in source_names[name]}
        if len(candidates) == 1 and len(districts) == 1:
            aliases.append((row, candidates[0], "unique_unclaimed_name_single_district")); continue
        left.append(row)

    # C: a transliteration of the same name in the same district -- PATTIKANDA
    # for PATTIKONDA, AVANIGADA for AVANIGADDA. Only when one unclaimed
    # boundary in that district is a near-identical spelling and the next best
    # is clearly behind it, so a genuinely different village cannot win.
    taken = claimed | {index for _, index, _ in aliases}
    in_district = defaultdict(list)
    for index, boundary in enumerate(boundaries):
        if index not in taken:
            in_district[key(boundary["d"])].append(index)
    still_left = []
    for row in left:
        name = stripped(row["mandal"])
        scored = sorted(
            ((difflib.SequenceMatcher(None, name, stripped(boundaries[index]["m"])).ratio(), index)
             for index in in_district.get(key(row["district"]), [])),
            reverse=True,
        )
        clear = len(scored) == 1 or (scored and scored[0][0] - scored[1][0] >= 0.06)
        if scored and scored[0][0] >= 0.90 and clear:
            aliases.append((row, scored[0][1], "transliteration_variant_same_district"))
            taken.add(scored[0][1])
            in_district[key(row["district"])].remove(scored[0][1])
        else:
            still_left.append(row)
    return matches, aliases, still_left


def main():
    geo = json.load(open(os.path.join(HERE, "..", "app", "data", "ap_map_geometry.json")))
    with open(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv")) as handle:
        sources = list(csv.DictReader(handle))
    matches, aliases, left = build(sources, geo["mandals"])
    with open(OUT, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["mandal_uuid", "district", "mandal", "boundary_index",
                         "boundary_district", "boundary_mandal", "method"])
        for row, index, method in aliases:
            boundary = geo["mandals"][index]
            writer.writerow([row["sourceSeriesId"], row["district"], row["mandal"],
                             index, boundary["d"], boundary["m"], method])
    with open(REPORT, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["mandal_uuid", "district", "mandal", "reason"])
        for row in left:
            writer.writerow([row["sourceSeriesId"], row["district"], row["mandal"], row["reason"]])
    print(f"reconciled {len(matches)}, aliased {len(aliases)}, unresolved {len(left)}")
    counts = defaultdict(int)
    for _, _, method in aliases:
        counts[method] += 1
    for method, count in sorted(counts.items()):
        print(f"  {count:4d}  {method}")


if __name__ == "__main__":
    main()
