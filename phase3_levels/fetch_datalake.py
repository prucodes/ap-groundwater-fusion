"""Pull the AI Living Labs data lake extracts this project uses, through the
platform's documented API, from a terminal the user runs themselves.

    python3 phase3_levels/fetch_datalake.py            # groundwater + boundaries
    python3 phase3_levels/fetch_datalake.py --villages # also village boundaries (slow)

The password is asked for with getpass, sent only to the platform's identity
endpoint, kept in memory for the first token and never written anywhere. The
short-lived access token is renewed with the refresh token as the run goes.
Extracts land in data/raw/datalake/ (git-ignored). Re-running skips files that
already exist, so an interrupted run resumes.

What is fetched:
  - Groundwater aggregated readings (state, district, mandal snapshot)
  - Groundwater categories, data sources, module counts; flood-warning districts
  - Mandal boundary vertices + codes, one request per mandal name
  - District and assembly-constituency boundary vertices
"""
import argparse
import concurrent.futures
import getpass
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from fetch_nasa_power_rainfall import _tls_context  # verified TLS, one implementation

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "data", "raw", "datalake")
GEOMETRY = os.path.join(ROOT, "app", "data", "ap_map_geometry.json")
TOKEN_URL = "https://auth.ailivinglabs.ap.gov.in/auth/realms/ap-soverign-stack/protocol/openid-connect/token"
API = "https://datalakes.ailivinglabs.ap.gov.in/api/v1"
CLIENT = "data-lake-cli"
PURPOSE = "RESEARCH_ANONYMISED"
WORKERS = 6
ASSEMBLY_CODES = (120, 294)   # Andhra Pradesh assembly seats in the data lake's numbering
SMALL = ["groundwater_aggregatedreadings_api", "ground_water_category", "ground_water_datasources_api",
         "gw_modulecounts_api", "aware_flood_warning_child_location_api"]


class Session:
    """Holds the token pair in memory; renews it before it lapses."""

    def __init__(self, username, password):
        self.lock = threading.Lock()
        self._grant({"grant_type": "password", "client_id": CLIENT, "username": username,
                     "password": password, "scope": "openid profile email"})

    def _grant(self, form):
        data = urllib.parse.urlencode(form).encode()
        request = urllib.request.Request(TOKEN_URL, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(request, timeout=60, context=_tls_context()) as response:
            body = json.load(response)
        self.access = body["access_token"]
        self.refresh_token = body["refresh_token"]
        self.expires = time.time() + int(body.get("expires_in", 300)) - 45

    def token(self, force=False):
        with self.lock:
            if force or time.time() > self.expires:
                self._grant({"grant_type": "refresh_token", "client_id": CLIENT, "refresh_token": self.refresh_token})
            return self.access

    def revoke(self):
        data = urllib.parse.urlencode({"client_id": CLIENT, "refresh_token": self.refresh_token}).encode()
        try:
            urllib.request.urlopen(urllib.request.Request(TOKEN_URL.replace("/token", "/logout"), data=data),
                                   timeout=30, context=_tls_context())
        except Exception:
            pass


class PurposeRefused(RuntimeError):
    pass


def export(session, key, filters=None, attempts=5):
    body = json.dumps({"purpose": PURPOSE, "filters": filters or {}}).encode()
    force = False
    for attempt in range(attempts):
        request = urllib.request.Request(f"{API}/datasets/{key}/export?format=json", data=body, method="POST", headers={
            "Authorization": f"Bearer {session.token(force)}", "Content-Type": "application/json"})
        force = False
        try:
            with urllib.request.urlopen(request, timeout=240, context=_tls_context()) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            if error.code == 401:
                force = True
                continue
            if error.code in (429, 500, 502, 503, 504) and attempt < attempts - 1:
                time.sleep(5 * (attempt + 1))
                continue
            text = error.read().decode("utf-8", "replace")
            if error.code == 403 and "is not allowed" in text:
                raise PurposeRefused(json.loads(text).get("message", text) if text.startswith("{") else text)
            raise RuntimeError(f"{key} {filters}: HTTP {error.code} {text[:300]}")
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt < attempts - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"{key} {filters}: {error}")
    raise RuntimeError(f"{key} {filters}: gave up")


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "blank"


def save(path, payload):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path + ".tmp", "w") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    os.replace(path + ".tmp", path)


def load(path):
    with open(path) as handle:
        return json.load(handle)


def name_variants(name):
    """The geography filter matches names exactly; source spellings differ."""
    base = name.strip()
    out = {base, base.replace("_", " "), re.sub(r"[_ ]*\((rural|urban)\)", r" \1", base, flags=re.I).strip()}
    out |= {re.sub(r"[_ ]+(rural|urban)$", "", v, flags=re.I).strip() for v in list(out)}
    return {v for v in out if v}


def fetch_by_name(session, key, field, names, folder, label):
    names = sorted(names)
    manifest_path = os.path.join(OUT, folder, "_manifest.json")
    manifest = load(manifest_path) if os.path.exists(manifest_path) else {}
    todo = [n for n in names if n not in manifest]
    print(f"  {label}: {len(names)} names, {len(todo)} still to ask")

    def one(name):
        payload = export(session, key, {field: name})
        records = payload.get("records") or []
        if records:
            save(os.path.join(OUT, folder, slug(name) + ".json"), records)
        return name, len(records)

    done = 0
    with concurrent.futures.ThreadPoolExecutor(WORKERS) as pool:
        for future in concurrent.futures.as_completed([pool.submit(one, n) for n in todo]):
            try:
                name, count = future.result()
                manifest[name] = count
            except Exception as error:  # one name failing must not stop the rest
                print(f"    [warn] {error}")
            done += 1
            if done % 25 == 0 or done == len(todo):
                save(manifest_path, manifest)
                print(f"    {done}/{len(todo)} asked; {sum(1 for v in manifest.values() if v)} with rows so far")
    save(manifest_path, manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--villages", action="store_true", help="also fetch village boundaries (thousands of requests)")
    parser.add_argument("--workers", type=int, default=WORKERS, help=f"requests at once (default {WORKERS}); lower it when the data lake answers 502")
    parser.add_argument("--only", choices=("mandals", "districts", "assemblies"),
                        help="fetch just one kind of boundary (small tables are always checked)")
    parser.add_argument("--purpose", default=PURPOSE,
                        help="the purpose declared to the data lake with every request (it is recorded upstream); "
                             f"default {PURPOSE}. The platform allows only certain purposes per dataset.")
    args = parser.parse_args()
    globals()["PURPOSE"] = args.purpose
    globals()["WORKERS"] = max(1, args.workers)
    print(f"Declared purpose for every request: {PURPOSE}")
    username = os.environ.get("DATALAKE_USERNAME") or input("Data lake username: ").strip()
    session = Session(username, getpass.getpass("Data lake password (not shown, not saved): "))
    print("Signed in. Extracts go to", os.path.relpath(OUT, ROOT))
    try:
        for key in SMALL:
            path = os.path.join(OUT, "tables", key + ".json")
            if not os.path.exists(path):
                payload = export(session, key)
                save(path, payload)
            print(f"  {key}: {len(load(path).get('records') or [])} records")

        readings = load(os.path.join(OUT, "tables", "groundwater_aggregatedreadings_api.json"))["records"]
        districts = {r["name"] for r in readings if r.get("pname") == "Andhra Pradesh"}
        mandals = {r["name"] for r in readings if r.get("pname") not in ("Andhra Pradesh", "", None) and r["name"] != "TOTAL"}
        try:
            mandals |= {m["m"].title() for m in load(GEOMETRY)["mandals"]}
        except (OSError, KeyError, ValueError):
            pass
        mandal_names = set().union(*(name_variants(n) for n in mandals))
        if args.only in (None, "mandals"):
            fetch_by_name(session, "aware_mandal_geo_api", "mandal", mandal_names, "mandal_geo", "mandal boundaries")
        if args.only in (None, "districts"):
            fetch_by_name(session, "aware_district_geo_api", "district", set().union(*(name_variants(n) for n in districts)),
                          "district_geo", "district boundaries")
        if args.only not in (None, "assemblies"):
            return 0

        # assembly_c is the constituency code: asked by name, every request
        # fails upstream (3 Oct 2026); asked by code, every one answers.
        codes = set()
        for name in os.listdir(os.path.join(OUT, "mandal_geo")):
            if name.endswith(".json") and not name.startswith("_"):
                for row in load(os.path.join(OUT, "mandal_geo", name)):
                    codes.add(str(row.get("assemcode") or ""))
        codes.discard("")
        # The State's 175 seats carry codes 120-294 (the undivided state's
        # numbering); asking for the whole range finds seats no fetched mandal names.
        codes |= {str(code) for code in range(ASSEMBLY_CODES[0], ASSEMBLY_CODES[1] + 1)}
        fetch_by_name(session, "aware_assembly_geo_api", "assembly_c", codes, "assembly_geo", "assembly boundaries (by code)")

        if args.villages:
            print("  village boundaries: not yet scripted; ask before running thousands of requests")
    except PurposeRefused as refused:
        print(f"\nThe data lake refused the declared purpose: {refused}\n"
              "Nothing more was fetched. Re-run with --purpose <one of the allowed values> only if that "
              "purpose is one you are prepared to have recorded for this use.")
        return 2
    finally:
        session.revoke()
    print("Done. Tell Claude the fetch has finished.")


if __name__ == "__main__":
    main()
