"""Focused Phase 1.1 semantics and presentation integrity tests."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPONENTS = ROOT / "app" / "components" / "living-water-table"


def load_json(path: str):
    return json.loads((ROOT / path).read_text())


def test_active_output_is_latest_target_holdout_not_operational_live_nowcast():
    engine = (ROOT / "phase3_levels" / "build_levels_engine.py").read_text()
    records = load_json("app/data/mandal_groundwater_records_v2.json")["records"]

    assert 'groupby("mkey").tail(1).index' in engine
    assert "train = df.drop(index=latest_idx)" in engine
    assert "latest targets" in engine
    assert all(
        record["nowcast"] is None
        or record["nowcast"]["modelVersion"] == "phase0-nowcast-2.0.0"
        for record in records
    )


def test_same_period_measurement_is_primary_and_model_is_evaluation_context():
    records = load_json("app/data/mandal_groundwater_records_v2.json")["records"]
    same_period = [
        record
        for record in records
        if record["observation"]
        and record["nowcast"]
        and record["observation"]["observationPeriod"]
        == record["nowcast"]["targetPeriod"]
    ]
    assert same_period

    panel = (COMPONENTS / "SelectedMandalPanel.tsx").read_text()
    semantics = (COMPONENTS / "displaySemantics.ts").read_text()
    assert panel.index("Current measured status") < panel.index("Model comparison")
    assert "Held-out model estimate" in semantics
    assert "generated without the target-period observation" in semantics
    assert "Absolute observed–model difference" in panel
    assert "Observed aggregate inside model range" in panel
    assert "Modelled nowcast" not in panel


def test_measured_only_and_boundary_only_panels_do_not_fabricate_model_fields():
    records = load_json("app/data/mandal_groundwater_records_v2.json")["records"]
    measured_only = [
        record
        for record in records
        if record["identity"]["coverageStatus"] == "measured_only"
    ]
    boundary_only = [
        record
        for record in records
        if record["identity"]["coverageStatus"] == "boundary_only"
    ]
    assert measured_only and boundary_only
    assert all(record["observation"] and record["nowcast"] is None for record in measured_only)
    assert all(
        record["observation"] is None and record["nowcast"] is None
        for record in boundary_only
    )

    panel = (COMPONENTS / "SelectedMandalPanel.tsx").read_text()
    assert "Measured-only record: no model estimate or model interval is published." in panel
    assert "No measured value, model estimate, model interval or forecast" in panel
    assert "record.forecast" not in panel


def test_legend_is_compact_collapsible_and_scientifically_explicit():
    legend = (COMPONENTS / "WaterTableLegend.tsx").read_text()
    styles = (COMPONENTS / "living-water-table.module.css").read_text()
    assert "aria-expanded={expanded}" in legend
    assert "(max-height: 820px)" in legend
    assert "Depth categories" in legend
    assert "Coverage status" in legend
    assert "does not" in legend and "greater groundwater volume" in legend
    assert ".legendCollapsed" in styles


def test_quality_scroll_and_appearance_labels_are_user_facing():
    page = (COMPONENTS / "LivingWaterTablePage.tsx").read_text()
    theme = (ROOT / "app" / "components" / "ThemeToggle.tsx").read_text()
    assert "Visual quality" in page
    assert "Using ${resolvedQuality" in page
    assert "Auto →" not in page
    assert 'window.history.scrollRestoration = "manual"' in page
    assert 'window.scrollTo({ top: 0, left: 0, behavior: "instant" })' in page
    assert "priorScrollRestoration" in page
    assert "scroll: false" in page
    assert "Switch to light" in theme and "Switch to dark" in theme


def test_camera_reset_is_bounds_derived_and_selection_lift_is_constant():
    scene = (COMPONENTS / "LivingWaterTableScene.tsx").read_text()
    geometry = (COMPONENTS / "geometry.ts").read_text()
    assert "defaultCameraFraming" in scene
    assert "createProjector(bbox)" in scene
    assert "boundsPadding = 1.15" in scene
    assert "camera.position.copy(framing.position)" in scene
    assert "orbit.target.copy(framing.target)" in scene
    assert "command.type === \"reset\"" in scene
    assert "geometry.translate(0, 0.035, 0)" in scene
    assert "const SURFACE_HEIGHT = 0.09" in geometry
    assert ".nowcast" not in geometry


def test_phase1_1_does_not_add_cinematic_dependencies_or_forecasts():
    package = load_json("app/package.json")
    forbidden = {
        "@react-three/postprocessing",
        "postprocessing",
        "deck.gl",
        "maplibre-gl",
        "cesium",
    }
    assert forbidden.isdisjoint(package["dependencies"])
    source = "\n".join(
        path.read_text()
        for path in COMPONENTS.glob("*")
        if path.suffix in {".ts", ".tsx"}
    )
    assert "bloom" not in source.lower()
    assert "refraction" not in source.lower()
    assert "satellite beam" not in source.lower()
