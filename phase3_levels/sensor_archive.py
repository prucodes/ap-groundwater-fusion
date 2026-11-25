#!/usr/bin/env python3
"""Every State sensor's reading, one value a day, kept so the sensors can be tested.

The telemetry service answers with each station's latest reading and the same date a
year before, never a history (re-tested 16 Nov 2026: a past end date still returns
today). So the only way to know what a sensor read last week is to have written it
down last week. fetch_apwrims_sensors.py adds each day here; --backfill recovers the
days already committed in app/data/gw_sensors.json's git history (from 11 Nov 2026).

Compact on purpose, centimetres as integers:
  stations: [[name, lat, lng, boundary index], ...]  -- a station's position in this
            list never changes; a new station is appended
  days:     {"YYYY-MM-DD" (IST): {"level": [cm|null per station], "yearAgo": [...]}}
A station that has not reported in ACTIVE_HOURS is null that day, never carried forward.

build_sensor_wells_check.py reads it to ask whether the sensors can stand in for the
monthly hand-read wells.
"""
import argparse
import datetime
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ARCHIVE = os.path.join(HERE, "data", "sensor_station_daily.json")
SENSORS_IN_GIT = "app/data/gw_sensors.json"
ACTIVE_HOURS = 48


def ist_day(iso):
    """The India date of a UTC timestamp, as the State's own line is dated."""
    when = datetime.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    return (when + datetime.timedelta(hours=5, minutes=30)).date().isoformat()


def empty():
    return {"note": "one value a day per State sensor, centimetres below ground; see phase3_levels/sensor_archive.py",
            "stations": [], "days": {}}


def load(path=ARCHIVE):
    return json.load(open(path)) if os.path.exists(path) else empty()


def cm(value):
    return int(round(value * 100)) if isinstance(value, (int, float)) else None


def add_day(archive, payload):
    """Record one gw_sensors.json payload under its India date; a later fetch of the same day replaces it."""
    key = {tuple(s[:3]): i for i, s in enumerate(archive["stations"])}
    level, ago = [None] * len(archive["stations"]), [None] * len(archive["stations"])
    for name, lat, lng, _district, _mandal, value, year_ago, hours, boundary in payload["stations"]:
        ident = (name, lat, lng)
        if ident not in key:
            key[ident] = len(archive["stations"])
            archive["stations"].append([name, lat, lng, boundary])
            level.append(None)
            ago.append(None)
        if hours is None or hours > ACTIVE_HOURS:
            continue
        level[key[ident]], ago[key[ident]] = cm(value), cm(year_ago)
    width = len(archive["stations"])
    for day in archive["days"].values():          # older days gain nulls for stations added since
        for field in ("level", "yearAgo"):
            day[field] += [None] * (width - len(day[field]))
    day = ist_day(payload["latestReading"])
    archive["days"][day] = {"level": level, "yearAgo": ago}
    archive["days"] = dict(sorted(archive["days"].items()))
    return day


def save(archive, path=ARCHIVE):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as handle:
        json.dump(archive, handle, separators=(",", ":"))
        handle.write("\n")
    os.replace(path + ".tmp", path)


def backfill(archive):
    """Each committed gw_sensors.json, oldest first; the last fetch of a day wins."""
    log = subprocess.run(["git", "log", "--reverse", "--format=%H", "--", SENSORS_IN_GIT],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    days = set()
    for commit in log:
        raw = subprocess.run(["git", "show", f"{commit}:{SENSORS_IN_GIT}"], cwd=ROOT, capture_output=True, text=True).stdout
        try:
            payload = json.loads(raw)
        except ValueError:
            continue
        if payload.get("stations") and payload.get("latestReading"):
            days.add(add_day(archive, payload))
    return sorted(days)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--backfill", action="store_true", help="recover the days in gw_sensors.json's git history")
    args = parser.parse_args()
    archive = load()
    if args.backfill:
        print(f"backfilled {len(backfill(archive))} day(s)")
    else:
        print(f"recorded {add_day(archive, json.load(open(os.path.join(ROOT, SENSORS_IN_GIT))))}")
    save(archive)
    print(f"{len(archive['days'])} days, {len(archive['stations'])} stations")
    return 0


if __name__ == "__main__":
    sys.exit(main())
