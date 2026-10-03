"""Fetch NOAA CPC's official El Nino outlook: what the forecasters expect next.

The ONI file (fetch_enso_index.py) says what the ocean has done. This says what
NOAA's Climate Prediction Center expects it to do over the next nine overlapping
three-month seasons, as published with each monthly ENSO Diagnostic Discussion
(second Thursday of the month):

  - the alert status and one-paragraph synopsis, quoted verbatim (US Government
    work, public domain);
  - the chance of La Nina / neutral / El Nino for each season;
  - the chance of each strength band, using CPC's relative Nino-3.4 index (RONI);
  - the RONI forecast percentiles.

CPC publishes these as plain HTML tables. If a page changes shape the parse
fails loudly and the previous file is kept: an outlook is never guessed.

The outlook is context for a reader. It does not enter any model here, and an
El Nino forecast is not a rainfall forecast for Andhra Pradesh.
"""
import datetime
import html
import html.parser
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "app", "data", "enso_outlook.json")
RECEIPT = os.path.join(ROOT, "data", "refresh_receipts", "enso_outlook.json")
CONTRACT_VERSION = "1.0.0"

DISCUSSION = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/ensodisc.shtml"
PROBABILITIES = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/probabilities/"
STRENGTHS = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/strengths/"
OUTLOOK = "https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso/roni/outlook/"

SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ", "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]
# Strength columns, left to right as CPC prints them, warm side named by CPC's
# own words in the discussion: weak 0.5, moderate 1.0, strong 1.5, very strong 2.0.
STRENGTH_KEYS = ["laNinaVeryStrong", "laNinaStrong", "laNinaModerate", "laNinaWeak", "neutral",
                 "elNinoWeak", "elNinoModerate", "elNinoStrong", "elNinoVeryStrong"]
PERCENTILES = ["p5", "p15", "p25", "p50", "p75", "p85", "p95"]
MONTHS = {name: index + 1 for index, name in enumerate(
    ["January", "February", "March", "April", "May", "June", "July",
     "August", "September", "October", "November", "December"])}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": "ap-groundwater-fusion"})
    with urllib.request.urlopen(request, timeout=60, context=_tls_context()) as response:
        return response.read().decode("utf-8", "replace")


class Tables(html.parser.HTMLParser):
    """Every <tr> on the page as a list of cell texts, header cells included."""

    def __init__(self):
        super().__init__()
        self.rows, self.row, self.cell, self.skip = [], None, None, 0

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        elif tag in ("td", "th") and self.row is not None:
            self.cell = []
        elif tag == "span" and ("role", "tooltip") in attrs:
            self.skip += 1  # "ASO <span>Aug Sep Oct</span>": keep the code only

    def handle_endtag(self, tag):
        if tag == "span" and self.skip:
            self.skip -= 1
        elif tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None and not self.skip:
            self.cell.append(data)


def season_rows(page, width):
    """Rows that start with a season code and carry `width` numbers after it."""
    parser = Tables()
    parser.feed(page)
    out = []
    for row in parser.rows:
        if len(row) == width + 1 and row[0] in SEASONS:
            try:
                out.append((row[0], [float(cell) for cell in row[1:]]))
            except ValueError:
                continue
    if len(out) < 6:
        raise RuntimeError(f"expected nine seasons of {width} numbers, found {len(out)}; the page has changed shape")
    seasons = [code for code, _ in out]
    for a, b in zip(seasons, seasons[1:]):
        if SEASONS[(SEASONS.index(a) + 1) % 12] != b:
            raise RuntimeError(f"seasons out of order ({a} then {b})")
    return out


def parse_probabilities(page):
    rows = []
    for code, (la_nina, neutral, el_nino) in season_rows(page, 3):
        if abs(la_nina + neutral + el_nino - 100) > 2:
            raise RuntimeError(f"{code} probabilities sum to {la_nina + neutral + el_nino}")
        rows.append({"season": code, "laNina": la_nina, "neutral": neutral, "elNino": el_nino})
    return rows


def parse_strengths(page):
    rows = []
    for code, values in season_rows(page, len(STRENGTH_KEYS)):
        if abs(sum(values) - 100) > 3:
            raise RuntimeError(f"{code} strength chances sum to {sum(values)}")
        rows.append({"season": code, **dict(zip(STRENGTH_KEYS, values))})
    return rows


def parse_outlook(page):
    rows = []
    for code, values in season_rows(page, len(PERCENTILES)):
        if values != sorted(values):
            raise RuntimeError(f"{code} percentiles are not in order")
        rows.append({"season": code, **dict(zip(PERCENTILES, values))})
    return rows


def text_of(page):
    page = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", page)
    page = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</h\d>", "\n", page)
    return html.unescape(re.sub(r"<[^>]+>", " ", page))


def iso_date(words):
    match = re.fullmatch(r"(\d{1,2}) ([A-Z][a-z]+) (\d{4})", words.strip())
    if not match or match.group(2) not in MONTHS:
        raise RuntimeError(f"cannot read a date from {words!r}")
    return datetime.date(int(match.group(3)), MONTHS[match.group(2)], int(match.group(1))).isoformat()


def parse_discussion(page):
    text = " ".join(text_of(page).split())
    issued = re.search(r"issued by CLIMATE PREDICTION CENTER/NCEP/NWS (\d{1,2} [A-Z][a-z]+ \d{4})", text)
    alert = re.search(r"ENSO Alert System Status: (.+?) Synopsis:", text)
    synopsis = re.search(r"Synopsis: (.+?\.)(?: |$)", text)
    upcoming = re.search(r"next ENSO Diagnostics Discussion is scheduled for (\d{1,2} [A-Z][a-z]+ \d{4})", text)
    if not (issued and alert and synopsis):
        raise RuntimeError("the discussion page has changed shape: no issue date, alert status or synopsis")
    return {
        "issued": iso_date(issued.group(1)),
        "next": iso_date(upcoming.group(1)) if upcoming else None,
        "alert": alert.group(1).strip(),
        "synopsis": synopsis.group(1).strip(),
    }


def label_seasons(rows, issued):
    """'ASO' alone is ambiguous across a year end; give each season its months and year."""
    issued = datetime.date.fromisoformat(issued)
    first = (SEASONS.index(rows[0]["season"]) - 1) % 12 + 1  # DJF starts in December
    year = issued.year - (1 if first > issued.month + 1 else 0)
    names = [name[:3] for name in MONTHS]
    for row in rows:
        last = (first + 1) % 12 + 1
        last_year = year + (1 if last < first else 0)
        row["label"] = f"{names[first - 1]}–{names[last - 1]} {last_year}"
        row["endsYear"], row["endsMonth"] = last_year, last
        first, year = first % 12 + 1, year + (1 if first == 12 else 0)
    return rows


def peak(outlook):
    top = max(outlook, key=lambda row: row["p50"])
    return {"season": top["season"], "label": top.get("label"), "medianC": top["p50"],
            "likelyRangeC": [top["p25"], top["p75"]]}


def build(fetch=get):
    discussion = parse_discussion(fetch(DISCUSSION))
    probabilities = parse_probabilities(fetch(PROBABILITIES))
    strengths = parse_strengths(fetch(STRENGTHS))
    outlook = parse_outlook(fetch(OUTLOOK))
    if not ([r["season"] for r in probabilities] == [r["season"] for r in strengths] == [r["season"] for r in outlook]):
        raise RuntimeError("the probability, strength and outlook tables cover different seasons")
    for rows in (probabilities, strengths, outlook):
        label_seasons(rows, discussion["issued"])
    return {
        "contractVersion": CONTRACT_VERSION,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "source": "NOAA Climate Prediction Center, official ENSO outlook and ENSO Diagnostic Discussion",
        "kind": "forecast",
        "licence": "US Government work, public domain; the synopsis is quoted verbatim",
        "urls": {"discussion": DISCUSSION, "probabilities": PROBABILITIES, "strengths": STRENGTHS, "outlook": OUTLOOK},
        "index": "RONI: CPC's relative Nino-3.4 index, 3-month means, 1991-2020 base",
        "strengthBands": {"weak": 0.5, "moderate": 1.0, "strong": 1.5, "veryStrong": 2.0},
        **discussion,
        "probabilities": probabilities,
        "strengths": strengths,
        "outlook": outlook,
        "peak": peak(outlook),
        "caveat": "An El Nino forecast is a forecast for the tropical Pacific, not a rainfall forecast for Andhra Pradesh.",
    }


def write(payload, path=OUT):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=1)
        handle.write("\n")
    os.replace(path + ".tmp", path)


def main():
    payload = build()
    write(payload)
    os.makedirs(os.path.dirname(RECEIPT), exist_ok=True)
    with open(RECEIPT, "w") as handle:
        json.dump({"fetchedAt": payload["fetchedAt"], "issued": payload["issued"], "alert": payload["alert"],
                   "seasons": len(payload["probabilities"]), "peak": payload["peak"]}, handle, indent=1)
        handle.write("\n")
    print(f"  CPC outlook issued {payload['issued']}: {payload['alert']}; "
          f"peak {payload['peak']['season']} median {payload['peak']['medianC']} C")
    return 0


if __name__ == "__main__":
    sys.exit(main())
