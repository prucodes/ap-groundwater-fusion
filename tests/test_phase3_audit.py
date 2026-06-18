"""Phase 3 audit guardrails — provenance, source-label, secret, model-claim,
and boundary-coverage regression tests. Strengthened after the re-audit:
exact GRACE-source equality, real coverage, repo-wide claim scan, mandatory
manifest, and CSV-banner checks."""
import hashlib
import json
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DATA = REPO_ROOT / "app" / "data"

SKIP_DIRS = {"node_modules", ".next", ".turbo", "dist", "out", "__pycache__", ".git"}


def _load(name):
    return json.loads((APP_DATA / name).read_text())


def _norm(s: str) -> str:
    s = str(s).upper()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = re.sub(r"[._\-]", " ", s).replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _repo_text_files():
    roots = [
        REPO_ROOT / "app" / "app", REPO_ROOT / "app" / "components", REPO_ROOT / "app" / "lib",
        REPO_ROOT / "docs", REPO_ROOT / "phase3_levels", REPO_ROOT / "scripts",
    ]
    exts = {".ts", ".tsx", ".js", ".md", ".html", ".py"}
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.suffix not in exts:
                continue
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.name == "test_phase3_audit.py":
                continue
            yield path


# ---- 1. NASA-field provenance: groundwater_percentile == its district GRACE value ----

def test_nasa_field_equals_district_grace_exactly():
    ds = _load("mandal_dataset.json")
    districts = {d["d"].upper(): d.get("gw_percentile")
                 for d in _load("ap_district_geometry.json")["districts"]}
    checked = mism = 0
    for r in ds:
        g = districts.get(r["district_name"].upper())
        if g is None or r.get("groundwater_percentile") is None:
            continue
        checked += 1
        if abs(r["groundwater_percentile"] - g) > 1e-6:
            mism += 1
    assert checked > 500, f"too few records checked ({checked})"
    assert mism == 0, f"{mism} records' NASA field != their district GRACE value"


def test_measured_wetness_is_separate_field():
    ds = _load("mandal_dataset.json")
    modelled = [r for r in ds if r.get("measured_wetness_percentile") is not None]
    assert modelled, "measured_wetness_percentile missing — fields not separated"
    same = sum(1 for r in modelled if r["measured_wetness_percentile"] == r.get("groundwater_percentile"))
    assert same < len(modelled), "measured and NASA percentiles identical — fields merged again"


# ---- 2. Source-label honesty ----

def test_apwrims_label_is_session_pending_not_public():
    items = _load("source_readiness.json")
    items = items if isinstance(items, list) else items.get("items", [])
    labels = " ".join(str(it.get("label", "")) + str(it.get("data_label", "")) for it in items).lower()
    assert "mock" not in labels and "public readings" not in labels
    assert "authorization pending" in labels or "session" in labels
    # no duplicate readiness rows
    seen = [(it.get("label"), it.get("data_label")) for it in items]
    assert len(seen) == len(set(seen)), "duplicate readiness entries"


# ---- 3. Secret scanning ----

def test_no_hardcoded_apwrims_cookie():
    pattern = re.compile(r"JSESSIONID=[0-9A-Fa-f]{8,}")
    offenders = [str(p.relative_to(REPO_ROOT)) for p in _repo_text_files()
                 if p.suffix == ".py" and pattern.search(p.read_text(errors="ignore"))]
    assert not offenders, f"hard-coded session cookie in: {offenders}"


def test_credentialed_fetcher_has_no_unverified_tls():
    src = (REPO_ROOT / "phase3_levels" / "fetch_apwrims_history.py").read_text()
    assert "_create_unverified_context" not in src
    assert 'os.environ.get("APWRIMS_COOKIE")' in src


def test_no_silent_unverified_tls_anywhere():
    """Any unverified-TLS use must be env-gated (ALLOW_INSECURE_TLS), never unconditional."""
    offenders = []
    for p in _repo_text_files():
        if p.suffix != ".py":
            continue
        text = p.read_text(errors="ignore")
        if "_create_unverified_context()" in text and "ALLOW_INSECURE_TLS" not in text:
            offenders.append(str(p.relative_to(REPO_ROOT)))
    assert not offenders, f"silent unverified TLS in: {offenders}"


# ---- 4. Model-claim & causal guardrails across the WHOLE repo (not just app TS) ----

BANNED = [
    "without a sensor", "without its own sensor", "without deploying a sensor",
    "driven by pumping, not drought", "driven by pumping",
    "drought-driven", "over-extraction", "likely climate-driven",
    "pumping > recharge", "pumping likely exceeds", "other 95%", "statewide metres",
]


def test_no_overclaim_or_attribution_phrasing_repo_wide():
    offenders = []
    for p in _repo_text_files():
        low = p.read_text(errors="ignore").lower()
        for phrase in BANNED:
            if phrase in low:
                offenders.append(f"{p.relative_to(REPO_ROOT)}: '{phrase}'")
    assert not offenders, "overclaim/attribution phrasing present:\n" + "\n".join(offenders)


# ---- 5. Coverage, schema, manifest, exports ----

def test_boundary_coverage_join_holds():
    geo = _load("ap_map_geometry.json")["mandals"]
    ds = _load("mandal_dataset.json")
    pairs = {(r["district_name"].upper(), r["mandal_name"].upper()) for r in ds}
    norms = {_norm(r["mandal_name"]) for r in ds}
    mapped = sum(1 for g in geo
                 if (g["d"].upper(), g["m"].upper()) in pairs or _norm(g["m"]) in norms)
    assert mapped >= 600, f"boundary coverage regressed: only {mapped}/{len(geo)} mapped"


def test_dataset_ids_unique_and_present():
    ds = _load("mandal_dataset.json")
    ids = [r["id"] for r in ds]
    assert all(ids) and len(ids) == len(set(ids))


def test_dashboard_summary_schema_and_nasa_avg():
    s = _load("dashboard_summary.json")["summary"]
    for key in ("mandals_analyzed", "avg_groundwater_percentile", "status_distribution"):
        assert key in s
    assert s["avg_groundwater_percentile"] > 70  # GRACE, not the old ~40 measured value


def test_manifest_present_and_hashes_match():
    manifest = json.loads((APP_DATA / "dataset_manifest.json").read_text())  # must exist
    for entry in manifest["files"]:
        blob = (APP_DATA / entry["file"]).read_bytes()
        assert hashlib.sha256(blob).hexdigest() == entry["sha256"], f"hash drift: {entry['file']}"


def test_all_csv_exporters_use_provenance_banner():
    csv_lib = (REPO_ROOT / "app" / "lib" / "csv.ts").read_text()
    assert "export function csvBanner" in csv_lib and "csvBanner(" in csv_lib
    for comp in ("ReportDownloads.tsx", "IrrigationExports.tsx"):
        text = (REPO_ROOT / "app" / "components" / comp).read_text()
        assert "csvBanner(" in text, f"{comp} CSV export missing provenance banner"
