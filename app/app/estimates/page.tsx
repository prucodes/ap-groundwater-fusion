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
  datasetManifest,
  levelsEstimates,
  mandalByMapKey,
  mapGeometry,
  mandalToPath,
  MAP_VIEW,
  modelCard,
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
            history with climate and terrain features for <strong>current-period temporal nowcasts</strong>.{" "}
            Measured values remain separate, and no forecast horizon is released.{" "}
            <strong>Modelled nowcasts for lag-eligible mandals — not official APWRIMS data.</strong>
          </>
        }
        showChips={false}
      />

      <div className="provRibbon">
        <span className="provRibbonItem"><IconActivity /> APWRIMS-format history · {bundle.n_mandals} modelled mandals · through {datasetManifest.periods.latestObservationPeriod}</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconSatellite /> CHIRPS / TerraClimate · climate context</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconTarget /> gradient-boosted + quantile bands</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconShield /> Prototype · cohort-specific evaluation</span>
      </div>

      <div className="kpiRow stagger">
        <KpiCard
          icon={<IconDroplet />}
          label="Modelled Mandals"
          value={<CountUp value={bundle.n_mandals} />}
          foot="metres below ground, as of latest month"
          accent="var(--teal)"
        />
        <KpiCard
          icon={<IconTarget />}
          label="Temporal Holdout MAE"
          value={<>{bundle.backtest.forecast_mae_m}<span className="unit">m</span></>}
          foot={`${modelCard.evaluations.temporalNowcast.sampleCount.toLocaleString("en-IN")} eligible mandal-months · R² ${bundle.backtest.forecast_r2}`}
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
                const view = mandalByMapKey(m.d, m.m);
                const est = view ? byKey.get(view.id) : undefined;
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
                <div className="estHoverRow"><span>Modelled nowcast</span><strong>{hover.estimate_mbgl} m</strong></div>
                <div className="estHoverRow"><span>Model P10–P90</span><span>{hover.band_p10}–{hover.band_p90} m</span></div>
                <div className="estHoverRow"><span>Latest measured aggregate ({hover.as_of})</span><span>{hover.observed_mbgl} m</span></div>
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
              holding out the 2024–2026 evaluation period for lag-eligible mandal-months.
            </p>
            <div className="estMetricGrid">
              <div className="estMetric"><span className="estMetricVal">{bundle.backtest.forecast_mae_m} m</span><span className="estMetricLbl">rolling temporal holdout MAE</span></div>
              <div className="estMetric"><span className="estMetricVal">{bundle.backtest.forecast_r2}</span><span className="estMetricLbl">R² explained</span></div>
              <div className="estMetric"><span className="estMetricVal">{modelCard.evaluations.spatialEstimation.reportedMetric.maeM} m</span><span className="estMetricLbl">whole-mandal spatial MAE</span></div>
            </div>
            <div className="estTerrain">
              <div className="estTerrainHead">Accuracy by terrain (MAE)</div>
              {Object.entries(bundle.backtest.by_terrain_mae_m).map(([k, v]) => (
                <div key={k} className="estTerrainRow">
                  <span>{AQ_LABEL[k] ?? k}</span>
                  <span className="estTerrainBar"><span style={{ width: `${Math.min(100, (v / 2) * 100)}%` }} /></span>
                  <strong>{v} m</strong>
                </div>
              ))}
            </div>
            <div className="estTerrainHead" style={{ marginTop: 16, marginBottom: 8 }}>Separate evaluation tasks</div>
            <ul className="estCaveats" style={{ borderTop: "none", paddingTop: 0 }}>
              <li><span style={{ color: "var(--green)", fontWeight: 700, width: 14, flexShrink: 0 }}>✓</span> <span>Rolling temporal holdout ({modelCard.evaluations.temporalNowcast.evaluationPeriod.start}–{modelCard.evaluations.temporalNowcast.evaluationPeriod.end}, n={modelCard.evaluations.temporalNowcast.sampleCount.toLocaleString("en-IN")}): <strong>{modelCard.evaluations.temporalNowcast.model.maeM} m MAE</strong>, R² {modelCard.evaluations.temporalNowcast.model.r2}.</span></li>
              <li><span style={{ color: "var(--amber)", fontWeight: 700, width: 14, flexShrink: 0 }}>±</span> <span>Whole-mandal spatial holdout ({modelCard.evaluations.spatialEstimation.mandalCount} mandals): <strong>{modelCard.evaluations.spatialEstimation.reportedMetric.maeM} m MAE</strong>. This is the relevant no-history estimate task.</span></li>
              <li><span style={{ color: "var(--amber)", fontWeight: 700, width: 14, flexShrink: 0 }}>±</span> <span>Same-month CGWB/APWRIMS cross-network comparison (n={modelCard.evaluations.crossNetworkComparison.sampleCount.toLocaleString("en-IN")}): <strong>{modelCard.evaluations.crossNetworkComparison.maeM} m MAE, r {modelCard.evaluations.crossNetworkComparison.correlation}</strong>; a network comparability diagnostic, not model accuracy.</span></li>
              <li><span style={{ color: "var(--green)", fontWeight: 700, width: 14, flexShrink: 0 }}>✓</span> <span>Model P10–P90 empirical coverage: <strong>{modelCard.evaluations.intervalEvaluation.empiricalCoveragePct}%</strong> over {modelCard.evaluations.intervalEvaluation.sampleCount.toLocaleString("en-IN")} eligible holdout rows.</span></li>
            </ul>
            <ul className="estCaveats">
              <li><IconInfo /> A <strong>modelled estimate</strong> with uncertainty — not a replacement for an official reading.</li>
              <li><IconInfo /> Best where a mandal has some history (nowcast/gap-fill). Hard-rock Rayalaseema is the weakest.</li>
              <li><IconInfo /> Temporal nowcast performance does not describe whole-mandal or no-history estimation.</li>
              <li><IconInfo /> The displayed interval is a <strong>model P10–P90 quantile range</strong>, not a guaranteed 80% confidence interval.</li>
              <li><IconInfo /> No future horizon is released; direct forecast experiments remain research-only.</li>
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
                <th className="num">Modelled nowcast</th><th className="num">Model P10–P90</th>
                <th className="num">Latest measured</th>
                <th
                  className="num"
                  title="Year-on-year change in metres below ground. Positive (+, red) = water table deeper / worse; negative (−, green) = shallower / recovering."
                >
                  YoY <span className="thHint">+deeper · −better</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 120).map((m, i) => (
                <tr key={`${m.mkey}-${i}`}>
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
