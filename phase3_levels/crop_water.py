"""The crop water check: an FAO-56 Chapter 8 root-zone water balance, per mandal.

Given a crop and its growth stage, it asks: is the crop already short of water
in this mandal, will it be within the next seven days on the forecast, or is it
comfortable through the week? Four inputs, all per mandal:

- soil moisture: APWRIMS's NRSC VIC model, plant-available water in the top 5,
  30, 100 and 150 cm as a % of what the soil can hold (modelled), on its date;
- how much the soil can hold: SoilGrids 2.0, mm per metre by depth (predicted);
- reference evapotranspiration and rain, daily: ECMWF's open IFS model via
  Open-Meteo, from the soil-moisture date to seven days ahead (forecast);
- the crop's coefficient, rooting depth and depletion fraction: FAO-56 Tables 12
  and 22 (references, not calibrated to Andhra Pradesh).

The steps, each FAO-56 Chapter 8:
- root depth Zr: 0.2 m at the initial stage; afterwards the larger Table 22 value,
  the one footnote 1 gives for modelling soil water stress or rainfed crops,
  capped at 1.5 m, the deepest the soil-moisture model reports;
- total available water TAW (Eq. 82) over 0-Zr from SoilGrids; the share still
  available from the model's cumulative columns, read evenly within each layer;
- p from Table 22, adjusted for the crop's water use: p + 0.04 (5 - ETc),
  kept within 0.1-0.8 (footnote 2); readily available water RAW = p TAW (Eq. 83);
- each day: rain under 0.2 ETo is ignored as evaporated; depletion
  Dr = Dr - rain + Ks Kc ETo, kept within 0-TAW (Eq. 85, no irrigation, runoff or
  capillary rise); Ks = 1 while Dr <= RAW, else (TAW - Dr) / ((1 - p) TAW) (Eq. 84).

app/lib/cropWater.ts runs the same steps in the browser, where the crop and
stage are chosen. fetch_field_signals.py runs this copy for every crop and
stage, and the page's counts must equal these (app/e2e/agriculture-live.spec.ts).
"""


def mean(values):
    """Left to right, as the browser adds: Python 3.12's compensated sum() could differ in the last bit."""
    total = 0.0
    for value in values:
        total += value
    return total / len(values)


# FAO-56 references, mirroring CROP_REFERENCE in app/lib/agriculture.ts:
# Kc initial / mid / end (Table 12), maximum root depth range in m and the
# depletion fraction p (Table 22). Chilli uses the sweet-pepper row and red gram
# the "beans, dry and pulses" row, with ICRISAT's 2 m taproot.
CROPS = {
    "maize": {"kc": (0.3, 1.2, 0.35), "root": (1.0, 1.7), "p": 0.55},
    "groundnut": {"kc": (0.4, 1.15, 0.6), "root": (0.5, 1.0), "p": 0.50},
    "cotton": {"kc": (0.35, 1.15, 0.6), "root": (1.0, 1.7), "p": 0.65},
    "chilli": {"kc": (0.6, 1.05, 0.9), "root": (0.5, 1.0), "p": 0.30},
    "redgram": {"kc": (0.4, 1.15, 0.35), "root": (0.6, 2.0), "p": 0.45},
    "bengalgram": {"kc": (0.4, 1.0, 0.35), "root": (0.6, 1.0), "p": 0.50},
    "jowar": {"kc": (0.3, 1.05, 0.55), "root": (1.0, 2.0), "p": 0.55},
}
SOWING_ROOT_M = 0.2
MAX_ROOT_M = 1.5
SOIL_DEPTHS_CM = (5, 30, 100, 150)
CAPACITY_DEPTHS_CM = ((0, 5), (5, 15), (15, 30), (30, 60), (60, 100), (100, 200))
OUTLOOK_DAYS = 7
SEVERE_KS = 0.5   # transpiration at half its unstressed rate or less


def root_depth(crop, stage):
    return SOWING_ROOT_M if stage == 0 else min(CROPS[crop]["root"][1], MAX_ROOT_M)


def available_fraction(pct, depth_m):
    """Share of the 0..depth column's capacity still available, from the model's cumulative columns."""
    depth = depth_m * 100
    tops = (0,) + SOIL_DEPTHS_CM
    held = [0.0] + [value / 100 * cm for value, cm in zip(pct, SOIL_DEPTHS_CM)]
    for i in range(1, len(tops)):
        if depth <= tops[i]:
            layer = min(1.0, max(0.0, (held[i] - held[i - 1]) / (tops[i] - tops[i - 1])))
            return min(1.0, max(0.0, (held[i - 1] + layer * (depth - tops[i - 1])) / depth))
    return min(1.0, max(0.0, pct[-1] / 100))


def capacity_mm(capacity, depth_m):
    """Total available water (mm) in the 0..depth column, from SoilGrids' mm per metre by interval."""
    depth = depth_m * 100
    total = 0.0
    for (a, b), mm in zip(CAPACITY_DEPTHS_CM, capacity):
        total += mm * max(0, min(b, depth) - a) / 100
    return total


def check(pct, capacity, eto, rain, start, today, crop, stage):
    """One mandal, one crop and stage.

    `start` is the index, in the daily weather, of the soil-moisture date (the
    state is known at the end of that day); `today` is the index of the first
    outlook day. Returns None when an input is missing.
    """
    end = today + OUTLOOK_DAYS
    if pct is None or capacity is None or start is None or start < 0 or end > len(eto) or start >= end:
        return None
    if any(value is None for value in eto[start + 1:end]) or any(value is None for value in rain[start + 1:end]):
        return None
    spec = CROPS[crop]
    kc = spec["kc"][stage]
    zr = root_depth(crop, stage)
    taw = capacity_mm(capacity, zr)
    if taw <= 0:
        return None
    eto_mean = mean(eto[today:end])
    etc = kc * eto_mean
    p = min(0.8, max(0.1, spec["p"] + 0.04 * (5 - etc)))
    raw = p * taw

    def ks(depletion):
        return 1.0 if depletion <= raw else max(0.0, (taw - depletion) / ((1 - p) * taw))

    dr = (1 - available_fraction(pct, zr)) * taw
    dr_now = dr if start + 1 >= today else None
    onset = None
    rain_used = 0.0
    for i in range(start + 1, end):
        if i == today:
            dr_now = dr
        effective = rain[i] if rain[i] >= 0.2 * eto[i] else 0.0
        if i >= today:
            rain_used += effective
        dr = min(taw, max(0.0, dr - effective + ks(dr) * kc * eto[i]))
        if i >= today and onset is None and ks(dr) < 1:
            onset = i - today
    ks_now = ks(dr_now)
    state = "stressed" if ks_now < 1 else "soon" if onset is not None else "ok"
    return {
        "state": state, "severe": ks_now < SEVERE_KS, "ksNow": ks_now, "ksEnd": ks(dr), "onset": onset,
        "taw": taw, "raw": raw, "p": p, "drNow": dr_now, "drEnd": dr, "kc": kc, "zr": zr,
        "etoMean": eto_mean, "rainUsed": rain_used,
        "reserve": max(0.0, raw - dr_now),
    }


def counts(results):
    out = {"stressed": 0, "severe": 0, "soon": 0, "ok": 0, "unknown": 0}
    for result in results:
        if result is None:
            out["unknown"] += 1
        else:
            out[result["state"]] += 1
            out["severe"] += 1 if result["severe"] else 0
    return out
