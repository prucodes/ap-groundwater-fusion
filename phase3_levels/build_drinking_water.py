"""Who drinks from these wells: the State's rural drinking-water sources beside the summer outlook.

Two public reports from the Jal Jeevan Mission's IMIS (ejalshakti.gov.in), no login:
  B26  schemes by source, groundwater or surface water, for each district (the 13 districts
       the mission still reports by), with the habitations each serves;
  E5   drinking-water sources and delivery points in each block (mandal), how many were
       tested and how many tested above a chemical or bacteriological limit.

Blocks are matched to the State's mandal outlines by name, then by a reviewed alias table
(phase3_levels/data/jjm_block_aliases.csv) for spellings and for names shared between
districts, which are placed by location. Only counts are read; no habitation, scheme or
person is named. If the portal does not answer, last week's file stays.

Output: app/data/drinking_water.json
"""
import csv
import datetime
import html
import http.cookiejar
import json
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(APP, "drinking_water.json")
ALIASES = os.path.join(HERE, "data", "jjm_block_aliases.csv")
BASE = "https://ejalshakti.gov.in/IMISReports/Reports/"
SCHEMES = BASE + "BasicInformation/rpt_SchemesSourcesGWSW_S.aspx?Rep=0&RP=Y"
SOURCES = BASE + "WaterQuality/rpt_WQM_GPwiseTesting_S.aspx?Rep=0&RP=Y"
STATE = "andhra pradesh"
PAUSE = 1.5     # seconds between requests: a public server, read gently

sys.path.insert(0, HERE)
from source_identity import key  # noqa: E402


def _opener():
    try:
        import certifi
        context = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        context = ssl.create_default_context()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
                                         urllib.request.HTTPSHandler(context=context))
    opener.addheaders = [("User-Agent", "ap-groundwater-fusion/1.0 (public research; counts only)")]
    return opener


OPENER = _opener()


def get(url, form=None):
    body = urllib.parse.urlencode(form).encode() if form else None
    with OPENER.open(url, body, timeout=120) as response:
        page = response.geturl(), response.read().decode("utf-8", "ignore")
    time.sleep(PAUSE)
    return page


def hidden(page):
    out = {}
    for tag in re.findall(r'<input[^>]*type="hidden"[^>]*>', page):
        name = re.search(r'name="([^"]+)"', tag)
        value = re.search(r'value="([^"]*)"', tag)
        if name:
            out[name.group(1)] = html.unescape(value.group(1)) if value else ""
    return out


def postbacks(page):
    return [(target, html.unescape(text).strip())
            for target, _, text in re.findall(r"__doPostBack\(&#39;([^&]+)&#39;,&#39;([^&]*)&#39;\)\"?[^>]*>([^<]*)<", page)]


def rows(page):
    out = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", c))).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        if len(cells) >= 5 and cells[0].isdigit():
            out.append(cells)
    return out


def number(text):
    return int(text.replace(",", "")) if text.replace(",", "").isdigit() else 0


def follow(url, page, wanted, suffix):
    target = next(t for t, text in postbacks(page) if t.endswith(suffix) and text.lower() == wanted.lower())
    form = hidden(page)
    form.update({"__EVENTTARGET": target, "__EVENTARGUMENT": ""})
    return get(url, form)


def state_page(report):
    url, page = get(report)
    return follow(url, page, STATE, "lkbstate")


def schemes_by_district():
    """B26: groundwater and surface-water schemes, and the habitations they serve, per district."""
    _, page = state_page(SCHEMES)
    kinds = ("piped", "spot", "other")
    out = []
    for cells in rows(page):
        values = [number(c) for c in cells[2:20]]
        if len(values) < 18:
            continue
        def part(start):
            return {kind: {"schemes": values[start + 2 * k], "habitations": values[start + 2 * k + 1]} for k, kind in enumerate(kinds)}
        out.append({"name": cells[1], "groundwater": part(0), "surface": part(6), "other": part(12)})
    return out


def sources_by_block():
    """E5: drinking-water sources per block, how many tested, and how many above a limit."""
    url, page = state_page(SOURCES)
    as_of = re.search(r"as on \((\d{2})/(\d{2})/(\d{4})\)", page)
    districts = [text for target, text in postbacks(page) if target.endswith("lkbdistrict")]
    out = {}
    for name in districts:
        url, page = state_page(SOURCES)
        _, blocks = follow(url, page, name, "lkbdistrict")
        out[name] = [{"block": c[1], "sources": number(c[2]), "tested": number(c[3]),
                      "chemical": number(c[4]), "bacterial": number(c[5])} for c in rows(blocks)]
    date = f"{as_of.group(3)}-{as_of.group(2)}-{as_of.group(1)}" if as_of else None
    return out, date


def match_blocks(blocks, boundaries):
    """Block -> boundary index: a unique name first, then the reviewed alias table."""
    by_name = {}
    for index, boundary in enumerate(boundaries):
        by_name.setdefault(key(boundary["m"]), []).append(index)
    aliases = {(row["former_district"], row["jjm_block"]): int(row["boundary_index"]) for row in csv.DictReader(open(ALIASES))}
    matched, unmatched, exact = {}, [], 0
    for district, items in blocks.items():
        for item in items:
            pair = (district, item["block"])
            candidates = by_name.get(key(item["block"]), [])
            if pair in aliases:
                matched[pair] = aliases[pair]
            elif len(candidates) == 1:
                matched[pair] = candidates[0]
                exact += 1
            else:
                unmatched.append(f"{district}: {item['block']}")
    taken = list(matched.values())
    if len(taken) != len(set(taken)):
        raise SystemExit("two blocks matched one mandal outline: review the alias table")
    return matched, unmatched, exact


def main():
    try:
        districts = schemes_by_district()
        blocks, as_of = sources_by_block()
    except Exception as error:  # the portal is down or changed: keep last week's file
        print(f"  Jal Jeevan Mission reports did not answer ({error}); keeping {os.path.relpath(OUT, ROOT)}")
        return 0
    if not districts or sum(len(v) for v in blocks.values()) < 600:
        print("  Jal Jeevan Mission reports came back short; keeping last week's file")
        return 0
    boundaries = json.load(open(os.path.join(APP, "ap_map_display.json")))["mandals"]
    summer = json.load(open(os.path.join(APP, "summer_outlook.json")))
    matched, unmatched, exact = match_blocks(blocks, boundaries)

    mandals = [None] * len(boundaries)
    for district, items in blocks.items():
        for item in items:
            index = matched.get((district, item["block"]))
            if index is not None:
                mandals[index] = {"former": district, **{k: item[k] for k in ("sources", "tested", "chemical", "bacterial")}}

    def schemes(row, side):
        return sum(row[side][kind]["schemes"] for kind in ("piped", "spot", "other"))
    state = {side: sum(schemes(d, side) for d in districts) for side in ("groundwater", "surface", "other")}
    piped = {side: sum(d[side]["piped"]["schemes"] for d in districts) for side in ("groundwater", "surface")}

    def tally(indexes):
        rows_ = [mandals[i] for i in indexes if mandals[i]]
        return {"mandals": len(indexes), "withSources": len(rows_),
                **{k: sum(r[k] for r in rows_) for k in ("sources", "tested", "chemical", "bacterial")}}
    tiers = {}
    for tier in ("beyond", "dry", "within"):
        indexes = [i for i, m in enumerate(summer["mandals"]) if m and m.get("tier") == tier]
        tiers[tier] = tally(indexes)

    former = []
    for d in districts:
        indexes = [i for i, m in enumerate(mandals) if m and m["former"] == d["name"]]
        beyond = [i for i in indexes if summer["mandals"][i] and summer["mandals"][i].get("tier") == "beyond"]
        total = sum(schemes(d, side) for side in ("groundwater", "surface", "other"))
        former.append({"name": d["name"], "groundwaterShare": round(schemes(d, "groundwater") / total, 4) if total else None,
                       "schemes": {side: schemes(d, side) for side in ("groundwater", "surface", "other")},
                       "habitationsOnGroundwaterPiped": d["groundwater"]["piped"]["habitations"],
                       "mandals": len(indexes), "beyond": tally(beyond), **{k: sum(mandals[i][k] for i in indexes) for k in ("sources", "chemical")}})

    payload = {
        "contractVersion": "drinking-water-v1",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "asOf": as_of,
        "source": "Jal Jeevan Mission IMIS public reports (Department of Drinking Water and Sanitation): B26 schemes by source, E5 tested sources",
        "sourceUrls": [SCHEMES, SOURCES],
        "summerAnchor": summer.get("anchor"),
        "state": {"schemes": state, "groundwaterShare": round(state["groundwater"] / sum(state.values()), 4),
                  "pipedSchemes": piped, "pipedGroundwaterShare": round(piped["groundwater"] / sum(piped.values()), 4)},
        "byTier": tiers,
        "formerDistricts": former,
        "matching": {"blocks": sum(len(v) for v in blocks.values()), "matched": len(matched), "exactName": exact,
                     "reviewed": len(matched) - exact, "unmatched": unmatched},
        "mandals": mandals,
        "caveat": ("Sources include delivery points and stand posts as the mission counts them. A test above a chemical limit "
                   "is a water-quality reading, not a forecast, and says nothing about why. The mission reports districts as "
                   "they were before 2022; each mandal is listed under that district."),
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))
    b = tiers["beyond"]
    print(f"  {payload['matching']['matched']} of {payload['matching']['blocks']} blocks matched ({exact} by name, "
          f"{payload['matching']['reviewed']} reviewed)")
    print(f"  {payload['state']['groundwaterShare']:.1%} of rural drinking-water schemes draw on groundwater "
          f"({payload['state']['pipedGroundwaterShare']:.1%} of piped schemes)")
    print(f"  mandals heading past their deepest May: {b['mandals']}, holding {b['sources']:,} drinking-water sources; "
          f"{b['chemical']:,} tested above a chemical limit")
    print(f"  wrote {os.path.relpath(OUT, ROOT)} (as on {as_of})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
