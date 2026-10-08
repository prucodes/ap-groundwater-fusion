import { HeaderHero } from "../../components/HeaderHero";
import { DistrictMap } from "../../components/DistrictMap";
import {
  IconCloudRain,
  IconDatabase,
  IconDroplet,
  IconInfo,
  IconLeaf,
  IconSatellite,
  IconShield,
  IconWaves,
} from "../../components/icons";
import {
  balanceMeta,
  dashboardSummary,
  districtGeometry,
  formatNumber,
  formatPeriod,
  titleCase,
} from "../../lib/data";
import { waterSummary } from "../../lib/waterSummary";
import { day, signed } from "../../components/agriculture/waterContextFormat";
import { brief } from "../../lib/pageBriefs";
import { RowFold, foldAt } from "../../components/RowFold";

const RAIN_LABEL: Record<string, string> = { excess: "Excess", normal: "Normal", deficient: "Deficient", scanty: "Scanty", noRain: "No rain" };
const RAIN_COLOR: Record<string, string> = { excess: "#2789af", normal: "#5e9c89", deficient: "#ce982b", scanty: "#b64c42", noRain: "#7a2e27" };

export default function ClimatePage() {
  const withBal = districtGeometry.districts.filter(
    (d) => d.water_balance_mm !== null && d.annual_et_mm !== null,
  );
  const avgEt = Math.round(withBal.reduce((a, d) => a + (d.annual_et_mm as number), 0) / withBal.length);
  const avgBal = Math.round(withBal.reduce((a, d) => a + (d.water_balance_mm as number), 0) / withBal.length);
  const avgAnnualRain = avgEt + avgBal; // annual precip = ET + balance
  const deficitDistricts = withBal.filter((d) => d.water_balance_status === "Deficit").length;
  const monthlyRain = dashboardSummary.summary.avg_rainfall_mm;
  const balRange = districtGeometry.layers.water_balance_mm;

  const ranked = [...withBal].sort((a, b) => (a.water_balance_mm as number) - (b.water_balance_mm as number));

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Climate & Water Balance"
        brief={brief("/climate", <><b>{dashboardSummary.summary.deficit_mandals} mandals</b> ran a water-balance deficit in {dashboardSummary.summary.balance_year}.</>)}
        showChips={false}
        variant="compact"
      />

      <div className="provRibbon">
        <span className="provRibbonItem"><IconCloudRain /> CHIRPS v3 rainfall · UCSB · ~5 km</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconCloudRain /> AP DES rain gauges · measured</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconDroplet /> NRSC soil moisture · modelled</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconLeaf /> TerraClimate ET · U. Idaho · ~4 km</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconInfo /> balance year {districtGeometry.balance_year}</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconShield /> open data · modeled/satellite</span>
      </div>

      {/* Water budget flow */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconWaves /></span>Climate balance / equal-weight district mean</div>
          <span className="cardSub">annual, TerraClimate {districtGeometry.balance_year}</span>
        </div>
        <div className="budgetFlow">
          <div className="budgetTile in">
            <span className="budgetIcon"><IconCloudRain /></span>
            <span className="budgetVal">{formatNumber(avgAnnualRain)}<small>mm</small></span>
            <span className="budgetLbl">Annual rainfall in</span>
          </div>
          <span className="budgetOp">−</span>
          <div className="budgetTile out">
            <span className="budgetIcon"><IconLeaf /></span>
            <span className="budgetVal">{formatNumber(avgEt)}<small>mm</small></span>
            <span className="budgetLbl">Evapotranspiration out</span>
          </div>
          <span className="budgetOp">=</span>
          <div className={`budgetTile net ${avgBal < 0 ? "bad" : "good"}`}>
            <span className="budgetIcon"><IconDroplet /></span>
            <span className="budgetVal">{avgBal > 0 ? "+" : ""}{formatNumber(avgBal)}<small>mm/yr</small></span>
            <span className="budgetLbl">Net water balance</span>
          </div>
        </div>
        <div className="budgetMeta">
          <span><b>{deficitDistricts}</b> of {withBal.length} districts carry a low-balance flag</span>
          <span className="dotsep" />
          <span>Latest monthly rainfall (CHIRPS {formatPeriod(districtGeometry.rainfall_period)}): <b>{formatNumber(monthlyRain)} mm</b></span>
        </div>
        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconInfo />
          <span>
            Rainfall minus actual ET is a <strong>climatic indicator</strong>, not an aquifer budget. Runoff, soil storage,
            geology and pumping also matter. The same value cannot establish groundwater recharge, depletion or causality.
          </span>
        </div>
      </section>

      {/* This water year, measured: the state's own gauges and reservoirs, with the NRSC soil model beside them. */}
      {waterSummary.rain || waterSummary.soil ? (
        <section className="card" aria-labelledby="season-districts-title">
          <div className="cardHead">
            <div className="cardTitle" id="season-districts-title"><span className="titleIcon"><IconCloudRain /></span>This water year by district — driest first</div>
            <span className="cardSub">
              {waterSummary.rain ? `gauges ${day(waterSummary.rain.start, false)} to ${day(waterSummary.rain.end)}` : ""}
              {waterSummary.soil ? ` · soil ${day(waterSummary.soil.asOf)}` : ""}
              {waterSummary.reservoirs ? ` · reservoirs ${day(waterSummary.reservoirs.asOf)}` : ""}
            </span>
          </div>
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
                      <td>{d.rain ? `${formatNumber(d.rain.actualMm)} mm` : "—"}</td>
                      <td>{d.rain ? `${formatNumber(d.rain.normalMm)} mm` : "—"}</td>
                      <td className="cellPct" style={{ color: d.rain?.category ? RAIN_COLOR[d.rain.category] : undefined }}>
                        {d.rain ? <>{signed(d.rain.deviationPct, 0)} <span className="wetTag" style={{ color: RAIN_COLOR[d.rain.category ?? "normal"], background: `${RAIN_COLOR[d.rain.category ?? "normal"]}1f` }}>{RAIN_LABEL[d.rain.category ?? ""] ?? "—"}</span></> : "—"}
                      </td>
                      <td>{d.soil ? `${formatNumber(d.soil.medianPct)}% median · ${d.soil.belowOwnMedian}/${d.soil.withBaseline} below usual` : "—"}</td>
                      <td>{d.reservoirs ? `${d.reservoirs.count} · ${formatNumber(d.reservoirs.storagePct)}% (${formatNumber(d.reservoirs.lastYearPct)}% last year)` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </RowFold>
          <div className="fusionNote" style={{ marginTop: 14 }}>
            <IconInfo />
            <span>
              Gauge rain is the AP Directorate of Economics and Statistics network against the department&rsquo;s own normal for the
              water year to date (measured). Soil moisture is the NRSC VIC land-surface model (modelled, driven by rainfall);
              &ldquo;usual&rdquo; is the same calendar day in earlier years since {waterSummary.soil?.firstYear ?? "the record began"}.
              Reservoir storage is measured at the dam; a release is not water delivered to a mandal. All via APWRIMS, research use.
            </span>
          </div>
        </section>
      ) : null}

      {/* Balance map */}
      <section className="card mapCard">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconDroplet /></span>District water balance</div>
          <span className="cardSub">rainfall − ET, mm/yr</span>
        </div>
        <DistrictMap layer="water_balance_mm" height={440} />
        <div className="choroLegend">
          <div className="choroHead">
            <span>Water balance <span className="choroUnit">(mm/yr)</span></span>
            <span className="choroPeriod">TerraClimate {districtGeometry.balance_year}</span>
          </div>
          <div className="choroBar" style={{ background: "linear-gradient(90deg,#c65a46,#e7cf86,#4f9268)" }} />
          <div className="choroScale">
            <span>Deficit · {formatNumber(balRange.min)}</span>
            <span>Surplus · {formatNumber(balRange.max)}</span>
          </div>
        </div>
      </section>

      {/* Provenance */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconDatabase /></span>Sources &amp; provenance</div>
          <span className="cardSub">open climate data</span>
        </div>
        <div className="provGrid">
          <div className="provCard">
            <div className="provCardHead">
              <span className="provCardIcon"><IconCloudRain /></span>
              <div><strong>CHIRPS v3 rainfall</strong><code className="provFile">chirps v3 monthly</code></div>
            </div>
            <dl className="provMeta">
              <div><dt>Provider</dt><dd>UCSB Climate Hazards Center</dd></div>
              <div><dt>Resolution</dt><dd>~5 km <span className="provDim">(0.05°)</span></dd></div>
              <div><dt>Type</dt><dd>satellite + rain-gauge blend</dd></div>
              <div><dt>Cadence</dt><dd>monthly</dd></div>
              <div><dt>Period</dt><dd>{formatPeriod(districtGeometry.rainfall_period)}</dd></div>
              <div><dt>Measures</dt><dd>precipitation (mm)</dd></div>
            </dl>
          </div>
          <div className="provCard">
            <div className="provCardHead">
              <span className="provCardIcon"><IconLeaf /></span>
              <div><strong>TerraClimate</strong><code className="provFile">ET + water balance</code></div>
            </div>
            <dl className="provMeta">
              <div><dt>Provider</dt><dd>University of Idaho</dd></div>
              <div><dt>Resolution</dt><dd>~4 km <span className="provDim">(0.0417°)</span></dd></div>
              <div><dt>Type</dt><dd>modeled climate (not a satellite)</dd></div>
              <div><dt>Cadence</dt><dd>monthly → annual</dd></div>
              <div><dt>Year</dt><dd>{districtGeometry.balance_year}</dd></div>
              <div><dt>Measures</dt><dd>actual ET; balance = rain − ET</dd></div>
            </dl>
          </div>
        </div>
        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconSatellite />
          <span>
            CHIRPS is a real satellite-gauge rainfall product; TerraClimate is a <strong>modeled</strong> climate dataset
            (not a satellite). These research summaries need local validation and do not become official groundwater findings when a climate layer updates. <a href="https://www.climatologylab.org/terraclimate.html" target="_blank" rel="noreferrer">TerraClimate methods and limitations</a>.
          </span>
        </div>
      </section>

      {/* District table */}
      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconWaves /></span>District water balance — ranked driest first</div>
        </div>
        <div className="tableWrap">
          <table className="dataTable">
            <thead>
              <tr><th>District</th><th>Annual rainfall</th><th>Annual ET</th><th>Balance</th><th>Status</th></tr>
            </thead>
            <tbody>
              {ranked.map((d) => {
                const et = d.annual_et_mm as number;
                const bal = d.water_balance_mm as number;
                const bm = balanceMeta(d.water_balance_status);
                return (
                  <tr key={d.d}>
                    <td className="cellStrong">{titleCase(d.d)}</td>
                    <td>{formatNumber(et + bal)} mm</td>
                    <td>{formatNumber(et)} mm</td>
                    <td className="cellPct" style={{ color: bm.color }}>{bal > 0 ? "+" : ""}{formatNumber(bal)} mm</td>
                    <td><span className="wetTag" style={{ color: bm.color, background: `${bm.color}1f` }}>{bm.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
