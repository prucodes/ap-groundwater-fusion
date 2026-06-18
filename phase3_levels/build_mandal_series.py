"""Export real per-mandal monthly depth series for the mandal-detail charts,
keyed by the same slug id as mandal_dataset.json. Replaces the synthetic
'illustrativeSeries' on the detail page with measured APWRIMS history.
"""
import csv, json, os, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")

def norm(s):
    s = str(s).upper().strip(); s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", s)).strip()

def slug(d, m):
    return re.sub(r"[^a-z0-9]+", "-", f"{d} {m}".lower()).strip("-")

hist = defaultdict(list)
for r in csv.DictReader(open(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))):
    try:
        lvl = float(r["level_mbgl"])
    except ValueError:
        continue
    if 0 < lvl < 60:
        hist[norm(r["mandal"])].append((r["date"], round(lvl, 2)))

est = json.load(open(os.path.join(HERE, "outputs", "mandal_levels_estimated.json")))["mandals"]
out = {}
for e in est:
    ser = sorted(set(hist.get(e["mkey"], [])))
    if len(ser) >= 6:
        out[slug(e["district"], e["mandal"])] = [[d, v] for d, v in ser]

p = os.path.join(APP, "mandal_depth_series.json")
json.dump(out, open(p, "w"))
import os as _o
print(f"  wrote series for {len(out)} mandals -> {p}  ({_o.path.getsize(p)//1024} KB)")
