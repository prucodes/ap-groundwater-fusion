"use client";

import { useMemo, useState } from "react";
import { HeaderHero } from "../../components/HeaderHero";
import { KpiCard } from "../../components/KpiCard";
import { CountUp } from "../../components/CountUp";
import {
  IconActivity,
  IconArrowDown,
  IconArrowUp,
  IconDroplet,
  IconInfo,
  IconList,
  IconSatellite,
  IconShield,
  IconTarget,
  IconSearch,
} from "../../components/icons";
import {
  depthColor,
  levelsEstimates,
  mapGeometry,
  mandalToPath,
  MAP_VIEW,
  titleCase,
  type MandalLevelEstimate,
} from "../../lib/data";

/** Match the python norm() so map-geometry names join to estimate mkeys. */
function norm(name: string): string {
  return name
    .toUpperCase()
    .trim()
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(RURAL|URBAN|MANDAL|MUNICIPALITY|MPL|CORPORATION|TOWN)\b/g, " ")
    .replace(/[.\-]/g, " ")
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const AQ_LABEL: Record<string, string> = {
  hard_rock: "Hard rock",
  alluvial: "Alluvial",
  coastal: "Coastal",
};

type SortKey = "estimate" | "trend" | "band" | "mandal";

export default function EstimatesPage() {
  const bundle = levelsEstimates;
  const byKey = useMemo(() => {
    const m = new Map<string, MandalLevelEstimate>();
    for (const r of bundle.mandals) m.set(r.mkey, r);
    return m;
  }, [bundle]);

  const [hover, setHover] = useState<MandalLevelEstimate | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("estimate");
  const [query, setQuery] = useState("");

  // statewide summary
  const ests = bundle.mandals.map((m) => m.estimate_mbgl);
  const median = [...ests].sort((a, b) => a - b)[Math.floor(ests.length / 2)];
  const deepening = bundle.mandals.filter((m) => (m.trend_m_per_yr ?? 0) > 0.5).length;
  const recovering = bundle.mandals.filter((m) => (m.trend_m_per_yr ?? 0) < -0.5).length;

  const rows = useMemo(() => {
    const q = norm(query);
    let list = bundle.mandals;
    if (q) list = list.filter((m) => norm(m.mandal).includes(q) || norm(m.district).includes(q));
    const sorted = [...list].sort((a, b) => {
      if (sortKey === "estimate") return b.estimate_mbgl - a.estimate_mbgl;
      if (sortKey === "trend") return (b.trend_m_per_yr ?? -99) - (a.trend_m_per_yr ?? -99);
      if (sortKey === "band") return b.band_p90 - b.band_p10 - (a.band_p90 - a.band_p10);
      return a.mandal.localeCompare(b.mandal);
    });
    return sorted;
  }, [bundle, query, sortKey]);

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Estimated Levels (β)"
        subtitle={
          <>
            Mandal groundwater depth <strong>in metres</strong>, modelled by fusing each mandal&apos;s APWRIMS sensor
            history with NASA satellite signals — so depth can be estimated <strong>for months a sensor missed</strong>{" "}
            (gap-fill &amp; short-range forecast). Every value carries an honest confidence band.{" "}
            <strong>Modelled estimate for mandals with sensor history — not official APWRIMS data.</strong>
          </>
        }
        showChips={false}
      />

      <div className="provRibbon">
        <span className="provRibbonItem"><IconActivity /> APWRIMS sensor history · {bundle.n_mandals} mandals · 2014–2026</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconSatellite /> NASA POWER rainfall · recharge driver</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconTarget /> gradient-boosted + quantile bands</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconShield /> BETA · validated, not official</span>
      </div>

      <div className="kpiRow stagger">
        <KpiCard
          icon={<IconDroplet />}
          label="Mandals Estimated"
          value={<CountUp value={bundle.n_mandals} />}
          foot="metres below ground, as of latest month"
          accent="var(--teal)"
        />
        <KpiCard
          icon={<IconTarget />}
          label="Validation Accuracy"
          value={<>±{bundle.backtest.forecast_mae_m}<span className="unit">m</span></>}
          foot={`MAE on never-seen months · R² ${bundle.backtest.forecast_r2}`}
          accent="var(--green)"
        />
        <KpiCard
          icon={<IconArrowDown />}
          label="Deepening (YoY)"
          value={<CountUp value={deepening} />}
          foot=">0.5 m/yr water-table decline"
          footAccent
          accent="var(--rust)"
        />
        <KpiCard
          icon={<IconArrowUp />}
          label="Recovering (YoY)"
          value={<CountUp value={recovering} />}
          foot=">0.5 m/yr improvement"
          accent="var(--cyan)"
        />
      </div>

      <div className="estLayout">
        {/* MAP */}
        <section className="card estMapCard">
          <div className="cardHead">
            <div className="cardTitle"><span className="titleIcon"><IconDroplet /></span>Estimated depth · {bundle.n_mandals} modelled mandals</div>
            <span className="cardSub">shallow → deep (m below ground)</span>
          </div>
          <div className="estMapWrap">
            <svg viewBox={`0 0 ${MAP_VIEW.width} ${MAP_VIEW.height}`} className="estMapSvg" role="img" aria-label="Estimated groundwater depth by mandal">
              {mapGeometry.mandals.map((m, i) => {
                const est = byKey.get(norm(m.m));
                const fill = est ? depthColor(est.estimate_mbgl) : "var(--field)";
                const active = hover && est && hover.mkey === est.mkey;
                return (
                  <path
                    key={`${m.d}|${m.m}|${i}`}
                    d={mandalToPath(m.rings)}
                    fill={fill}
                    stroke={active ? "var(--ink)" : "var(--hairline)"}
                    strokeWidth={active ? 1.1 : 0.3}
                    onMouseEnter={() => est && setHover(est)}
                    onMouseLeave={() => setHover(null)}
                    style={{ cursor: est ? "pointer" : "default", transition: "stroke-width .1s" }}
                  />
                );
              })}
            </svg>
            <div className="estLegend">
              <span className="estLegendLabel">Shallow</span>
              <span className="estLegendBar" style={{ background: `linear-gradient(90deg, ${depthColor(1)}, ${depthColor(10)}, ${depthColor(20)})` }} />
              <span className="estLegendLabel">Deep</span>
              <span className="estLegendTicks">0 m · 10 m · 20 m+</span>
            </div>
            {hover ? (
              <div className="estHoverCard">
                <div className="estHoverTitle">{titleCase(hover.mandal)}</div>
                <div className="estHoverSub">{titleCase(hover.district)} · {AQ_LABEL[hover.aquifer] ?? hover.aquifer}</div>
                <div className="estHoverRow"><span>Estimate</span><strong>{hover.estimate_mbgl} m</strong></div>
                <div className="estHoverRow"><span>Confidence band</span><span>{hover.band_p10}–{hover.band_p90} m</span></div>
                <div className="estHoverRow"><span>Observed ({hover.as_of})</span><span>{hover.observed_mbgl} m</span></div>
                {hover.trend_m_per_yr !== null ? (
                  <div className="estHoverRow">
                    <span>YoY change</span>
                    <span style={{ color: hover.trend_m_per_yr > 0 ? "var(--rust)" : "var(--green)" }}>
                      {hover.trend_m_per_yr > 0 ? "↓ " : "↑ "}{Math.abs(hover.trend_m_per_yr)} m/yr
                    </span>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="estHoverHint"><IconInfo /> Hover a mandal for its estimate &amp; band</div>
            )}
          </div>
        </section>

        {/* HONESTY / METHOD */}
        <aside className="card estMethodCard">
          <div className="cardHead">
            <div className="cardTitle"><span className="titleIcon"><IconShield /></span>How honest is this number?</div>
          </div>
          <div className="estMethodBody">
            <p className="estMethodLead">
              We trained on <strong>{bundle.n_mandals} mandals × 12 years</strong> of real APWRIMS depth, then tested by
              hiding entire time periods the model had never seen.
            </p>
            <div className="estMetricGrid">
              <div className="estMetric"><span className="estMetricVal">±{bundle.backtest.forecast_mae_m} m</span><span className="estMetricLbl">typical error (MAE)</span></div>
              <div className="estMetric"><span className="estMetricVal">{bundle.backtest.forecast_r2}</span><span className="estMetricLbl">R² explained</span></div>
              <div className="estMetric"><span className="estMetricVal">+{bundle.backtest.vs_persistence_pct}%</span><span className="estMetricLbl">better than naive</span></div>
            </div>
            <div className="estTerrain">
              <div className="estTerrainHead">Accuracy by terrain (MAE)</div>
              {Object.entries(bundle.backtest.by_terrain_mae_m).map(([k, v]) => (
                <div key={k} className="estTerrainRow">
                  <span>{AQ_LABEL[k] ?? k}</span>
                  <span className="estTerrainBar"><span style={{ width: `${Math.min(100, (v / 2) * 100)}%` }} /></span>
                  <strong>±{v} m</strong>
                </div>
              ))}
            </div>
            <div className="estTerrainHead" style={{ marginTop: 16, marginBottom: 8 }}>Cross-checked against independent data</div>
            <ul className="estCaveats" style={{ borderTop: "none", paddingTop: 0 }}>
              <li><span style={{ color: "var(--green)", fontWeight: 700, width: 14, flexShrink: 0 }}>✓</span> <span>Unseen months (2024–26): <strong>±1.31 m</strong>, R² 0.90 — 45% better than naive.</span></li>
              <li><span style={{ color: "var(--green)", fontWeight: 700, width: 14, flexShrink: 0 }}>✓</span> <span>Independent June-2026 district snapshot: <strong>±0.82 m, r 0.98</strong>.</span></li>
              <li><span style={{ color: "var(--green)", fontWeight: 700, width: 14, flexShrink: 0 }}>✓</span> <span>Year-on-year trend direction: <strong>r 0.93</strong>.</span></li>
              <li><span style={{ color: "var(--amber)", fontWeight: 700, width: 14, flexShrink: 0 }}>±</span> <span>CGWB independent network: official networks differ <strong>3–6 m</strong> by nature (different aquifer zones) — which is <em>why every estimate ships a confidence band</em>.</span></li>
            </ul>
            <ul className="estCaveats">
              <li><IconInfo /> A <strong>modelled estimate</strong> with uncertainty — not a replacement for an official reading.</li>
              <li><IconInfo /> Best where a mandal has some history (nowcast/gap-fill). Hard-rock Rayalaseema is the weakest.</li>
              <li><IconInfo /> Validation is a <strong>temporal hold-out</strong> (unseen months on mandals with history) — not spatial estimation of sensorless mandals. The confidence band is model-derived, not yet calibrated for empirical p10–p90 coverage.</li>
              <li><IconInfo /> Source sensor series carries occasional noise; extreme YoY swings are winsorised.</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* TABLE */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconList /></span>Per-mandal estimates</div>
          <div className="estTableTools">
            <label className="estSearch">
              <IconSearch />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mandal or district…" />
            </label>
            <div className="estSortRow">
              {([["estimate", "Depth"], ["trend", "Decline"], ["band", "Uncertainty"], ["mandal", "A–Z"]] as [SortKey, string][]).map(([k, lbl]) => (
                <button key={k} className={`estSortBtn ${sortKey === k ? "active" : ""}`} onClick={() => setSortKey(k)}>{lbl}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="estTableScroll">
          <table className="estTable">
            <thead>
              <tr>
                <th>Mandal</th><th>District</th><th>Terrain</th>
                <th className="num">Estimate</th><th className="num">Band (p10–p90)</th>
                <th className="num">Observed</th>
                <th
                  className="num"
                  title="Year-on-year change in metres below ground. Positive (+, red) = water table deeper / worse; negative (−, green) = shallower / recovering."
                >
                  YoY <span className="thHint">+deeper · −better</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 120).map((m) => (
                <tr key={m.mkey}>
                  <td><span className="estDot" style={{ background: depthColor(m.estimate_mbgl) }} />{titleCase(m.mandal)}</td>
                  <td className="muted">{titleCase(m.district)}</td>
                  <td className="muted">{AQ_LABEL[m.aquifer] ?? m.aquifer}</td>
                  <td className="num"><strong>{m.estimate_mbgl}</strong> m</td>
                  <td className="num muted">{m.band_p10}–{m.band_p90}</td>
                  <td className="num muted">{m.observed_mbgl}</td>
                  <td className="num" style={{ color: (m.trend_m_per_yr ?? 0) > 0 ? "var(--rust)" : (m.trend_m_per_yr ?? 0) < 0 ? "var(--green)" : "var(--muted)" }}>
                    {m.trend_m_per_yr === null ? "—" : `${m.trend_m_per_yr > 0 ? "+" : ""}${m.trend_m_per_yr}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 120 ? <div className="estTableMore">Showing top 120 of {rows.length} — refine with search.</div> : null}
        </div>
      </section>
    </div>
  );
}
