import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import {
  IconActivity,
  IconAlert,
  IconCloudRain,
  IconDroplet,
  IconGlobe,
  IconInfo,
  IconMap,
  IconShield,
  IconWaves,
} from "../../components/icons";
import { ExportMonsoonWatchButton } from "../../components/ExportButtons";
import { ElNinoChain, EnsoTrail, RainfallHistory, RechargeMap, RechargeTrajectory } from "../../components/MonsoonVisuals";
import { PacificEnso } from "../../components/PacificEnso";
import { MonsoonFilm } from "../../components/MonsoonFilm";
import { TemperatureRecord } from "../../components/TemperatureRecord";
import { WatchEvidenceStatus } from "../../components/WatchEvidenceStatus";
import { apTemperature, formatNumber, monsoonWatch, pacificEnso, titleCase } from "../../lib/data";
import styles from "./MonsoonPage.module.css";

const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthName(period: string) {
  return `${MONTHS[Number(period.slice(5, 7))]} ${period.slice(0, 4)}`;
}

/** Names arrive from the source already presentable ("Y.S.R Kadapa", "NTR");
 *  only the all-capitals ones need casing, and title-casing the rest turns
 *  "Y.S.R" into "Y.s.r". */
function displayName(value: string) {
  return /[a-z]/.test(value) ? value : titleCase(value);
}

const ENSO_LABEL: Record<string, string> = {
  el_nino: "El Niño",
  la_nina: "La Niña",
  neutral: "Neutral",
};

export default function MonsoonPage() {
  const w = monsoonWatch;
  const r = w.recharge;
  const enso = w.enso;
  const rain = w.rainfall;
  const sw = w.elNinoRainfall.swMonsoon;
  const ne = w.elNinoRainfall.neMonsoon;
  const prior = w.seasons.filter((s) => s.year !== w.season.year);
  const priorFalling = prior.map((s) => s.fallingPct);
  const priorLow = priorFalling.length ? Math.min(...priorFalling) : null;
  const priorHigh = priorFalling.length ? Math.max(...priorFalling) : null;
  const worst = w.mandals.filter((m) => m.status !== "normal").slice(0, 25);
  const maxFalling = Math.max(...w.seasons.map((s) => s.fallingPct));

  return (
    <div className={`pageWrap ${styles.page}`}>
      <HeaderHero
        title={enso?.state === "el_nino" ? "Monsoon Watch — El Niño" : "Monsoon Watch"}
        subtitle={
          <>
            {enso?.state === "el_nino" ? (
              <>
                The retained Pacific index indicates <strong>{enso.strength} El Niño conditions</strong> at{" "}
                {enso.oniC > 0 ? "+" : ""}
                {enso.oniC.toFixed(2)} °C for {enso.season} {enso.asOf.slice(0, 4)}.
                Andhra Pradesh rainfall and groundwater changes are shown alongside that climate context.{" "}
              </>
            ) : null}
            Compare each mandal&rsquo;s measured groundwater change with its own past seasons.
            Water-volume shortfalls are derived estimates. The index is context; no model on this site uses it.
          </>
        }
        showChips={false}
        variant="compact"
      />

      <div className="provRibbon">
        <span className="provRibbonItem"><IconDroplet /> APWRIMS monthly readings</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconCloudRain /> CHIRPS rainfall · 1981–{w.season.year}</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconGlobe /> NOAA Oceanic Niño Index</span>
        <span className="provRibbonDot" />
        <span className="provRibbonItem"><IconShield /> observations + derived estimates</span>
      </div>

      <WatchEvidenceStatus />
      <nav className={styles.nav} aria-label="Monsoon sections"><a href="#season-evidence">Season evidence</a><a href="#monsoon-film-title">Film brief</a><a href="#pacific-evidence">Pacific record</a><a href="#monsoon-map">Groundwater map</a><Link href="/agriculture#agriculture-brief">Agriculture review →</Link></nav>

      <section className={styles.season} id="season-evidence" aria-label="Season evidence">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconActivity /></span>
            This season so far
          </div>
          <span className="cardSub">
            {monthName(w.season.preMonsoonMonth)} → {monthName(w.season.latestMonth)} · {r.mandals} source series
          </span>
        </div>
        <div className="monsoonHeadline">
          <div className="monsoonStat">
            <span>Lower than in May</span>
            <strong>{formatNumber(r.fallingPct)}%</strong>
            <em>
              {r.falling} of {r.mandals} source series
              {priorLow === null || priorHigh === null
                ? ""
                : ` · ${formatNumber(priorLow)}–${formatNumber(priorHigh)}% in the previous ${prior.length} seasons`}
            </em>
          </div>
          <div className="monsoonStat">
            <span>Short of retained baseline</span>
            <strong>{formatNumber(r.shortOfNormalPct)}%</strong>
            <em>median shortfall {formatNumber(r.medianShortfallM)} m</em>
          </div>
          <div className="monsoonStat">
            <span>Provisional shortfall flags</span>
            <strong>{r.flaggedShort}</strong>
            <em>{r.flaggedSevere} larger shortfalls · not crop loss</em>
          </div>
          {r.volume ? (
            <div className="monsoonStat">
              <span>State storage estimate</span>
              <strong>Under review</strong>
              <em>Boundary duplicates and specific-yield assumptions require validation</em>
            </div>
          ) : null}
          {rain ? (
            <div className="monsoonStat">
              <span>Rain, {monthName(`${w.season.year}-${rain.months.slice(0, 2)}`).slice(0, 3)}–
                {MONTHS[Number(rain.months.slice(3))]}</span>
              <strong>{formatNumber(rain.anomalyPct)}%</strong>
              <em>
                {formatNumber(rain.mm)} mm against {formatNumber(rain.normalMm)} normal · {rain.rankDriest}
                {rain.rankDriest === 1 ? "st" : rain.rankDriest === 2 ? "nd" : rain.rankDriest === 3 ? "rd" : "th"}
                {" "}driest of {rain.ofYears} since {rain.firstYear}
              </em>
            </div>
          ) : null}
        </div>
        <p className="cardNote">{r.rule}. Source-series totals are not unique boundary counts; the Agriculture review uses reconciled boundary units. Baseline review pending.</p>
      </section>
      <MonsoonFilm />

      <section className="card pacificEvidenceSection" id="pacific-evidence">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconWaves /></span>
            Pacific evidence explorer
          </div>
          <span className="cardSub">monthly ocean reconstruction, {pacificEnso.months[0].month} to{" "}
            {pacificEnso.months[pacificEnso.months.length - 1].month}</span>
        </div>
        <p className="cardLede">
          El Niño is a recurring warming of the central and eastern equatorial Pacific, coupled with changes
          in atmospheric circulation. The film explains the mechanism; this record shows how ocean
          temperature anomalies evolved. Rainfall over India also depends on the Indian Ocean and local weather.
        </p>
        <PacificEnso />
        <details className="pacificSourceNotes">
        <summary>Source and index notes</summary>
        <p className="cardNote">
          {pacificEnso.source}. Earth imagery: {pacificEnso.basemapSource}. The figure beside each month is that
          <strong> single month&rsquo;s</strong> average anomaly in the Niño 3.4 box. The published index —{" "}
          {enso ? `the ${enso.oniC > 0 ? "+" : ""}${enso.oniC.toFixed(2)} °C quoted above` : "the one quoted above"} — is a
          three-month running mean of the same box, so it lags a fast-rising month and reads lower. Computed here
          against a 1991–2020 baseline, the running mean lands within about 0.2 °C of NOAA&rsquo;s published
          value throughout this event.
        </p>
        </details>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconGlobe /></span>
            From ocean context to local groundwater evidence
          </div>
          <span className="cardSub">observations, association and derived estimates</span>
        </div>
        <ElNinoChain />
        <p className="cardNote">
          The ocean index, gridded rainfall estimates and groundwater source readings are different kinds
          of evidence. The ocean-rain link is a historical statistical association,
          not a mechanism this site models or a forecast for an individual district.
          Groundwater movement also reflects pumping and local conditions.
        </p>
      </section>

      <section className="card mapCard" id="monsoon-map">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconMap /></span>
            Seasonal groundwater departures
          </div>
          <span className="cardSub">each mandal against its own ten-year normal</span>
        </div>
        <p className="cardLede">
          These are changes in each mandal&rsquo;s groundwater readings since May, compared with its
          own historical change by {monthName(w.season.latestMonth).split(" ")[0]}.
          Rainfall, pumping, geology and other local factors can contribute; this map does not attribute
          individual changes to El Niño.
        </p>
        <RechargeMap />
        {r.volume ? (
          <p className="cardNote">
            <strong>Depth change is not measured recharge or water lost.</strong> The volume view is an
            illustrative storage proxy using prototype area and specific yield, which may be interpolated
            or assigned from an aquifer proxy. It is not an extraction entitlement or an allocation estimate.
            Multiple series mapped to one boundary are left unresolved, not silently selected or added.
          </p>
        ) : null}
        {r.flaggedWithoutBoundary > 0 ? (
          <p className="cardNote">
            {r.flaggedWithoutBoundary} flagged source series are <strong>not on this map</strong>: they
            never reconciled to a boundary polygon, so there is nothing to shade. They are in the table below and
            in the export. A map that quietly omitted them would be worse than one that says so.
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconWaves /></span>
            How deep it goes, season by season
          </div>
          <span className="cardSub">source-series median change from May · {r.mandals} series</span>
        </div>
        <RechargeTrajectory />
        <p className="cardNote">
          Plotted as change from May, with a historical range from the retained comparison seasons.
          A rise or fall in water level alone does not isolate recharge from pumping, geology or changes in monitoring.
        </p>
      </section>

      <div className="monsoonGrid">
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon"><IconWaves /></span>
              How widespread it is, year by year
            </div>
            <span className="cardSub">share of source series lower than in May</span>
          </div>
          <div className="seasonBars">
            {w.seasons.map((s) => (
              <div className={`seasonBar ${s.year === w.season.year ? "current" : ""}`} key={s.year}>
                <span className="seasonBarLabel">{s.year}</span>
                <span className="seasonBarTrack">
                  <span
                    className="seasonBarFill"
                    style={{ width: `${Math.round((s.fallingPct / maxFalling) * 100)}%` }}
                  />
                </span>
                <span className="seasonBarValue">{formatNumber(s.fallingPct)}%</span>
                <span className="seasonBarOni">
                  {s.oniJjaC === null ? "—" : `${s.oniJjaC > 0 ? "+" : ""}${s.oniJjaC.toFixed(2)}`}
                </span>
              </div>
            ))}
          </div>
          <p className="cardNote">
            Right-hand column is the Oceanic Niño Index for that June–August. It is shown for context and is
            <strong> not</strong> an input to the groundwater-depth comparisons. It is used to group years in the historical rainfall analysis below.
          </p>
        </section>

        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon"><IconGlobe /></span>
              Ocean state
            </div>
            <span className="cardSub">NOAA CPC, updated monthly</span>
          </div>
          {enso ? (
            <>
              <div className={`ensoDial ${enso.state}`}>
                <span className="ensoState">{ENSO_LABEL[enso.state]}</span>
                <strong>
                  {enso.oniC > 0 ? "+" : ""}
                  {enso.oniC.toFixed(2)} °C
                </strong>
                <em>
                  {enso.season} {enso.asOf.slice(0, 4)} · {enso.strength}
                  {enso.trend3moC === null
                    ? ""
                    : ` · ${enso.trend3moC > 0 ? "+" : ""}${enso.trend3moC.toFixed(2)} °C in three months`}
                </em>
              </div>
              <EnsoTrail />
              <p className="cardNote">
                {enso.index}. The traditional ONI episode criterion uses at least five overlapping seasons
                at or above +0.5 °C (warm) or at or below −0.5 °C (cool). Current conditions and official
                declarations also consider atmospheric evidence; this index is not a local forecast.
              </p>
            </>
          ) : (
            <p className="cardNote">No index available.</p>
          )}
        </section>
      </div>

      {sw && ne ? (
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon"><IconCloudRain /></span>
              Andhra Pradesh rainfall in warm-index years
            </div>
            <span className="cardSub">
              CHIRPS, {sw.firstYear}–{sw.lastYear}, mandal means
            </span>
          </div>
          <RainfallHistory />
          <div className="ensoSeasons">
            {[
              { key: "sw", label: "South-west monsoon", months: "June–September", c: sw },
              { key: "ne", label: "North-east monsoon", months: "October–December", c: ne },
            ].map(({ key, label, months, c }) => (
              <div className="ensoSeasonCard" key={key}>
                <span className="ensoSeasonName">{label}</span>
                <span className="ensoSeasonMonths">{months} · {formatNumber(c.meanMm)} mm normal</span>
                <strong className={c.elNinoAnomalyPct !== null && c.elNinoAnomalyPct < 0 ? "bad" : "good"}>
                  {c.elNinoAnomalyPct !== null && c.elNinoAnomalyPct > 0 ? "+" : ""}
                  {formatNumber(c.elNinoAnomalyPct)}%
                </strong>
                <em>average across {c.elNinoYears} warm-index years</em>
                <div className="ensoSeasonFacts">
                  <span>
                    Below normal in <strong>{c.elNinoBelowNormal} of {c.elNinoYears}</strong> warm-index years,
                    against {c.belowNormalAllYears} of {c.allYears} years overall.
                  </span>
                  {c.elNinoRangePct ? (
                    <span>
                      Individual warm-index years ranged{" "}
                      <strong>
                        {formatNumber(c.elNinoRangePct[0])}% to {c.elNinoRangePct[1] > 0 ? "+" : ""}
                        {formatNumber(c.elNinoRangePct[1])}%
                      </strong>
                      .
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <p className="cardNote">
            Historical composites use years whose JJA (summer) or OND (winter) ONI is at least +0.5 °C,
            not a count of independent confirmed events. Small samples and other climate influences limit
            interpretation. These averages are neither a local forecast nor evidence that El Niño caused a particular loss.
          </p>
          <div className="ensoHonesty">
            <span className="validationEyebrow"><IconInfo /> Why the index is context and never a prediction</span>
            <p>
              Adding the Oceanic Niño Index to the three-month forecast was tested on rolling origin and made it{" "}
              <strong>worse</strong> — 1.776 m to 1.850 m mean error, and worse in every aquifer. Two El Niño
              events inside the training record are not enough to learn a response from, so the model does not
              use it. Groundwater changes come from the readings and rainfall estimates from CHIRPS.
              ONI is used to group historical rainfall years for comparison, not to forecast local outcomes.
            </p>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconActivity /></span>
            The other cost: heat
          </div>
          <span className="cardSub">
            {apTemperature.records.ghcn_cams.firstYear}–{apTemperature.records.ghcn_cams.lastYear} ·
            two independent records
          </span>
        </div>
        <p className="cardLede">
          Two gridded historical temperature products provide climate context. Their trends and warm-index
          composites differ; neither is a field temperature measurement, attribution of a local heat event,
          or a forecast of crop water demand.
        </p>
        <TemperatureRecord />
        <p className="cardNote">
          Sources: {Object.values(apTemperature.records).map((r) => `${r.label} (${r.note})`).join("; ")}.
          Sampled by how much of each grid cell falls inside the state, weighted by latitude.{" "}
          <strong>No rate is published as a single figure and nothing here is projected forward</strong> — this
          site carries no climate model, and the same rule keeps the ocean index out of the groundwater
          forecast.
        </p>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconAlert /></span>
            Where the shortfall is
          </div>
          <span className="cardSub">district median, metres against own normal</span>
        </div>
        <div className="tableWrap capped">
          <table className="dataTable compact">
            <thead>
              <tr>
                <th>District</th>
                <th>Source series</th>
                <th>This season</th>
                <th>Typical</th>
                <th>Shortfall</th>
                <th>Flagged</th>
              </tr>
            </thead>
            <tbody>
              {w.districts.map((d) => (
                <tr key={d.district}>
                  <td>{displayName(d.district)}</td>
                  <td>{d.mandals}</td>
                  <td>{d.thisSeasonM > 0 ? "+" : ""}{formatNumber(d.thisSeasonM)} m</td>
                  <td>{d.typicalM > 0 ? "+" : ""}{formatNumber(d.typicalM)} m</td>
                  <td className={d.shortfallM > 0 ? "bad" : "good"}>
                    {d.shortfallM > 0 ? "+" : ""}{formatNumber(d.shortfallM)} m
                  </td>
                  <td>{d.shortMandals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cardNote">
          A positive depth change means the water table fell between May and {monthName(w.season.latestMonth)}.
          These district medians summarise retained source-series comparisons; they are not area-weighted
          recharge estimates. Historical-baseline approval remains pending.
        </p>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconDroplet /></span>
            Provisional groundwater review queue
          </div>
          <span className="cardSub">
            {r.flaggedShort} source series · {worst.length} shown, largest departure first
          </span>
        </div>
        <div className="watchActions">
          <ExportMonsoonWatchButton />
          <span>
            All {r.flaggedShort} source-series rows with their own numbers. Baseline and identity verification
            are required before operational use; this is not an irrigation instruction.
          </span>
        </div>
        <div className="tableWrap capped">
          <table className="dataTable compact">
            <thead>
              <tr>
                <th>Mandal</th>
                <th>District</th>
                <th>Aquifer</th>
                <th>This season</th>
                <th>Typical</th>
                <th>Shortfall</th>
                <th title="Illustrative estimate: depth departure x specific yield x prototype area">Storage proxy</th>
                <th>Recorded depth</th>
              </tr>
            </thead>
            <tbody>
              {worst.map((m) => (
                <tr key={m.mandalUuid}>
                  <td>
                    {displayName(m.mandal)}
                    {m.status === "severe" ? <span className="sevPill">severe</span> : null}
                  </td>
                  <td>{displayName(m.district)}</td>
                  <td>{m.aquifer.replace("_", " ")}</td>
                  <td>{m.thisSeasonM > 0 ? "+" : ""}{formatNumber(m.thisSeasonM)} m</td>
                  <td>{m.typicalM > 0 ? "+" : ""}{formatNumber(m.typicalM)} m</td>
                  <td className="bad">+{formatNumber(m.shortfallM)} m</td>
                  <td>{m.shortfallMm3 === null ? "—" : `${formatNumber(m.shortfallMm3)} Mm³`}</td>
                  <td>{formatNumber(m.latestDepthM)} m bgl</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="cardNote">
          A mandal is flagged only when it misses its own normal by at least {formatNumber(1)} m{" "}
          <strong>and</strong> by at least twice its own year-to-year spread. Either test alone fails: metres
          alone flag every naturally swinging hard-rock mandal, and spread alone flags a delta mandal that moved
          twenty centimetres more than usual. <Link href="/methodology">How this is built</Link>.
        </p>
      </section>
    </div>
  );
}
