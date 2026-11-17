import type { CSSProperties } from "react";
import { HeaderHero } from "../../components/HeaderHero";
import { DistrictChoropleth } from "../../components/DistrictChoropleth";
import { RankList } from "../../components/RankList";
import { IconCloudRain, IconWaves } from "../../components/icons";
import { balanceMeta, dashboardSummary, districtGeometry, districtLayerColor, formatNumber, formatPeriod, titleCase } from "../../lib/data";
import { waterSummary } from "../../lib/waterSummary";
import { day, signed } from "../../components/agriculture/waterContextFormat";
import { brief } from "../../lib/pageBriefs";
import { RowFold, foldAt } from "../../components/RowFold";
import shared from "../rabi/Rabi.module.css";

/* The water budget behind the groundwater: a year's rain in, what plants and soil return to
   the air, and what is left, by district; beside it this water year as the State's own gauges,
   soil model and reservoirs read it. A climatic indicator, never an aquifer budget: runoff,
   soil storage, geology and pumping all sit between it and the water table. */

const RAIN_LABEL: Record<string, string> = { excess: "Excess", normal: "Normal", deficient: "Deficient", scanty: "Scanty", noRain: "No rain" };
const RAIN_COLOR: Record<string, string> = { excess: "#2789af", normal: "#5e9c89", deficient: "#ce982b", scanty: "#b64c42", noRain: "#7a2e27" };
const mm = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNumber(Math.abs(Math.round(v)))}`;

export default function ClimatePage() {
  const withBal = districtGeometry.districts.filter(d => d.water_balance_mm !== null && d.annual_et_mm !== null);
  const avgEt = Math.round(withBal.reduce((a, d) => a + (d.annual_et_mm as number), 0) / withBal.length);
  const avgBal = Math.round(withBal.reduce((a, d) => a + (d.water_balance_mm as number), 0) / withBal.length);
  const avgAnnualRain = avgEt + avgBal; // annual precipitation = ET + balance
  const low = withBal.filter(d => d.water_balance_status === "Deficit").length;
  const balRange = districtGeometry.layers.water_balance_mm;
  const ranked = [...withBal].sort((a, b) => (a.water_balance_mm as number) - (b.water_balance_mm as number));
  // The thinnest are read against 250 mm a year, where the ample band begins: how far short each one is.
  const thinnest = ranked.slice(0, 5), AMPLE = 250;
  const year = districtGeometry.balance_year;

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero
        title="Climate & Water Balance"
        brief={brief("/climate", <><b>{dashboardSummary.summary.below_zero_mandals} mandals</b> ran a water-balance deficit in {dashboardSummary.summary.balance_year}, and {dashboardSummary.summary.deficit_mandals - (dashboardSummary.summary.below_zero_mandals ?? 0)} more kept under 50 mm.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={shared.hero} aria-label="The water budget in figures" data-testid="climate-summary">
        <div className={shared.heroText}>
          <span className={shared.kicker}>Water in, water out · {year}, district average</span>
          <h2>A year&rsquo;s rain brings about <b>{formatNumber(avgAnnualRain)} mm</b>; plants and soil give <b>{formatNumber(avgEt)} mm</b> back to the air, leaving <b>{mm(avgBal)} mm</b>. <b>{low} of {withBal.length}</b> districts keep under 50 mm.</h2>
          <p>Rain from CHIRPS v3, evaporation from TerraClimate (a climate model). A climatic indicator, not an aquifer budget: runoff, soil storage, geology and pumping all sit between it and the water table.</p>
        </div>
        <ul className={shared.tiles}>
          <li><span>Rain in</span><b>{formatNumber(avgAnnualRain)}<small> mm</small></b><em>a year, CHIRPS v3 · latest month {formatPeriod(districtGeometry.rainfall_period)}</em></li>
          <li><span>Back to the air</span><b>{formatNumber(avgEt)}<small> mm</small></b><em>actual evapotranspiration, TerraClimate {year}</em></li>
          <li><span>Left over</span><b data-tone={avgBal < 50 ? "bad" : undefined}>{mm(avgBal)}<small> mm</small></b><em>rain minus evaporation, district average</em></li>
          {waterSummary.rain ? <li><span>This water year</span><b data-tone={waterSummary.rain.deviationPct !== null && waterSummary.rain.deviationPct < -19 ? "bad" : undefined}>{signed(waterSummary.rain.deviationPct)}</b><em>gauge rain against normal, to {day(waterSummary.rain.end, false)}</em></li> : null}
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="climate-balance">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconWaves /> Rain minus evaporation, {year}</span>
          <h2 id="climate-balance">Where the balance runs thin</h2>
          {thinnest.length ? <p>Thinnest in <b>{titleCase(thinnest[0].d)}</b> at {mm(thinnest[0].water_balance_mm as number)} mm a year; the low band is anything under 50 mm, which includes some districts still slightly above zero.</p> : null}
        </header>
        <div className={shared.soilGrid}>
          <div>
            <DistrictChoropleth layer="water_balance_mm" testId="climate-district-map" label="Districts coloured by annual water balance, rainfall minus actual evapotranspiration" />
            <div className="choroLegend">
              <div className="choroHead"><span>Water balance <span className="choroUnit">(mm a year)</span></span><span className="choroPeriod">TerraClimate {year}</span></div>
              <div className="choroBar" style={{ background: "linear-gradient(90deg,#c65a46,#e7cf86,#4f9268)" }} />
              <div className="choroScale"><span>Thin · {mm(balRange.min)}</span><span>Ample · {mm(balRange.max)}</span></div>
            </div>
          </div>
          <div className={shared.soilSide}>
            <RankList title="Thinnest five" rows={thinnest.map(d => ({ name: titleCase(d.d), value: `${mm(d.water_balance_mm as number)} mm`, share: (100 * Math.max(0, d.water_balance_mm as number)) / AMPLE,
              color: districtLayerColor("water_balance_mm", d.water_balance_mm, false), note: `${formatNumber(Math.round((d.annual_et_mm as number) + (d.water_balance_mm as number)))} mm in, ${formatNumber(Math.round(d.annual_et_mm as number))} out` }))}
              foot="Each bar runs to 250 mm a year, where the ample band begins. Rain minus actual evapotranspiration over the whole year: the same value cannot establish recharge, depletion or a cause." />
          </div>
        </div>
      </section>

      {/* This water year, measured: the state's own gauges and reservoirs, with the NRSC soil model beside them. */}
      {waterSummary.rain || waterSummary.soil ? (
        <section className={shared.block} aria-labelledby="season-districts-title">
          <header className={shared.blockHead}>
            <span className={shared.eyebrow}><IconCloudRain /> Measured this water year</span>
            <h2 id="season-districts-title">This water year by district, driest first</h2>
            <p>
              {waterSummary.rain ? `gauges ${day(waterSummary.rain.start, false)} to ${day(waterSummary.rain.end)}` : ""}
              {waterSummary.soil ? ` · soil ${day(waterSummary.soil.asOf)}` : ""}
              {waterSummary.reservoirs ? ` · reservoirs ${day(waterSummary.reservoirs.asOf)}` : ""}
            </p>
          </header>
          <div className="budgetMeta">
            {waterSummary.rain ? <span>Statewide gauge rain <b>{signed(waterSummary.rain.deviationPct)}</b> against normal (area-weighted, {waterSummary.rain.gauges.toLocaleString("en-IN")} gauges)</span> : null}
            {waterSummary.soil ? <><span className="dotsep" /><span>Soil below its usual level for the date in <b>{waterSummary.soil.belowOwnMedian}</b> of {waterSummary.soil.withBaseline} mandals</span></> : null}
            {waterSummary.reservoirs ? <><span className="dotsep" /><span>Reservoirs <b>{formatNumber(waterSummary.reservoirs.storagePct)}%</b> full against {formatNumber(waterSummary.reservoirs.lastYearPct)}% a year ago</span></> : null}
          </div>
          <RowFold id="climate-district-rows" total={waterSummary.districts.filter((d) => d.rain || d.soil).length} visible={10} noun="districts">
          <div className="tableWrap">
            <table className="dataTable">
              <thead>
                <tr><th>District</th><th>Gauge rain</th><th>Normal</th><th>Departure</th><th>Soil moisture 30 cm</th><th>Reservoirs</th></tr>
              </thead>
              <tbody>
                {waterSummary.districts.filter((d) => d.rain || d.soil)
                  .sort((a, b) => (a.rain?.deviationPct ?? 999) - (b.rain?.deviationPct ?? 999))
                  .map((d, i) => (
                    <tr key={d.key} {...foldAt(i, 10)}>
                      <td className="cellStrong">{titleCase(d.district)}</td>
                      <td>{d.rain ? `${formatNumber(d.rain.actualMm)} mm` : "–"}</td>
                      <td>{d.rain ? `${formatNumber(d.rain.normalMm)} mm` : "–"}</td>
                      <td className={d.rain?.category ? "cellPct toneText" : "cellPct"} style={d.rain?.category ? { "--tone": RAIN_COLOR[d.rain.category] } as CSSProperties : undefined}>
                        {d.rain ? <>{signed(d.rain.deviationPct, 0)} <span className="wetTag toneText" style={{ "--tone": RAIN_COLOR[d.rain.category ?? "normal"], background: `${RAIN_COLOR[d.rain.category ?? "normal"]}1f` } as CSSProperties}>{RAIN_LABEL[d.rain.category ?? ""] ?? "–"}</span></> : "–"}
                      </td>
                      <td>{d.soil ? `${formatNumber(d.soil.medianPct)}% median · ${d.soil.belowOwnMedian}/${d.soil.withBaseline} below usual` : "–"}</td>
                      <td>{d.reservoirs ? `${d.reservoirs.count} · ${formatNumber(d.reservoirs.storagePct)}% (${formatNumber(d.reservoirs.lastYearPct)}% last year)` : "–"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </RowFold>
          <p className="cardNote">
              Gauge rain is the AP Directorate of Economics and Statistics network against the department&rsquo;s own normal for the
              water year to date (measured). Soil moisture is the NRSC VIC land-surface model (modelled, driven by rainfall);
              &ldquo;usual&rdquo; is the same calendar day in earlier years since {waterSummary.soil?.firstYear ?? "the record began"}.
              Reservoir storage is measured at the dam; a release is not water delivered to a mandal. All via APWRIMS, research use.
          </p>
        </section>
      ) : null}

      <details className="foldMore">
        <summary><span>District water balance, all {ranked.length}</span><span>Rain in, evaporation out and what is left, thinnest first</span></summary>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>District</th><th>Annual rainfall</th><th>Annual ET</th><th>Balance</th><th>Band</th></tr></thead>
            <tbody>
              {ranked.map(d => {
                const et = d.annual_et_mm as number, bal = d.water_balance_mm as number, bm = balanceMeta(d.water_balance_status);
                return (
                  <tr key={d.d}>
                    <td className="cellStrong">{titleCase(d.d)}</td>
                    <td>{formatNumber(Math.round(et + bal))} mm</td>
                    <td>{formatNumber(Math.round(et))} mm</td>
                    <td className="cellPct toneText" style={{ "--tone": bm.color } as CSSProperties}>{mm(bal)} mm</td>
                    <td><span className="wetTag toneText" style={{ "--tone": bm.color, background: `${bm.color}1f` } as CSSProperties}>{bal < 0 ? "Deficit" : bm.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <details className="foldMore">
        <summary><span>The sources</span><span>CHIRPS v3 rainfall and TerraClimate evaporation</span></summary>
        <div className="provGrid">
          <div className="provCard">
            <div className="provCardHead"><div><strong>CHIRPS v3 rainfall</strong><code className="provFile">chirps v3 monthly</code></div></div>
            <dl className="provMeta">
              <div><dt>Provider</dt><dd>UCSB Climate Hazards Center</dd></div>
              <div><dt>Resolution</dt><dd>~5 km <span className="provDim">(0.05°)</span></dd></div>
              <div><dt>Type</dt><dd>satellite and rain-gauge blend</dd></div>
              <div><dt>Cadence</dt><dd>monthly</dd></div>
              <div><dt>Period</dt><dd>{formatPeriod(districtGeometry.rainfall_period)}</dd></div>
            </dl>
          </div>
          <div className="provCard">
            <div className="provCardHead"><div><strong>TerraClimate</strong><code className="provFile">ET and water balance</code></div></div>
            <dl className="provMeta">
              <div><dt>Provider</dt><dd>University of Idaho</dd></div>
              <div><dt>Resolution</dt><dd>~4 km <span className="provDim">(0.0417°)</span></dd></div>
              <div><dt>Type</dt><dd>modelled climate, not a satellite</dd></div>
              <div><dt>Cadence</dt><dd>monthly, summed to the year</dd></div>
              <div><dt>Year</dt><dd>{year}</dd></div>
            </dl>
          </div>
        </div>
        <p className="cardNote">CHIRPS blends satellite and gauge rain; TerraClimate is a modelled climate dataset. These summaries need local checking and do not become groundwater findings when a climate layer updates. <a href="https://www.climatologylab.org/terraclimate.html" target="_blank" rel="noreferrer">TerraClimate documentation</a>.</p>
      </details>
    </div>
  );
}
