"""Fetch the Oceanic Nino Index -- the standard measure of El Nino and La Nina.

ONI is a three-month running mean of sea surface temperature anomalies in the
Nino 3.4 box (5N-5S, 170W-120W). NOAA's Climate Prediction Center publishes it
back to 1950 and updates it monthly; PSL mirrors the same file. At or above
+0.5 C for five overlapping seasons is an El Nino, at or below -0.5 C a La Nina.

This is the one satellite-era climate index in this project that needs no
account and no licence, so unlike the aquifer maps it can run unattended in the
weekly refresh.

Why the project wants it: it does NOT go into the model. Adding ONI to the
three-month forecast was measured and made it worse (1.776 -> 1.850 m MAE),
because two El Nino events inside the training record are not enough to learn
from. It is published as CONTEXT beside the measured recharge, so a reader can
see the ocean state that the rainfall deficit sits in.
"""
import argparse
import csv
import datetime
import json
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation

URL = "https://psl.noaa.gov/data/correlation/oni.data"
OUT = os.path.join(HERE, "data", "enso_oni.csv")
RECEIPT = os.path.join(HERE, "..", "data", "refresh_receipts", "enso_oni.json")
# CPC's own thresholds. An "event" needs five overlapping seasons past these;
# a single season past one is only a warm or cool month.
EL_NINO = 0.5
LA_NINA = -0.5
MISSING = -90.0
# The season a row's Nth column is centred on: column 1 is Dec-Jan-Feb, so the
# centre month is January of that row's year.
SEASONS = ["DJF", "JFM", "FMA", "MAM", "AMJ", "MJJ",
           "JJA", "JAS", "ASO", "SON", "OND", "NDJ"]


def parse(text):
    """Year rows are twelve floats after a four-digit year; everything else is prose."""
    rows = []
    for line in text.splitlines():
        parts = line.split()
        if len(parts) != 13 or not re.fullmatch(r"\d{4}", parts[0]):
            continue
        year = int(parts[0])
        for index, raw in enumerate(parts[1:]):
            try:
                value = float(raw)
            except ValueError:
                continue
            if value <= MISSING:
                continue
            rows.append({
                "date": f"{year}-{index + 1:02d}",
                "season": SEASONS[index],
                "oni_c": round(value, 2),
            })
    return rows


def classify(value):
    if value >= EL_NINO:
        return "el_nino"
    if value <= LA_NINA:
        return "la_nina"
    return "neutral"


def events(rows, kind):
    """Runs of five or more consecutive overlapping seasons past the threshold."""
    found, run = [], []
    for row in rows:
        if classify(row["oni_c"]) == kind:
            run.append(row)
            continue
        if len(run) >= 5:
            found.append(run)
        run = []
    if len(run) >= 5:
        found.append(run)
    return found


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true",
                        help="re-read the stored file instead of fetching")
    args = parser.parse_args()

    if args.offline:
        if not os.path.exists(OUT):
            print("  no stored ONI to read")
            return 1
        with open(OUT) as handle:
            rows = [dict(row, oni_c=float(row["oni_c"])) for row in csv.DictReader(handle)]
    else:
        request = urllib.request.Request(URL, headers={"User-Agent": "ap-groundwater-fusion"})
        with urllib.request.urlopen(request, timeout=120, context=_tls_context()) as response:
            text = response.read().decode("utf-8", "replace")
        rows = parse(text)
        if len(rows) < 600:
            print(f"  refusing to write: parsed only {len(rows)} months, expected 800+")
            return 1
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        with open(OUT, "w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=["date", "season", "oni_c"])
            writer.writeheader()
            writer.writerows(rows)

    latest = rows[-1]
    warm = events(rows, "el_nino")
    cool = events(rows, "la_nina")
    print(f"  {len(rows):,} months, {rows[0]['date']} -> {latest['date']}")
    print(f"  latest {latest['season']} {latest['oni_c']:+.2f} C -> {classify(latest['oni_c'])}")
    print(f"  {len(warm)} El Nino and {len(cool)} La Nina events on record")

    if not args.offline:
        os.makedirs(os.path.dirname(RECEIPT), exist_ok=True)
        with open(RECEIPT, "w") as handle:
            json.dump({
                "source": URL,
                "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                "months": len(rows),
                "latest": latest,
                "classification": classify(latest["oni_c"]),
            }, handle, indent=2)
            handle.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
