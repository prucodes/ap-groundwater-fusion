import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { IconArrowRight, IconCloudRain, IconDroplet, IconGlobe, IconLeaf, IconSatellite, IconWaves } from "../../components/icons";
import { day } from "../../components/agriculture/waterContextFormat";
import { CROP_WATER_STATES } from "../../lib/cropWater";
import { titleCase } from "../../lib/data";
import { rabiView, SOIL_CLASSES, type SoilClass } from "../../lib/rabi";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import styles from "./Rabi.module.css";

export const metadata: Metadata = {
  title: "Rabi Outlook | AP Water Intelligence",
  description: "What the rabi season starts with: reservoir storage for irrigated rabi, soil moisture in rainfed mandals against their own past, and the northeast monsoon under El Niño.",
};

const pct = (value: number | null | undefined, digits = 0) => (value === null || value === undefined ? "—" : `${value.toFixed(digits)}%`);
const signed = (value: number | null | undefined, digits = 0) =>
  value === null || value === undefined ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
const tmc = (value: number) => (value >= 100 ? Math.round(value).toLocaleString("en-IN") : value.toFixed(1));
const place = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));
const CLASS_ORDER: SoilClass[] = ["record", "below", "above", "irrigated", "none"];
/** One character per class for the map: "i" and "n" are the neutral keys the map greys in dark mode. */
const KEY: Record<SoilClass, string> = { record: "r", below: "b", above: "a", irrigated: "i", none: "n" };

export default function RabiPage() {
  const v = rabiView();
  const res = v.reservoirs, soil = v.soil, rain = v.rain, enso = v.enso;
  const dry = soil ? soil.record + soil.below : 0;
  const hardest = res ? [...res.basins].filter(b => b.storagePct !== null && b.lastYearPct !== null)
    .sort((a, b) => (a.storagePct! - a.lastYearPct!) - (b.storagePct! - b.lastYearPct!))[0] : null;
  const hardestMajors = res && hardest ? res.major.filter(r => r.basin === hardest.name).slice(0, 2) : [];
  const sown = v.sowing, sownKnown = sown.stressed + sown.soon + sown.ok;
  const ne = rain?.ne && "deviationPct" in rain.ne ? rain.ne : null;
  const neDays = ne ? Math.round((Date.parse(ne.end) - Date.parse(ne.start)) / 86_400_000) + 1 : 0;
  const strong = enso.peak && enso.peak.medianC >= 2 ? "very strong " : enso.peak && enso.peak.medianC >= 1.5 ? "strong " : "";

  return (
    <div className={`pageWrap ${styles.page}`}>
      <HeaderHero
        title="Rabi Outlook"
        subtitle={<>What the rabi season starts with: water in the reservoirs for irrigated rabi, moisture in the soil for rainfed rabi, and the northeast monsoon that decides the rest. Readings, not a crop plan.</>}
        showChips={false}
        variant="compact"
      />

      <section className={styles.hero} aria-labelledby="rabi-summary" data-testid="rabi-summary">
        <div className={styles.heroText}>
          <span className={styles.kicker}>Rabi 2026–27 · the starting position</span>
          <h2 id="rabi-summary">
            {res ? <>Rabi begins with the reservoirs at <b>{pct(res.state.storagePct)}</b> of capacity, against {pct(res.state.lastYearPct)} a year ago</> : <>Rabi begins</>}
            {rain?.deviationPct !== null && rain?.deviationPct !== undefined ? <>, after a monsoon <b>{Math.abs(Math.round(rain.deviationPct))}% {rain.deviationPct < 0 ? "short of" : "above"}</b> normal</> : null}
            {enso.alert.includes("El Niño") ? <>, with a {strong}El Niño over the Pacific</> : null}.
          </h2>
          <p>Each figure carries its own date. The site recommends no crop, release or sowing date; it shows the water these decisions start from.</p>
        </div>
        <ul className={styles.tiles}>
          {res ? <li><span>Reservoir storage</span><b>{pct(res.state.storagePct)}</b><em>{tmc(res.state.storageTmc)} of {tmc(res.state.capacityTmc)} TMC · {pct(res.state.lastYearPct)} a year ago</em></li> : null}
          {rain ? <li><span>Rain since 1 June</span><b data-tone={rain.deviationPct !== null && rain.deviationPct < -19 ? "bad" : undefined}>{signed(rain.deviationPct)}</b><em>State gauges, to {day(rain.end, false)}</em></li> : null}
          {soil ? <li><span>Rainfed mandals, dry topsoil</span><b data-tone={dry / Math.max(soil.read, 1) > 0.5 ? "bad" : undefined}>{dry}<small> of {soil.read}</small></b><em>Top {soil.depthCm} cm drier than its median year · {soil.record} driest on record</em></li> : null}
          <li><span>El Niño, Oct–Dec</span><b>{enso.ondElNinoPct !== null ? `${Math.round(enso.ondElNinoPct)}%` : enso.alert}</b><em>NOAA&rsquo;s chance, issued {day(enso.issued, false)}</em></li>
        </ul>
      </section>

      {res ? (
        <section className={styles.block} aria-labelledby="rabi-reservoirs" data-testid="rabi-reservoirs">
          <header className={styles.blockHead}>
            <span className={styles.eyebrow}><IconWaves /> Irrigated rabi</span>
            <h2 id="rabi-reservoirs">The water in the reservoirs</h2>
            <p>
              {hardest ? <>The {hardest.name} basin is furthest behind last year: <b>{pct(hardest.storagePct)}</b> full against {pct(hardest.lastYearPct)}{hardestMajors.length ? <>, with {hardestMajors.map((r, i) => <span key={r.name}>{i ? " and " : ""}{r.name} at {pct(r.storagePct)}</span>)}</> : null}. </> : null}
              Storage as APWRIMS reports it on {day(v.asOf.reservoirs, false)}; which mandals a canal reaches is not public, so this is the water, not where it will go.
            </p>
          </header>
          <div className={styles.reservoirGrid}>
            <div className={styles.basins} role="list" aria-label="Storage by river basin">
              {res.basins.map(b => {
                const start = b.capacityTmc ? (100 * b.monsoonStartStorageTmc) / b.capacityTmc : null;
                const gained = b.storageTmc - b.monsoonStartStorageTmc;
                return <div key={b.basin} className={styles.basin} role="listitem" data-testid="rabi-basin">
                  <div className={styles.basinName}><b>{b.name}</b><small>{b.count} reservoirs · {tmc(b.capacityTmc)} TMC</small></div>
                  <div className={styles.basinTrack} aria-hidden="true">
                    <i style={{ width: `${Math.min(100, b.storagePct ?? 0)}%` }} />
                    {start !== null ? <u style={{ left: `${Math.min(100, start)}%` }} /> : null}
                    {b.lastYearPct !== null ? <s style={{ left: `${Math.min(100, b.lastYearPct)}%` }} /> : null}
                  </div>
                  <div className={styles.basinValue}><b>{pct(b.storagePct)}</b><small>{pct(b.lastYearPct)} a year ago</small><small>{gained >= 0 ? "+" : "−"}{tmc(Math.abs(gained))} TMC since the monsoon began</small></div>
                </div>;
              })}
              <div className={styles.basinKey} aria-hidden="true"><span><i /> Storage now</span><span><s /> A year ago</span><span><u /> When the monsoon began</span></div>
            </div>
            <div className={styles.majors}>
              <h3>The largest reservoirs</h3>
              <ol>
                {res.major.map(r => <li key={r.name}>
                  <span className={styles.majorName}><b>{r.name}</b><small>{r.district ?? r.basin}</small></span>
                  <span className={styles.majorBar} aria-hidden="true"><i style={{ width: `${Math.min(100, r.storagePct ?? 0)}%` }} />{r.lastYearPct !== null ? <s style={{ left: `${Math.min(100, r.lastYearPct)}%` }} /> : null}</span>
                  <span className={styles.majorValue}><b>{pct(r.storagePct)}</b><small>{pct(r.lastYearPct)}</small></span>
                </li>)}
              </ol>
            </div>
          </div>
        </section>
      ) : null}

      {soil ? (
        <section className={styles.block} aria-labelledby="rabi-soil" data-testid="rabi-soil">
          <header className={styles.blockHead}>
            <span className={styles.eyebrow}><IconLeaf /> Rainfed rabi</span>
            <h2 id="rabi-soil">Moisture in the seedbed</h2>
            <p>
              Rainfed rabi is sown on the water the soil holds and the rain still to come. In <b>{dry} of the {soil.read}</b> mostly rainfed mandals,
              the top {soil.depthCm} cm is drier than in its median year on this date ({soil.firstYear}–{soil.lastYear}); <b>{soil.record}</b> are the driest on record.
              The {soil.irrigated} mandals where most cropland is irrigated are set aside: their sowing follows the canal and the well.
            </p>
          </header>
          <div className={styles.soilGrid}>
            <StateOutlineMap testId="rabi-map" aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height}
              keys={v.mandals.map(m => KEY[m.cls])}
              colors={Object.fromEntries(CLASS_ORDER.map(c => [KEY[c], SOIL_CLASSES[c].color]))}
              notes={v.mandals.map(m => `${SOIL_CLASSES[m.cls].label}${m.pct !== null && m.cls !== "irrigated" && m.cls !== "none" ? `: ${m.pct.toFixed(0)}% of capacity in the top ${soil.depthCm} cm, median year ${m.median?.toFixed(0)}%` : ""}${m.irrigatedPct !== null ? `. ${Math.round(m.irrigatedPct)}% of cropland irrigated.` : ""}`)}
              label={`Soil moisture against the same date in past years, mostly rainfed mandals: ${soil.record} driest on record, ${soil.below} drier than the median year, ${soil.above} at or above it; ${soil.irrigated} mostly irrigated.`}
              legend={CLASS_ORDER.filter(c => c !== "none").map(c => <span key={c}><i style={{ background: SOIL_CLASSES[c].color }} />{SOIL_CLASSES[c].label}</span>)} />
            <div className={styles.soilSide}>
              <div className={styles.splitBlock}>
                <div className={styles.split} aria-hidden="true">
                  {(["record", "below", "above"] as SoilClass[]).map(c => {
                    const n = c === "record" ? soil.record : c === "below" ? soil.below : soil.above;
                    return <i key={c} style={{ flexGrow: n, background: SOIL_CLASSES[c].color }} />;
                  })}
                </div>
                <p><b>{soil.record}</b> driest on record · <b>{soil.below}</b> drier than the median year · <b>{soil.above}</b> at or above it <span>of {soil.read} mostly rainfed mandals with a reading</span></p>
              </div>
              <div className={styles.sowing} data-testid="rabi-sowing">
                <h3>A {sown.crop} crop sown this week</h3>
                <p>
                  On this week&rsquo;s soil and forecast, a {sown.crop} crop sown now would be short of water within seven days in
                  {" "}<b>{sown.stressed + sown.soon}</b> of the {sownKnown} rainfed mandals with a reading: {sown.stressed} already, {sown.soon} more within the week.
                </p>
                <div className={styles.sowingBar} aria-hidden="true">
                  <i style={{ flexGrow: sown.stressed, background: CROP_WATER_STATES.stressed.color }} />
                  <i style={{ flexGrow: sown.soon, background: CROP_WATER_STATES.soon.color }} />
                  <i style={{ flexGrow: sown.ok, background: CROP_WATER_STATES.ok.color }} />
                </div>
                <Link href="/agriculture/#field-week" className={styles.more}>Open the crop water check <IconArrowRight /></Link>
              </div>
              <div className={styles.districts}>
                <h3>Where the rainfed seedbed is driest</h3>
                <ol>
                  {v.districts.slice(0, 7).map(d => <li key={d.district}>
                    <span><b>{place(d.district)}</b>{d.neSharePct !== null ? <small>{Math.round(d.neSharePct)}% of its year&rsquo;s rain falls Oct–Dec</small> : null}</span>
                    <span className={styles.districtBar} aria-hidden="true"><i style={{ width: `${d.dryPct}%` }} /></span>
                    <span className={styles.districtValue}><b>{d.dry}</b> of {d.rainfed}</span>
                  </li>)}
                </ol>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className={styles.block} aria-labelledby="rabi-monsoon" data-testid="rabi-monsoon">
        <header className={styles.blockHead}>
          <span className={styles.eyebrow}><IconCloudRain /> October to December</span>
          <h2 id="rabi-monsoon">The northeast monsoon decides the rest</h2>
          <p>South coastal Andhra and Rayalaseema take a third to half of their year&rsquo;s rain from the northeast monsoon. What El Niño has meant for it here is a tilt, not a forecast.</p>
        </header>
        <div className={styles.facts}>
          <article>
            <span><IconGlobe /> NOAA outlook</span>
            <b>{enso.ondElNinoPct !== null ? `${Math.round(enso.ondElNinoPct)}%` : "—"}</b>
            <p>Chance of El Niño conditions through October–December ({enso.alert}, issued {day(enso.issued)}){enso.peak ? <>; NOAA&rsquo;s median for {enso.peak.label} is {enso.peak.medianC > 0 ? "+" : ""}{enso.peak.medianC.toFixed(1)} °C</> : null}.</p>
          </article>
          {enso.past ? <article>
            <span><IconCloudRain /> Past El Niño years</span>
            <b>{signed(enso.past.anomalyPct, 1)}</b>
            <p>Statewide October–December rain, average of {enso.past.elNinoYears} El Niño years since 1981 (CHIRPS). Below normal in {enso.past.belowNormal} of {enso.past.elNinoYears}, against {enso.past.belowNormalAll} of {enso.past.allYears} years overall{enso.past.range ? `; from ${signed(enso.past.range[0])} to ${signed(enso.past.range[1])}` : ""}.</p>
          </article> : null}
          <article>
            <span><IconDroplet /> So far</span>
            <b>{ne && neDays >= 14 ? signed(ne.deviationPct) : `Day ${neDays || 1}`}</b>
            <p>{ne ? (neDays >= 14
              ? <>District gauges, 1 October to {day(ne.end, false)}, against the normal for those days.</>
              : <>Of a 92-day season: too early to read. District gauge figures from 1 October appear here with each weekly refresh.</>)
              : <>Gauge figures from 1 October appear here with the weekly refresh.</>}</p>
          </article>
        </div>
        <Link href="/monsoon/#enso-outlook" className={styles.more}>El Niño and the monsoon, in full <IconArrowRight /></Link>
      </section>

      <p className={styles.foot}>
        <IconSatellite /> Sources: reservoir storage, soil moisture (NRSC VIC model, % of what each soil holds, against the same date each year since {soil?.firstYear ?? "2014"}) and gauge rain from{" "}
        <a href="https://apwrims.ap.gov.in" target="_blank" rel="noreferrer">APWRIMS</a>;
        irrigated cropland from <a href={v.irrigation?.url ?? "https://esa-worldcereal.org"} target="_blank" rel="noreferrer">ESA WorldCereal</a> (10 m, rabi 2020–21; a mandal is mostly irrigated when half or more of its cropland is: {v.irrigation?.caveat ?? ""});
        the sowing check is the FAO-56 water balance on the Agriculture page, Bengal gram at the initial stage (roots 0.2 m);
        El Niño from <a href="https://www.cpc.ncep.noaa.gov/products/analysis_monitoring/enso_advisory/" target="_blank" rel="noreferrer">NOAA CPC</a>; past October–December rain from CHIRPS v3.
      </p>
    </div>
  );
}
