import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

PROTOTYPE_NOTICE = (
    "Prototype using real APWRIMS mandal groundwater readings (2014-2026) "
    "calibrated with NASA satellite signals. Estimates are modelled with "
    "confidence bands and are not official APWRIMS results."
)

BANNED_PHRASES = [
    "official mandal-level result",
    "satellite groundwater depth",
    "nasa water level",
]

SKIP_DIRS = {"node_modules", ".next", ".turbo", "dist", "out"}


def _source_files():
    app_dir = REPO_ROOT / "app"
    for sub in ("app", "components", "lib", "data"):
        root = app_dir / sub
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if any(part in SKIP_DIRS for part in path.parts):
                continue
            if path.suffix.lower() in {".tsx", ".ts", ".css", ".json"} and path.is_file():
                yield path


def test_dashboard_seed_json_contains_required_source_labels():
    summary_path = REPO_ROOT / "app/data/dashboard_summary.json"
    mandals_path = REPO_ROOT / "app/data/mandal_dataset.json"
    if not summary_path.exists() or not mandals_path.exists():
        return
    summary = json.loads(summary_path.read_text(encoding="utf-8"))["summary"]
    labels = summary["source_labels"]
    assert labels["measured_input_label"].startswith("APWRIMS")
    assert labels["satellite_input_label"] == "NASA/NDMC GRACE-DA satellite-model"
    assert labels["boundary_source"] == "public_prototype"
    assert labels["official_boundary_flag"] is False
    assert labels["official_apwrims_export"] == "pending"
    assert "not official APWRIMS results" in labels["not_official_results_caveat"]
    assert summary["prototype_notice"] == PROTOTYPE_NOTICE


def test_seed_mandals_never_marked_official():
    mandals_path = REPO_ROOT / "app/data/mandal_dataset.json"
    if not mandals_path.exists():
        return
    mandals = json.loads(mandals_path.read_text(encoding="utf-8"))
    assert mandals, "expected seed mandals"
    for mandal in mandals:
        assert mandal["official_result"] is False
        assert mandal["boundary_official_flag"] is False
        assert mandal["boundary_source"] == "public_prototype"
        assert mandal["measured_input_source"] == "APWRIMS (AP-GWD)"


def test_rainfall_is_real_and_labeled_when_present():
    """If CHIRPS rainfall is wired in, it must be labeled satellite-gauge-rainfall (mm),
    never groundwater depth, and surfaced with its source + period."""
    summary_path = REPO_ROOT / "app/data/dashboard_summary.json"
    mandals_path = REPO_ROOT / "app/data/mandal_dataset.json"
    if not summary_path.exists() or not mandals_path.exists():
        return
    summary = json.loads(summary_path.read_text(encoding="utf-8"))["summary"]
    if summary.get("avg_rainfall_mm") is None:
        return  # rainfall optional/graceful — skip if not pulled
    assert summary["source_labels"]["rainfall_input_label"].startswith("CHIRPS")
    assert summary.get("rainfall_period")
    mandals = json.loads(mandals_path.read_text(encoding="utf-8"))
    assert any(m.get("rainfall_mm") is not None for m in mandals)
    for m in mandals:
        if m.get("rainfall_mm") is not None:
            assert m["rainfall_input_label"].startswith("CHIRPS")

    rainfall_csv = REPO_ROOT / "data/processed/satellite/rainfall_samples_at_station_points.csv"
    if rainfall_csv.exists():
        text = rainfall_csv.read_text(encoding="utf-8").lower()
        assert "not groundwater depth" in text


def test_water_balance_is_modeled_context_not_groundwater_depth():
    """If TerraClimate ET/water balance is wired in, it must be labeled modeled context
    (mm), never groundwater depth, with a balance year and status per mandal."""
    summary_path = REPO_ROOT / "app/data/dashboard_summary.json"
    mandals_path = REPO_ROOT / "app/data/mandal_dataset.json"
    if not summary_path.exists() or not mandals_path.exists():
        return
    summary = json.loads(summary_path.read_text(encoding="utf-8"))["summary"]
    if summary.get("avg_water_balance_mm") is None:
        return  # optional/graceful
    assert summary["source_labels"]["water_balance_input_label"].startswith("TerraClimate")
    assert summary.get("balance_year")
    mandals = json.loads(mandals_path.read_text(encoding="utf-8"))
    statuses = {m.get("water_balance_status") for m in mandals if m.get("water_balance_mm") is not None}
    assert statuses, "expected at least one mandal with a water balance"
    assert statuses.issubset({"Surplus", "Balanced", "Deficit"})
    et_csv = REPO_ROOT / "data/processed/satellite/et_balance_samples_at_station_points.csv"
    if et_csv.exists():
        assert "not groundwater depth" in et_csv.read_text(encoding="utf-8").lower()


def test_satellite_samples_describe_percentiles_not_depth():
    samples_path = REPO_ROOT / "app/data/satellite_station_samples.json"
    if not samples_path.exists():
        return
    samples = json.loads(samples_path.read_text(encoding="utf-8"))
    assert samples, "expected satellite samples"
    for sample in samples:
        assert sample["data_label"] == "satellite-model"
        assert "not groundwater depth" in sample["notes"].lower()


def test_map_geometry_is_prototype_and_renderable():
    map_path = REPO_ROOT / "app/data/ap_map_geometry.json"
    if not map_path.exists():
        return
    geometry = json.loads(map_path.read_text(encoding="utf-8"))
    assert geometry["boundary_source"] == "public_prototype"
    assert geometry["official_flag"] is False
    assert len(geometry["bbox"]) == 4
    assert geometry["feature_count"] > 0
    seed = [m for m in geometry["mandals"] if m.get("seed")]
    assert seed, "expected at least one highlighted seed mandal"
    for mandal in seed:
        assert mandal.get("rings"), "seed mandal must have renderable rings"
        assert mandal.get("c"), "seed mandal must carry a centroid"


def test_ui_copy_contains_prototype_notice_and_no_banned_claims():
    files = list(_source_files())
    if not files:
        return
    text = "\n".join(path.read_text(encoding="utf-8") for path in files)
    assert PROTOTYPE_NOTICE in text, "prototype notice string must exist in UI source/data"
    lowered = text.lower()
    for phrase in BANNED_PHRASES:
        assert phrase not in lowered, f"banned UI phrase present: {phrase!r}"


def test_every_page_surfaces_the_prototype_caveat():
    """No page may hide the caveat: each page either renders HeaderHero (which carries the
    prototype banner) or otherwise surfaces the prototype notice itself."""
    pages_dir = REPO_ROOT / "app/app"
    if not pages_dir.exists():
        return
    pages = [p for p in pages_dir.rglob("page.tsx") if not any(part in SKIP_DIRS for part in p.parts)]
    assert pages, "expected at least one page"
    for page in pages:
        content = page.read_text(encoding="utf-8")
        surfaces_caveat = (
            "HeaderHero" in content
            or "prototypeNotice" in content
            or "Prototype" in content
        )
        assert surfaces_caveat, f"page does not surface the prototype caveat: {page}"

    header = (REPO_ROOT / "app/components/HeaderHero.tsx").read_text(encoding="utf-8")
    assert "protoBanner" in header
    assert "prototypeNotice" in header


def test_no_page_labels_seed_data_as_official():
    files = list(_source_files())
    if not files:
        return
    lowered = "\n".join(path.read_text(encoding="utf-8") for path in files).lower()
    # The seed measured input must never be described as official APWRIMS data.
    assert "official apwrims reading" not in lowered
    assert "official seed" not in lowered
