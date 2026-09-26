"""Conservative, shared source-UUID → prototype-boundary reconciliation.

Whitespace and punctuation are cosmetic; Urban/Rural/directional qualifiers are
not. Never choose a fuzzy best match or the first of multiple candidates.
"""
import re
from collections import defaultdict


def key(value):
    return re.sub(r"[^A-Z0-9]", "", str(value).upper())


def reconcile(sources, boundaries):
    sources = {row["mandal_uuid"]: row for row in sources}
    source_pairs, boundary_pairs = defaultdict(list), defaultdict(list)
    source_names, boundary_names = defaultdict(list), defaultdict(list)
    for uid, row in sources.items():
        pair = (key(row["district"]), key(row["mandal"]))
        source_pairs[pair].append(uid)
        source_names[pair[1]].append(uid)
    for index, row in enumerate(boundaries):
        pair = (key(row["d"]), key(row["m"]))
        boundary_pairs[pair].append(index)
        boundary_names[pair[1]].append(index)
    matches = {}
    for pair, uids in source_pairs.items():
        candidates = boundary_pairs.get(pair, [])
        if len(uids) == len(candidates) == 1:
            matches[uids[0]] = {"boundaryIndex": candidates[0], "method": "district_and_name_spacing_normalized"}
    used = {match["boundaryIndex"] for match in matches.values()}
    for name, uids in source_names.items():
        candidates = boundary_names.get(name, [])
        if len(uids) == len(candidates) == 1 and uids[0] not in matches and candidates[0] not in used:
            matches[uids[0]] = {"boundaryIndex": candidates[0], "method": "unique_name_district_mismatch_requires_review"}
            used.add(candidates[0])
    unresolved = [
        {"sourceSeriesId": uid, "district": row["district"], "mandal": row["mandal"],
         "reason": "No unique normalized name match; spelling, district or duplicate-boundary reconciliation required"}
        for uid, row in sorted(sources.items()) if uid not in matches
    ]
    return matches, unresolved
