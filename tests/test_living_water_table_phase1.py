"""Phase 1 integrity tests for the isolated Living Water Table route."""

from __future__ import annotations

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
COMPONENTS = APP / "components" / "living-water-table"


def load_json(relative: str):
    return json.loads((ROOT / relative).read_text())


def slug(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()))


def test_v2_geometry_join_is_stable_complete_and_unique():
    geometry = load_json("app/data/ap_map_geometry.json")
    bundle = load_json("app/data/mandal_groundwater_records_v2.json")
    manifest = load_json("app/data/dataset_manifest.json")
    records = bundle["records"]
    by_boundary = {record["identity"]["boundaryId"]: record for record in records}

    assert bundle["contractVersion"] == "2.0.0"
    assert len(records) == len(by_boundary)
    assert len(geometry["mandals"]) == manifest["counts"]["boundaryFeatureCount"]
    assert len(records) == manifest["counts"]["boundaryFeatureCount"]

    joined = set()
    for index, feature in enumerate(geometry["mandals"]):
        boundary_id = (
            f"ap-prototype-boundary-{slug(feature['d'])}-{slug(feature['m'])}-"
            f"{index + 1:03d}"
        )
        record = by_boundary[boundary_id]
        assert record["identity"]["districtName"] == feature["d"]
        assert record["identity"]["mandalName"] == feature["m"]
        joined.add(record["identity"]["mandalId"])

    assert len(joined) == manifest["counts"]["boundaryFeatureCount"]


def test_coverage_states_reconcile_without_value_substitution():
    records = load_json("app/data/mandal_groundwater_records_v2.json")["records"]
    manifest = load_json("app/data/dataset_manifest.json")
    counts = Counter(record["identity"]["coverageStatus"] for record in records)

    assert counts["modelled"] == manifest["counts"]["modelledRecordCount"]
    assert counts["measured_only"] == manifest["counts"]["measuredOnlyCount"]
    assert counts["boundary_only"] == manifest["counts"]["boundaryOnlyCount"]
    assert counts["no_data"] == manifest["counts"]["noDataCount"]

    for record in records:
        status = record["identity"]["coverageStatus"]
        assert record["forecast"] is None
        if status == "modelled":
            nowcast = record["nowcast"]
            assert nowcast is not None
            assert nowcast["unit"] == "m_bgl"
            assert nowcast["lower"] <= nowcast["value"] <= nowcast["upper"]
        elif status == "measured_only":
            assert record["observation"] is not None
            assert record["nowcast"] is None
        elif status in {"boundary_only", "no_data"}:
            assert record["observation"] is None
            assert record["nowcast"] is None


def test_geometry_preserves_all_parts_and_valid_coordinate_rings():
    geometry = load_json("app/data/ap_map_geometry.json")
    assert geometry["feature_count"] == len(geometry["mandals"])
    assert sum(len(feature["rings"]) for feature in geometry["mandals"]) == 679
    assert any(len(feature["rings"]) > 1 for feature in geometry["mandals"])
    for feature in geometry["mandals"]:
        assert feature["rings"]
        for ring in feature["rings"]:
            assert len(ring) >= 4
            assert ring[0] == ring[-1]
            assert all(
                -180 <= point[0] <= 180 and -90 <= point[1] <= 90
                for point in ring
            )


def test_depth_scale_is_fixed_explained_and_null_safe():
    encoding = (COMPONENTS / "encoding.ts").read_text()
    expected_edges = [
        ("near_surface", 0, 2),
        ("very_shallow", 2, 10),
        ("shallow", 10, 20),
        ("moderate", 20, 30),
        ("deep", 30, 40),
        ("very_deep", 40, 60),
    ]
    for key, lower, upper in expected_edges:
        pattern = (
            rf'key: "{key}".+minInclusive: {lower}, maxExclusive: {upper}'
        )
        assert re.search(pattern, encoding)
    assert 'key: "extremely_deep"' in encoding
    assert "Number.isFinite(value)" in encoding
    assert 'return coverageStatus' in encoding


def test_height_is_uniform_by_default_and_relief_is_bounded_and_opt_in():
    """Height must not imply precision the model doesn't have.

    Originally that meant height was never depth-driven at all. Relief view
    (an opt-in depth extrusion) has since been added deliberately, so the
    invariant is now: flat/uniform is what you get unless you ask for relief,
    relief is bounded, and a record with no groundwater value never receives a
    depth-derived height.
    """
    geometry_module = (COMPONENTS / "geometry.ts").read_text()
    page = (COMPONENTS / "LivingWaterTablePage.tsx").read_text()

    assert "const SURFACE_HEIGHT = 0.09" in geometry_module
    # Uniform height unless relief is explicitly requested.
    assert "if (!relief) return SURFACE_HEIGHT;" in geometry_module
    # No groundwater value => uniform height, never an invented one.
    assert (
        "if (depth === null || !Number.isFinite(depth)) return SURFACE_HEIGHT;"
        in geometry_module
    )
    # Relief is clamped to the legend's reference depth, so no runaway columns.
    assert "Math.min(Math.max(depth, 0), DEPTH_REF_M) / DEPTH_REF_M" in geometry_module
    # Flat is the default; relief is opt-in via an explicit query parameter.
    assert 'const relief = searchParams.get("surface") === "relief";' in page


def test_route_is_client_isolated_and_has_no_legacy_imports():
    page = (APP / "app" / "living-water-table" / "page.tsx").read_text()
    client = (COMPONENTS / "LivingWaterTableClient.tsx").read_text()
    phase1_source = "\n".join(
        path.read_text()
        for path in COMPONENTS.glob("*")
        if path.suffix in {".ts", ".tsx"}
    )
    assert "LivingWaterTableClient" in page
    assert 'dynamic(' in client and "ssr: false" in client
    assert "mandal_dataset.json" not in phase1_source
    assert "mandal_depth_series.json" not in phase1_source
    assert "mandal_levels_estimated.json" not in phase1_source
    assert "mandal_levels_current.json" not in phase1_source
    assert ".forecast" not in phase1_source


def test_phase1_ui_contains_fallback_quality_accessibility_and_disclosures():
    page = (COMPONENTS / "LivingWaterTablePage.tsx").read_text()
    fallback = (COMPONENTS / "WebGLFallback.tsx").read_text()
    selected = (COMPONENTS / "SelectedMandalPanel.tsx").read_text()
    styles = (COMPONENTS / "living-water-table.module.css").read_text()

    assert '"auto"' in page and '"standard"' in page and '"reduced"' in page
    assert "webglcontextlost" in (COMPONENTS / "LivingWaterTableScene.tsx").read_text()
    assert "Keyboard mandal selection" in page
    assert "GRACE-DA is regional model-assimilated context" in page
    # The view must say what column height does and does not mean. The wording
    # changed when opt-in relief replaced uniform-only height; the disclosure
    # requirement did not.
    assert "flat view uses a uniform height" in page
    assert "Height never encodes groundwater volume or subsurface geology." in page
    assert "Accessible 2D fallback" in fallback
    assert "Measured-only record" in selected
    assert "No measured groundwater value" in selected
    assert "prefers-reduced-motion" in styles


def test_navigation_and_package_policy():
    shell = (APP / "components" / "AppShell.tsx").read_text()
    package = load_json("app/package.json")
    assert 'href: "/living-water-table"' in shell
    assert 'label: "Living Water Table"' in shell
    assert package["dependencies"]["@react-three/fiber"] == "^9.6.1"
    assert "@react-three/drei" not in package["dependencies"]
    forbidden = {"deck.gl", "maplibre-gl", "cesium", "@react-three/postprocessing"}
    assert forbidden.isdisjoint(package["dependencies"])
