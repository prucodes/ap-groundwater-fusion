"""Publish the active Phase 0 V2 records, histories, model card and manifest.

The publisher is deliberately local and fail-closed: every boundary receives one
record, missing groundwater remains missing, and forecasts are never synthesized.
"""
import csv
import datetime
import difflib
import hashlib
import json
import os
import re
import statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(HERE, "..", "app", "data"))
OUT = os.path.join(HERE, "outputs")
CONTRACT_VERSION = "2.0.0"
BUILDER_VERSION = "phase0-publisher-2.0.0"
GEOMETRY_VERSION = "public-prototype-2026-07"


def norm(value):
    text = str(value).upper().strip()
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", text)
    text = text.replace("_", " ").replace(".", " ").replace("-", " ").replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", text)).strip()


def norm2(value):
    text = str(value).upper().strip()
    text = re.sub(r"\(.*?\)", " ", text)
    text = text.replace("_", " ").replace(".", " ").replace("-", " ").replace("&", " AND ")
    text = re.sub(
        r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN|EAST|WEST|NORTH|SOUTH)\b",
        " ",
        text,
    )
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", text)).strip()


def identity_norm(value):
    """Normalize punctuation/spacing while preserving Urban/Rural/direction qualifiers."""
    text = str(value).upper().strip()
    text = text.replace("_", " ").replace("&", " AND ")
    return re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9 ]", " ", text)).strip()


def slug(*parts):
    return re.sub(r"[^a-z0-9]+", "-", "-".join(str(part).lower() for part in parts)).strip("-")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def write_json(path, payload):
    with open(path, "w") as handle:
        json.dump(payload, handle, indent=2, sort_keys=False)
        handle.write("\n")


def read_histories(path):
    exact = defaultdict(list)
    reconciled = defaultdict(list)
    raw_series = set()
    raw_row_count = 0
    valid_row_count = 0
    with open(path) as handle:
        for row in csv.DictReader(handle):
            raw_row_count += 1
            try:
                level = float(row["level_mbgl"])
            except (TypeError, ValueError):
                continue
            if not 0 < level < 60:
                continue
            valid_row_count += 1
            district = norm(row["district"])
            item = {
                "period": row["date"],
                "value": round(level, 3),
                "sourceSeriesId": row["mandal_uuid"],
            }
            exact[(district, norm(row["mandal"]))].append(item)
            reconciled[(district, norm2(row["mandal"]))].append(item)
            raw_series.add(row["mandal_uuid"])
    return exact, reconciled, raw_series, raw_row_count, valid_row_count


def aggregate_history(rows, reconcile):
    if not rows:
        return []
    if not reconcile:
        return sorted(rows, key=lambda row: row["period"])
    months = defaultdict(list)
    for row in rows:
        months[row["period"]].append(row)
    result = []
    for period, values in sorted(months.items()):
        result.append({
            "period": period,
            "value": round(statistics.mean(item["value"] for item in values), 3),
            "sourceSeriesIds": sorted({item["sourceSeriesId"] for item in values}),
        })
    return result


def trend_from_series(series):
    if len(series) < 13:
        return None
    by_period = {row["period"]: row["value"] for row in series}
    latest = series[-1]
    previous_period = f"{int(latest['period'][:4]) - 1}{latest['period'][4:]}"
    if previous_period not in by_period:
        return None
    return round(max(-6.0, min(6.0, latest["value"] - by_period[previous_period])), 2)


def build_records(generated_at):
    paths = {
        "apwrimsHistory": os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"),
        "nowcasts": os.path.join(OUT, "mandal_nowcasts_v2.json"),
        "geometry": os.path.join(APP, "ap_map_geometry.json"),
        "districtSignals": os.path.join(APP, "ap_district_geometry.json"),
        "climateContext": os.path.join(APP, "ap_mandal_heat.json"),
        "graceProvenance": os.path.join(APP, "nasa_provenance.json"),
        "extractionCategories": os.path.join(HERE, "data", "mandal_extraction_cgwb2024.csv"),
        "evaluations": os.path.join(OUT, "phase0_evaluations.json"),
    }
    missing_required = [path for path in paths.values() if not os.path.exists(path)]
    if missing_required:
        raise FileNotFoundError(f"required Phase 0 inputs are missing: {missing_required}")

    geometry = json.load(open(paths["geometry"]))
    district_geometry = json.load(open(paths["districtSignals"]))
    heat = json.load(open(paths["climateContext"]))
    grace_provenance = json.load(open(paths["graceProvenance"]))
    nowcast_bundle = json.load(open(paths["nowcasts"]))
    evaluations = json.load(open(paths["evaluations"]))
    exact_history, reconciled_history, raw_series, observation_rows, valid_observation_rows = read_histories(paths["apwrimsHistory"])

    boundary_rows = list(geometry["mandals"])
    boundary_exact = defaultdict(list)
    boundary_relaxed = defaultdict(list)
    for boundary_index, feature in enumerate(boundary_rows):
        boundary_exact[(identity_norm(feature["d"]), identity_norm(feature["m"]))].append(boundary_index)
        boundary_relaxed[(norm(feature["d"]), norm(feature["m"]))].append(boundary_index)
    assigned_nowcasts = {}
    remaining_nowcasts = []
    for row in nowcast_bundle["mandals"]:
        candidates = [
            index
            for index in boundary_exact.get(
                (identity_norm(row["district"]), identity_norm(row["mandal"])),
                [],
            )
            if index not in assigned_nowcasts
        ]
        if len(candidates) == 1:
            assigned_nowcasts[candidates[0]] = row
        else:
            remaining_nowcasts.append(row)
    unresolved = []
    for row in remaining_nowcasts:
        candidates = [
            index
            for index in boundary_relaxed.get(
                (norm(row["district"]), norm(row["mandal"])),
                [],
            )
            if index not in assigned_nowcasts
        ]
        if len(candidates) == 1:
            assigned_nowcasts[candidates[0]] = row
        else:
            unresolved.append(row)
    cross_district_unresolved = []
    for row in unresolved:
        candidates = [
            index for index, feature in enumerate(boundary_rows)
            if index not in assigned_nowcasts
            and identity_norm(feature["m"]) == identity_norm(row["mandal"])
        ]
        if not candidates:
            candidates = [
                index for index, feature in enumerate(boundary_rows)
                if index not in assigned_nowcasts and norm(feature["m"]) == norm(row["mandal"])
            ]
        if len(candidates) == 1:
            assigned_nowcasts[candidates[0]] = row
        else:
            cross_district_unresolved.append(row)
    for row in cross_district_unresolved:
        district = norm(row["district"])
        target = norm(row["mandal"]).replace(" ", "")
        candidates = [
            index for index, feature in enumerate(boundary_rows)
            if index not in assigned_nowcasts and norm(feature["d"]) == district
        ]
        if not candidates:
            candidates = [
                index for index, _feature in enumerate(boundary_rows)
                if index not in assigned_nowcasts
            ]
        scored = sorted(
            (
                difflib.SequenceMatcher(
                    None,
                    target,
                    norm(boundary_rows[index]["m"]).replace(" ", ""),
                ).ratio(),
                index,
            )
            for index in candidates
        )
        if not scored or scored[-1][0] < 0.86:
            scored = sorted(
                (
                    difflib.SequenceMatcher(
                        None,
                        target,
                        norm(feature["m"]).replace(" ", ""),
                    ).ratio(),
                    index,
                )
                for index, feature in enumerate(boundary_rows)
                if index not in assigned_nowcasts
            )
        if not scored or scored[-1][0] < 0.86:
            raise ValueError(
                "nowcast must map to one unused boundary: "
                f"{row['district']}|{row['mandal']} (best={scored[-1] if scored else None})"
            )
        assigned_nowcasts[scored[-1][1]] = row
    district_signals = {norm(row["d"]): row for row in district_geometry["districts"]}
    climate = {}
    for key, value in heat["values"].items():
        district, mandal = key.split("|", 1)
        identity = (identity_norm(district), identity_norm(mandal))
        if identity in climate:
            raise ValueError(f"duplicate district-plus-mandal climate identity: {key}")
        climate[identity] = value
    extraction = {}
    with open(paths["extractionCategories"]) as handle:
        for row in csv.DictReader(handle):
            identity = (identity_norm(row["district"]), identity_norm(row["mandal"]))
            if identity in extraction:
                raise ValueError(f"duplicate district-plus-mandal extraction identity: {identity}")
            extraction[identity] = row["category"]

    input_hashes = {name: sha256(path) for name, path in paths.items()}
    records = []
    observation_series = {}
    diagnostics = {
        "joinIdentity": "normalized district plus normalized mandal",
        "climateNameOnlyJoinAllowed": False,
        "modelledMatches": 0,
        "measuredOnlyMatches": 0,
        "boundaryOnlyMatches": 0,
        "climateMatches": 0,
        "graceDistrictMatches": 0,
        "extractionMatches": 0,
        "unmatchedNowcastIdentities": [],
    }
    used_nowcasts = set()
    modelled_reconciled_names = {
        norm2(boundary_rows[index]["m"]) for index in assigned_nowcasts
    } | {
        norm2(row["mandal"]) for row in assigned_nowcasts.values()
    }

    for boundary_index, feature in enumerate(boundary_rows):
        district_name = str(feature["d"]).upper()
        mandal_name = str(feature["m"]).upper()
        district_key = norm(district_name)
        identity = (district_key, norm(mandal_name))
        reconciled_identity = (district_key, norm2(mandal_name))
        # Prototype geometry contains repeated district/mandal labels. Include
        # the versioned feature ordinal so temporary IDs remain unique and
        # reproducible for this geometry version.
        feature_ordinal = f"{boundary_index + 1:03d}"
        mandal_id = f"ap-temp-mandal-{slug(district_name, mandal_name)}-{feature_ordinal}"
        district_id = f"ap-temp-district-{slug(district_name)}"
        boundary_id = f"ap-prototype-boundary-{slug(district_name, mandal_name)}-{feature_ordinal}"

        nowcast_source = assigned_nowcasts.get(boundary_index)
        reconcile = False
        history_rows = exact_history.get(identity, [])
        if nowcast_source is not None:
            coverage = "modelled"
            history_rows = exact_history.get(
                (norm(nowcast_source["district"]), nowcast_source["mkey"]),
                [],
            )
            used_nowcasts.add(boundary_index)
            diagnostics["modelledMatches"] += 1
            join_method = "district_and_mandal"
        else:
            history_rows = (
                []
                if norm2(mandal_name) in modelled_reconciled_names
                else reconciled_history.get(reconciled_identity, [])
            )
            reconcile = bool(history_rows)
            series_candidate = aggregate_history(history_rows, reconcile=True)
            if len(series_candidate) >= 6:
                coverage = "measured_only"
                diagnostics["measuredOnlyMatches"] += 1
                join_method = "district_and_reconciled_mandal"
            else:
                history_rows = []
                coverage = "boundary_only"
                diagnostics["boundaryOnlyMatches"] += 1
                join_method = "boundary_only"

        series = aggregate_history(history_rows, reconcile=reconcile)
        source_ids = sorted({
            source_id
            for row in history_rows
            for source_id in ([row["sourceSeriesId"]] if "sourceSeriesId" in row else row["sourceSeriesIds"])
        })
        observation = None
        if series:
            observation = {
                "latestMeasuredValue": round(float(series[-1]["value"]), 2),
                "unit": "m_bgl",
                "observationPeriod": series[-1]["period"],
                "aggregationMethod": (
                    "monthly_mean_of_reconciled_source_series"
                    if reconcile
                    else "monthly_mandal_source_series"
                ),
                "observationRecordCount": len(history_rows),
                "uniqueObservationMonthCount": len({row["period"] for row in series}),
                "physicalStationCount": None,
                "sourceStatus": "session_sample",
                "authorizationStatus": "pending",
                "validityPeriod": {"start": series[0]["period"], "end": series[-1]["period"]},
                "fetchDate": None,
            }
            observation_series[mandal_id] = {
                "mandalId": mandal_id,
                "unit": "m_bgl",
                "aggregationMethod": observation["aggregationMethod"],
                "observations": [
                    {"period": row["period"], "value": row["value"]}
                    for row in series
                ],
            }

        nowcast = None
        if nowcast_source is not None:
            lower, upper = sorted([
                float(nowcast_source["band_p10"]),
                float(nowcast_source["band_p90"]),
            ])
            nowcast = {
                "value": round(float(nowcast_source["estimate_mbgl"]), 2),
                "unit": "m_bgl",
                "targetPeriod": nowcast_source["as_of"],
                "modelVersion": nowcast_bundle["modelVersion"],
                "lower": round(lower, 2),
                "upper": round(upper, 2),
                "intervalType": "model_quantile_p10_p90",
                "eligibleEvaluationCohort": evaluations["temporalNowcast"]["eligibleCohort"],
                "qualityStatus": "eligible",
            }

        district_context = district_signals.get(district_key, {})
        climate_identity = (identity_norm(district_name), identity_norm(mandal_name))
        climate_context = climate.get(climate_identity)
        if climate_context is None:
            # Reconciled city/split records use district plus reconciled mandal only.
            matches = [
                value for (dkey, mkey), value in climate.items()
                if norm(dkey) == district_key and norm2(mkey) == reconciled_identity[1]
            ]
            climate_context = matches[0] if len(matches) == 1 else None
        if climate_context:
            diagnostics["climateMatches"] += 1
        if district_context.get("gw_percentile") is not None:
            diagnostics["graceDistrictMatches"] += 1
        extraction_category = extraction.get(climate_identity)
        if extraction_category is not None:
            diagnostics["extractionMatches"] += 1

        rainfall = climate_context.get("rainfall_mm") if climate_context else None
        balance = climate_context.get("water_balance_mm") if climate_context else None
        balance_status = climate_context.get("water_balance_status") if climate_context else None
        balance_category = (
            "positive" if balance_status == "Surplus"
            else "negative" if balance_status == "Deficit"
            else "neutral" if balance is not None
            else "unknown"
        )
        trend = (
            nowcast_source.get("trend_m_per_yr")
            if nowcast_source is not None
            else trend_from_series(series)
        )
        declining = trend is not None and trend > 0.3
        if declining and balance_category == "positive":
            agreement = "declining_despite_positive_climate_balance"
        elif declining and balance_category in {"negative", "neutral"}:
            agreement = "declining_without_positive_climate_balance"
        elif trend is not None:
            agreement = "stable_or_recovering"
        else:
            agreement = "unknown"

        basis_value = nowcast["value"] if nowcast else (
            observation["latestMeasuredValue"] if observation else None
        )
        if basis_value is None:
            monitoring = "insufficient_data"
        elif coverage == "measured_only":
            monitoring = "verify"
        elif basis_value >= 20 or (trend is not None and trend > 1.2):
            monitoring = "stress"
        elif basis_value >= 10 or (trend is not None and trend > 0.3):
            monitoring = "watch"
        else:
            monitoring = "stable"

        missing_features = []
        if observation is None: missing_features.append("groundwater_observation")
        if nowcast is None: missing_features.append("modelled_nowcast")
        if rainfall is None: missing_features.append("rainfall_context")
        if balance is None: missing_features.append("climate_balance_context")
        if district_context.get("gw_percentile") is None: missing_features.append("grace_da_context")
        if extraction_category is None: missing_features.append("extraction_category")
        interval_width = round(nowcast["upper"] - nowcast["lower"], 2) if nowcast else None
        if coverage == "modelled" and len(missing_features) == 0:
            completeness = "complete"
        elif observation is None and nowcast is None:
            completeness = "groundwater_missing"
        else:
            completeness = "partial"
        if coverage != "modelled":
            confidence_class = "not_assessed"
        elif observation["uniqueObservationMonthCount"] >= 120 and (interval_width or 99) <= 4:
            confidence_class = "high"
        elif observation["uniqueObservationMonthCount"] >= 24 and (interval_width or 99) <= 8:
            confidence_class = "moderate"
        else:
            confidence_class = "limited"

        record = {
            "contractVersion": CONTRACT_VERSION,
            "identity": {
                "mandalId": mandal_id,
                "mandalName": mandal_name,
                "districtId": district_id,
                "districtName": district_name,
                "boundaryId": boundary_id,
                "boundarySource": geometry["boundary_source"],
                "boundaryStatus": "official" if geometry["official_flag"] else "prototype",
                "identifierStatus": "temporary",
                "coverageStatus": coverage,
                "coverageReason": (
                    None if coverage == "modelled"
                    else "Measured history is available but no eligible V2 nowcast exists."
                    if coverage == "measured_only"
                    else "Prototype boundary is loaded; no reconciled groundwater history or nowcast is available."
                ),
                "joinedSourceSeriesIds": source_ids,
                "joinMethod": join_method,
            },
            "observation": observation,
            "nowcast": nowcast,
            "forecast": None,
            "signals": {
                "graceDa": {
                    "groundwaterPercentile": district_context.get("gw_percentile"),
                    "rootZonePercentile": district_context.get("rootzone_percentile"),
                    "surfacePercentile": district_context.get("surface_percentile"),
                    "validPeriod": None,
                    "fetchDate": grace_provenance.get("fetch_date"),
                    "spatialLevel": "district_regional_model_assimilated_context",
                },
                "rainfall": {
                    "amountMm": rainfall,
                    "anomalyPct": None,
                    "validPeriod": heat.get("rainfall_period"),
                    "source": "CHIRPS",
                },
                "evapotranspiration": {
                    "amountMm": district_context.get("annual_et_mm"),
                    "anomalyPct": None,
                    "validPeriod": heat.get("balance_year"),
                    "source": "TerraClimate actual evapotranspiration",
                },
                "climateBalance": {
                    "amountMm": balance,
                    "validPeriod": heat.get("balance_year"),
                    "label": "rainfall_minus_actual_et",
                    "category": balance_category,
                },
                "extractionCategory": extraction_category,
            },
            "quality": {
                "observationHistoryMonths": observation["uniqueObservationMonthCount"] if observation else 0,
                "missingFeatures": missing_features,
                "intervalWidthM": interval_width,
                "terrainCohort": nowcast_source.get("aquifer") if nowcast_source else None,
                "evaluationCohort": (
                    "rolling_temporal_holdout_eligible"
                    if coverage == "modelled"
                    else "measured_only_not_evaluated"
                    if coverage == "measured_only"
                    else "not_evaluated"
                ),
                "dataCompleteness": completeness,
                "confidenceClass": confidence_class,
                "confidenceMethod": (
                    "qualitative history-length and quantile-width class; not forecast accuracy"
                    if coverage == "modelled"
                    else "not assessed without a modelled nowcast"
                ),
            },
            "assessment": {
                "monitoringStatus": monitoring,
                "measuredTrendMPerYear": trend,
                "contextAgreement": agreement,
            },
            "provenance": {
                "sourceNames": [
                    "APWRIMS-format groundwater history",
                    "NASA/NDMC GRACE-DA",
                    "CHIRPS",
                    "TerraClimate",
                    "CGWB Dynamic Ground Water Resources Assessment 2024",
                ],
                "sourceFilesOrUris": list(paths.values()),
                "authorizationStatus": "APWRIMS-format browser-session sample; authorization pending",
                "generatedAt": generated_at,
                "inputHashes": input_hashes,
                "modelVersion": nowcast_bundle["modelVersion"] if nowcast else None,
                "dataContractVersion": CONTRACT_VERSION,
                "geometryVersion": GEOMETRY_VERSION,
                "builderScriptVersion": BUILDER_VERSION,
            },
        }
        records.append(record)

    diagnostics["unmatchedNowcastIdentities"] = sorted(
        f"{row['district']}|{row['mandal']}"
        for index, row in assigned_nowcasts.items()
        if index not in used_nowcasts
    )
    if diagnostics["unmatchedNowcastIdentities"]:
        raise ValueError(
            "nowcast identities did not reconcile to prototype boundaries: "
            f"{diagnostics['unmatchedNowcastIdentities'][:10]}"
        )
    return {
        "records": records,
        "series": observation_series,
        "diagnostics": diagnostics,
        "rawSeriesCount": len(raw_series),
        "observationRowCount": observation_rows,
        "validObservationRowCount": valid_observation_rows,
        "paths": paths,
        "inputHashes": input_hashes,
        "geometry": geometry,
        "heat": heat,
        "districtGeometry": district_geometry,
        "graceProvenance": grace_provenance,
        "nowcastBundle": nowcast_bundle,
        "evaluations": evaluations,
    }


def build_model_card(context, generated_at):
    evaluations = context["evaluations"]
    temporal = evaluations["temporalNowcast"]
    spatial = evaluations["spatialEstimation"]
    direct = evaluations["directForecast"]
    cross = evaluations["crossNetworkComparison"]
    return {
        "schemaVersion": "1.0.0",
        "modelName": "AP Mandal Groundwater Temporal Nowcast",
        "modelVersion": context["nowcastBundle"]["modelVersion"],
        "buildTimestamp": context["nowcastBundle"]["generatedAt"],
        "trainingPeriod": context["nowcastBundle"]["trainingPeriod"],
        "targetVariable": "groundwater depth below ground level",
        "unit": "m_bgl",
        "supportedUseCases": [
            "Current-period temporal nowcast or gap fill for lag-eligible mandals",
            "Monitoring prioritization with explicit measured/modelled separation",
            "Regional climate and GRACE-DA context review",
        ],
        "unsupportedUseCases": [
            "Official groundwater measurement",
            "Sensorless statewide accuracy inferred from temporal holdout metrics",
            "Permit, pumping restriction or field-order automation",
            "Direct recharge measurement from rainfall minus evapotranspiration",
            "Released future forecasting at any horizon",
        ],
        "evaluations": {
            "temporalNowcast": temporal,
            "spatialEstimation": spatial,
            "directForecast": direct,
            "crossNetworkComparison": cross,
            "intervalEvaluation": evaluations["intervalEvaluation"],
        },
        "forecastRelease": {
            "releasedHorizons": [],
            "status": "not_released",
            "gate": direct["releaseGate"],
            "reason": "No horizon has completed and passed the required rolling-origin release gate.",
        },
        "cohortDefinitions": {
            "temporalNowcast": temporal["eligibleCohort"],
            "spatialEstimation": "Entire mandals held out from training under GroupKFold.",
            "crossNetwork": cross["comparison"],
        },
        "knownLimitations": [
            "APWRIMS-format source remains a browser-session research sample with authorization pending.",
            "Prototype boundaries and identifiers are not official administrative identifiers.",
            "Physical station counts cannot be verified from the source schema.",
            "GRACE-DA is coarse regional model-assimilated storage context, not direct mandal depth.",
            "Cross-network comparison pairs different sites and potentially different aquifers.",
            "Model quantile ranges are not guaranteed confidence intervals.",
        ],
        "disclosures": {
            "measured": "APWRIMS-format observations are the measured historical source.",
            "nowcast": "Latest modelled values are temporal nowcasts for eligible mandals, not measurements.",
            "spatial": "Whole-mandal spatial estimation has materially different error from temporal nowcasting.",
            "graceDa": "GRACE-DA contributes regional model-assimilated wetness context and is not a direct mandal-level groundwater-depth measurement.",
            "climateBalance": "Rainfall minus actual evapotranspiration is a climatic water-balance indicator, not direct measured recharge.",
            "crossNetwork": "CGWB/APWRIMS results are a cross-network comparability diagnostic with site, aquifer, timing and aggregation limitations.",
            "officialUse": "Prototype results do not replace official field measurements or APWRIMS outputs.",
        },
        "dataAuthorizationStatus": "pending for APWRIMS-format browser-session research sample",
        "boundaryStatus": "public prototype; temporary identifiers",
        "sourceScripts": {
            "nowcast": "phase3_levels/build_levels_engine.py",
            "spatial": "phase3_levels/train_spatial.py",
            "directForecast": "phase3_levels/train_multihorizon.py",
            "crossNetwork": "phase3_levels/cross_validate_cgwb.py",
            "publisher": "phase3_levels/build_phase0_foundation.py",
        },
        "inputHashes": context["inputHashes"],
        "generatedAt": generated_at,
    }


def build_manifest(context, generated_at, active_paths):
    records = context["records"]
    coverage = defaultdict(int)
    for record in records:
        coverage[record["identity"]["coverageStatus"]] += 1
    latest_targets = [
        record["nowcast"]["targetPeriod"] for record in records if record["nowcast"]
    ]
    observation_periods = [
        record["observation"]["observationPeriod"] for record in records if record["observation"]
    ]
    active = []
    for path in active_paths:
        active.append({
            "file": os.path.relpath(path, os.path.join(HERE, "..")),
            "status": "active",
            "schemaVersion": CONTRACT_VERSION if "v2" in os.path.basename(path) else "1.0.0",
            "bytes": os.path.getsize(path),
            "sha256": sha256(path),
        })
    legacy_files = [
        os.path.join(APP, "mandal_dataset.json"),
        os.path.join(APP, "mandal_depth_series.json"),
        os.path.join(APP, "mandal_levels_estimated.json"),
        os.path.join(OUT, "mandal_levels_estimated.json"),
        os.path.join(OUT, "mandal_levels_current.json"),
    ]
    legacy = []
    for path in legacy_files:
        legacy.append({
            "file": os.path.relpath(path, os.path.join(HERE, "..")),
            "status": "legacy_inactive",
            "exists": os.path.exists(path),
            "sha256": sha256(path) if os.path.exists(path) else None,
        })
    extraction_coverage = sum(
        record["signals"]["extractionCategory"] is not None for record in records
    )
    # Backward-compatible app-local hash inventory used by the existing audit
    # suite. Lifecycle authority remains artifacts.active / artifacts.legacy.
    files = [
        {
            "file": os.path.basename(path),
            "bytes": os.path.getsize(path),
            "sha256": sha256(path),
        }
        for path in active_paths
        if os.path.dirname(os.path.abspath(path)) == os.path.abspath(APP)
    ]
    return {
        "manifestVersion": "2.0.0",
        "dataContractVersion": CONTRACT_VERSION,
        "generatedAt": generated_at,
        "generator": "phase3_levels/build_phase0_foundation.py",
        "generatorVersion": BUILDER_VERSION,
        "officialAdministrativeUnitCount": None,
        "counts": {
            "boundaryFeatureCount": len(records),
            "rawSourceSeriesCount": context["rawSeriesCount"],
            "observationRowCount": context["observationRowCount"],
            "validObservationRowCount": context["validObservationRowCount"],
            "historySeriesCount": sum(record["observation"] is not None for record in records),
            "modelledRecordCount": coverage["modelled"],
            "measuredOnlyCount": coverage["measured_only"],
            "boundaryOnlyCount": coverage["boundary_only"],
            "noDataCount": coverage["no_data"],
            "excludedCount": coverage["excluded"],
            "missingGroundwaterValueCount": sum(
                record["observation"] is None and record["nowcast"] is None for record in records
            ),
            "districtCount": len({record["identity"]["districtId"] for record in records}),
            "rainfallContextCoverage": sum(
                record["signals"]["rainfall"]["amountMm"] is not None for record in records
            ),
            "climateBalanceCoverage": sum(
                record["signals"]["climateBalance"]["amountMm"] is not None for record in records
            ),
            "graceDistrictContextCoverage": sum(
                record["signals"]["graceDa"]["groundwaterPercentile"] is not None for record in records
            ),
            "extractionCategoryCoverage": extraction_coverage,
        },
        "periods": {
            "latestObservationPeriod": max(observation_periods) if observation_periods else None,
            "modelTargetPeriodRange": {
                "start": min(latest_targets) if latest_targets else None,
                "end": max(latest_targets) if latest_targets else None,
                "latestTargetCount": (
                    latest_targets.count(max(latest_targets)) if latest_targets else 0
                ),
            },
            "graceValidPeriod": None,
            "graceFetchDate": context["graceProvenance"].get("fetch_date"),
            "rainfallValidPeriod": context["heat"].get("rainfall_period"),
            "etValidPeriod": context["heat"].get("balance_year"),
            "modelBuildTimestamp": context["nowcastBundle"]["generatedAt"],
            "uiGenerationTimestamp": generated_at,
        },
        "joinDiagnostics": context["diagnostics"],
        "refreshStatus": {
            "apwrims": {"status": "retained_local_input", "fetchDate": None},
            "graceDa": {
                "status": "refreshed",
                "fetchDate": context["graceProvenance"].get("fetch_date"),
            },
            "rainfall": {"status": "retained_local_input", "fetchDate": None},
            "evapotranspiration": {"status": "retained_local_input", "fetchDate": None},
        },
        "inputHashes": context["inputHashes"],
        "files": files,
        "artifacts": {"active": active, "legacy": legacy},
        "caveat": "Prototype modelled nowcasts and contextual signals; not official APWRIMS results.",
    }


def main():
    generated_at = utc_now()
    context = build_records(generated_at)
    records_path = os.path.join(APP, "mandal_groundwater_records_v2.json")
    series_path = os.path.join(APP, "mandal_observation_series_v2.json")
    model_card_path = os.path.join(APP, "model_card.json")
    manifest_path = os.path.join(APP, "dataset_manifest.json")

    write_json(records_path, {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": generated_at,
        "records": context["records"],
        "joinDiagnostics": context["diagnostics"],
    })
    write_json(series_path, {
        "contractVersion": CONTRACT_VERSION,
        "generatedAt": generated_at,
        "unit": "m_bgl",
        "series": context["series"],
    })
    write_json(model_card_path, build_model_card(context, generated_at))
    active_paths = [
        records_path,
        series_path,
        model_card_path,
        context["paths"]["geometry"],
        context["paths"]["districtSignals"],
        context["paths"]["climateContext"],
        context["paths"]["graceProvenance"],
        os.path.join(APP, "dashboard_summary.json"),
        os.path.join(APP, "source_readiness.json"),
        os.path.join(APP, "satellite_station_samples.json"),
        context["paths"]["nowcasts"],
        context["paths"]["evaluations"],
    ]
    write_json(manifest_path, build_manifest(context, generated_at, active_paths))
    print(
        "published Phase 0 V2: "
        f"{len(context['records'])} boundaries, "
        f"{context['diagnostics']['modelledMatches']} modelled, "
        f"{context['diagnostics']['measuredOnlyMatches']} measured-only, "
        f"{context['diagnostics']['boundaryOnlyMatches']} boundary-only"
    )


if __name__ == "__main__":
    main()
