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
        subtitle={
          <>
            The water <strong>budget</strong> behind groundwater: how much rain comes in (CHIRPS) versus how much leaves
            as evaporation and transpiration (TerraClimate). The home for the two open climate signals — with full
            source provenance. Annual figures, mm.
          </>
        }
        showChips={false}
      />

      <div className="provRibbon">
        <span className="provRibbonItem"><IconCloudRain /> CHIRPS rainfall · UCSB · ~5 km</span>
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
          <div className="cardTitle"><span className="titleIcon"><IconWaves /></span>The water budget — statewide average</div>
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
          <span><b>{deficitDistricts}</b> of {withBal.length} districts run an annual deficit</span>
          <span className="dotsep" />
          <span>Latest monthly rainfall (CHIRPS {formatPeriod(districtGeometry.rainfall_period)}): <b>{formatNumber(monthlyRain)} mm</b></span>
        </div>
        <div className="fusionNote" style={{ marginTop: 14 }}>
          <IconInfo />
          <span>
            When rainfall exceeds ET the aquifer can recharge (surplus); when ET wins, the area draws down (deficit).
            This is the <strong>input/output</strong> story — it explains <em>why</em> groundwater moves; it is not itself
            a groundwater level.
          </span>
        </div>
      </section>

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
              <div><strong>CHIRPS rainfall</strong><code className="provFile">chirps monthly</code></div>
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
            (not a satellite). Both are open and free. Figures are prototype values pending official APWRIMS data.
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
