"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { motion } from "motion/react";
import { HeaderHero } from "../../components/HeaderHero";
import { DistrictChoropleth } from "../../components/DistrictChoropleth";
import { PickerGlide } from "../../components/PickerGlide";
import { IconCloudRain, IconPause, IconPlay } from "../../components/icons";
import { balanceMeta, balanceStatusFor, districtGeometry, formatNumber, monsoonWatch, titleCase } from "../../lib/data";
import { waterSummary } from "../../lib/waterSummary";
import { monthSpan } from "../../components/agriculture/waterContextFormat";
import { brief } from "../../lib/pageBriefs";
import { rainNow } from "../../lib/pageNow";
import shared from "../rabi/Rabi.module.css";
import styles from "./Scenario.module.css";

type Row = {
  d: string;
  baseBalance: number;
  scenarioBalance: number;
  baseStatus: string;
  scenarioStatus: string;
  tipped: boolean;
};

/* The El Nino preset used to read "IMD outlook - 92% of LPA" with a delta of
   -8. Nothing on this site sourced that forecast, and it sat beside a measured
   deficit on the Monsoon Watch page that disagreed with it. The preset now
   carries what this project actually measured -- CHIRPS over the elapsed
   monsoon months against its own 1981-onward mean -- so the two pages agree and
   the number can be checked. */
function presets() {
  const rain = monsoonWatch.rainfall;
  const enso = monsoonWatch.enso;
  const measured = rain ? Math.round(rain.anomalyPct) : null;
  return [
    { key: "normal", label: "Reference year", sub: `TerraClimate ${districtGeometry.balance_year}`, delta: 0, tone: "#5e9b6b" },
    ...(measured !== null && rain ? [{
      key: "elnino",
      label: `${enso?.state === "el_nino" ? "El Niño" : "This monsoon"} ${monsoonWatch.season.year}`,
      sub:
        rain && measured !== null
          ? `${rain.product.split(" monthly")[0]} ${monthSpan(rain.months)} · ${measured}% anomaly`
          : "measured so far",
      delta: measured,
      tone: "#d79b2e",
      flagship: true,
    }] : []),
    { key: "below", label: "Lower rainfall", sub: "Illustrative stress test", delta: -20, tone: "#c98a1e" },
    { key: "drought", label: "Severe reduction", sub: "Not a drought classification", delta: -40, tone: "#c65a46" },
  ];
}

export default function ScenarioPage() {
  const PRESETS = presets();
  const [delta, setDelta] = useState(-30); // monsoon anomaly %, default 30% below normal
  const [playing, setPlaying] = useState(false);
  const dirRef = useRef(-1);

  // Simulation sweep: bounce the monsoon dial between +20% and −50% so the
  // map plays through recovery → drought and back. Modeled scenario, not history.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setDelta((d) => {
        let next = d + dirRef.current * 5;
        if (next <= -50) { next = -50; dirRef.current = 1; }
        else if (next >= 20) { next = 20; dirRef.current = -1; }
        return next;
      });
    }, 480);
    return () => clearInterval(id);
  }, [playing]);

  const rows = useMemo<Row[]>(() => {
    const f = delta / 100;
    return districtGeometry.districts
      .filter((d) => d.water_balance_mm !== null && d.annual_et_mm !== null)
      .map((d) => {
        const balance = d.water_balance_mm as number;
        const et = d.annual_et_mm as number;
        const precip = balance + et; // annual precipitation
        const scenarioBalance = Math.round((balance + precip * f) * 10) / 10;
        const baseStatus = balanceStatusFor(balance);
        const scenarioStatus = balanceStatusFor(scenarioBalance);
        return {
          d: d.d,
          baseBalance: balance,
          scenarioBalance,
          baseStatus,
          scenarioStatus,
          tipped: baseStatus !== "Deficit" && scenarioStatus === "Deficit",
        };
      })
      .sort((a, b) => a.scenarioBalance - b.scenarioBalance);
  }, [delta]);

  const deficitNow = rows.filter((r) => r.baseStatus === "Deficit").length;
  const deficitScenario = rows.filter((r) => r.scenarioStatus === "Deficit").length;
  const tipped = rows.filter((r) => r.tipped).length;
  const total = rows.length;

  const label = delta === 0 ? `the ${districtGeometry.balance_year} reference rainfall` : `annual rainfall ${Math.abs(delta)}% ${delta < 0 ? "below" : "above"} the ${districtGeometry.balance_year} reference`;

  const scenarioMap = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { m[r.d] = r.scenarioBalance; });
    return m;
  }, [rows]);
  const average = Math.round(rows.reduce((a, r) => a + r.scenarioBalance, 0) / (total || 1));
  const tone = delta < 0 ? "dry" : delta > 0 ? "wet" : "even";
  const signedPct = `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`;
  const mm = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatNumber(Math.abs(Math.round(v)))}`;
  const widest = Math.max(1, ...rows.map(r => Math.abs(r.scenarioBalance)));
  const SHOWN = 10;

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero title="Scenario Planner" brief={brief("/scenario", <>Starts from this season: {rainNow()}</>)} showChips={false} variant="compact" />

      <section className={shared.hero} aria-label="The scenario and what it does" data-testid="scenario-summary">
        <div className={shared.heroText}>
          <span className={shared.kicker}>A what-if over {districtGeometry.balance_year}, not a forecast</span>
          <h2 aria-live="polite">With {label}, <b>{deficitScenario} of {total}</b> districts sit in the low-balance band{tipped > 0 ? <>; <b>{tipped}</b> of them cross into it</> : null}.</h2>
          <div className={styles.controls}>
            <div className={styles.presets} role="group" aria-label="Scenario presets">
              <PickerGlide />
              {PRESETS.map(p => (
                <button key={p.key} type="button" aria-pressed={delta === p.delta} title={p.sub} onClick={() => { setPlaying(false); setDelta(p.delta); }}>
                  {p.label}<small>{p.delta > 0 ? "+" : p.delta < 0 ? "−" : ""}{Math.abs(p.delta)}%</small>
                </button>
              ))}
            </div>
            <div className={styles.dial} data-tone={tone}>
              <button type="button" className={styles.play} onClick={() => setPlaying(on => !on)} aria-label={playing ? "Pause the sweep" : "Play the sweep from wet to dry and back"}>
                {playing ? <IconPause /> : <IconPlay />}
              </button>
              <input type="range" min={-50} max={20} step={5} value={delta} onChange={event => { setPlaying(false); setDelta(Number(event.target.value)); }} aria-label="Monsoon anomaly percent" />
              <output className={styles.value}>{signedPct}</output>
            </div>
          </div>
        </div>
        <ul className={shared.tiles}>
          <li><span>In the low band</span><b data-tone={deficitScenario > deficitNow ? "bad" : undefined}>{deficitScenario}<small> of {total}</small></b><em>{deficitNow} in the reference year</em></li>
          <li><span>Crossing into it</span><b data-tone={tipped > 0 ? "bad" : undefined}>{tipped}</b><em>districts not in the band at reference rainfall</em></li>
          <li><span>Average balance</span><b data-tone={average < 50 ? "bad" : undefined}>{mm(average)}<small> mm</small></b><em>a year, under this scenario</em></li>
          <li><span>Rain change</span><b>{signedPct}</b><em>on the {districtGeometry.balance_year} reference year</em></li>
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="scenario-where">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconCloudRain /> Rain minus evaporation, rescaled</span>
          <h2 id="scenario-where">Where it tips first</h2>
          <p>Each district&rsquo;s year of rain is scaled by the dial while evaporation is held where it was. Press play to sweep from {"+20%"} to {"−50%"} and back; the districts reorder as they go.</p>
        </header>
        <div className={shared.soilGrid}>
          <div className={styles.mapStage}>
            <DistrictChoropleth layer="water_balance_mm" scenarioValues={scenarioMap} testId="scenario-district-map" label={`Districts coloured by water balance with annual rainfall ${signedPct}: a modelled scenario`} />
            <div className="choroLegend">
              <div className="choroHead"><span>Water balance under the scenario <span className="choroUnit">(mm a year)</span></span><span className="choroPeriod">{playing ? "Sweeping" : "Modelled"}</span></div>
              <div className="choroBar" style={{ background: "linear-gradient(90deg,#c65a46,#e7cf86,#4f9268)" }} />
              <div className="choroScale"><span>Thin</span><span>Ample</span></div>
            </div>
          </div>
          <div className={styles.thinnest}>
            <h3>The {SHOWN} thinnest under this scenario</h3>
            <ol>
              {rows.slice(0, SHOWN).map(r => {
                const sm = balanceMeta(r.scenarioStatus);
                return (
                  <motion.li layout transition={{ type: "spring", stiffness: 500, damping: 42 }} key={r.d} data-tipped={r.tipped || undefined}>
                    <span className={styles.name}>{titleCase(r.d)}{r.tipped ? <small>crosses in</small> : null}</span>
                    <span className={styles.track} aria-hidden="true"><i style={{ width: `${Math.max(2, (100 * Math.abs(r.scenarioBalance)) / widest)}%`, "--tone": sm.color } as CSSProperties} data-no-reveal="" /></span>
                    <b style={{ color: sm.color }}>{mm(r.scenarioBalance)}</b>
                  </motion.li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      <details className="foldMore">
        <summary><span>All {total} districts under this scenario</span><span>From the reference year to the scenario, thinnest first</span></summary>
        <div className="tableWrap">
          <table className="dataTable">
            <thead><tr><th>District</th><th>Reference year</th><th>Under the scenario</th><th>Balance</th></tr></thead>
            <tbody>
              {rows.map(r => {
                const sm = balanceMeta(r.scenarioStatus), bm = balanceMeta(r.baseStatus);
                return (
                  <tr key={r.d}>
                    <td className="cellStrong">{titleCase(r.d)}{r.tipped ? <span className="verifyPill">crosses in</span> : null}</td>
                    <td><span className="wetTag toneText" style={{ "--tone": bm.color, background: `${bm.color}1f` } as CSSProperties}>{bm.label}</span></td>
                    <td><span className="wetTag toneText" style={{ "--tone": sm.color, background: `${sm.color}1f` } as CSSProperties}>{sm.label}</span></td>
                    <td className="cellPct toneText" style={{ "--tone": sm.color } as CSSProperties}>{mm(r.scenarioBalance)} mm</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>

      <details className="foldMore">
        <summary><span>How the scenario is worked out</span><span>What is scaled, what is held, and what it cannot say</span></summary>
        <p className="cardNote">
          Annual rainfall is scaled by the dial and actual evapotranspiration is held where it was; the balance is the scaled rain minus that evaporation, sorted into the
          prototype&rsquo;s bands (ample at 250 mm or more, balanced at 50 mm or more, low under 50 mm). A sensitivity test over TerraClimate {districtGeometry.balance_year}, not
          a calibrated forecast. The low band means under 50 mm, which includes some positive balances; it does not mean evaporation exceeds rain or that groundwater is being depleted.
        </p>
        {monsoonWatch.enso?.state === "el_nino" && monsoonWatch.rainfall ? (
          <p className="cardNote">
            The published ONI indicates {monsoonWatch.enso.strength} El Niño conditions. {monsoonWatch.rainfall.product.split(" monthly")[0]} rainfall for {monthSpan(monsoonWatch.rainfall.months)} was {Math.abs(monsoonWatch.rainfall.anomalyPct)}% {monsoonWatch.rainfall.anomalyPct < 0 ? "below" : "above"} its historical mean{waterSummary.rain?.deviationPct !== null && waterSummary.rain?.deviationPct !== undefined ? <>, and the State&rsquo;s rain gauges read {Math.abs(waterSummary.rain.deviationPct)}% {waterSummary.rain.deviationPct < 0 ? "below" : "above"} normal from 1 June</> : null}.
            The &ldquo;{PRESETS.find(p => p.flagship)?.label}&rdquo; preset reuses that seasonal anomaly to scale a whole year: an illustration, not an ENSO forecast.
          </p>
        ) : null}
      </details>
    </div>
  );
}
