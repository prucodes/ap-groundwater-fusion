"""A JSON import must be cast through `unknown` before a domain type.

TypeScript infers the shape of a JSON import from the values that happen to be
in the file. A nullable field that is null in every row one week and a number in
some rows the next changes the inferred element type, and a direct
`json as Type` stops overlapping -- the compiler rejects a file nobody touched.

The weekly refresh failed its type-check on exactly that, after the data it had
just fetched was fine. Going through `unknown` says plainly that the shape is
guaranteed by the builder and its tests rather than by inference.

Scoped to the specs, which is where it broke. lib/data.ts casts several JSON
imports directly and those are left alone deliberately: there the cast doubles
as a weak check that the declared type still resembles the file, and those
shapes have held. If one of them ever drifts the same way, the fix is the same.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOTS = [os.path.join(ROOT, "app", "e2e")]


def sources():
    for base in ROOTS:
        for folder, _, names in os.walk(base):
            if "node_modules" in folder:
                continue
            for name in names:
                if name.endswith((".ts", ".tsx")):
                    path = os.path.join(folder, name)
                    with open(path, encoding="utf-8") as handle:
                        yield os.path.relpath(path, ROOT), handle.read()


def test_no_json_import_is_cast_straight_to_a_domain_type():
    offenders = []
    for path, text in sources():
        imported = set(re.findall(r'import\s+(\w+)\s+from\s+"[^"]+\.json"', text))
        if not imported:
            continue
        for name in imported:
            # `name as Type` or `name.field as Type`, but not `name as unknown as Type`.
            for match in re.finditer(rf'\b{name}(?:\.\w+)*\s+as\s+(?!unknown\b)(\w+)', text):
                kind = match.group(1)
                # A cast to a primitive or to a literal shape is not the hazard here.
                if kind in {"const", "string", "number", "boolean", "any"}:
                    continue
                offenders.append(f"{path}: {name} as {kind}")
    assert not offenders, (
        "cast through `unknown` first; JSON inference drifts with the data:\n  "
        + "\n  ".join(sorted(offenders))
    )
