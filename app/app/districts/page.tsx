"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { HeaderHero } from "../../components/HeaderHero";
import { StatusBadge } from "../../components/Badges";
import { PercentileBar } from "../../components/Signals";
import { ExportCsvButton } from "../../components/ExportButtons";
import { IconActivity, IconMap, IconTarget } from "../../components/icons";
import { balanceMeta, districtRollups, districtSeries, formatNumber, officialStatusLine, statusMeta, titleCase } from "../../lib/data";
import { AiBrief } from "../../components/AiBrief";
import { DistrictChoropleth } from "../../components/DistrictChoropleth";
import { DistrictTrendGrid } from "../../components/DistrictTrendGrid";
import { DistrictProfile } from "../../components/governance/DistrictProfile";
import { RowFold, foldAt } from "../../components/RowFold";
import styles from "../../components/governance/Governance.module.css";
import shared from "../rabi/Rabi.module.css";
import { brief } from "../../lib/pageBriefs";
import { AssessmentTrajectory } from "../../components/AssessmentTrajectory";
import { SeawaterWatch } from "../../components/SeawaterWatch";
import { FieldQueue } from "../../components/FieldQueue";
import { VillageOffsets } from "../../components/VillageOffsets";
import { districtsNow } from "../../lib/pageNow";

/* The 28 districts: how many carry stress, which are going deeper, and one district at a time
   in close-up. The page leads with the count; the profile or the map picks a district, and
   everything below follows it. The decade's decline, an AI briefing and the research that sits
   under the mandal are further down, the research a fold away. */

const signedM = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} m`;

export default function DistrictsPage() {
  const router = useRouter();
  const rollups = districtRollups();
  const [selected, setSelected] = useState(rollups[0]?.district_name);
  const [view, setView] = useState<"profile" | "map">("profile");
  const current = rollups.find((r) => r.district_name === selected) ?? rollups[0];

  // colour every district by its worst stress status for the map
  const stressColors: Record<string, string> = {};
  for (const r of rollups) stressColors[r.district_name] = statusMeta(r.worst_bucket).color;
  // govt-style levels table: deepest / most-stressed first
  const levelRows = [...rollups].sort((a, b) => (b.avg_estimate_mbgl ?? 0) - (a.avg_estimate_mbgl ?? 0));
  const trendSeries = districtSeries();
  const withStress = rollups.filter(r => r.stress_count > 0).length;
  const stressMandals = rollups.reduce((n, r) => n + r.stress_count, 0), allMandals = rollups.reduce((n, r) => n + r.mandal_count, 0);
  const deeper = rollups.filter(r => r.avg_trend_m_per_yr !== null && r.avg_trend_m_per_yr > 0.1).length;
  const deepest = levelRows[0];
  const ROWS = 10;

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero title="Districts" brief={brief("/districts", districtsNow())} showChips={false} variant="compact" />

      <section className={shared.hero} aria-label="The districts in figures" data-testid="districts-summary">
        <div className={shared.heroText}>
          <span className={shared.kicker}>{rollups.length} districts · measured readings and the model&rsquo;s nowcasts</span>
          <h2><b>{withStress} of {rollups.length}</b> districts have mandals in stress, <b>{stressMandals}</b> mandals in all; <b>{deeper}</b> districts are deeper than a year ago on average{deepest?.avg_estimate_mbgl != null ? <>, and the deepest is <b>{titleCase(deepest.district_name)}</b> at {deepest.avg_estimate_mbgl.toFixed(1)} m</> : null}.</h2>
          <p>District figures are equal-weight averages of their mandals, whose reading periods can differ. Pick a district below; the close-up, the decade and the briefing follow it.</p>
        </div>
        <ul className={shared.tiles}>
          <li><span>Districts with stress</span><b data-tone={withStress > rollups.length / 2 ? "bad" : undefined}>{withStress}<small> of {rollups.length}</small></b><em>at least one mandal in the stress status</em></li>
          <li><span>Mandals in stress</span><b data-tone="bad">{stressMandals}</b><em>of {allMandals} prototype units</em></li>
          <li><span>Going deeper</span><b data-tone={deeper > rollups.length / 2 ? "bad" : undefined}>{deeper}<small> of {rollups.length}</small></b><em>districts deeper than a year ago, on average</em></li>
          {deepest?.avg_estimate_mbgl != null ? <li><span>Deepest on average</span><b>{deepest.avg_estimate_mbgl.toFixed(1)}<small> m</small></b><em>{titleCase(deepest.district_name)}, below ground</em></li> : null}
        </ul>
      </section>

      <nav className="jumpNavPlain jumpNav" aria-label="District sections"><a href="#chapter-districts">Pick a district</a><a href="#district-detail">The district close up</a><a href="#district-decline">Eleven years</a><a href="#field-queue">Where a visit counts</a><a href="#district-research">Research</a></nav>

      <section className={shared.block} aria-labelledby="chapter-districts">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconActivity /> {view === "profile" ? "Pressure profile" : "Status map"}</span>
          <h2 id="chapter-districts">Pick a district</h2>
          <p>The profile sets each district&rsquo;s modelled depth against its measured change in a year; the map colours each by its most severe status. Either one picks the district the rest of the page follows.</p>
        </header>
        <div className={styles.districtWorkspace}>
          <div>
            <div className="segmented" aria-label="District view" style={{ marginBottom: 12 }}>
              <button className={`segBtn ${view === "profile" ? "active" : ""}`} aria-pressed={view === "profile"} onClick={() => setView("profile")}><IconActivity /> Profile</button>
              <button className={`segBtn ${view === "map" ? "active" : ""}`} aria-pressed={view === "map"} onClick={() => setView("map")}><IconMap /> Map</button>
            </div>
            {view === "profile" ? <DistrictProfile rows={rollups} selected={selected} onSelect={setSelected} /> : <><DistrictChoropleth layer="gw_percentile" colorOverride={stressColors} overrideLabel={Object.fromEntries(rollups.map(r => [r.district_name, statusMeta(r.worst_bucket).label]))} testId="districts-status-map" label="Districts coloured by their most severe review or coverage category" /><p className="cardNote">Most severe review or coverage category present in the district.</p></>}
          </div>
          <div>
            <h3 className={styles.levelsHead}>District levels / available nowcasts</h3>
            <div className="tableWrap" style={{ maxHeight: 440, overflowY: "auto" }}>
              <table className="dataTable">
                <thead><tr><th>District</th><th className="num">Est. level</th><th className="num">In a year</th><th className="num">Stress</th><th>Status</th></tr></thead>
                <tbody>
                  {levelRows.map((r) => {
                    const t = r.avg_trend_m_per_yr;
                    const tcol = t !== null && t > 0.1 ? "var(--rust)" : t !== null && t < -0.1 ? "var(--green)" : "var(--muted)";
                    return (
                      <tr key={r.district_name} className={selected === r.district_name ? "selected" : ""}>
                        <td className="cellStrong"><button className="linkAction" onClick={() => setSelected(r.district_name)}>{titleCase(r.district_name)}</button></td>
                        <td className="num"><strong>{r.avg_estimate_mbgl == null ? "–" : r.avg_estimate_mbgl.toFixed(1)}</strong> m</td>
                        <td className="num" style={{ color: tcol, whiteSpace: "nowrap" }}>{t === null ? "No comparison" : signedM(t)}</td>
                        <td className="num" style={{ color: r.stress_count ? "var(--rust)" : "var(--muted)" }}>{r.stress_count}</td>
                        <td><StatusBadge bucket={r.worst_bucket} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="cardNote">Metres below ground; &ldquo;in a year&rdquo; is the measured change, + deeper and − shallower.</p>
          </div>
        </div>
      </section>

      {current && (
        <section className={shared.block} id="district-detail" aria-labelledby="district-detail-title">
          <header className={shared.blockHead}>
            <span className={shared.eyebrow}>The district close up</span>
            <h2 id="district-detail-title">{titleCase(current.district_name)}</h2>
            <p><b>{current.stress_count}</b> of {current.mandal_count} mandals in stress, <b>{current.normal_count}</b> stable; {current.mandals.filter(m => m.estimate_mbgl != null).length} have a model nowcast.{current.avg_estimate_mbgl !== null ? <> On average <b>{current.avg_estimate_mbgl.toFixed(1)} m</b> below ground{current.avg_trend_m_per_yr !== null ? <>, {signedM(current.avg_trend_m_per_yr)} in a year</> : null}.</> : null}</p>
          </header>
          <div className={styles.detailTools}><ExportCsvButton rows={current.mandals} filename={`ap_${current.district_name.toLowerCase()}_mandals.csv`} /></div>
          <RowFold id="district-mandal-rows" total={current.mandals.length} visible={ROWS} noun="mandals">
            <div className="tableWrap">
              <table className="dataTable">
                <thead><tr><th>Mandal</th><th>Historical median</th><th>Estimate β</th><th>NASA groundwater</th><th>Root zone</th><th>Water balance</th><th>Status</th></tr></thead>
                <tbody>
                  {current.mandals.map((m, i) => (
                    <tr key={m.id} onClick={() => router.push(`/mandals/${m.id}`)} {...foldAt(i, ROWS)}>
                      <td className="cellStrong">{titleCase(m.mandal_name)}</td>
                      <td>{m.median_groundwater_mbgl == null ? "–" : m.median_groundwater_mbgl.toFixed(1)} <small style={{ color: "var(--muted-2)" }}>m</small></td>
                      <td><strong>{m.estimate_mbgl == null ? "–" : m.estimate_mbgl.toFixed(1)}</strong> <small style={{ color: "var(--muted-2)" }}>m</small></td>
                      <td><PercentileBar value={m.groundwater_percentile} /></td>
                      <td><PercentileBar value={m.rootzone_percentile} /></td>
                      <td>{m.water_balance_status ? <span className="toneText" style={{ "--tone": balanceMeta(m.water_balance_status).color, fontWeight: 600, fontSize: 11.5 } as CSSProperties}>{balanceMeta(m.water_balance_status).label}</span> : "–"}</td>
                      <td><StatusBadge bucket={m.status_bucket} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RowFold>
        </section>
      )}

      <section className={shared.block} id="district-decline" aria-labelledby="district-decline-title">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}>Measured history · steepest deepening first</span>
          <h2 id="district-decline-title">Eleven years, district by district</h2>
        </header>
        <DistrictTrendGrid series={trendSeries} selected={selected} onSelect={setSelected} />
      </section>

      <section className={shared.block} id="field-queue" aria-labelledby="field-queue-title">
        <header className={shared.blockHead} id="chapter-look">
          <span className={shared.eyebrow}><IconTarget /> Interval width, population and irrigated area, each ranked against every mandal</span>
          <h2 id="field-queue-title">Where a visit would be worth most</h2>
        </header>
        <FieldQueue />
      </section>

      <details className="foldMore" id="district-brief">
        <summary><span>Ask about {current ? titleCase(current.district_name) : "a district"}</span><span>An AI briefing grounded in the fused data</span></summary>
        <AiBrief district={selected} onDistrictChange={setSelected} />
      </details>

      <details className="foldMore" id="district-research"><summary><span>Long-term assessment and village research</span><span>Methods, comparisons and limits</span></summary>
      <section className={shared.block} id="assessment-trajectory" aria-labelledby="assessment-title">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}>Official category against twelve years of measured pre-monsoon depth</span>
          <h2 id="assessment-title">Where the decade disagrees with the assessment</h2>
        </header>
        <AssessmentTrajectory />
      </section>

      <section className={shared.block} id="seawater-watch" aria-labelledby="seawater-title">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}>Ground height minus measured depth · an estimate to verify</span>
          <h2 id="seawater-title">Where the water table sits below sea level</h2>
        </header>
        <SeawaterWatch />
      </section>

      <section className={shared.block} id="village-offsets" aria-labelledby="village-title">
        <header className={shared.blockHead} id="chapter-village">
          <span className={shared.eyebrow}>Below the mandal · tested on CGWB&rsquo;s own Andhra well records</span>
          <h2 id="village-title">Can a level be given per village?</h2>
        </header>
        <VillageOffsets />
      </section>

      <p className="cardNote"><strong>Prototype roll-up.</strong> Aggregated from APWRIMS readings (2014 to 2026) and NASA satellite-model percentiles. {officialStatusLine}</p>
      </details>
    </div>
  );
}
