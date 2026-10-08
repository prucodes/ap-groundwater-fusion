"""The model's forecasts, checked on CGWB's wells: a network it has never seen.

The model learns only from the State's APWRIMS series. CGWB reads its own wells by hand
in May, August and November (fetch_cgwb_manual.py), and none of them feeds the model.
The rolling-origin backtest (experiment_forecast_bias.py) holds three-month forecasts
made without seeing their outcome, and two of its windows line up with CGWB's rounds
exactly: May to August, the monsoon's rise, and August to November.

The two networks measure different wells: mostly shallow dug wells for CGWB, deeper
piezometers for APWRIMS. Their depths are not comparable, so this compares the change
over each window: did the water table rise or fall, and by how much. The benchmark is the
State's own measured change for the same mandal and window; the model cannot be expected
to agree with CGWB more often than APWRIMS itself does.

  direction  share of mandal-windows where the call (rise or fall) matches CGWB's wells,
             counted only where CGWB's median moved at least MIN_MOVE metres
  error      mean absolute difference in metres of change

Writes app/data/cross_network_check.json. Research only: nothing here changes a forecast.
"""
import json
import os
import sys

import numpy as np
import pandas as pd
import shapely
from shapely.geometry import MultiPolygon, Point, Polygon
from shapely.strtree import STRtree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from series_quality import history_carried_forward  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
APP = os.path.join(ROOT, "app", "data")
CGWB = os.path.join(HERE, "cgwb", "cgwb_manual_levels.csv")
ROWS = os.path.join(ROOT, "data", "raw", "experiments", "forecast_bias_rows.csv")
OUT = os.path.join(APP, "cross_network_check.json")

WINDOWS = {"may_aug": (5, 8, "May to August"), "aug_nov": (8, 11, "August to November")}
MIN_MOVE = 0.5          # metres: a smaller median move is too close to call either way
MAX_DEPTH = 60.0        # the same plausibility cut the model applies to its own series


def boundaries():
    geo = json.load(open(os.path.join(APP, "ap_map_geometry.json")))
    shapes = [shapely.make_valid(MultiPolygon([Polygon(ring) for ring in m["rings"] if len(ring) >= 4]))
              for m in geo["mandals"]]
    return geo, shapes


def cgwb_changes(shapes):
    """Each station's change over each window and year, placed in its mandal outline."""
    c = pd.read_csv(CGWB)
    c = c[(c.level_mbgl > 0) & (c.level_mbgl < MAX_DEPTH)].copy()
    c["year"] = c.date.str.slice(0, 4).astype(int)
    c["month"] = c.date.str.slice(5, 7).astype(int)
    level = c.groupby(["station_code", "year", "month"]).level_mbgl.median()
    tree = STRtree(shapes)
    where = {}
    for code, lat, lon in c[["station_code", "lat", "lon"]].drop_duplicates("station_code").itertuples(index=False):
        point = Point(lon, lat)
        hits = [int(i) for i in tree.query(point) if shapes[i].contains(point)]
        where[code] = hits[0] if len(hits) == 1 else None
    rows = []
    for name, (start, end, _) in WINDOWS.items():
        a = level.xs(start, level="month")
        b = level.xs(end, level="month")
        both = a.to_frame("start").join(b.to_frame("end"), how="inner").reset_index()
        both["window"] = name
        rows.append(both)
    out = pd.concat(rows, ignore_index=True)
    out["boundary"] = out.station_code.map(where)
    out = out.dropna(subset=["boundary"])
    out["boundary"] = out.boundary.astype(int)
    out["change"] = out.end - out.start           # positive: the water table fell
    return out


def model_changes(geo):
    """The backtest's forecast for each mandal-window, with the State's measured change beside it."""
    sys.path.insert(0, HERE)
    from build_levels_engine import resolve_locations
    rows = pd.read_csv(ROWS)
    history = pd.read_csv(os.path.join(HERE, "apwrims", "apwrims_gw_history.csv"))
    history = history[(history.level_mbgl > 0) & (history.level_mbgl < MAX_DEPTH)].copy()
    frozen = history_carried_forward()
    window_months = lambda origin, target: {origin} | {str(p) for p in pd.period_range(origin, target, freq="M")}
    rows = rows[[not (window_months(o, t) & set(frozen)) for o, t in zip(rows.origin, rows.target_date)]]
    history["mkey"] = history.mandal_uuid
    _, basis, boundary_index = resolve_locations(history, geo)
    # A district centroid is not a place a CGWB well can be matched to.
    own = {key: index for key, index in boundary_index.items()
           if index is not None and basis.get(key) in ("boundary_exact", "boundary_alias")}
    rows["boundary"] = rows.mkey.map(own)
    rows = rows.dropna(subset=["boundary"]).copy()
    rows["boundary"] = rows.boundary.astype(int)
    rows["year"] = rows.origin.str.slice(0, 4).astype(int)
    picked = []
    for name, (start, end, _) in WINDOWS.items():
        part = rows[(rows.origin.str.slice(5, 7).astype(int) == start)
                    & (rows.target_date.str.slice(5, 7).astype(int) == end)].copy()
        part["window"] = name
        picked.append(part)
    rows = pd.concat(picked, ignore_index=True)
    rows["forecast"] = rows.blend - rows.noChange      # the released forecast's change
    rows["measured"] = rows.actual - rows.noChange     # what the State's own wells did
    rows["seasonal"] = rows.seasonal - rows.noChange
    # Two source series on one outline: keep their mean, so a mandal counts once.
    return rows.groupby(["boundary", "year", "window"], as_index=False)[["forecast", "measured", "seasonal"]].mean(), frozen


def score(frame, split=True):
    clear = frame[frame.cgwb.abs() >= MIN_MOVE]
    def agree(column):
        return float(np.mean(np.sign(clear[column]) == np.sign(clear.cgwb))) if len(clear) else None
    def error(column):
        return float(np.mean(np.abs(frame[column] - frame.cgwb)))
    return {
        "mandalWindows": int(len(frame)), "clearMoves": int(len(clear)),
        "direction": {"forecast": agree("forecast"), "measured": agree("measured"), "seasonal": agree("seasonal")},
        "errorM": {"forecast": error("forecast"), "measured": error("measured"), "seasonal": error("seasonal"),
                   "noChange": float(np.mean(np.abs(frame.cgwb)))},
        "correlation": {"forecast": float(frame.forecast.corr(frame.cgwb)), "measured": float(frame.measured.corr(frame.cgwb))},
        **({"bySeason": season_split(frame)} if split else {}),
    }


def season_split(frame):
    """Seasons that went the usual way, and seasons that broke from it.

    "Usual" is the calendar baseline: each mandal's average change over the same window.
    Where CGWB's wells moved against it, only a forecast that read the season could agree.
    """
    clear = frame[frame.cgwb.abs() >= MIN_MOVE]
    usual = np.sign(clear.seasonal) == np.sign(clear.cgwb)
    out = {}
    for name, part in (("usual", clear[usual]), ("broke", clear[~usual])):
        out[name] = {"clearMoves": int(len(part)),
                     "forecast": float(np.mean(np.sign(part.forecast) == np.sign(part.cgwb))) if len(part) else None,
                     "measured": float(np.mean(np.sign(part.measured) == np.sign(part.cgwb))) if len(part) else None}
    return out


def main():
    if not os.path.exists(ROWS):
        print(f"  No backtest rows at {os.path.relpath(ROWS, ROOT)}: run experiment_forecast_bias.py first")
        return 1
    geo, shapes = boundaries()
    wells = cgwb_changes(shapes)
    per_mandal = wells.groupby(["boundary", "year", "window"]).agg(cgwb=("change", "median"), wells=("change", "size")).reset_index()
    forecasts, frozen = model_changes(geo)
    joined = per_mandal.merge(forecasts, on=["boundary", "year", "window"], how="inner")
    if joined.empty:
        print("  No mandal-window has both a CGWB change and a backtest forecast")
        return 1
    overall = score(joined)
    windows = {name: {"label": WINDOWS[name][2], "years": sorted(int(y) for y in part.year.unique()), **score(part, split=False)}
               for name, part in joined.groupby("window")}
    used = wells.merge(joined[["boundary", "year", "window"]], on=["boundary", "year", "window"])
    payload = {
        "contractVersion": "cross-network-v1",
        "source": "CGWB National Hydrograph Network, manual readings, via India Data Portal (ISB)",
        "forecast": "Released three-month forecast (model blended with the year-ago level), rolling-origin backtest",
        "years": sorted(int(y) for y in joined.year.unique()),
        "mandals": int(joined.boundary.nunique()),
        "stations": int(used.station_code.nunique()),
        "minMoveM": MIN_MOVE,
        "frozenMonths": frozen,
        "overall": overall,
        "windows": windows,
        "caveat": ("CGWB's wells are mostly shallow dug wells and APWRIMS's are piezometers, so depths are not compared, "
                   "only the change over each window. The State's own measured change is the benchmark: no model can be "
                   "expected to agree with CGWB more often than the State's wells do."),
    }
    with open(OUT, "w") as handle:
        json.dump(payload, handle, indent=1)
    d, e = overall["direction"], overall["errorM"]
    print(f"  {payload['mandals']} mandals, {payload['stations']} CGWB stations, years {payload['years']}")
    print(f"  {overall['mandalWindows']} mandal-windows, {overall['clearMoves']} with a clear move (>= {MIN_MOVE} m)")
    print(f"  direction agrees with CGWB: forecast {d['forecast']:.1%}  State's own wells {d['measured']:.1%}  seasonal {d['seasonal']:.1%}")
    print(f"  error in metres of change: forecast {e['forecast']:.2f}  State's wells {e['measured']:.2f}  "
          f"seasonal {e['seasonal']:.2f}  no change {e['noChange']:.2f}")
    b = overall["bySeason"]
    print(f"  seasons that went the usual way: n={b['usual']['clearMoves']} forecast {b['usual']['forecast']:.1%} State's wells {b['usual']['measured']:.1%}")
    print(f"  seasons that broke from it:      n={b['broke']['clearMoves']} forecast {b['broke']['forecast']:.1%} State's wells {b['broke']['measured']:.1%}")
    print(f"  months left out, carried forward in the State's series: {', '.join(frozen) or 'none'}")
    for name, w in windows.items():
        print(f"    {w['label']:<20} {w['years']}  n={w['mandalWindows']:<4} direction forecast {w['direction']['forecast']:.1%} "
              f"measured {w['direction']['measured']:.1%}  error forecast {w['errorM']['forecast']:.2f} measured {w['errorM']['measured']:.2f} "
              f"no change {w['errorM']['noChange']:.2f}")
    print(f"  wrote {os.path.relpath(OUT, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
