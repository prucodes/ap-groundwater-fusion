"""Poll the submitted HyP3 InSAR jobs until done, then download the LOS-displacement
GeoTIFFs. Run in the background (jobs take ~1-2 h). -> insar/products/*.zip
"""
import json, os, ssl, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
INS = os.path.join(HERE, "insar"); PROD = os.path.join(INS, "products"); os.makedirs(PROD, exist_ok=True)
TOKEN = os.environ.get("EDL_TOKEN", "")
def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (opt-in)."""
    if os.environ.get("ALLOW_INSECURE_TLS") == "1":
        return ssl._create_unverified_context()
    return ssl.create_default_context()


_ctx = _tls_context()


def get(url):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOKEN, "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=120, context=_ctx) as r:
        return r.read()


def main():
    ids = set(json.load(open(os.path.join(INS, "hyp3_jobs.json")))["job_ids"])
    while True:
        data = json.loads(get("https://hyp3-api.asf.alaska.edu/jobs"))
        jobs = [j for j in data.get("jobs", []) if j["job_id"] in ids]
        by = {}
        for j in jobs:
            by[j["status_code"]] = by.get(j["status_code"], 0) + 1
        print(f"  {time.strftime('%H:%M')} status: {by}", flush=True)
        if not by.get("RUNNING") and not by.get("PENDING"):
            break
        time.sleep(150)
    # download succeeded products
    done = [j for j in jobs if j["status_code"] == "SUCCEEDED"]
    n = 0
    for j in done:
        for f in j.get("files", []):
            url = f["url"]; name = f["filename"]
            p = os.path.join(PROD, name)
            if not os.path.exists(p):
                open(p, "wb").write(get(url)); n += 1
                print(f"    downloaded {name} ({os.path.getsize(p)//1024//1024} MB)", flush=True)
    print(f"  DONE: {len(done)}/{len(jobs)} succeeded, {n} files -> insar/products/", flush=True)


if __name__ == "__main__":
    main()
