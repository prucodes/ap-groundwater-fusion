#!/usr/bin/env python3
"""Historical well offsets and a prospective calibration check.

An offset is a well's deviation from contemporaneous, same-type peers in its
mandal. It is not a representative village depth. Split-half validation uses
calendar order. The original random calibration curve estimates a later mean;
the separate forward curve scores individual future offsets on one fixed cohort.
Both rely on observed peer levels and exclude mandal-nowcast error.

Raw CGWB well records are supplied with --src and are not committed. Regenerate
the full payload and browser summary together after any validation change.
"""
import argparse
import datetime
import difflib
import json
import os
import re
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import GroupKFold
from sklearn.metrics import mean_absolute_error, r2_score

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.join(ROOT, "app", "data")
OUT = os.path.join(APP, "village_offsets.json")
# The card on /districts needs a dozen figures, not 626 village rows. /districts is
# a client page, so importing the full file would ship the lot to every browser.
SUMMARY = os.path.join(APP, "village_offsets_summary.json")
DEFAULT_SRC = os.path.join(
    ROOT, "phase3_levels", "cgwb_sy",
    "Quality_controlled_groundwater_levels_over_India", "Output",
    "4_India_GWLs_2000_2024_after_3sigma.csv",
)

# A mandal-month needs this many wells before one well's distance from the others
# means anything. Below it the "mandal mean" is the well itself.
MIN_WELLS_IN_GROUP = 3
# Readings needed before a well's own offset is treated as pinned rather than guessed.
MIN_READINGS_FOR_OFFSET = 6
# Reading counts the dose-response is reported at. CGWB reads Jan/May/Aug/Nov, so
# four readings is about one year of quarterly measurement, eight about two.
DOSE_STEPS = (1, 2, 3, 4, 6, 8)
# Beyond this deviation from its mandal a village is called a place the mandal
# figure cannot stand in for.
PROXY_POOR_M = 2.0
# Worked examples stay inside this offset. Beyond it the well is reading a
# different aquifer from the mandal's dug wells, not a different position in it.
APPLIED_MAX_OFFSET_M = 10.0
APPLIED_PER_AQUIFER = 2
UNKNOWN_WELL_TYPES = {"-", "", "NAN", "nan", "None"}
SEED = 7


def norm(name):
    """Mandal names as they are compared across sources, matching train_spatial."""
    text = str(name).upper().strip()
    text = re.sub(r"\(.*?\)", " ", text)
    text = re.sub(r"\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b", " ", text)
    text = text.replace(".", " ").replace("-", " ").replace("&", " AND ")
    text = re.sub(r"[^A-Z0-9 ]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def load_records():
    with open(os.path.join(APP, "mandal_groundwater_records_v2.json"), encoding="utf-8") as handle:
        return json.load(handle)["records"]


def mandal_index(records):
    """normalised mandal name -> (mandalName, districtName, terrainCohort, nowcast)."""
    index = {}
    for record in records:
        identity = record["identity"]
        index.setdefault(norm(identity["mandalName"]), (
            identity["mandalName"],
            identity["districtName"],
            (record.get("quality") or {}).get("terrainCohort"),
            (record.get("nowcast") or {}).get("value"),
            (record.get("observation") or {}).get("latestMeasuredValue"),
        ))
    return index


def read_wells(src):
    frame = pd.read_csv(src, low_memory=False)
    frame = frame[frame["State"].astype(str).str.strip().str.lower() == "andhra pradesh"].copy()
    months = [c for c in frame.columns if len(c) == 6 and c[3] == "-"]
    keep = ["Station Code", "District", "Tehsil", "Village",
            "Latitude", "Longitude", "Type of Well", "Well Depth"]
    long = frame.melt(id_vars=keep, value_vars=months, var_name="month", value_name="mbgl")
    long["mbgl"] = pd.to_numeric(long["mbgl"], errors="coerce")
    long = long.dropna(subset=["mbgl"])
    long["tehsil"] = long["Tehsil"].astype(str).str.upper().str.strip()
    long["village"] = long["Village"].astype(str).str.upper().str.strip()
    long["well_type"] = long["Type of Well"].astype(str).str.strip()
    # Wells whose type the record leaves as "-" are dropped. The offset is only
    # meaningful against wells reading the same water, so a stratum of unknowns
    # is not one: on these 149 the learned offset came out worse than the mandal
    # mean it was meant to improve.
    long = long[~long["well_type"].isin(UNKNOWN_WELL_TYPES)].copy()
    return long, len(months)


def add_offsets(long):
    """Each reading's distance from the OTHER wells OF ITS OWN TYPE in its mandal.

    Leave-one-out, so a well is never compared against a mean containing itself,
    and stratified by well type because a bore tapping a deeper fractured zone is
    not measuring the same water as a dug well beside it. Mixing them puts the
    aquifer's depth into what is supposed to be the village's position: the AP
    set holds dug wells against piezometers 55 m deeper. Stratifying costs
    coverage, since a mandal-month now needs three wells of one type, and it is
    the comparison that can be defended.
    """
    group = long.groupby(["tehsil", "month", "well_type"])["mbgl"]
    long["peer_sum"] = group.transform("sum")
    long["peer_n"] = group.transform("size")
    long = long[long["peer_n"] >= MIN_WELLS_IN_GROUP].copy()
    long["peer_mean"] = (long["peer_sum"] - long["mbgl"]) / (long["peer_n"] - 1)
    long["offset"] = long["mbgl"] - long["peer_mean"]
    return long


def persistence(long):
    """Is the offset a property of the place, or scatter?"""
    per_well = long.groupby("Station Code")["offset"].agg(["size", "mean", "std"])
    pinned = per_well[per_well["size"] >= MIN_READINGS_FOR_OFFSET]
    between = float(pinned["mean"].std())
    within = float(pinned["std"].median())
    return {
        "wellsScored": int(len(pinned)),
        "betweenWellOffsetSdM": round(between, 3),
        "withinWellScatterSdM": round(within, 3),
        "persistentSharePct": round(100 * between ** 2 / (between ** 2 + within ** 2), 1),
    }


def split_half(long, cohort_of):
    """Does the first half of a well's record predict the second half?"""
    rows = []
    ordered = long.assign(_date=pd.to_datetime(long["month"], format="%b-%y", errors="raise")).sort_values("_date")
    for station, sub in ordered.groupby("Station Code"):
        if len(sub) < 2 * (MIN_READINGS_FOR_OFFSET // 2) + 2:
            continue
        half = len(sub) // 2
        rows.append((cohort_of(sub["tehsil"].iat[0]),
                     sub["offset"].iloc[:half].mean(),
                     sub["offset"].iloc[half:].mean()))
    frame = pd.DataFrame(rows, columns=["cohort", "past", "future"])
    out = {
        "status": "validated",
        "protocol": "chronological-month-v2",
        "target": "later-half mean offset, not individual monthly depth",
        "wellsScored": int(len(frame)),
        "pastPredictsFutureR": round(float(frame["past"].corr(frame["future"])), 3),
        "mandalMeanAppliedMaeM": round(float(frame["future"].abs().mean()), 3),
        "withLearnedOffsetMaeM": round(float((frame["future"] - frame["past"]).abs().mean()), 3),
        "byAquifer": [],
    }
    out["reductionPct"] = round(100 * (1 - out["withLearnedOffsetMaeM"] / out["mandalMeanAppliedMaeM"]), 1)
    for cohort, sub in frame.groupby("cohort"):
        if not cohort or len(sub) < 30:
            continue
        plain = float(sub["future"].abs().mean())
        fixed = float((sub["future"] - sub["past"]).abs().mean())
        out["byAquifer"].append({
            "aquifer": cohort,
            "wells": int(len(sub)),
            "mandalMeanAppliedMaeM": round(plain, 3),
            "withLearnedOffsetMaeM": round(fixed, 3),
            "reductionPct": round(100 * (1 - fixed / plain), 1),
        })
    out["byAquifer"].sort(key=lambda row: row["aquifer"])
    return out


def dose_response(long):
    """What k readings at a village buy, held out against the rest of its record."""
    rng = np.random.default_rng(SEED)
    series = {station: sub["offset"].to_numpy() for station, sub in long.groupby("Station Code")}
    curve = []
    for k in DOSE_STEPS:
        errors = []
        for values in series.values():
            if len(values) < k + 4:
                continue
            shuffled = values.copy()
            rng.shuffle(shuffled)
            errors.append(abs(shuffled[k:].mean() - shuffled[:k].mean()))
        if errors:
            curve.append({"readings": k,
                          "residualErrorM": round(float(np.mean(errors)), 3),
                          "wells": int(len(errors))})
    return curve


def forward_dose_response(long):
    """Early readings predict individual later offsets, on one fixed well cohort.

    Every k is scored on the same future tail after the largest calibration
    window, so a changing evaluation cohort cannot manufacture an improvement.
    Future peer means remain observed: this is not an end-to-end depth forecast.
    """
    ordered = long.assign(_date=pd.to_datetime(long["month"], format="%b-%y", errors="raise")).sort_values("_date")
    cutoff = max(DOSE_STEPS)
    series = [sub["offset"].to_numpy() for _, sub in ordered.groupby("Station Code")
              if len(sub) >= cutoff + 4]
    return [{
        "readings": k,
        "residualErrorM": round(float(np.mean([
            np.abs(values[cutoff:] - values[:k].mean()).mean() for values in series
        ])), 3),
        "wells": len(series),
        "futureReadings": sum(len(values) - cutoff for values in series),
    } for k in DOSE_STEPS] if series else []


def static_null(long, cohort_of):
    """Can the offset be predicted instead of measured? Whole mandals held out."""
    per_well = long.groupby("Station Code").agg(
        offset=("offset", "mean"), n=("offset", "size"),
        lat=("Latitude", "first"), lon=("Longitude", "first"),
        depth=("Well Depth", "first"), well_type=("Type of Well", "first"),
        tehsil=("tehsil", "first"))
    per_well = per_well[per_well["n"] >= MIN_READINGS_FOR_OFFSET].copy()
    per_well["depth"] = pd.to_numeric(per_well["depth"], errors="coerce")
    per_well["well_type"] = per_well["well_type"].astype("category").cat.codes
    features = per_well[["lat", "lon", "depth", "well_type"]].to_numpy()
    target = per_well["offset"].to_numpy()
    groups = per_well["tehsil"].to_numpy()
    predicted = np.zeros_like(target)
    for train, test in GroupKFold(n_splits=5).split(features, target, groups=groups):
        model = HistGradientBoostingRegressor(max_iter=300, random_state=0)
        model.fit(features[train], target[train])
        predicted[test] = model.predict(features[test])
    return {
        "wellsScored": int(len(target)),
        "features": ["latitude", "longitude", "well depth", "well type"],
        "validation": "5-fold GroupKFold, whole mandals held out",
        "mandalMeanMaeM": round(float(np.abs(target).mean()), 3),
        "predictedOffsetMaeM": round(float(mean_absolute_error(target, predicted)), 3),
        "predictedOffsetR2": round(float(r2_score(target, predicted)), 3),
        "verdict": "worse than using the mandal mean; the offset must be measured, not inferred",
    }


def cross_network(long, resolved):
    """The same offset measured against APWRIMS instead of against peer wells.

    This is the tempting shortcut -- it needs no peer wells in the mandal, so it
    reaches villages the peer method cannot -- and it is much weaker, which is
    the finding that matters for planning. A CGWB bore and the APWRIMS network's
    wells are
    different well types in different aquifers, so most of the gap between them
    is the networks differing rather than the village's position, and the two
    move apart month to month. Offsets only behave when the village reading and
    its mandal reference are the same kind of measurement.
    """
    history = pd.read_csv(os.path.join(ROOT, "phase3_levels", "apwrims", "apwrims_gw_history.csv"))
    history["level_mbgl"] = pd.to_numeric(history["level_mbgl"], errors="coerce")
    history = history.dropna(subset=["level_mbgl"])
    history["key"] = history["mandal"].map(norm)
    reference = history.groupby(["key", "date"])["level_mbgl"].mean().rename("mandal_level").reset_index()

    stamp = {"Jan": "01", "May": "05", "Aug": "08", "Nov": "11"}
    frame = long.copy()
    frame["date"] = (frame["month"].str[-2:].astype(int).add(2000).astype(str)
                     + "-" + frame["month"].str[:3].map(stamp))
    frame["key"] = frame["tehsil"].map(resolved)
    frame = frame.dropna(subset=["key"]).merge(reference, on=["key", "date"], how="inner")
    if frame.empty:
        return None
    frame["cross"] = frame["mbgl"] - frame["mandal_level"]

    per_well = frame.groupby("Station Code")["cross"].agg(["size", "mean", "std"])
    pinned = per_well[per_well["size"] >= MIN_READINGS_FOR_OFFSET]
    between = float(pinned["mean"].std())
    within = float(pinned["std"].median())
    rows = []
    for _, sub in frame.sort_values("date").groupby("Station Code"):
        if len(sub) < 8:
            continue
        half = len(sub) // 2
        rows.append((sub["cross"].iloc[:half].mean(), sub["cross"].iloc[half:].mean()))
    halves = pd.DataFrame(rows, columns=["past", "future"])
    return {
        "reference": "APWRIMS mandal monthly mean",
        "overlapWindow": f"{frame['date'].min()} to {frame['date'].max()}",
        "villagesReached": int(frame["village"].nunique()),
        "mandalsReached": int(frame["key"].nunique()),
        "wellsScored": int(len(pinned)),
        "persistentSharePct": round(100 * between ** 2 / (between ** 2 + within ** 2), 1),
        "pastPredictsFutureR": round(float(halves["past"].corr(halves["future"])), 3),
        "mandalLevelAppliedMaeM": round(float(halves["future"].abs().mean()), 3),
        "withLearnedOffsetMaeM": round(float((halves["future"] - halves["past"]).abs().mean()), 3),
        "verdict": "weaker than offsets measured within one network, so village readings need "
                   "a mandal reference built from the same kind of well; a pilot therefore needs "
                   "several wells per mandal rather than one",
    }


def build(src):
    long, month_count = read_wells(src)
    raw_wells = long["Station Code"].nunique()
    raw_readings = len(long)
    # Kept before the peer-count filter: the cross-network comparison exists to
    # show what the wider, weaker alternative would cover, so it must see the
    # wells that have no peers in their mandal.
    unfiltered = long
    long = add_offsets(long)

    records = load_records()
    index = mandal_index(records)
    keys = list(index.keys())
    resolved, unmatched = {}, set()
    for tehsil in sorted(long["tehsil"].unique()):
        key = norm(tehsil)
        if key in index:
            resolved[tehsil] = key
            continue
        near = difflib.get_close_matches(key, keys, n=1, cutoff=0.88)
        if near:
            resolved[tehsil] = near[0]
        else:
            unmatched.add(tehsil)
    long["key"] = long["tehsil"].map(resolved)
    joined = long.dropna(subset=["key"]).copy()

    cohort_of = lambda tehsil: (index.get(resolved.get(tehsil, ""), (None, None, None))[2]
                                if tehsil in resolved else None)

    validation = {
        "persistence": persistence(long),
        "splitHalf": split_half(long, cohort_of),
        "doseResponse": dose_response(long),
        "forwardDoseResponse": forward_dose_response(long),
        "forwardDoseMethod": "First k readings predict individual later offsets after the first eight readings, on a common well cohort. Future same-type peer means are observed; nowcast and peer-reference errors are not included.",
        "doseResponseMethod": "Randomly selected calibration readings versus the mean of remaining offsets; not a forward monthly-depth test. Peer-reference and nowcast errors are not included.",
        "staticCovariateNull": static_null(long, cohort_of),
        "crossNetworkOffset": cross_network(unfiltered, resolved),
        "byWellType": [],
    }
    # The headline could have been an artefact of comparing deep bores with
    # shallow dug wells, so it is repeated inside each type. It is not: dug
    # wells on their own are steadier than the pooled figure.
    for well_type, sub in long.groupby("well_type"):
        if sub["Station Code"].nunique() < 40:
            continue
        validation["byWellType"].append({
            "wellType": well_type,
            "wells": int(sub["Station Code"].nunique()),
            "persistence": persistence(sub),
            "splitHalf": {k: v for k, v in split_half(sub, cohort_of).items() if k != "byAquifer"},
            "doseResponse": dose_response(sub),
            "forwardDoseResponse": forward_dose_response(sub),
        })
    validation["byWellType"].sort(key=lambda row: -row["wells"])
    curve = {row["readings"]: row["residualErrorM"] for row in validation["doseResponse"]}

    def expected_error(count):
        """The pooled dose-response value at or below this many readings."""
        eligible = [k for k in sorted(curve) if k <= count]
        return curve[eligible[-1]] if eligible else None

    villages, by_mandal = [], {}
    for (key, village, well_type), sub in joined.groupby(["key", "village", "well_type"]):
        if village in {"", "NAN", "-"}:
            continue
        name, district, cohort, nowcast, measured = index[key]
        readings = int(len(sub))
        offset = float(sub["offset"].mean())
        # The well's own month-to-month scatter about its mean offset, which is
        # what a single future reading would miss by. Reported beside the
        # dose-response value so a steady well is not given a stranger's error.
        scatter = float(sub["offset"].std()) if readings > 1 else None
        villages.append({
            "district": district,
            "mandal": name,
            "village": sub["Village"].iat[0],
            "wellType": well_type,
            "offsetM": round(offset, 2),
            "readings": readings,
            "wells": int(sub["Station Code"].nunique()),
            "lastRead": sub.loc[pd.to_datetime(sub["month"], format="%b-%y").idxmax(), "month"],
            "pinned": readings >= MIN_READINGS_FOR_OFFSET,
            "ownScatterM": round(scatter, 2) if scatter is not None else None,
            "cohortErrorM": expected_error(readings),
            "aquifer": cohort,
        })
        by_mandal.setdefault(key, []).append(offset)

    villages.sort(key=lambda row: (row["district"], row["mandal"], row["village"], row["wellType"]))

    mandals = {}
    for key, offsets in by_mandal.items():
        name, district, cohort, nowcast, measured = index[key]
        spread = float(np.mean(np.abs(np.asarray(offsets) - np.mean(offsets)))) if len(offsets) > 1 else None
        mandals[name] = {
            "district": district,
            "villagesRead": len(offsets),
            "aquifer": cohort,
            "villageSpreadM": round(spread, 2) if spread is not None else None,
            "proxyQuality": (None if spread is None else
                             ("poor" if spread >= PROXY_POOR_M else "fair")),
        }

    scored = [m for m in mandals.values() if m["villageSpreadM"] is not None]
    spreads = sorted(m["villageSpreadM"] for m in scored)

    # The method end to end: a pinned village offset on top of the live mandal
    # nowcast. Deliberately NOT the largest offsets, which select deep bores
    # reading a different aquifer and would publish a 106 m "village level".
    # Dug wells only, the shallow kind a village actually draws from and the
    # kind a private-well programme would read, with the steadiest records
    # chosen and two per aquifer setting so no one cohort speaks for the state.
    applied, seen = [], {}
    eligible = [v for v in villages
                if v["pinned"] and v["wellType"] == "Dug well"
                and abs(v["offsetM"]) <= APPLIED_MAX_OFFSET_M
                and v["ownScatterM"] is not None]
    for row in sorted(eligible, key=lambda v: v["ownScatterM"]):
        name, district, cohort, nowcast, measured = index[norm(row["mandal"])]
        if nowcast is None:
            continue
        if seen.get(cohort, 0) >= APPLIED_PER_AQUIFER:
            continue
        seen[cohort] = seen.get(cohort, 0) + 1
        applied.append({
            "district": district,
            "mandal": row["mandal"],
            "village": row["village"],
            "aquifer": cohort,
            "mandalNowcastM": nowcast,
            "offsetM": row["offsetM"],
            "villageEstimateM": round(nowcast + row["offsetM"], 2),
            "readings": row["readings"],
            "ownScatterM": row["ownScatterM"],
            "cohortErrorM": row["cohortErrorM"],
        })
    applied.sort(key=lambda row: (row["aquifer"] or "", row["district"], row["mandal"]))

    return {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
            .replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {
            "name": "CGWB Quality controlled groundwater levels over India",
            "period": "2000-2024, read in January, May, August and November",
            "monthColumns": month_count,
            "apWells": int(raw_wells),
            "apReadings": int(raw_readings),
            "caveat": "observation wells with a fixed measuring point, read at rest; "
                      "private irrigation wells will be noisier",
        },
        "method": "each well's leave-one-out distance from the other wells in its mandal "
                  "that month, averaged over its record; added to the mandal nowcast",
        "coverage": {
            "villages": len(villages),
            "villagesPinned": sum(1 for v in villages if v["pinned"]),
            "mandals": len(mandals),
            "mandalsWithSpread": len(scored),
            "tehsilsUnmatched": len(unmatched),
            "mandalsInRecords": len(records),
        },
        "spread": {
            "medianVillageSpreadM": spreads[len(spreads) // 2] if spreads else None,
            "proxyPoorThresholdM": PROXY_POOR_M,
            "proxyPoor": sum(1 for m in scored if m["proxyQuality"] == "poor"),
            "proxyFair": sum(1 for m in scored if m["proxyQuality"] == "fair"),
        },
        "validation": validation,
        "appliedExamples": applied,
        "mandals": mandals,
        "villages": villages,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--src", default=DEFAULT_SRC,
                        help="CGWB quality-controlled levels CSV (git-ignored for size)")
    args = parser.parse_args()
    if not os.path.exists(args.src):
        print(f"missing {args.src}\n"
              "  CGWB's quality-controlled levels are git-ignored for size; this is run by\n"
              "  hand, like validate_cross_network.py. Offsets are persistent, so the\n"
              "  committed village_offsets.json stays valid between runs.", file=sys.stderr)
        return 1

    payload = build(args.src)
    with open(OUT, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

    dug = next((row for row in payload["validation"]["byWellType"]
                if row["wellType"] == "Dug well"), None)
    bore = next((row for row in payload["validation"]["byWellType"]
                 if row["wellType"] == "Bore well"), None)
    summary = {
        "contractVersion": "1.0.0",
        "generatedAt": payload["generatedAt"],
        "source": payload["source"],
        "method": payload["method"],
        "coverage": payload["coverage"],
        "spread": payload["spread"],
        "persistence": payload["validation"]["persistence"],
        "splitHalf": {k: v for k, v in payload["validation"]["splitHalf"].items()
                      if k != "byAquifer"},
        "byAquifer": payload["validation"]["splitHalf"]["byAquifer"],
        "staticCovariateNull": payload["validation"]["staticCovariateNull"],
        "crossNetworkOffset": payload["validation"]["crossNetworkOffset"],
        "dugWell": None if dug is None else
            {"wells": dug["wells"], "persistence": dug["persistence"]["persistentSharePct"],
             "r": dug["splitHalf"]["pastPredictsFutureR"], "dose": dug["doseResponse"], "forwardDose": dug["forwardDoseResponse"]},
        "boreWell": None if bore is None else
            {"wells": bore["wells"], "r": bore["splitHalf"]["pastPredictsFutureR"],
             "dose": bore["doseResponse"], "forwardDose": bore["forwardDoseResponse"]},
        "caveat": payload["source"]["caveat"],
        "doseResponseMethod": payload["validation"]["doseResponseMethod"],
        "forwardDoseMethod": payload["validation"]["forwardDoseMethod"],
    }
    with open(SUMMARY, "w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)
        handle.write("\n")
    print(f"  summary -> {SUMMARY} ({os.path.getsize(SUMMARY) / 1024:.0f} KB)")

    coverage, spread = payload["coverage"], payload["spread"]
    persist = payload["validation"]["persistence"]
    half = payload["validation"]["splitHalf"]
    null = payload["validation"]["staticCovariateNull"]
    print(f"  {coverage['villages']} villages in {coverage['mandals']} mandals "
          f"({coverage['villagesPinned']} pinned on {MIN_READINGS_FOR_OFFSET}+ readings); "
          f"{coverage['tehsilsUnmatched']} tehsils unmatched")
    print(f"  offset is {persist['persistentSharePct']}% persistent "
          f"(between-well {persist['betweenWellOffsetSdM']} m vs within-well "
          f"{persist['withinWellScatterSdM']} m, {persist['wellsScored']} wells)")
    print(f"  split half: r={half['pastPredictsFutureR']}, mandal mean "
          f"{half['mandalMeanAppliedMaeM']} m -> with offset {half['withLearnedOffsetMaeM']} m "
          f"({half['reductionPct']}% better)")
    print("  dose: " + ", ".join(f"{row['readings']}->{row['residualErrorM']} m"
                                 for row in payload["validation"]["doseResponse"]))
    print(f"  predicting the offset instead: {null['predictedOffsetMaeM']} m, "
          f"R2 {null['predictedOffsetR2']} (mandal mean {null['mandalMeanMaeM']} m)")
    cross = payload["validation"].get("crossNetworkOffset")
    if cross:
        print(f"  against APWRIMS instead: {cross['persistentSharePct']}% persistent, "
              f"r={cross['pastPredictsFutureR']}, offset residual "
              f"{cross['withLearnedOffsetMaeM']} m over {cross['villagesReached']} villages")
    print(f"  mandal figure a poor village proxy in {spread['proxyPoor']} of "
          f"{coverage['mandalsWithSpread']} scored mandals "
          f"(median village spread {spread['medianVillageSpreadM']} m)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
