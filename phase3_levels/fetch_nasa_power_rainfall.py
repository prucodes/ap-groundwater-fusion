"""Monthly rainfall per mandal from NASA POWER: the level model's rainfall input.

NASA POWER (https://power.larc.nasa.gov) serves a free, no-key JSON time series
per lat/lon point. We use corrected precipitation (PRECTOTCORR, mm/day) at every
mandal centroid. Satellite/reanalysis blend, open data, NOT groundwater depth: it
is the recharge driver behind the model's rain_1m / rain_3m / rain_12m features.

Only POWER's final monthly product is used, the same one the model was trained
on, so the input runs about a month behind. The near-real-time daily product was
tried for the newest month and rejected: for Aug 2026 it read 212 mm where CHIRPS
read 112 mm on the same mandals, while soil moisture and the wells both said dry,
and feeding it in raised the model's August error from 0.62 m to 0.96 m (median).
Values convert as mean mm/day x 30.44, as the stored history always has.

Weekly runs are incremental. A probe finds the newest month POWER has finalised;
only mandals whose stored history does not reach it are fetched. That is every
mandal once a new month is published, and otherwise just the few a previous run
could not reach, so most weeks fetch nothing. Each fetch re-reads the window from
January of last year, picking up any revision. `--full` rebuilds from 2014, and
`--test` pulls three mandals without writing.

Output: phase3_levels/data/mandal_rain_history.csv  (district, mandal, date, rain_mm)
"""
import csv
import datetime
import http.client
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")
OUT = os.path.join(HERE, "data", "mandal_rain_history.csv")
MONTHLY_API = "https://power.larc.nasa.gov/api/temporal/monthly/point"
FIRST_YEAR = 2014
DAYS_PER_MONTH = 30.44   # the conversion the stored history was built with
FILL = -900              # POWER marks missing values as -999
ATTEMPTS = 4
# POWER rate-limits bursts (HTTP 429). Pace requests, and on a 429 wait as long
# as the server asks, or RATE_LIMIT_WAIT seconds when it does not say.
PAUSE_SECONDS = 0.4
RATE_LIMIT_WAIT = 30
# Share of the mandals attempted that must succeed for a run to write at all.
MIN_SHARE = 0.9


def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (loud, opt-in).

    Framework Python builds often ship with no CA file wired up. Fall back to
    certifi's bundle: still fully verified, just a trust store that exists.
    """
    if os.environ.get("ALLOW_INSECURE_TLS") == "1":
        sys.stderr.write("WARNING: ALLOW_INSECURE_TLS=1 - using UNVERIFIED TLS.\n")
        return ssl._create_unverified_context()
    if not ssl.get_default_verify_paths().cafile:
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
    return ssl.create_default_context()


_ctx = _tls_context()


def is_transient(error):
    """Retry dropped or timed-out transfers, 429s and 5xx; never TLS faults or other 4xx."""
    if isinstance(error, urllib.error.HTTPError):
        return error.code == 429 or error.code >= 500
    if isinstance(error, urllib.error.URLError):
        return not isinstance(error.reason, ssl.SSLError)
    if isinstance(error, ssl.SSLError):
        return False
    return isinstance(error, (http.client.IncompleteRead, ConnectionError, TimeoutError))


def retry_wait(error, attempt):
    """Seconds before the next attempt: the server's Retry-After on a 429, else backoff."""
    if isinstance(error, urllib.error.HTTPError) and error.code == 429:
        try:
            return max(1, min(120, int(error.headers.get("Retry-After", ""))))
        except (TypeError, ValueError):
            return RATE_LIMIT_WAIT * attempt
    return 2 ** attempt


def get_json(url, timeout=90):
    for attempt in range(1, ATTEMPTS + 1):
        request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(request, timeout=timeout, context=_ctx) as response:
                return json.loads(response.read())
        except Exception as error:
            if attempt == ATTEMPTS or not is_transient(error):
                raise
            time.sleep(retry_wait(error, attempt))


def centroids():
    geometry = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    out, seen = [], set()
    for m in geometry["mandals"]:
        pts = [pt for ring in m.get("rings", []) for pt in ring]
        if not pts:
            continue
        key = f"{m['d']}|{m['m']}"
        if key in seen:
            continue
        seen.add(key)
        lon = sum(p[0] for p in pts) / len(pts)
        lat = sum(p[1] for p in pts) / len(pts)
        out.append((m["d"], m["m"], round(lat, 4), round(lon, 4)))
    return out


def month_add(ym, n):
    year, month = int(ym[:4]), int(ym[5:7]) + n
    year += (month - 1) // 12
    return f"{year}-{(month - 1) % 12 + 1:02d}"


def months_between(first, last):
    out, ym = [], first
    while ym <= last:
        out.append(ym)
        ym = month_add(ym, 1)
    return out


def last_complete_month(today):
    return month_add(f"{today.year}-{today.month:02d}", -1)


def to_monthly_mm(mm_per_day):
    return round(mm_per_day * DAYS_PER_MONTH, 1)


def monthly_series(payload):
    """{'YYYY-MM': mm} from a POWER monthly payload, skipping fills and the annual rollup."""
    out = {}
    for ym, value in payload["properties"]["parameter"]["PRECTOTCORR"].items():
        if not (len(ym) == 6 and ym.isdigit()) or not ("01" <= ym[4:] <= "12"):
            continue  # POWER appends a "YYYY13" annual rollup
        if value is None or value < FILL:
            continue
        out[f"{ym[:4]}-{ym[4:]}"] = to_monthly_mm(value)
    return out


def fetch_point(lat, lon, first, last):
    """Final monthly rainfall, months first..last, for one centroid."""
    start_year, end_year = int(first[:4]), int(last[:4])
    base = f"parameters=PRECTOTCORR&community=AG&latitude={lat}&longitude={lon}&format=JSON"
    try:
        series = monthly_series(get_json(f"{MONTHLY_API}?{base}&start={start_year}&end={end_year}"))
    except urllib.error.HTTPError as error:
        # Early in a year the monthly product may reject the new year outright.
        if error.code >= 500 or end_year <= start_year:
            raise
        series = monthly_series(get_json(f"{MONTHLY_API}?{base}&start={start_year}&end={end_year - 1}"))
    return {ym: series[ym] for ym in months_between(first, last) if ym in series}


def probe_latest_month(points, today):
    """Newest month POWER has finalised, from a few centroids; None if unreachable."""
    ceiling = last_complete_month(today)
    first = f"{today.year - 1}-01"
    latest = None
    for _, _, lat, lon in points[:3]:
        try:
            months = fetch_point(lat, lon, first, ceiling)
        except Exception as error:  # a failed probe must not be mistaken for "nothing new"
            print(f"    [warn] probe: {error}")
            continue
        if months:
            latest = max(latest or "", max(months))
    return latest


def read_history(path):
    """{(district, mandal): {'YYYY-MM': mm}} from the stored CSV; empty if absent."""
    history = {}
    if not os.path.exists(path):
        return history
    with open(path, newline="") as handle:
        for row in csv.DictReader(handle):
            history.setdefault((row["district"], row["mandal"]), {})[row["date"]] = float(row["rain_mm"])
    return history


def stale_points(history, points, target):
    """Mandals whose stored history does not yet reach the last complete month.

    All of them once a new month completes; otherwise only the few a previous
    run could not fetch, so a straggler is retried the following week.
    """
    return [p for p in points if target not in history.get((p[0], p[1]), {})]


def merge(history, fresh, window_start):
    """Stored months before the window, then everything fetched inside it.

    A mandal whose fetch failed keeps its stored history whole, rather than
    losing the window it could not refresh.
    """
    merged = {}
    for key in set(history) | set(fresh):
        if key not in fresh:
            merged[key] = dict(history[key])
            continue
        kept = {ym: mm for ym, mm in history.get(key, {}).items() if ym < window_start}
        kept.update(fresh[key])
        merged[key] = kept
    return merged


def write_history(path, merged, points):
    order = {(d, m): i for i, (d, m, _, _) in enumerate(points)}
    tmp = path + ".tmp"
    with open(tmp, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["district", "mandal", "date", "rain_mm"])
        for key in sorted(merged, key=lambda k: (order.get(k, len(order)), k)):
            for ym in sorted(merged[key]):
                writer.writerow([key[0], key[1], ym, merged[key][ym]])
    os.replace(tmp, path)


def main():
    full, test = "--full" in sys.argv, "--test" in sys.argv
    points = centroids()
    target = probe_latest_month(points, datetime.date.today())
    if target is None:
        sys.exit("Could not reach NASA POWER to find its latest month; the stored history is untouched.")
    history = {} if full else read_history(OUT)
    todo = points[:3] if test else points if full else stale_points(history, points, target)
    if not todo:
        print(f"  Up to date: every mandal's rainfall already runs to {target}. Nothing fetched.")
        return 0
    window_start = f"{FIRST_YEAR}-01" if full else f"{int(target[:4]) - 1}-01"
    print(f"  Fetching NASA POWER rainfall {window_start}..{target} for {len(todo)} mandals ...")

    fresh, failures = {}, 0
    for i, (d, m, lat, lon) in enumerate(todo, 1):
        try:
            fresh[(d, m)] = fetch_point(lat, lon, window_start, target)
        except Exception as error:
            failures += 1
            print(f"    [warn] {d}|{m}: {error}")
        if i % 100 == 0:
            print(f"    [{i}/{len(todo)}]")
        time.sleep(PAUSE_SECONDS)

    if test:
        for key, series in fresh.items():
            print("  TEST", key, list(series.items())[-3:])
        return 0
    if len(fresh) < MIN_SHARE * len(todo):
        sys.exit(f"Refusing to write: only {len(fresh)} of {len(todo)} mandals fetched. "
                 f"The stored history at {OUT} is untouched.")
    with_target = sum(1 for series in fresh.values() if target in series)
    write_history(OUT, merge(history, fresh, window_start), points)
    print(f"  Wrote {window_start}..{target}: {len(fresh)} mandals, {failures} failed, "
          f"{with_target} with {target} complete")
    return 0


if __name__ == "__main__":
    sys.exit(main())
