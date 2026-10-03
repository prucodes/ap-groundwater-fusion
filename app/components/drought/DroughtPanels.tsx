import {
  HYDRO_LABEL, IMPACT_META, RULES, addDays, daysBetween, place, shortDate, todayInIndia, type DroughtWatch,
} from "../../lib/drought";
import styles from "./Drought.module.css";

const BAND_COLOR = { normal: "#5e9b6b", mild: "#a9c7a3", moderate: "#e39a3b", severe: "#c65a46", extreme: "#7a2e27" } as const;

/** Storage against the last ten years on the same date (Table 3.8), state and reservoir by reservoir. */
export function ReservoirPanel({ data }: { data: Pick<DroughtWatch, "reservoirs" | "sources"> }) {
  const rsi = data.sources.rsi;
  if (!rsi) return null;
  // Barrages and anicuts that usually hold under 1 TMC swing from full to empty in
  // a week; the list is the reservoirs that store water through a season.
  const worst = data.reservoirs.filter(r => r.deficitPct !== null && r.deficitPct >= 20 && r.averageTmc >= 1).slice(0, 12);
  return (
    <div className={styles.chartCard}>
      <h3>Reservoirs against their last ten years</h3>
      <p>Live storage on {shortDate(rsi.date, true)} against the average for the same date in {rsi.years[0]}–{rsi.years[rsi.years.length - 1]}. Measured at the dam. The manual applies this only where farming depends on reservoir water; which mandals each one serves is not public.</p>
      <span className={styles.statChip}><b>{rsi.state.storageTmc.toFixed(0)}</b> TMC now</span>
      <span className={styles.statChip}><b>{rsi.state.averageTmc.toFixed(0)}</b> TMC usual</span>
      <span className={styles.statChip} style={{ borderColor: rsi.state.band ? BAND_COLOR[rsi.state.band] : undefined }}>
        <b>{rsi.state.deficitPct === null ? "—" : `${rsi.state.deficitPct.toFixed(0)}%`}</b> short · {rsi.state.band ? HYDRO_LABEL[rsi.state.band] : "—"} deficit
      </span>
      <div className={styles.bars} style={{ marginTop: 6 }}>
        {worst.map(r => {
          const share = Math.min(1, r.storageTmc / Math.max(r.averageTmc, 0.001));
          return (
            <div key={r.name} className={`${styles.barRow} ${styles.barRowWide}`}>
              <span title={r.name}>{place(r.name)}</span>
              <span className={styles.barTrack} role="img" aria-label={`${place(r.name)}: ${r.storageTmc.toFixed(1)} of a usual ${r.averageTmc.toFixed(1)} TMC`}>
                <i style={{ width: `${share * 100}%`, background: r.band ? BAND_COLOR[r.band] : "var(--muted)" }} />
                <em style={{ left: "calc(100% - 1px)" }} />
              </span>
              <b>−{(r.deficitPct ?? 0).toFixed(0)}% · {r.band ? HYDRO_LABEL[r.band] : "—"}</b>
            </div>
          );
        })}
      </div>
      <p style={{ marginTop: 10 }}>
        {RULES.rsi} Listed: reservoirs that usually hold 1 TMC or more on this date. The state figure counts all {data.reservoirs.length} with at least five of the ten years on record
        {rsi.notReporting?.length ? `; ${rsi.notReporting.length} that had stopped reporting are left out` : ""}.
      </p>
    </div>
  );
}

/** Area sown, as the Agriculture department has reported it, against the manual's 85% and 75% lines. */
export function SowingPanel({ data }: { data: Pick<DroughtWatch, "sowingDistricts" | "sources"> }) {
  const sowing = data.sources.sowing;
  if (!sowing) return null;
  const rows = [{ district: "Andhra Pradesh", pctOfNormal: sowing.state.pctOfNormal, cls: sowing.state.cls }, ...data.sowingDistricts.map(d => ({ ...d, district: place(d.district) }))];
  return (
    <div className={styles.chartCard}>
      <h3>Fields sown, as reported</h3>
      <p>Kharif area sown against the season&rsquo;s normal, {shortDate(sowing.asOf, true)}: the Commissionerate of Agriculture&rsquo;s weekly report as quoted by the press ({sowing.reportedBy}). Entered by hand and not refreshed: the department&rsquo;s site does not answer requests from outside India. Five districts were quoted.</p>
      <div className={styles.legend} style={{ marginTop: 0 }}>
        <span><i style={{ background: "transparent", borderLeft: "1px dashed var(--muted)", borderRadius: 0, width: 1 }} />Dashed lines: 85% (drought) and 75% (severe)</span>
      </div>
      <div className={styles.bars} style={{ marginTop: 12 }}>
        {rows.map((r, index) => (
          <div key={r.district} className={styles.barRow} style={index === 0 ? { fontWeight: 600 } : undefined}>
            <span>{r.district}</span>
            <span className={styles.barTrack} role="img" aria-label={`${r.district}: ${r.pctOfNormal}% of normal sown`}>
              <i style={{ width: `${Math.min(100, r.pctOfNormal)}%`, background: IMPACT_META[r.cls].color }} />
              {index === 0 ? <>
                <span className={styles.threshold} style={{ left: "85%" }}><span>85%</span></span>
                <span className={styles.threshold} style={{ left: "75%" }}><span>75%</span></span>
              </> : <>
                <span className={styles.threshold} style={{ left: "85%" }} />
                <span className={styles.threshold} style={{ left: "75%" }} />
              </>}
            </span>
            <b style={{ color: IMPACT_META[r.cls].color }}>{r.pctOfNormal}% · {IMPACT_META[r.cls].label}</b>
          </div>
        ))}
      </div>
      <p style={{ marginTop: 10 }}>{RULES.sown} The manual also asks the State to certify that no further sowing is expected before declaring. <a href={sowing.url} target="_blank" rel="noreferrer">Source report</a>.</p>
    </div>
  );
}

/** The calendar the manual sets, with today on it, and who does what. */
export function StateActions({ data, builtOn }: { data: Pick<DroughtWatch, "season" | "state" | "rules">; builtOn?: string }) {
  const { season, state } = data;
  const today = builtOn ?? todayInIndia();
  // The line runs to the latest the manual allows: 31 October plus its three-week extension.
  const extended = addDays(season.declareBy, 21);
  const marks = [
    { date: season.start, label: "Season starts", kind: "start", align: "start" },
    { date: season.earlyFrom, label: "Early declaration possible", kind: "early" },
    { date: today, label: "This build", kind: "today" },
    { date: season.declareBy, label: "Declare drought", kind: "deadline" },
    { date: extended, label: "+3 weeks at most", kind: "extended", align: "end" },
  ];
  const span = Math.max(1, daysBetween(season.start, extended));
  const at = (date: string) => Math.min(100, Math.max(0, (daysBetween(season.start, date) / span) * 100));
  const fieldMandals = state.counts.severe + state.counts["moderate|severe"] + state.counts.moderate;
  return (
    <div>
      <div className={styles.timeline} aria-label="The manual's calendar for kharif drought">
        <div className={styles.timelineLine} />
        <div className={styles.timelinePast} style={{ width: `${at(today)}%` }} />
        {marks.map(mark => (
          <div key={mark.kind} className={styles.mark} data-kind={mark.kind} data-align={mark.align} style={{ left: `${at(mark.date)}%` }}>
            <b>{shortDate(mark.date)}</b><i />{mark.label}
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <div className={styles.action} data-owner="site">
          <span className={styles.owner}>This page</span>
          <h4>Steps 1 and 2 for every mandal</h4>
          <p>Rainfall deviation, dry spells and SPI for Trigger 1; vegetation, soil moisture and groundwater for Trigger 2, with each value&rsquo;s rule and source. Updated every Monday.</p>
        </div>
        <div className={styles.action} data-owner="state">
          <span className={styles.owner}>Revenue &amp; Agriculture</span>
          <h4>Ground truth in {fieldMandals} mandals</h4>
          <p>{RULES.groundTruth} Form 11 compiles it village by village.</p>
        </div>
        <div className={styles.action} data-owner="state">
          <span className={styles.owner}>Agriculture</span>
          <h4>Area sown, by mandal</h4>
          <p>The fourth impact indicator, and the certificate that no further sowing is expected. Only district figures for five districts are on this page, as reported.</p>
        </div>
        <div className={styles.action} data-owner="state">
          <span className={styles.owner}>Water Resources</span>
          <h4>Irrigated share by mandal</h4>
          <p>Above 75% irrigated, the State may move a mandal down one rank. The share is not public; canal command areas would also tell which mandals the reservoirs serve.</p>
        </div>
        <div className={styles.action} data-owner="state">
          <span className={styles.owner}>Revenue (Disaster Management)</span>
          <h4>Notify by {shortDate(season.declareBy, true)}</h4>
          <p>{RULES.declaration}</p>
        </div>
      </div>
    </div>
  );
}

/** What was read from the manual, what had to be interpreted, and the limits of each source. */
export function DroughtMethod({ data }: { data: Pick<DroughtWatch, "rules" | "sources" | "manual"> }) {
  const { sources } = data;
  return (
    <div className={styles.method}>
      <div>
        <h4>Read straight from the manual</h4>
        <ul>
          <li>{RULES.rain}</li>
          <li>{RULES.drySpell}</li>
          <li>{RULES.trigger1}</li>
          <li>{RULES.vci} {RULES.pasm}</li>
          <li>{RULES.gwdi}</li>
          <li>{RULES.severity}</li>
        </ul>
      </div>
      <div>
        <h4>Where the manual had to be read</h4>
        <ul>{data.rules.interpretations.map(text => <li key={text}>{text}</li>)}</ul>
      </div>
      <div>
        <h4>Sources, and what each one is</h4>
        <ul>
          <li>Rain: {sources.rain.source}, {shortDate(sources.rain.window.start)}–{shortDate(sources.rain.window.end, true)}. Measured.</li>
          {sources.spi ? <li>SPI: {sources.spi.product}, {sources.spi.months}, against {sources.spi.baselineFirstYear}–{sources.spi.baselineLastYear}. Satellite estimate.</li> : null}
          {sources.vci ? <li>VCI: {sources.vci.product}, weeks of {shortDate(sources.vci.averaged[0].approxStart)}–{shortDate(sources.vci.averaged[sources.vci.averaged.length - 1].approxEnd, true)} (dates approximate). {sources.vci.caveat}</li> : null}
          {sources.pasm ? <li>PASM: {sources.pasm.source}, weekly values {sources.pasm.averaged.map(d => shortDate(d)).join(", ")}. Modelled.</li> : null}
          {sources.gwdi ? <li>GWDI: {sources.gwdi.source}, {sources.gwdi.month}; {sources.gwdi.rule}. Measured, research-access readings.</li> : null}
        </ul>
      </div>
      <div>
        <h4>What this is not</h4>
        <ul>
          <li>Not a declaration, and not a recommendation to declare: the manual makes ground truth final and the notification the State&rsquo;s.</li>
          <li>Prototype mandal boundaries; a few boundaries have no unique gauge or model record and are not assessed.</li>
          <li>The NDVI/NDWI the manual prefers comes from the State Remote Sensing Centre or MNCFC at 56–500 m; the 4 km NOAA index here is a stand-in until that is shared.</li>
          <li>The manual: <a href={data.manual.url} target="_blank" rel="noreferrer">{data.manual.title}</a>, {data.manual.publisher}.</li>
        </ul>
      </div>
    </div>
  );
}
