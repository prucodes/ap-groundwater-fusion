"""IMD district forecasts, warnings and rainfall for Andhra Pradesh: dormant until a key exists.

IMD's API (https://api.imd.gov.in/public/api_reference.html) answers every
endpoint with 401 "API key missing" until a registered key is sent (checked
2026-10-02). Register at api.imd.gov.in with an ordinary email, then provide the
key as the IMD_API_KEY environment variable -- a GitHub Actions secret for the
weekly refresh. It never goes in the repository or in a chat.

The public reference does not say how the key travels; the account dashboard
does. Set IMD_AUTH to match it:
    header:Authorization:Bearer   Authorization: Bearer <key>   (default)
    header:<Name>                 <Name>: <key>
    query:<param>                 ?<param>=<key>

IMD's terms restrict republishing data in violation of its usage rules. So by
default the fetch writes only a local cache that git ignores
(data/private/imd_context.json). With IMD_PUBLISH=1 -- set once IMD's usage
rules are confirmed to allow district forecast and warning categories on a
public page -- it also writes app/data/imd_context.json for the site.

IMD's district list may follow an older district map than the app's 28. Each
district is matched by name; anything that does not match is listed for review,
never silently dropped or guessed.
"""
import datetime
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation

ROOT = os.path.join(HERE, "..")
API = "https://api.imd.gov.in/api/v1"
REFERENCE = "https://api.imd.gov.in/public/api_reference.html"
PRIVATE_OUT = os.path.join(ROOT, "data", "private", "imd_context.json")
PUBLIC_OUT = os.path.join(ROOT, "app", "data", "imd_context.json")
STATE = "ANDHRA PRADESH"
DEFAULT_AUTH = "header:Authorization:Bearer"
# AP's river basins in IMD's quantitative precipitation forecast.
AP_BASINS = ("KRISHNA", "GODAVARI", "PENNAR", "VAMSADHARA", "NAGAVALI")
WARNING_CODES = {
    1: "No warning", 2: "Heavy rain", 3: "Heavy snow", 4: "Thunderstorm, lightning, squall", 5: "Hailstorm",
    6: "Dust storm", 7: "Dust-raising winds", 8: "Strong surface winds", 9: "Heat wave", 10: "Hot day",
    11: "Warm night", 12: "Cold wave", 13: "Cold day", 14: "Ground frost", 15: "Fog", 16: "Very heavy rain",
    17: "Extremely heavy rain",
}
WARNING_COLOURS = {1: "red", 2: "orange", 3: "yellow", 4: "green"}


def key(name):
    return re.sub(r"[^A-Z0-9]", "", str(name or "").upper())


def auth_request(path, api_key, style=None):
    """URL and headers for one call, carrying the key the way IMD_AUTH says."""
    # An unset workflow variable arrives as an empty string, not as a missing one.
    style = style or os.environ.get("IMD_AUTH") or DEFAULT_AUTH
    url, headers = f"{API}/{path}", {"User-Agent": "ap-groundwater-fusion", "Accept": "application/json"}
    kind, _, rest = style.partition(":")
    if kind == "query":
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}{urllib.parse.urlencode({rest or 'api_key': api_key})}", headers
    name, _, scheme = rest.partition(":")
    headers[name or "Authorization"] = f"{scheme} {api_key}".strip() if scheme else api_key
    return url, headers


def get(path, api_key, context):
    url, headers = auth_request(path, api_key)
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60, context=context) as response:
        return json.loads(response.read())


def rows_of(payload):
    """IMD answers with a bare list or with {"data": [...]}, depending on the endpoint."""
    if isinstance(payload, dict):
        payload = payload.get("data", payload.get("Data", []))
    return payload if isinstance(payload, list) else []


def match_district(name, known):
    return known.get(key(name))


def parse_forecast(payload, known):
    out = []
    for row in rows_of(payload):
        if key(row.get("State")) != key(STATE):
            continue
        days = [{"day": n, "distribution": row.get(f"day{n}_distribution"), "colour": row.get(f"day{n}_color"),
                 "stations": row.get(f"day{n}_distribution_percentage")} for n in range(1, 6) if row.get(f"day{n}_distribution")]
        out.append({"district": row.get("District"), "matchedDistrict": match_district(row.get("District"), known),
                    "issued": row.get("date_obs"), "days": days})
    return out


def parse_warnings(payload, known):
    out = []
    for row in rows_of(payload):
        district = match_district(row.get("District"), known)
        if district is None and key(row.get("State", "")) != key(STATE):
            continue  # the warning list is national; keep AP's districts and any AP-labelled row
        days = []
        for n in range(1, 6):
            codes = [int(c) for c in re.findall(r"\d+", str(row.get(f"Day_{n}") or ""))]
            colour = WARNING_COLOURS.get(int(row[f"Day{n}_Color"])) if str(row.get(f"Day{n}_Color") or "").isdigit() else None
            days.append({"day": n, "codes": codes, "warnings": [WARNING_CODES.get(c, f"code {c}") for c in codes], "colour": colour})
        out.append({"district": row.get("District"), "matchedDistrict": district, "issued": row.get("Date"), "days": days})
    return out


def percent(text):
    match = re.search(r"-?\d+(\.\d+)?", str(text or ""))
    return float(match.group()) if match else None


def parse_rainfall(payload, known):
    out = []
    for row in rows_of(payload):
        district = match_district(row.get("District"), known)
        if district is None:
            continue
        out.append({
            "district": row.get("District"), "matchedDistrict": district, "date": row.get("Date"),
            "weekly": {"actualMm": percent(row.get("Weekly Actual")), "normalMm": percent(row.get("Weekly Normal")),
                       "departurePct": percent(row.get("Weekly Departure Per")), "category": row.get("Weekly Category")},
            "cumulative": {"from": row.get("Cumulative Date"), "actualMm": percent(row.get("Cumulative Actual")),
                           "normalMm": percent(row.get("Cumulative Normal")),
                           "departurePct": percent(row.get("Cumulative Departure Per")), "category": row.get("Cumulative Category")},
        })
    return out


def parse_basins(payload):
    out = []
    for row in rows_of(payload):
        basin = str(row.get("Basin") or "")
        if not any(name in basin.upper() for name in AP_BASINS):
            continue
        out.append({"basin": basin, "subBasin": row.get("SubBasin"), "issued": row.get("Date"),
                    "daysMm": [percent(row.get(f"Day{n}")) for n in range(1, 6)]})
    return out


def known_districts():
    geometry = json.load(open(os.path.join(ROOT, "app", "data", "ap_district_geometry.json")))
    return {key(d["d"]): d["d"] for d in geometry["districts"]}


def write(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as handle:
        json.dump(payload, handle, indent=1)
        handle.write("\n")
    os.replace(path + ".tmp", path)


def main():
    api_key = os.environ.get("IMD_API_KEY", "").strip()
    if not api_key:
        print("  IMD_API_KEY is not set; IMD stays unconnected (register at api.imd.gov.in). Nothing written.")
        return 0
    known, context = known_districts(), _tls_context()
    sections, errors = {}, {}
    for name, path, parse in (
        ("districtForecast", "state_district_rainfall_forecast", lambda p: parse_forecast(p, known)),
        ("districtWarnings", "districtwarning", lambda p: parse_warnings(p, known)),
        ("districtRainfall", "districtrainfall", lambda p: parse_rainfall(p, known)),
        ("basinQpf", "basinqpf", parse_basins),
    ):
        try:
            sections[name] = parse(get(path, api_key, context))
        except Exception as error:  # one endpoint failing must not cost the others
            errors[name] = str(error)[:200]
            print(f"  [warn] {name}: {error}")
    unmatched = sorted({row["district"] for rows in sections.values() for row in rows
                        if isinstance(row, dict) and "matchedDistrict" in row and row["matchedDistrict"] is None})
    payload = {
        "source": "India Meteorological Department API", "reference": REFERENCE,
        "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "auth": (os.environ.get("IMD_AUTH") or DEFAULT_AUTH).split(":")[0],
        "published": os.environ.get("IMD_PUBLISH") == "1",
        "note": "IMD forecasts and warnings, district level. Context only; not a groundwater or crop advisory.",
        **sections, "unmatchedDistricts": unmatched, "errors": errors,
    }
    write(PRIVATE_OUT, payload)
    if payload["published"]:
        write(PUBLIC_OUT, payload)
    counts = {name: len(rows) for name, rows in sections.items()}
    print(f"  IMD: {counts}; unmatched districts {unmatched}; published={payload['published']}")
    return 1 if errors and not sections else 0


if __name__ == "__main__":
    sys.exit(main())
