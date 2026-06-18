"""Phase 3 — feature schema + physics helpers for satellite→metres groundwater levels.

The model learns:  features (all open-source) -> groundwater level (mbgl)
trained against sparse well observations (the "answer key"), then predicts
levels for every mandal. Specific-yield physics is provided BOTH as an
engineered feature (a first-principles estimate) and left for the model to
refine — a hybrid physics + ML approach.
"""

# Ordered feature list used by training + inference (must stay in sync).
NUMERIC_FEATURES = [
    "grace_gws_anom_cm",     # GRACE groundwater storage anomaly (cm water-equiv); raw signal
    "grace_gws_pctl",        # GRACE-DA groundwater percentile (0-100)
    "rootzone_pctl",         # root-zone soil-moisture percentile
    "surface_pctl",          # surface soil-moisture percentile
    "rain_1m_mm",            # CHIRPS rainfall, last month
    "rain_3m_mm",            # CHIRPS rainfall, last 3 months (recharge memory)
    "et_1m_mm",              # TerraClimate ET, last month
    "water_balance_mm",      # annual rainfall - ET
    "specific_yield",        # aquifer specific yield (CGWB)
    "elevation_m",           # SRTM/Copernicus DEM
    "slope_deg",             # terrain slope
    "twi",                   # topographic wetness index
    "phys_level_change_m",   # engineered: grace_gws_anom_m / specific_yield
    "month_sin", "month_cos",  # seasonality (cyclical)
    "lat", "lon",
]
CATEGORICAL_FEATURES = ["aquifer_type"]   # e.g. alluvial / hard_rock / coastal
TARGET = "mbgl"                            # depth to water table, metres below ground level

ALL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES


def physics_level_change_m(grace_gws_anom_cm: float, specific_yield: float) -> float:
    """First-principles conversion: storage change (cm water) -> water-table change (m).

        water_table_change (m) = groundwater_storage_change (m of water) / specific_yield

    Returns a CHANGE/anomaly, not absolute depth. Absolute mbgl needs a baseline
    (set from a sensor reading once). This value is fed to the model as a feature.
    """
    if specific_yield is None or specific_yield <= 0:
        return 0.0
    return (grace_gws_anom_cm / 100.0) / specific_yield


import math


def month_cyclical(month: int):
    """Encode month 1-12 as (sin, cos) so December and January are 'close'."""
    ang = 2 * math.pi * (month - 1) / 12.0
    return math.sin(ang), math.cos(ang)
