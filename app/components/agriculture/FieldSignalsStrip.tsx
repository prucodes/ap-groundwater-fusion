import { GEC_CATEGORIES, VCI_CLASSES, type AgricultureEvidence, type GecCategory, type VciClass } from "../../lib/agriculture";
import { IconArrowRight, IconLeaf, IconLayers } from "../icons";
import { day, thousands } from "./waterContextFormat";
import styles from "./WaterContextStrip.module.css";

const VCI_ORDER: VciClass[] = ["severe", "moderate", "normal"];
const GEC_ORDER: GecCategory[] = ["over_exploited", "critical", "semi_critical", "safe", "salinity"];

/** The satellite vegetation index over cropland and the official groundwater
 * assessment: two more dated, sourced views beside the water context. */
export function FieldSignalsStrip({ evidence }: { evidence: AgricultureEvidence }) {
  const veg = evidence.field?.vegetation, gw = evidence.field?.assessment;
  if (!veg && !gw) return null;
  const first = veg?.byWeek[0], last = veg?.byWeek[veg.byWeek.length - 1];
  const peak = veg ? Math.max(...veg.byWeek.map(week => week.normal + week.moderate + week.severe)) : 0;
  const stressed = gw ? gw.state.categories.semi_critical + gw.state.categories.critical + gw.state.categories.over_exploited : 0;
  const stressedBefore = gw?.state.previousCategories ? gw.state.previousCategories.semi_critical + gw.state.previousCategories.critical + gw.state.previousCategories.over_exploited : null;
  return <div className={`${styles.strip} ${styles.pair}`} role="group" aria-label="Crop vegetation and the groundwater assessment">
    <article className={styles.card} data-testid="context-vegetation">
      <header><IconLeaf /><span>Crop vegetation</span><em>Satellite index</em></header>
      {veg ? <>
        <strong className={styles.figure} data-tone={veg.summary.severe > veg.summary.mandals / 4 ? "short" : "ok"}>{veg.summary.severe}<small>of {veg.summary.mandals} mandals severely below normal · {day(veg.averaged[0]?.approxStart, false)} to {day(veg.averaged[veg.averaged.length - 1]?.approxEnd, false)}</small></strong>
        <p className={styles.line}><b>{veg.summary.moderate}</b> moderately below · <b>{veg.summary.normal}</b> normal · median index {veg.summary.medianVci}</p>
        <figure className={styles.weeks} aria-label={`Mandals by class, week by week from ${day(veg.weeks[0]?.approxStart, false)}: severely below normal went from ${first?.severe} to ${last?.severe}.`}>
          <div className={styles.weekBars} aria-hidden="true">
            {veg.byWeek.map((week, i) => <span key={i} title={`Week of ${day(veg.weeks[i]?.approxStart, false)}: ${week.severe} severe, ${week.moderate} moderate, ${week.normal} normal`}>
              {VCI_ORDER.map(key => <i key={key} style={{ height: `${(week[key] / peak) * 100}%`, background: VCI_CLASSES[key].color }} />)}
            </span>)}
          </div>
          <figcaption><span>{day(veg.weeks[0]?.approxStart, false)}</span><span>Severely below normal: <b>{first?.severe} → {last?.severe}</b> mandals</span><span>{day(veg.weeks[veg.weeks.length - 1]?.approxStart, false)}</span></figcaption>
        </figure>
        <ul className={styles.bandKey} aria-hidden="true">{VCI_ORDER.map(key => <li key={key}><i style={{ background: VCI_CLASSES[key].color }} />{VCI_CLASSES[key].short} ({VCI_CLASSES[key].range})</li>)}</ul>
        <p className={styles.note}>Vegetation Condition Index: this week&rsquo;s greenness against the same week in every year on record (0 the worst seen, 100 the best), NOAA STAR, 4 km. Weighted to cropland with ESA WorldCover 2021, so forest does not stand in for fields. Classes per the drought manual, Table 3.4. A satellite index of plant vigour, not crop yield or sown area.</p>
        <a href={veg.url} target="_blank" rel="noreferrer">NOAA STAR Vegetation Health <IconArrowRight /></a>
      </> : <p className={styles.missing}>The vegetation index is not available in this build.</p>}
    </article>
    <article className={styles.card} data-testid="context-assessment">
      <header><IconLayers /><span>Groundwater assessment {gw?.year ?? ""}</span><em>Official</em></header>
      {gw ? <>
        <strong className={styles.figure}>{gw.state.stagePct?.toFixed(1)}%<small>of the State&rsquo;s annual extractable groundwater is drawn each year{gw.state.previousStagePct !== null ? ` · ${gw.state.previousStagePct.toFixed(1)}% in ${gw.previousYear}` : ""}</small></strong>
        <div className={styles.bands} role="img" aria-label={GEC_ORDER.map(key => `${GEC_CATEGORIES[key].label} ${gw.state.categories[key]}`).join(", ")}>
          {GEC_ORDER.map(key => gw.state.categories[key] ? <i key={key} style={{ flexGrow: gw.state.categories[key], background: GEC_CATEGORIES[key].color }} /> : null)}
        </div>
        <ul className={styles.bandKey} aria-hidden="true">{GEC_ORDER.map(key => <li key={key}><i style={{ background: GEC_CATEGORIES[key].color }} />{GEC_CATEGORIES[key].label} {gw.state.categories[key]}</li>)}</ul>
        <p className={styles.line}><b>{stressed}</b> of {gw.state.units} assessment units semi-critical or worse{stressedBefore !== null ? `, against ${stressedBefore} in ${gw.previousYear}` : ""} · <b>{gw.state.movedWorse}</b> mandals moved to a worse category, {gw.state.movedBetter} to a better one</p>
        {gw.state.extractionMcm !== null && gw.state.resourceMcm !== null ? <p className={styles.line}>{thousands(gw.state.extractionMcm)} million m³ drawn a year{gw.state.irrigationMcm !== null ? `, ${Math.round((gw.state.irrigationMcm / gw.state.extractionMcm) * 100)}% for irrigation` : ""}, of {thousands(gw.state.resourceMcm)} million m³ extractable</p> : null}
        <p className={styles.note}>The Dynamic Ground Water Resources assessment, made each year by CGWB and the State Ground Water Department under the GEC-2015 method; in Andhra Pradesh the assessment unit is the mandal. Safe up to 70% drawn, semi-critical 70–90%, critical 90–100%, over-exploited above 100%; saline where the water is too salty to use. {gw.state.matched} of our 670 boundaries are matched to their unit; city wards that INGRES assesses separately are left unmatched.</p>
        <a href={gw.url} target="_blank" rel="noreferrer">INGRES, CGWB <IconArrowRight /></a>
      </> : <p className={styles.missing}>The groundwater assessment is not available in this build.</p>}
    </article>
  </div>;
}
