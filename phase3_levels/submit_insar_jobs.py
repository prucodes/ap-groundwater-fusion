"""Submit Sentinel-1 InSAR interferogram jobs to ASF HyP3 over the AP delta
pumping-pressure hotspot (track 92, frame 536 — Eluru/Krishna/W.Godavari).

Builds a ~monthly time-series stack and submits consecutive-pair INSAR_GAMMA jobs
(with LOS displacement) via the HyP3 REST API using an Earthdata bearer token.
Saves job IDs -> insar/hyp3_jobs.json for later polling/download.
"""
import json, os, ssl, sys, urllib.request
import asf_search as asf

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "insar"); os.makedirs(OUT, exist_ok=True)
TOKEN = os.environ.get("EDL_TOKEN", "")
def _tls_context():
    """Verified TLS by default; unverified only with ALLOW_INSECURE_TLS=1 (opt-in)."""
    if os.environ.get("ALLOW_INSECURE_TLS") == "1":
        return ssl._create_unverified_context()
    return ssl.create_default_context()


_ctx = _tls_context()
try:
    if os.environ.get('ALLOW_INSECURE_TLS') == '1':
        ssl._create_default_https_context = ssl._create_unverified_context
except Exception:
    pass


def hyp3_post(path, payload):
    req = urllib.request.Request("https://hyp3-api.asf.alaska.edu" + path, data=json.dumps(payload).encode(),
                                 method="POST", headers={"Authorization": "Bearer " + TOKEN,
                                 "Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=90, context=_ctx) as r:
        return json.loads(r.read())


def main():
    if not TOKEN:
        print("EDL_TOKEN not set"); return 1
    # stack over the delta hotspot, one coherent track/frame, ~monthly 2023->2026
    res = asf.geo_search(platform=[asf.PLATFORM.SENTINEL1], processingLevel=[asf.PRODUCT_TYPE.SLC],
                         intersectsWith="POINT(81.1 16.95)", start="2023-01-01", end="2026-07-15",
                         beamMode=[asf.BEAMMODE.IW], relativeOrbit=[92])
    scenes = sorted([r.properties for r in res if r.properties.get("frameNumber") == 536],
                    key=lambda p: p["startTime"])
    # thin to ~monthly (skip near-duplicate dates)
    picked = []
    for p in scenes:
        if not picked or (p["startTime"][:7] != picked[-1]["startTime"][:7]):
            picked.append(p)
    # cap the stack size (credits/time); take an evenly-spaced ~14
    if len(picked) > 14:
        step = len(picked) / 14.0
        picked = [picked[int(i*step)] for i in range(14)]
    names = [p["sceneName"] for p in picked]
    print(f"  stack: {len(names)} scenes, {picked[0]['startTime'][:10]} .. {picked[-1]['startTime'][:10]}")

    jobs = [{"job_type": "INSAR_GAMMA", "name": f"ap_delta_{i:02d}",
             "job_parameters": {"granules": [names[i], names[i+1]],
                                "include_los_displacement": True, "apply_water_mask": True, "looks": "20x4"}}
            for i in range(len(names)-1)]
    print(f"  submitting {len(jobs)} interferogram pairs to HyP3 ...")
    resp = hyp3_post("/jobs", {"jobs": jobs})
    ids = [j["job_id"] for j in resp.get("jobs", [])]
    json.dump({"job_ids": ids, "scenes": names, "submitted": resp.get("jobs", [])},
              open(os.path.join(OUT, "hyp3_jobs.json"), "w"), indent=2)
    print(f"  submitted {len(ids)} jobs -> insar/hyp3_jobs.json")


if __name__ == "__main__":
    sys.exit(main() or 0)
