import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { IconArrowRight, IconCloudRain, IconDroplet, IconGlobe, IconLeaf, IconSatellite, IconWaves } from "../../components/icons";
import { day } from "../../components/agriculture/waterContextFormat";
import { CROP_WATER_STATES } from "../../lib/cropWater";
import { mapGeometry, titleCase } from "../../lib/data";
import tanks from "../../data/tank_fill.json";
import { rabiView, SOIL_CLASSES, type SoilClass } from "../../lib/rabi";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import styles from "./Rabi.module.css";
import { brief } from "../../lib/pageBriefs";

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
        brief={brief("/rabi", res && soil ? <>Reservoirs hold <b>{pct(res.state.storagePct)}</b> against {pct(res.state.lastYearPct)} a year ago; the topsoil is drier than usual in <b>{dry} of {soil.read}</b> rainfed mandals.</> : undefined)}
        showChips={false}
        variant="compact"
      />

      <section className={styles.hero} aria-label="Rabi starting position in figures" data-testid="rabi-summary">
        <div className={styles.heroText}>
          <span className={styles.kicker}>Rabi 2026–27 · the starting position</span>
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

      <TankSection />

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

const TANK_CLASSES = {
  e: { label: "Emptier than usual", color: "#d08a3c" },
  u: { label: "About usual", color: "#c9d6cf" },
  f: { label: "Fuller than usual", color: "#3f8fb5" },
  n: { label: "Not seen through cloud, or too short a record", color: "#eef1f3" },
  x: { label: "Few or no tanks", color: "#f7f8f9" },
} as const;
type TankKey = keyof typeof TANK_CLASSES;
const km2 = (ha: number) => Math.round(ha / 100).toLocaleString("en-IN");

/** Tank-fed rabi: how much of each mandal's tank bed holds water now, against its own usual for the same weeks. */
function TankSection() {
  const t = tanks;
  if (!t.window) return null;
  const keyOf = (row: (typeof t.mandals)[number]): TankKey => {
    if (!row) return "x";
    if (row.now === null || row.usual === null) return "n";
    return row.now < row.usual - 0.1 ? "e" : row.now > row.usual + 0.1 ? "f" : "u";
  };
  const keys = t.mandals.map(keyOf);
  const districts = new Map<string, { now: number; usual: number; mandals: number; emptier: number }>();
  t.mandals.forEach((row, index) => {
    if (!row || row.now === null || row.usual === null) return;
    const name = mapGeometry.mandals[index]?.d ?? "";
    const d = districts.get(name) ?? { now: 0, usual: 0, mandals: 0, emptier: 0 };
    d.now += row.tankHa * row.now; d.usual += row.tankHa * row.usual; d.mandals += 1; d.emptier += keys[index] === "e" ? 1 : 0;
    districts.set(name, d);
  });
  // Districts whose tanks usually hold at least 3 km² of water this time of year, lowest share of usual first.
  const rows = [...districts.entries()].filter(([, d]) => d.usual >= 300).sort((a, b) => a[1].now / a[1].usual - b[1].now / b[1].usual).slice(0, 7);
  const until = day(t.window[1], false);
  const share = t.wetHaUsual ? Math.round((100 * t.wetHaNow) / t.wetHaUsual) : null;
  const years = t.byYear.filter(y => y.medianShare !== null);
  const latest = years[years.length - 1];
  const lowest = latest && years.every(y => y.medianShare! >= latest.medianShare!) ? latest : null;
  return (
    <section className={styles.block} aria-labelledby="rabi-tanks" data-testid="rabi-tanks">
      <header className={styles.blockHead}>
        <span className={styles.eyebrow}><IconDroplet /> Tank-fed rabi</span>
        <h2 id="rabi-tanks">The water in the tanks</h2>
        <p>
          From {day(t.window[0], false)} to {until}, the tank beds of the {t.scoredMandals} mandals with tanks held water over
          {" "}<b>{km2(t.wetHaNow)} km²</b>, against a usual {km2(t.wetHaUsual)} km² for the same weeks ({t.usualYears[0]}–{t.usualYears[1]}){share !== null ? `, ${share}% of usual` : ""}.
          {" "}<b>{t.emptier}</b> mandals are emptier than their usual and {t.fuller} fuller.
          {lowest ? <>{" "}The typical tank mandal&rsquo;s bed is {Math.round(lowest.medianShare! * 100)}% wet, the lowest of the {years.length} years read.</> : null}
        </p>
      </header>
      <div className={styles.soilGrid}>
        <StateOutlineMap testId="rabi-tank-map" aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height}
          keys={keys}
          colors={Object.fromEntries(Object.entries(TANK_CLASSES).map(([k, c]) => [k, c.color]))}
          notes={t.mandals.map((row) => row ? `${Math.round(row.tankHa).toLocaleString("en-IN")} ha of tank bed${row.now !== null ? `; ${Math.round(row.now * 100)}% holding water now` : "; not seen clear this window"}${row.usual !== null ? `, usual ${Math.round(row.usual * 100)}%` : ""}` : "Few or no tanks")}
          label={`Tank beds holding water against each mandal's usual for the same weeks: ${t.emptier} emptier, ${t.fuller} fuller, of ${t.scoredMandals} mandals with tanks.`}
          legend={(["e", "u", "f", "n"] as TankKey[]).map(k => <span key={k}><i style={{ background: TANK_CLASSES[k].color }} />{TANK_CLASSES[k].label}</span>)} />
        <div className={styles.soilSide}>
          <div className={styles.districts}>
            <h3>Where the tanks are furthest below their usual</h3>
            <ol>
              {rows.map(([name, d]) => <li key={name}>
                <span><b>{place(name)}</b><small>{d.emptier} of {d.mandals} tank mandals emptier than usual</small></span>
                <span className={styles.districtBar} aria-hidden="true"><i style={{ width: `${Math.min(100, (100 * d.now) / Math.max(d.usual, 1))}%` }} /></span>
                <span className={styles.districtValue}><b>{Math.round((100 * d.now) / Math.max(d.usual, 1))}%</b> of usual</span>
              </li>)}
            </ol>
          </div>
          <details className="foldMore">
            <summary><span>How the tanks are read</span><span>Tank beds, satellite, window</span></summary>
            <p className="cardNote">
              Tank beds are the water that came and went with the seasons both before and after 2000 in the JRC Global Surface Water
              record (1984 to 2021): {t.tankBodies.toLocaleString("en-IN")} water bodies of 2 to 5,000 ha with little permanent water,
              {" "}{km2(t.tankHa)} km² in {t.tankMandals} mandals. Permanent lakes and lagoons, reservoir drawdown rings and water that
              became permanent after 2000, largely aquaculture, are left out. Water is Sentinel-2&rsquo;s own scene classification
              at 80 m, each pixel&rsquo;s share of clear looks that saw water from 15 September to 15 October, against the median of
              the same weeks in {t.usualYears[0]} to {t.usualYears[1]}. A mandal is read where at least half its tank bed was seen
              clear; emptier or fuller means more than ten points from its usual. Weedy or very shallow water can read as land in
              every year alike. Tanks fill again in the northeast monsoon, so this is the start of rabi, not its end.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
