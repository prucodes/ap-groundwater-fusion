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
import { formatNumber, monsoonWatch, titleCase } from "../../lib/data";

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
    <div className="pageWrap">
      <HeaderHero
        title={enso?.state === "el_nino" ? "Monsoon Watch — El Niño" : "Monsoon Watch"}
        subtitle={
          <>
            {enso?.state === "el_nino" ? (
              <>
                A <strong>{enso.strength} El Niño</strong> is in place — the Pacific index stands at{" "}
                {enso.oniC > 0 ? "+" : ""}
                {enso.oniC.toFixed(2)} °C for {enso.season} {enso.asOf.slice(0, 4)}, the warmest
                June–August in the 1950–{enso.asOf.slice(0, 4)} record. Across 45 years an El Niño
                costs Andhra Pradesh about {sw ? Math.abs(sw.elNinoAnomalyPct ?? 0) : 15}% of its monsoon rain.
                This one has cost {rain ? Math.abs(rain.anomalyPct) : 0}%, and the water table has not
                recharged.{" "}
              </>
            ) : null}
            Every figure below is a measured change in a mandal&rsquo;s own readings against that same
            mandal&rsquo;s own past seasons. The index is context; no model on this site uses it.
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
        <span className="provRibbonItem"><IconShield /> measured, not modelled</span>
      </div>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconActivity /></span>
            This season so far
          </div>
          <span className="cardSub">
            {monthName(w.season.preMonsoonMonth)} → {monthName(w.season.latestMonth)} · {r.mandals} mandals
          </span>
        </div>
        <div className="monsoonHeadline">
          <div className="monsoonStat">
            <span>Lower than in May</span>
            <strong>{formatNumber(r.fallingPct)}%</strong>
            <em>
              {r.falling} of {r.mandals} mandals
              {priorLow === null || priorHigh === null
                ? ""
                : ` · ${formatNumber(priorLow)}–${formatNumber(priorHigh)}% in the previous ${prior.length} seasons`}
            </em>
          </div>
          <div className="monsoonStat">
            <span>Short of their own normal</span>
            <strong>{formatNumber(r.shortOfNormalPct)}%</strong>
            <em>median shortfall {formatNumber(r.medianShortfallM)} m</em>
          </div>
          <div className="monsoonStat">
            <span>Flagged short</span>
            <strong>{r.flaggedShort}</strong>
            <em>{r.flaggedSevere} of them severe</em>
          </div>
          {r.volume ? (
            <div className="monsoonStat">
              <span>Water short</span>
              <strong>{formatNumber(Math.round(r.volume.shortfallMm3))}<small> Mm³</small></strong>
              <em>
                across {r.volume.mandals} mandals · {formatNumber(r.volume.asDepthMm)} mm over the{" "}
                {formatNumber(Math.round(r.volume.areaKm2))} km² measured
              </em>
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
        <p className="cardNote">{r.rule}.</p>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconGlobe /></span>
            How an El Niño reaches a well in Andhra Pradesh
          </div>
          <span className="cardSub">four steps, each one measured</span>
        </div>
        <ElNinoChain />
        <p className="cardNote">
          Explainers of El Niño stop at the ocean — they show the Pacific warming and never reach a monsoon,
          let alone an aquifer. Three of the links above are measured directly in Andhra Pradesh. The one
          between the ocean and the rain is a <strong>statistical association across 45 years</strong>, strong
          and consistent in direction, and it is not a mechanism this site models: the ocean explains why a
          poor monsoon was more likely, never how much rain any particular month will bring.
        </p>
      </section>

      <section className="card mapCard">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconMap /></span>
            Where the season failed
          </div>
          <span className="cardSub">each mandal against its own ten-year normal</span>
        </div>
        <p className="cardLede">
          This is the El Niño arriving in the aquifer. Not a model of it — the change each mandal&rsquo;s own
          well has recorded since May, set against what that well normally does by{" "}
          {monthName(w.season.latestMonth).split(" ")[0]}. The monsoon is the mechanism: rain is down{" "}
          {rain ? Math.abs(rain.anomalyPct) : 0}% and the water has not come back.
        </p>
        <RechargeMap />
        {r.volume ? (
          <p className="cardNote">
            <strong>Metres are not water.</strong> A metre of water table in hard rock holds a fraction of what a
            metre in the delta does, so the two views rank mandals differently and answer different questions:
            metres answer whether a bore will still reach water, volume answers how much this place has actually
            lost. {r.volume.note.charAt(0).toUpperCase() + r.volume.note.slice(1)}.{" "}
            {r.volume.mandals} of {r.volume.ofMandals} compared mandals have a polygon and so a volume.
          </p>
        ) : null}
        {r.flaggedWithoutBoundary > 0 ? (
          <p className="cardNote">
            {r.flaggedWithoutBoundary} flagged mandals are <strong>not on this map</strong>: their source series
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
          <span className="cardSub">statewide median change from May · {r.mandals} mandals</span>
        </div>
        <RechargeTrajectory />
        <p className="cardNote">
          Plotted as change from May rather than depth, so each year starts at zero and the lines can be read
          against each other. Every season before this one turns down as the monsoon arrives. This one does not.
        </p>
      </section>

      <div className="monsoonGrid">
        <section className="card">
          <div className="cardHead">
            <div className="cardTitle">
              <span className="titleIcon"><IconWaves /></span>
              How widespread it is, year by year
            </div>
            <span className="cardSub">share of mandals lower than in May</span>
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
            <strong> not</strong> used to produce any figure on this page.
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
                {enso.index}. At or above +0.5 °C for five overlapping seasons is an El Niño, at or below
                −0.5 °C a La Niña.
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
              What El Niño has actually done to Andhra Pradesh&rsquo;s rain
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
                <em>average across {c.elNinoYears} El Niño years</em>
                <div className="ensoSeasonFacts">
                  <span>
                    Below normal in <strong>{c.elNinoBelowNormal} of {c.elNinoYears}</strong> El Niño years,
                    against {c.belowNormalAllYears} of {c.allYears} years overall.
                  </span>
                  {c.elNinoRangePct ? (
                    <span>
                      Individual El Niño years ranged{" "}
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
            The south-west monsoon signal is strong and consistent. The north-east monsoon is not: it is often
            assumed to compensate south-east peninsular India during an El Niño, and in Andhra Pradesh&rsquo;s
            own record it does not — but neither does it reliably fail. Planning the rabi season on a
            north-east monsoon rescue is a coin flip, and this page will not call it one way or the other.
          </p>
          <div className="ensoHonesty">
            <span className="validationEyebrow"><IconInfo /> Why the index is context and never a prediction</span>
            <p>
              Adding the Oceanic Niño Index to the three-month forecast was tested on rolling origin and made it{" "}
              <strong>worse</strong> — 1.776 m to 1.850 m mean error, and worse in every aquifer. Two El Niño
              events inside the training record are not enough to learn a response from, so the model does not
              use it, and no figure on this page is derived from it. The recharge numbers come from the readings
              and the rainfall numbers from CHIRPS; the ocean state is shown beside them so a reader can see
              what the deficit sits in.
            </p>
          </div>
        </section>
      ) : null}

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
                <th>Mandals</th>
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
          A positive change means the water table fell between May and {monthName(w.season.latestMonth)}, when it
          should be rising. &ldquo;Typical&rdquo; is the median of the same district&rsquo;s mandals over the
          previous ten seasons.
        </p>
      </section>

      <section className="card">
        <div className="cardHead">
          <div className="cardTitle">
            <span className="titleIcon"><IconDroplet /></span>
            Mandals flagged short
          </div>
          <span className="cardSub">
            {r.flaggedShort} in total · {worst.length} shown, worst first
          </span>
        </div>
        <div className="watchActions">
          <ExportMonsoonWatchButton />
          <span>
            All {r.flaggedShort} rows with their own numbers — the list a district office can work from. Nothing
            in it authorizes an irrigation instruction.
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
                <th title="Metres of water table x the mandal's specific yield x its area">Water short</th>
                <th>Now at</th>
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
                  <td>{formatNumber(m.latestDepthM)} m</td>
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
