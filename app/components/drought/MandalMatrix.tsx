import {
  CATEGORY_META, HYDRO_LABEL, IMPACT_META, RAIN_CLASS_META, RULES, SPI_LABEL, place, shortDate, signed, signedPct,
  type DroughtMandal, type DroughtWeek, type ImpactClass,
} from "../../lib/drought";
import { boundaryLabel, mapGeometry } from "../../lib/data";
import styles from "./Drought.module.css";

const WHY: Record<DroughtMandal["t1Why"], string> = {
  drySpell: "set by a dry spell",
  largeDeficient: "set by large-deficient rainfall",
  deficitWithoutDrySpell: "not set: deficient, but no dry spell and not large-deficient",
  normalRainfall: "not set: no dry spell and rainfall not deficient",
  insufficient: "cannot be read: no unique gauge record",
};

function Cls({ value }: { value: ImpactClass | null | undefined }) {
  if (!value) return <span className={styles.cls} style={{ background: "var(--field)", color: "var(--muted)" }}>n/a</span>;
  return <span className={styles.cls} style={{ background: IMPACT_META[value].color, color: "#fff" }}>{IMPACT_META[value].label}</span>;
}

/** Weekly rain against normal, the dry weeks red and a counted spell darker. */
export function RainBarcode({ row, weeks, spellWeeks }: { row: DroughtMandal; weeks: DroughtWeek[]; spellWeeks: number }) {
  if (!row.weeks) return null;
  const inSpell = new Set<number>();
  for (const [first, last] of row.dry?.runs ?? []) {
    if (last - first + 1 >= spellWeeks) for (let w = first; w <= last; w += 1) inSpell.add(w);
  }
  const cap = 200;
  return (
    <>
      <div className={styles.barcode} role="img"
        aria-label={`Weekly rain as a share of normal: ${row.weeks.map((pct, i) => `${shortDate(weeks[i]?.start ?? "")} ${pct === null ? "missing" : `${pct}%`}`).join(", ")}`}>
        <span className={styles.halfLine} style={{ bottom: `${(50 / cap) * 100}%` }} />
        {row.weeks.map((pct, i) => (
          <i key={i} data-dry={pct !== null && pct < 50} data-spell={inSpell.has(i)} data-counted={weeks[i]?.counted !== false}
            data-missing={pct === null} style={{ height: pct === null ? undefined : `${Math.max(4, Math.min(cap, pct) / cap * 100)}%` }} />
        ))}
      </div>
      <div className={styles.barAxis}><span>{shortDate(weeks[0]?.start ?? "")}</span><span>dashed line: half of normal</span><span>{shortDate(weeks[weeks.length - 1]?.end ?? "")}</span></div>
    </>
  );
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.map((v, i) => (v === null ? null : [i / Math.max(1, values.length - 1) * 100, 34 - (v / 100) * 30] as const)).filter(Boolean) as (readonly [number, number])[];
  if (points.length < 2) return null;
  return (
    <svg className={styles.spark} viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y={34 - 0.6 * 30} width="100" height={0.2 * 30} fill="rgba(227,154,59,.14)" />
      <rect x="0" y={34 - 0.4 * 30} width="100" height={0.4 * 30} fill="rgba(178,58,46,.10)" />
      <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke="var(--teal)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** One mandal through the manual's Table 3.11 and Table 3.12, every value with its rule and source. */
export function MandalMatrix({ row, weeks, light = false, sown, sowingAsOf, compact = false }: {
  row: DroughtMandal;
  weeks: DroughtWeek[];
  light?: boolean;
  sown?: { pctOfNormal: number; cls: ImpactClass } | null;
  sowingAsOf?: string | null;
  compact?: boolean;
}) {
  const category = light ? row.categoryLight : row.category;
  const meta = CATEGORY_META[category];
  const t1 = light ? row.t1Light : row.t1;
  const spellWeeks = light ? 3 : 4;
  const impacts = [row.impact.rs, row.impact.sm, row.impact.hy];
  const known = impacts.filter(Boolean).length;

  return (
    <article className={styles.inspector} aria-label={`${place(row.m)}: drought manual check`}>
      <header className={styles.inspectorHead}>
        <h3>{place(row.m)}</h3>
        <small>{`${place(row.d)} district · ${boundaryLabel(mapGeometry.mandals[row.i])}`}</small>
        <div>
          <span className={styles.verdict} style={{ background: meta.color, color: meta.ink }} data-testid="drought-verdict">{meta.label}</span>
          {!light && row.prev !== row.category ? <span className={styles.moved}>a week earlier: {CATEGORY_META[row.prev].label}</span> : null}
        </div>
      </header>

      <section className={styles.step}>
        <div className={styles.stepHead}>
          <span>Step 1 · Trigger 1</span>
          <b className={styles.result} style={{ background: t1 ? "rgba(198,90,70,.14)" : "var(--field)", color: t1 ? "var(--rust)" : "var(--ink-soft)" }}>
            {t1 === null ? "Cannot be read" : t1 ? "Set" : "Not set"}
          </b>
        </div>
        <div className={styles.indicator}>
          <span>Rainfall vs normal</span>
          <strong>{row.rain ? signedPct(row.rain.dev) : "—"}</strong>
          <small>
            {row.rain ? <>{row.rain.mm.toFixed(0)} mm against {row.rain.normal.toFixed(0)} mm · {row.rain.cls ? RAIN_CLASS_META[row.rain.cls].label : "—"}. </> : "No unique gauge record. "}
            {RULES.rain} Measured: AP DES gauges via APWRIMS.
          </small>
        </div>
        <div className={styles.indicator}>
          <span>Longest dry spell</span>
          <strong>{row.dry ? `${row.dry.longest} wk` : "—"}</strong>
          <small>{RULES.drySpell}</small>
        </div>
        {!compact ? <RainBarcode row={row} weeks={weeks} spellWeeks={spellWeeks} /> : null}
        <div className={styles.indicator}>
          <span>SPI route (satellite)</span>
          <strong>{row.spi ? signed(row.spi.v) : "—"}</strong>
          <small>{row.spi ? `${SPI_LABEL[row.spi.cls]}; ${row.t1Spi ? "would set" : "would not set"} Trigger 1 on its own route. ` : ""}{RULES.spi} CHIRPS v3 since 1981.</small>
        </div>
        <small style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--ink-soft)" }}>
          Trigger 1 {light ? (row.t1Light ? "set by a 3-week dry spell (light soils)" : WHY[row.t1Why]) : WHY[row.t1Why]}. {RULES.trigger1}
        </small>
      </section>

      <section className={styles.step}>
        <div className={styles.stepHead}>
          <span>Step 2 · Trigger 2 · {known} of 3 indicators</span>
          <b className={styles.result} style={{ background: t1 ? meta.color : "var(--field)", color: t1 ? meta.ink : "var(--muted)" }}>
            {t1 ? CATEGORY_META[row.severity].label : `${CATEGORY_META[row.severity].label} (not reached)`}
          </b>
        </div>
        <div className={styles.indicator}>
          <span>Remote sensing · VCI <Cls value={row.impact.rs} /></span>
          <strong>{row.vci ? row.vci.v.toFixed(0) : "—"}</strong>
          <small>{RULES.vci} NOAA STAR VHP, 4 km, last four weeks. Satellite index over all vegetation; coarser than the manual prefers.</small>
          {row.vci && !compact ? <Sparkline values={row.vci.weeks} /> : null}
        </div>
        <div className={styles.indicator}>
          <span>Soil moisture · PASM <Cls value={row.impact.sm} /></span>
          <strong>{row.pasm ? `${row.pasm.v.toFixed(0)}%` : "—"}</strong>
          <small>
            {row.pasm?.usual !== null && row.pasm?.usual !== undefined ? `Usual for the date ${row.pasm.usual.toFixed(0)}%. ` : ""}
            {row.pasm?.severeYears !== null && row.pasm?.severeYears !== undefined ? `This date read Severe in ${row.pasm.severeYears} of ${row.pasm.years} earlier years. ` : ""}
            {RULES.pasm} Modelled: NRSC VIC at 30 cm via APWRIMS, four-week mean.
          </small>
        </div>
        <div className={styles.indicator}>
          <span>Hydrology · GWDI <Cls value={row.impact.hy} /></span>
          <strong>{row.gwdi ? signed(row.gwdi.v) : "—"}</strong>
          <small>
            {row.gwdi ? `${HYDRO_LABEL[row.gwdi.band]}: ${row.gwdi.depth.toFixed(1)} m below ground against a ${row.gwdi.mean.toFixed(1)} m mean for the month, ${row.gwdi.years} years. ` : "Under 10 years of record for the month, or no series of its own. "}
            {RULES.gwdi} Measured: APWRIMS wells.
          </small>
        </div>
        <div className={styles.indicator}>
          <span>Agriculture · area sown <Cls value={sown?.cls ?? null} /></span>
          <strong>{sown ? `${sown.pctOfNormal}%` : "—"}</strong>
          <small>
            {sown ? `District figure as reported${sowingAsOf ? ` for ${shortDate(sowingAsOf, true)}` : ""}; context only, not one of this mandal's three. ` : "Not published per mandal: the Agriculture department holds it. "}
            {RULES.sown}
          </small>
        </div>
        <small style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--ink-soft)" }}>{RULES.severity}</small>
      </section>

      <section className={styles.step}>
        <div className={styles.stepHead}><span>Step 3 · the State</span></div>
        <small style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          {category === "severe" || category === "moderate" || category === "moderate|severe"
            ? `Field verification due before harvest. ${RULES.groundTruth}`
            : "No field verification is called for unless Trigger 2 is set."}
        </small>
      </section>
    </article>
  );
}
