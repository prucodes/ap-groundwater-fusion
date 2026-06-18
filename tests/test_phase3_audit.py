"""Phase 3 audit guardrails — provenance, source-label, secret, model-claim,
and boundary-coverage regression tests. Added after the external audit so the
critical fixes can't silently regress."""
import json
import re
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
APP_DATA = REPO_ROOT / "app" / "data"

SKIP_DIRS = {"node_modules", ".next", ".turbo", "dist", "out", "__pycache__"}


def _load(name):
    return json.loads((APP_DATA / name).read_text())


def _app_source_files():
    for sub in ("app", "components", "lib"):
        root = REPO_ROOT / "app" / sub
        if not root.exists():
            continue
        for path in root.rglob("*.ts*"):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            yield path


def _py_files():
    for sub in ("scripts", "phase3_levels"):
        root = REPO_ROOT / sub
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            yield path


# ---- 1. NASA-field provenance: the "NASA" percentile must be GRACE, not measured ----

def test_nasa_field_is_grace_not_measured():
    ds = _load("mandal_dataset.json")
    gw = [r["groundwater_percentile"] for r in ds if r.get("groundwater_percentile") is not None]
    assert gw, "no groundwater_percentile values"
    # GRACE-DA for AP currently sits high (~88-100). The measured-history percentile
    # averaged ~40 — a regression to that would mean the mislabel came back.
    avg = sum(gw) / len(gw)
    assert avg > 70, f"avg NASA percentile {avg:.1f} looks like the measured field, not GRACE"
    assert all(0 <= v <= 100 for v in gw), "percentile out of 0-100"


def test_measured_wetness_is_separate_field():
    ds = _load("mandal_dataset.json")
    modelled = [r for r in ds if r.get("measured_wetness_percentile") is not None]
    assert modelled, "measured_wetness_percentile missing — fields not separated"
    # The two fields must not be the same value everywhere (that would mean re-merge).
    same = sum(1 for r in modelled if r["measured_wetness_percentile"] == r.get("groundwater_percentile"))
    assert same < len(modelled), "measured and NASA percentiles are identical — fields merged again"


# ---- 2. Source-label honesty ----

def test_apwrims_label_is_session_pending_not_public():
    items = _load("source_readiness.json")
    items = items if isinstance(items, list) else items.get("items", [])
    labels = " ".join(str(it.get("label", "")) + str(it.get("data_label", "")) for it in items)
    assert "mock" not in labels.lower(), "stale 'mock' APWRIMS label"
    assert "public readings" not in labels.lower(), "overclaims APWRIMS as public"
    assert "authorization pending" in labels.lower() or "session" in labels.lower(), \
        "APWRIMS session-sample provenance not disclosed"


# ---- 3. Secret scanning: no hard-coded credentials ----

def test_no_hardcoded_apwrims_cookie():
    pattern = re.compile(r"JSESSIONID=[0-9A-Fa-f]{8,}")
    offenders = []
    for path in _py_files():
        text = path.read_text(errors="ignore")
        for m in pattern.finditer(text):
            # allow the help-text example placeholder "JSESSIONID=..."
            if "JSESSIONID=..." in text[m.start():m.start() + 20]:
                continue
            offenders.append(str(path.relative_to(REPO_ROOT)))
    assert not offenders, f"hard-coded session cookie found in: {offenders}"


def test_credentialed_fetcher_has_no_unverified_tls():
    src = (REPO_ROOT / "phase3_levels" / "fetch_apwrims_history.py").read_text()
    assert "_create_unverified_context" not in src, "credentialed fetcher must use verified TLS"
    assert 'os.environ.get("APWRIMS_COOKIE")' in src, "cookie must come from environment"


# ---- 4. Model-claim guardrails (UI copy) ----

CAUSAL_OVERCLAIMS = [
    "driven by pumping, not drought",
    "without its own sensor",
    "pumping > recharge",
    "pumping likely exceeds recharge",
]


def test_no_causal_or_no_sensor_overclaims_in_ui():
    offenders = []
    for path in _app_source_files():
        text = path.read_text(errors="ignore").lower()
        for phrase in CAUSAL_OVERCLAIMS:
            if phrase in text:
                offenders.append(f"{path.relative_to(REPO_ROOT)}: '{phrase}'")
    assert not offenders, f"overclaim phrasing present: {offenders}"


# ---- 5. Boundary coverage + dashboard schema ----

def test_dataset_ids_unique_and_present():
    ds = _load("mandal_dataset.json")
    ids = [r["id"] for r in ds]
    assert all(ids), "blank mandal id"
    assert len(ids) == len(set(ids)), "duplicate mandal ids"


def test_dashboard_summary_schema_and_nasa_avg():
    s = _load("dashboard_summary.json")["summary"]
    for key in ("mandals_analyzed", "avg_groundwater_percentile", "status_distribution"):
        assert key in s, f"dashboard_summary missing {key}"
    # NASA average must reflect GRACE, not the old ~40 measured value.
    assert s["avg_groundwater_percentile"] > 70


def test_manifest_hashes_match_files():
    manifest_path = APP_DATA / "dataset_manifest.json"
    if not manifest_path.exists():
        pytest.skip("manifest not generated")
    import hashlib
    manifest = json.loads(manifest_path.read_text())
    for entry in manifest["files"]:
        blob = (APP_DATA / entry["file"]).read_bytes()
        assert hashlib.sha256(blob).hexdigest() == entry["sha256"], f"hash drift: {entry['file']}"
