"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { HeaderHero } from "../../components/HeaderHero";
import { DistrictMap } from "../../components/DistrictMap";
import { IconArrowRight, IconCloudRain, IconDroplet, IconInfo } from "../../components/icons";
import { balanceMeta, balanceStatusFor, districtGeometry, formatNumber, monsoonWatch, titleCase } from "../../lib/data";
import { waterSummary } from "../../lib/waterSummary";
import { monthSpan } from "../../components/agriculture/waterContextFormat";

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
  const sweepPct = ((20 - delta) / 70) * 100; // position along +20%…−50% sweep

  return (
    <div className="pageWrap">
      <HeaderHero
        title="Scenario Planner"
        subtitle={
          <>
            Stress-test the statewide water balance: drag the monsoon dial to see <strong>which districts tip into
            deficit</strong>. Real TerraClimate {districtGeometry.balance_year} balance, simplified scenario.
          </>
        }
        showChips={false}
        variant="compact"
      />

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle"><span className="titleIcon"><IconCloudRain /></span>Scenario presets</div>
          <span className="cardSub">annual rainfall sensitivity / not a forecast</span>
        </div>
        <div className="presetRow">
          {PRESETS.map((p, i) => {
            const active = delta === p.delta;
            return (
              <motion.button
                key={p.key}
                type="button"
                onClick={() => { setPlaying(false); setDelta(p.delta); }}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className={`presetCard ${p.flagship ? "flagship" : ""} ${active ? "active" : ""}`}
                style={{ ["--pt" as string]: p.tone }}
              >
                {p.flagship && <span className="presetPulse" />}
                <span className="presetVal">{p.delta > 0 ? "+" : ""}{p.delta}%</span>
                <span className="presetLabel">{p.label}</span>
                <span className="presetSub">{p.sub}</span>
                {active && <motion.span layoutId="presetActive" className="presetActiveBar" />}
              </motion.button>
            );
          })}
        </div>
        <div className="fusionNote" style={{ marginTop: 12 }}>
          <IconInfo />
          <span>
            {monsoonWatch.enso?.state === "el_nino" && monsoonWatch.rainfall ? (
              <>
                The published ONI indicates {monsoonWatch.enso.strength} El Niño conditions. {monsoonWatch.rainfall.product.split(" monthly")[0]} rainfall for {monthSpan(monsoonWatch.rainfall.months)} was{" "}
                <strong>{Math.abs(monsoonWatch.rainfall.anomalyPct)}% {monsoonWatch.rainfall.anomalyPct < 0 ? "below" : "above"}</strong> its historical mean
                {waterSummary.rain?.deviationPct !== null && waterSummary.rain?.deviationPct !== undefined ? <>; the state&rsquo;s rain gauges read {Math.abs(waterSummary.rain.deviationPct)}% {waterSummary.rain.deviationPct < 0 ? "below" : "above"} normal from 1 June to {waterSummary.rain.end}</> : null}.
                Reusing that seasonal anomaly to scale a whole reference year is an illustrative assumption, not an ENSO forecast.{" "}
              </>
            ) : null}
            Tap a preset to model its effect on the statewide water balance — a modelled scenario over real
            TerraClimate data, not a prediction.
          </span>
        </div>
      </section>

      <section className="card mapCard">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconCloudRain /></span>
            Rainfall sensitivity / climate balance
          </div>
          <div className={`simBadge ${playing ? "live" : ""}`}>
            <span className="simBadgeDot" /> {playing ? "SIMULATING" : "MODELED SCENARIO"}
          </div>
        </div>

        <div className="simStage">
          <DistrictMap layer="water_balance_mm" height={430} scenarioValues={scenarioMap} />
          <div className="simOverlay">
            <div className="simReadout" style={{ color: delta < 0 ? "var(--rust)" : delta > 0 ? "var(--green)" : "var(--ink)" }}>
              {delta > 0 ? "+" : ""}{delta}%
              <span className="simReadoutLbl">annual rainfall</span>
            </div>
            <div className="simCounters">
              <span className="simCount">
                <motion.b
                  key={deficitScenario}
                  initial={{ scale: 0.55, opacity: 0.4 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 600, damping: 24 }}
                  style={{ color: "var(--rust)", display: "inline-block" }}
                >
                  {deficitScenario}
                </motion.b>
                /{total} in deficit
              </span>
              {tipped > 0 && <span className="simCount tip"><b>{tipped}</b> newly tipped</span>}
            </div>
          </div>
        </div>

        <div className="simControls">
          <button type="button" className={`simPlayBtn ${playing ? "on" : ""}`} onClick={() => setPlaying((p) => !p)}>
            {playing ? (
              <><span className="simIcoPause" /> Pause</>
            ) : (
              <><span className="simIcoPlay" /> Run simulation</>
            )}
          </button>
          <div className="simTrack">
            <span className="simTrackFill" style={{ width: `${sweepPct}%` }} />
            <span className="simTrackHead" style={{ left: `${sweepPct}%` }} />
            <span className="simTrackLabels"><span>+20% wet</span><span>normal</span><span>−50% drought</span></span>
          </div>
        </div>

        <div className="fusionNote" style={{ marginTop: 4 }}>
          <IconInfo />
          <span>
            Press play to sweep the monsoon dial and watch districts shift toward deficit (deeper rust) and back. This is
            a <strong>modeled what-if</strong> over real TerraClimate {districtGeometry.balance_year} balance — a planning
            aid, not a forecast.
          </span>
        </div>
      </section>

      <section className="card">
        <div className="scenarioHead">
          <div className="scenarioDial">
            <span className="eyebrow">Monsoon scenario</span>
            <div className="scenarioValue" style={{ color: delta < 0 ? "var(--rust)" : delta > 0 ? "var(--green)" : "var(--ink)" }}>
              {delta > 0 ? "+" : ""}
              {delta}%
            </div>
            <span className="scenarioSub">{titleCase(label)}</span>
          </div>
          <div className="scenarioSliderWrap">
            <input
              type="range"
              className="scrubber scenarioSlider"
              min={-50}
              max={20}
              step={5}
              value={delta}
              onChange={(e) => setDelta(Number(e.target.value))}
              aria-label="Monsoon anomaly percent"
            />
            <div className="scenarioTicks">
              <span>−50%</span>
              <span>−25%</span>
              <span>normal</span>
              <span>+20%</span>
            </div>
          </div>
        </div>

        <div className="scenarioKpis">
          <div className="scenarioKpi">
            <span className="skNum">{deficitScenario}<span className="skOf">/{total}</span></span>
            <span className="skLbl">districts in deficit</span>
            <span className="skMeta">{deficitNow} in reference year</span>
          </div>
          <div className="scenarioKpi">
            <span className="skNum" style={{ color: tipped > 0 ? "var(--rust)" : "var(--green)" }}>{tipped}</span>
            <span className="skLbl">newly tip into deficit</span>
            <span className="skMeta">vs reference rainfall</span>
          </div>
          <div className="scenarioKpi">
            <span className="skNum">{formatNumber(Math.round(rows.reduce((a, r) => a + r.scenarioBalance, 0) / (total || 1)))}</span>
            <span className="skLbl">avg balance (mm/yr)</span>
            <span className="skMeta">under scenario</span>
          </div>
        </div>

        <div className="scenarioHeadline">
          <IconCloudRain />
          <span>
            Under <strong>{label}</strong>, <strong style={{ color: "var(--rust)" }}>{deficitScenario} of {total}</strong> AP
            district groups enter the prototype low-balance category{tipped > 0 ? <>; <strong>{tipped} newly cross</strong> its threshold.</> : "."}
          </span>
        </div>

        <div className="scenarioList">
          {rows.map((r) => {
            const sm = balanceMeta(r.scenarioStatus);
            const bm = balanceMeta(r.baseStatus);
            return (
              <motion.div
                layout
                transition={{ type: "spring", stiffness: 500, damping: 42 }}
                className={`scenarioRow ${r.tipped ? "tipped" : ""}`}
                key={r.d}
              >
                <div className="srName">
                  {titleCase(r.d)}
                  {r.tipped && <span className="srTip">tips into deficit</span>}
                </div>
                <div className="srFlow">
                  <span className="srStatus" style={{ color: bm.color, background: `${bm.color}1f` }}>{bm.label}</span>
                  <IconArrowRight />
                  <span className="srStatus" style={{ color: sm.color, background: `${sm.color}1f` }}>{sm.label}</span>
                </div>
                <div className="srBar">
                  <span className="srBarMid" />
                  <span
                    className="srBarFill"
                    style={{
                      background: sm.color,
                      left: r.scenarioBalance >= 0 ? "50%" : undefined,
                      right: r.scenarioBalance < 0 ? "50%" : undefined,
                      width: `${Math.min(50, (Math.abs(r.scenarioBalance) / 900) * 50)}%`,
                    }}
                  />
                </div>
                <div className="srVal" style={{ color: sm.color }}>
                  {r.scenarioBalance > 0 ? "+" : ""}
                  {formatNumber(r.scenarioBalance)} mm
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="fusionNote" style={{ marginTop: 16 }}>
          <IconInfo />
          <span>
            <strong>Simplified scenario:</strong> annual rainfall is scaled by the monsoon dial and actual ET is held
            constant; balance = scaled rainfall − ET, re-tiered (Surplus ≥ 250, Balanced ≥ 50, Deficit &lt; 50 mm/yr). A
            sensitivity test over TerraClimate data, not a calibrated forecast. The legacy "Deficit" label means below 50 mm,
            including some positive balances; it does not necessarily mean ET exceeds rainfall or establish groundwater depletion.
          </span>
        </div>
      </section>
    </div>
  );
}
