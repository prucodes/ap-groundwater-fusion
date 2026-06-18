"""Replace the 10-mandal SEED with the REAL all-mandal dataset across the app.

Generates app/data/mandal_dataset.json (one record per estimated mandal, conforming
to the existing MandalFusionSeed schema so the old screens work unchanged) using only
REAL data: APWRIMS depth history + the validated levels engine + CHIRPS/TerraClimate
context. Also refreshes dashboard_summary.json aggregates with honest source labels.

Every record stays labelled modelled / not-official (official_result=false).
"""
import csv, json, os, re, datetime, statistics as st
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..", "app", "data")

NEW_NOTICE = ("Prototype using real APWRIMS mandal groundwater readings (2014-2026) "
              "calibrated with NASA satellite signals. Estimates are modelled with "
              "confidence bands and are not official APWRIMS results.")


def norm(s):
    s = str(s).upper().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", s)
    s = s.replace(".", " ").replace("-", " ").replace("&", " AND ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm2(s):
    """Stronger norm: also collapses Urban/Rural/East/West/North/South city splits
    so APWRIMS split series join to the single map polygon (e.g. Anantapur_Urban -> ANANTAPUR)."""
    s = str(s).upper().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = s.replace("_", " ").replace(".", " ").replace("-", " ").replace("&", " AND ")
    s = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN|EAST|WEST|NORTH|SOUTH)\b", " ", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def slug(d, m):
    return re.sub(r"[^a-z0-9]+", "-", f"{d} {m}".lower()).strip("-")


def main():
    est = json.load(open(os.path.join(HERE, "outputs", "mandal_levels_estimated.json")))["mandals"]
    dgeo = {d["d"].upper(): d for d in json.load(open(os.path.join(APP, "ap_district_geometry.json")))["districts"]}
    heat = json.load(open(os.path.join(APP, "ap_mandal_heat.json")))["values"]
    heat_by = {}
    for k, v in heat.items():
        heat_by[norm(k.split("|", 1)[1])] = v

    # APWRIMS per-mandal history -> count, median/avg, current-vs-own-history percentile
    hist = defaultdict(list)
    hist2 = defaultdict(list)  # keyed by norm2 — merges urban/rural/directional splits
    for r in csv.DictReader(open(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))):
        try:
            lvl = float(r["level_mbgl"])
        except ValueError:
            continue
        if 0 < lvl < 60:
            hist[norm(r["mandal"])].append((r["date"], lvl))
            hist2[norm2(r["mandal"])].append((r["date"], lvl))

    records = []
    for e in est:
        mk = e["mkey"]
        ser = sorted(hist.get(mk, []))
        levels = [l for _, l in ser]
        sensor_count = len(levels)
        latest = ser[-1][0] if ser else e["as_of"]
        median_mbgl = round(st.median(levels), 2) if levels else None
        avg_mbgl = round(st.mean(levels), 2) if levels else None
        obs = e["observed_mbgl"]
        # wetness percentile: % of history DEEPER than now (shallow now -> high pct -> wet)
        gw_pctl = round(100 * sum(1 for l in levels if l >= obs) / len(levels), 1) if levels else None

        du = e["district"].upper()
        dd = dgeo.get(du, {})
        grace = dd.get("gw_percentile")           # satellite (GRACE-DA), district
        rootzone = dd.get("rootzone_percentile")
        surface = dd.get("surface_percentile")
        et = dd.get("annual_et_mm")

        hv = heat_by.get(mk, {})
        rainfall = hv.get("rainfall_mm")
        wbal = hv.get("water_balance_mm")
        wbal_status = hv.get("water_balance_status") or ""

        trend = e["trend_m_per_yr"] or 0.0
        band_w = round(e["band_p90"] - e["band_p10"], 2)
        est_mbgl = e["estimate_mbgl"]

        # Bad-sensor / verify signal: latest reading vs independent model estimate.
        obs_model_gap = round(abs(obs - est_mbgl), 2) if (obs is not None and est_mbgl is not None) else None

        # Next-month projection from the model's own trend (m/yr -> m/month).
        # Positive trend = water table deepening (worse). Honest linear nowcast.
        forecast_next_month_mbgl = round(est_mbgl + trend / 12.0, 2) if est_mbgl is not None else None

        # Sensor-as-truth: show the measured reading where we have one; model only fills.
        if obs is not None:
            display_mbgl, display_basis = round(obs, 2), "measured"
        else:
            display_mbgl, display_basis = est_mbgl, "modelled"

        # Recharge-vs-decline signal (the meaningful fusion insight, not a scary mismatch):
        # is the water table falling DESPITE a healthy water balance (-> pumping-pressure
        # hypothesis), falling WITH a rainfall deficit (-> climate-stress hypothesis),
        # or stable/recovering? These are hypotheses to verify, not attributions.
        declining = trend > 0.3                      # water table deepening, m/yr
        recharge_ok = wbal_status == "Surplus"       # real per-mandal recharge (TerraClimate)
        if declining and recharge_ok:
            agreement = "over_extraction"            # falls despite recharge — human draft
        elif declining:
            agreement = "drought_decline"            # falls with deficit — consistent
        else:
            agreement = "stable_or_recovering"

        # confidence from data coverage + band width
        coverage = min(sensor_count / 144.0, 1.0)
        conf = round(0.55 * coverage + 0.45 * (1 - min(band_w / 8.0, 1.0)), 2)
        conf_label = "High" if conf >= 0.75 else "Moderate" if conf >= 0.5 else "Low"

        # status — groundwater STRESS triage for governance (depth + decline)
        deep, fast = est_mbgl >= 20, trend > 1.2
        if sensor_count < 18 or band_w > 8:
            bucket, status = "Low Confidence", "Low Confidence — sparse history"
            action = "Collect more readings before acting."
        elif obs_model_gap is not None and obs_model_gap >= 8:
            bucket, status = "Verify", "Verify — sensor diverges from model"
            action = (f"Field-verify: latest sensor reading ({round(obs,1)} m) diverges sharply from the "
                      f"model estimate ({est_mbgl} m, gap {obs_model_gap} m) — check the sensor before acting.")
        elif deep or fast or (est_mbgl >= 12 and trend > 0.5):
            bucket = "Stress"
            if agreement == "over_extraction":
                status = "Stress — pumping-pressure (verify)"
                action = "Pumping-pressure hypothesis: water table deep & falling despite a healthy water balance — verify extraction in the field before demand-management action."
            else:
                status = "Stress — deep / declining"
                action = "Conserve — restrict new draw; water table deep or fast-falling."
        elif trend > 0.3 or wbal_status == "Deficit" or est_mbgl >= 10:
            bucket, status = "Watch", "Watch — monitor"
            action = ("Monitor — falling despite a healthy water balance (possible early extraction pressure — verify)."
                      if agreement == "over_extraction"
                      else "Monitor — moderate decline, rainfall deficit, or deepening water table.")
        else:
            bucket, status = "Normal", "Stable"
            action = "Stable — routine monitoring."

        records.append({
            "id": slug(e["district"], e["mandal"]),
            "rank": 0,
            "mandal_name": e["mandal"].upper(),
            "district_name": du,
            "sensor_count": sensor_count,
            "latest_sensor_date": latest,
            "median_groundwater_mbgl": median_mbgl,
            "avg_groundwater_mbgl": avg_mbgl,
            "estimate_mbgl": est_mbgl,
            "estimate_band_p10": e["band_p10"],
            "estimate_band_p90": e["band_p90"],
            "forecast_next_month_mbgl": forecast_next_month_mbgl,
            "obs_model_gap_m": obs_model_gap,
            "display_mbgl": display_mbgl,
            "display_basis": display_basis,
            "trend_m_per_yr": e["trend_m_per_yr"],
            # NASA GRACE-DA district storage percentile (the satellite signal the UI labels NASA).
            "groundwater_percentile": grace,
            # Mandal-vs-own-history wetness percentile (measured, NOT NASA) — kept distinct.
            "measured_wetness_percentile": gw_pctl,
            "rootzone_percentile": rootzone,
            "surface_percentile": surface,
            "rainfall_mm": rainfall,
            "annual_et_mm": et,
            "water_balance_mm": wbal,
            "water_balance_status": wbal_status,
            "sensor_satellite_agreement": agreement,
            "confidence_score": conf,
            "confidence_label": conf_label,
            "status": status,
            "status_bucket": bucket,
            "recommended_action": action,
            "data_quality_notes": f"{sensor_count} months of APWRIMS readings to {latest}; model band ±{round(band_w/2,1)} m.",
            "boundary_source": "public_prototype",
            "boundary_official_flag": False,
            "measured_input_label": "APWRIMS mandal groundwater series",
            "measured_input_source": "APWRIMS (AP-GWD)",
            "satellite_input_label": "NASA GRACE-DA percentile",
            "rainfall_input_label": "CHIRPS / NASA POWER rainfall (mm)",
            "water_balance_input_label": "TerraClimate (ET vs rainfall)",
            "official_result": False,
            "aware_apwrims_action_preview": {
                "district_name": du, "mandal_name": e["mandal"].upper(),
                "status": status, "confidence_label": conf_label,
                "recommended_action": action,
                "source_caveat": "Modelled estimate calibrated to APWRIMS — not an official APWRIMS result.",
            },
        })

    # ---- second pass: attach REAL sensor series to blank city polygons ----
    # APWRIMS splits some cities (Urban/Rural, East/West, North/South) under names that
    # don't join to the single map polygon. Aggregate those series and show them as
    # measured-only records (real readings; not yet modelled, so no model band/QC gap).
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))["mandals"]
    covered = {norm2(r["mandal_name"]) for r in records}
    added = set()
    added_measured = 0
    for g in geo:
        key = norm2(g["m"])
        if not key or key in covered or key in added:
            continue
        # Collapse split series to ONE reading per month (mean of Urban+Rural etc.),
        # else interleaving two series fakes a zig-zag trend.
        by_month = defaultdict(list)
        for d, l in hist2.get(key, []):
            by_month[d].append(l)
        ser = sorted((d, round(sum(v) / len(v), 3)) for d, v in by_month.items())
        if len(ser) < 6:
            continue
        levels = [l for _, l in ser]
        latest_date = ser[-1][0]
        latest = round(ser[-1][1], 2)
        # Robust YoY: median of recent 6 months vs the 6-month window a year earlier
        # (resistant to months where only one split reported). Clamped to a sane band.
        if len(ser) >= 18:
            recent = st.median(l for _, l in ser[-6:])
            prior = st.median(l for _, l in ser[-18:-12])
            trend = round(max(-3.0, min(3.0, recent - prior)), 2)
        else:
            trend = 0.0
        est_mbgl = latest
        deep, fast = est_mbgl >= 20, trend > 1.2
        if len(ser) < 18:
            bucket, status = "Low Confidence", "Low Confidence — sparse history"
            action = "Collect more readings before acting."
        elif deep or fast or (est_mbgl >= 12 and trend > 0.5):
            bucket, status = "Stress", "Stress — deep / declining"
            action = "Conserve — restrict new draw; water table deep or fast-falling."
        elif trend > 0.3 or est_mbgl >= 10:
            bucket, status = "Watch", "Watch — monitor"
            action = "Monitor — moderate decline or deepening water table."
        else:
            bucket, status = "Normal", "Stable"
            action = "Stable — routine monitoring."
        du = g["d"].upper()
        dd = dgeo.get(du, {})
        hv = heat_by.get(key, {})
        conf = round(0.6 * min(len(ser) / 144.0, 1.0), 2)  # measured-only: capped, no model band
        conf_label = "Moderate" if conf >= 0.5 else "Low"
        records.append({
            "id": slug(g["d"], g["m"]),
            "rank": 0,
            "mandal_name": g["m"].upper(),
            "district_name": du,
            "sensor_count": len(ser),
            "latest_sensor_date": latest_date,
            "median_groundwater_mbgl": round(st.median(levels), 2),
            "avg_groundwater_mbgl": round(st.mean(levels), 2),
            "estimate_mbgl": est_mbgl,
            "estimate_band_p10": None,
            "estimate_band_p90": None,
            "forecast_next_month_mbgl": round(est_mbgl + trend / 12.0, 2),
            "obs_model_gap_m": None,
            "display_mbgl": latest,
            "display_basis": "measured",
            "trend_m_per_yr": trend,
            "groundwater_percentile": dd.get("gw_percentile"),
            "measured_wetness_percentile": None,
            "rootzone_percentile": dd.get("rootzone_percentile"),
            "surface_percentile": dd.get("surface_percentile"),
            "rainfall_mm": hv.get("rainfall_mm"),
            "annual_et_mm": dd.get("annual_et_mm"),
            "water_balance_mm": hv.get("water_balance_mm"),
            "water_balance_status": hv.get("water_balance_status") or "",
            "sensor_satellite_agreement": "drought_decline" if trend > 0.3 else "stable_or_recovering",
            "confidence_score": conf,
            "confidence_label": conf_label,
            "status": status,
            "status_bucket": bucket,
            "recommended_action": action,
            "data_quality_notes": f"{len(ser)} months of APWRIMS readings to {latest_date}; measured-only (urban/rural split reconciled, not yet modelled).",
            "boundary_source": "public_prototype",
            "boundary_official_flag": False,
            "measured_input_label": "APWRIMS mandal groundwater series",
            "measured_input_source": "APWRIMS (AP-GWD)",
            "satellite_input_label": "NASA GRACE-DA percentile",
            "rainfall_input_label": "CHIRPS / NASA POWER rainfall (mm)",
            "water_balance_input_label": "TerraClimate (ET vs rainfall)",
            "official_result": False,
            "aware_apwrims_action_preview": {
                "district_name": du, "mandal_name": g["m"].upper(),
                "status": status, "confidence_label": conf_label,
                "recommended_action": action,
                "source_caveat": "Measured APWRIMS readings — not modelled, not an official APWRIMS result.",
            },
        })
        added.add(key)
        added_measured += 1
    print(f"  + {added_measured} measured-only mandals reconciled from split sensor series")

    # rank: most-actionable first (Verify/Stress/Watch), then deepest estimate
    sev = {"Verify": 0, "Stress": 1, "Watch": 2, "Low Confidence": 3, "Normal": 4}
    records.sort(key=lambda r: (sev.get(r["status_bucket"], 9), -r["estimate_mbgl"]))
    for i, r in enumerate(records, 1):
        r["rank"] = i

    out = os.path.join(APP, "mandal_dataset.json")
    json.dump(records, open(out, "w"))
    print(f"  wrote {len(records)} real mandal records -> {out}")

    # ---- refresh dashboard_summary aggregates (honest) ----
    sp = os.path.join(APP, "dashboard_summary.json")
    summ = json.load(open(sp))
    s = summ["summary"]
    def avg(key):
        vals = [r[key] for r in records if r.get(key) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None
    buckets = defaultdict(int)
    for r in records:
        buckets[r["status_bucket"]] += 1
    conf_dist = defaultdict(int)
    for r in records:
        lbl = r["confidence_label"]
        conf_dist["Verify" if r["status_bucket"] == "Verify" else "High" if lbl == "High" else "Medium" if lbl == "Moderate" else "Low"] += 1
    s["prototype_notice"] = NEW_NOTICE
    s["mandals_analyzed"] = len(records)
    s["mandals_needing_verification"] = buckets["Verify"]
    s["avg_groundwater_percentile"] = avg("groundwater_percentile")
    s["avg_rootzone_percentile"] = avg("rootzone_percentile")
    s["avg_surface_percentile"] = avg("surface_percentile")
    s["avg_rainfall_mm"] = avg("rainfall_mm")
    s["avg_water_balance_mm"] = avg("water_balance_mm")
    s["deficit_mandals"] = sum(1 for r in records if r["water_balance_status"] == "Deficit")
    s["overall_data_confidence"] = "Validated prototype (β)"
    s["sample_fetch_date"] = datetime.date.today().isoformat()
    s["status_distribution"] = {k: buckets.get(k, 0) for k in ["Normal", "Watch", "Stress", "Verify", "Low Confidence"]}
    s["confidence_distribution"] = {k: conf_dist.get(k, 0) for k in ["Verify", "Low", "Medium", "High"]}
    s["source_labels"]["measured_input_label"] = "APWRIMS (AP-GWD) mandal series 2014-2026"
    s["source_labels"]["not_official_results_caveat"] = NEW_NOTICE
    json.dump(summ, open(sp, "w"), indent=1)
    print(f"  refreshed dashboard_summary: {len(records)} mandals, "
          f"{buckets['Verify']} verify, {s['deficit_mandals']} deficit")

    write_manifest()


def write_manifest():
    """Provenance manifest: hash + size + generation time for every app data file,
    so any rendered number can be traced to a versioned, reproducible artifact."""
    import hashlib
    files = sorted(f for f in os.listdir(APP) if f.endswith(".json") and f != "dataset_manifest.json")
    entries = []
    for f in files:
        path = os.path.join(APP, f)
        blob = open(path, "rb").read()
        entries.append({
            "file": f,
            "bytes": len(blob),
            "sha256": hashlib.sha256(blob).hexdigest(),
        })
    manifest = {
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "generator": "phase3_levels/build_real_app_data.py",
        "source_inputs": [
            "phase3_levels/outputs/mandal_levels_estimated.json (APWRIMS-trained levels engine)",
            "phase3_levels/apwrims/apwrims_gw_history.csv (APWRIMS session sample, auth pending)",
            "app/data/ap_district_geometry.json (NASA GRACE-DA / TerraClimate district signals)",
            "app/data/ap_mandal_heat.json (CHIRPS rainfall / TerraClimate water balance)",
        ],
        "caveat": "Prototype — modelled estimates, not official APWRIMS results.",
        "files": entries,
    }
    json.dump(manifest, open(os.path.join(APP, "dataset_manifest.json"), "w"), indent=1)
    print(f"  wrote dataset_manifest.json ({len(entries)} files hashed)")


if __name__ == "__main__":
    main()
