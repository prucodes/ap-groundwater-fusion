import Link from "next/link";
import { basePath } from "../../../../lib/data";
import { pdfName, sheetDates, type DistrictSheet, type SheetMandal } from "../../../../lib/districtSheet";
import { dayIn, metresIn, monthIn, namedMonthIn, peopleIn, type Lang } from "../../../../lib/telugu";
import { BAND_LABEL } from "../../../../lib/summerPriority";
import { Borewells, pumpState } from "../../../../components/garden/Borewells";
import brief from "../../../summer/brief/SummerBrief.module.css";
import styles from "./DistrictSheet.module.css";

/* One district on one A4 page, for its Collector, in English or Telugu: where the water table
   stands against each mandal's usual, this season's recharge, rain and reservoirs, which
   mandals to plan summer drinking water for first, and the drought manual's reading. Every
   figure is one the site already publishes (lib/districtSheet.ts). The deploy prints each
   sheet to PDF beside it (scripts/print-digest.mjs --manifest districts/sheets.json).
   Mandal and district names stay in English: the site has no Telugu names for them yet. */

const TONE = { deeper: "#c4563a", shallower: "#2a9fd6", steady: "#9aa8b5", none: "#dfe5ec" } as const;
const toneOf = (side: -1 | 0 | 1 | null) => (side === 1 ? TONE.deeper : side === -1 ? TONE.shallower : side === 0 ? TONE.steady : TONE.none);
const SUMMER_WORD = {
  en: { beyond: "Past its record", dry: "Past it if dry", within: "Within its record" },
  te: { beyond: "రికార్డును దాటుతుంది", dry: "పొడి శీతాకాలంలో దాటుతుంది", within: "రికార్డు లోపే" },
} as const;
const BAND = { en: BAND_LABEL, te: { first: "ముందుగా ప్రణాళిక", next: "తదుపరి ప్రణాళిక", watch: "పర్యవేక్షణ" } } as const;
const GROUND = { en: undefined, te: ["గట్టి శిల", "ఒండ్రు నేల", "తీర ఇసుక నేల"] } as const;
/** Rows the table has room for under the rest of the sheet (Telugu's lines stand taller);
    every mandal is in the borewell strip either way. */
const TABLE_ROWS = { en: 4, te: 3 } as const;

export function SheetView({ s, lang, caveat }: { s: DistrictSheet; lang: Lang; caveat: string }) {
  const te = lang === "te";
  const dates = sheetDates(), c = s.counts, target = dates.summer.slice(0, 4);
  const month = monthIn(lang, s.month.split(" ")[0]), monthYear = namedMonthIn(lang, s.month), year = s.month.split(" ")[1];
  const m = (v: number) => metresIn(lang, Math.abs(v));
  const unit = te ? "మీ." : "m";
  const below = s.mandals.filter(x => x.side === 1).sort((a, b) => (b.vsUsualM ?? 0) - (a.vsUsualM ?? 0));
  const shown = below.slice(0, TABLE_ROWS[lang]), rest = below.length - shown.length;
  const planned = s.priority.rows.filter(r => r.band !== "watch"), firstRows = planned.slice(0, 3);
  const w = s.water, mon = s.monsoon, sum = s.summer, dr = s.drought;
  const rose = mon ? mon.thisSeasonM < 0 : false;
  const here = te ? `/districts/${s.slug}/sheet/te/` : `/districts/${s.slug}/sheet/`;
  const pdf = `${basePath}${here}${pdfName(s.slug, lang)}`;
  const states = s.mandals.map(pumpState), n = (k: string) => states.filter(x => x === k).length;

  return (
    <div className="pageWrap">
      <div className={brief.viewer}>
        <div className={brief.toolbar}>
          <p>
            {te ? <>{s.name} ఒక A4 పేజీలో, ప్రతి సోమవారం డేటాతో నవీకరణ. </> : <>{s.name} on one A4 page, rebuilt from each Monday&rsquo;s data. </>}
            <Link href="/districts/sheets/">{te ? "అన్ని జిల్లాల షీట్లు" : "Every district’s sheet"}</Link>
            {" · "}
            {te ? <Link href={`/districts/${s.slug}/sheet/`} lang="en" data-testid="district-sheet-lang">In English</Link>
              : <Link href={`/districts/${s.slug}/sheet/te/`} lang="te" data-testid="district-sheet-lang">తెలుగులో</Link>}
          </p>
          <a className={brief.download} href={pdf} download={`AP-${s.slug}-district-sheet${te ? "-te" : ""}.pdf`} data-testid="district-sheet-pdf">{te ? "PDF డౌన్‌లోడ్" : "Download PDF"}</a>
        </div>

        <section className={`${brief.page} ${te ? styles.te : ""}`} lang={lang} data-testid="district-sheet" data-lang={lang} data-deeper={c.deeper} data-compared={c.compared}>
          <div className={brief.band}>
            <div className={brief.eyebrow}>{te ? `ఆంధ్రప్రదేశ్ · ${s.name} జిల్లా · కలెక్టర్ గారికి` : `Andhra Pradesh · ${s.name} district · for the Collector`}</div>
            <h1>
              {c.compared
                ? te ? <><b>{c.compared}లో {c.deeper} మండలాల్లో</b> నీటి మట్టం సాధారణ {month} కంటే లోతులో ఉంది</> : <><b>{c.deeper} of {c.compared}</b> mandals stand deeper than their usual {month}</>
                : te ? <>{monthYear}లో ఏ మండలంలోనూ రీడింగ్ లేదు</> : <>No mandal read in {s.month}</>}
            </h1>
            <p className={brief.sub}>
              {te
                ? <>{monthYear}: ప్రతి మండలాన్ని రికార్డులోని దాని సొంత {month} నెలల మధ్యస్థ మట్టంతో పోల్చాం{c.shallower ? `; ${c.shallower} మండలాల్లో అంతకంటే పైన ఉంది` : ""}.</>
                : <>{s.month}, each mandal against the median of its own {month}s on record{c.shallower ? `; ${c.shallower} stand above it` : ""}.</>}
              {sum ? (te
                ? <> సాధారణ శీతాకాలంలో మే {target} నాటికి <b>{sum.mandals}లో {sum.beyond} మండలాలు</b> రికార్డులోని అత్యంత లోతైన మే మట్టాన్ని దాటుతాయని అంచనా{sum.people ? <>; అక్కడ సుమారు <b>{peopleIn(lang, sum.people)} మంది</b> నివసిస్తున్నారు</> : null}.</>
                : <> By May {target}, on a typical winter, <b>{sum.beyond} of {sum.mandals}</b> are projected past their deepest May on record{sum.people ? <>, home to about <b>{peopleIn(lang, sum.people)} people</b></> : null}.</>) : null}
            </p>
          </div>

          <div className={brief.body}>
            <ul className={brief.tiles} data-testid="district-sheet-tiles">
              <li>
                <span>{te ? `నీటి మట్టం, ${month}` : `Water table, ${month}`}</span>
                <b data-tone={s.medianNowM !== null && s.medianUsualM !== null && s.medianNowM - s.medianUsualM > 0.5 ? "bad" : undefined}>{s.medianNowM !== null ? s.medianNowM.toFixed(1) : "–"}<small>{unit}</small></b>
                <em>{te
                  ? `మధ్యస్థ మండలంలో భూమి నుండి లోతు${s.medianUsualM !== null ? `; సాధారణ ${month}: ${metresIn(lang, s.medianUsualM)}` : ""}`
                  : `below ground at the median mandal${s.medianUsualM !== null ? `, against a usual ${month} of ${s.medianUsualM.toFixed(1)} m` : ""}`}</em>
              </li>
              <li>
                <span>{te ? "మే నుండి" : "Since May"}</span>
                <b data-tone={mon && mon.shortfallM > 0.5 ? "bad" : undefined}>{mon ? <>{Math.abs(mon.thisSeasonM).toFixed(1)}<small>{te ? (rose ? "మీ. పైకి" : "మీ. లోతుకు") : `m ${rose ? "higher" : "deeper"}`}</small></> : "–"}</b>
                <em>{mon ? (te
                  ? `వర్షాకాలం తర్వాత నీటి మట్టం, మేతో పోలిస్తే; సాధారణంగా ${m(mon.typicalM)} ${mon.typicalM < 0 ? "పైకి వస్తుంది" : "లోతుకు వెళ్తుంది"}${mon.shortMandals ? `. ${mon.shortMandals} మండలాల్లో రీఛార్జ్ తక్కువ` : ""}`
                  : `the water table after the monsoon, against May; usually it ${mon.typicalM < 0 ? "rises" : "falls"} ${m(mon.typicalM)}${mon.shortMandals ? `. ${mon.shortMandals} mandals flagged short` : ""}`)
                  : te ? "పోల్చదగిన సీజన్లు లేవు" : "no comparable seasons"}</em>
              </li>
              <li>
                <span>{te ? `${dates.rain ? dayIn(lang, dates.rain.start, false) : "జూన్"} నుండి వర్షం` : `Rain since ${dates.rain ? dayIn(lang, dates.rain.start, false) : "June"}`}</span>
                <b data-tone={w?.rain && w.rain.deviationPct <= -20 ? "bad" : undefined}>{w?.rain ? `${w.rain.deviationPct > 0 ? "+" : "−"}${Math.abs(Math.round(w.rain.deviationPct))}` : "–"}<small>%</small></b>
                <em>{w?.rain ? (te
                  ? `సాధారణం ${Math.round(w.rain.normalMm)} మి.మీ.కు గాను ${Math.round(w.rain.actualMm)} మి.మీ.; రాష్ట్ర వర్షమాపకాలు, ${dates.rain ? dayIn(lang, dates.rain.end, false) : "–"} వరకు`
                  : `${Math.round(w.rain.actualMm)} mm against a normal ${Math.round(w.rain.normalMm)} mm, State gauges to ${dates.rain ? dayIn(lang, dates.rain.end, false) : "–"}`)
                  : te ? "వర్షమాపక సమాచారం లేదు" : "no gauge figure"}</em>
              </li>
              {w?.reservoirs && w.reservoirs.storagePct !== null ? (
                <li>
                  <span>{te ? "జలాశయాలు" : "Reservoirs"}</span>
                  <b data-tone={w.reservoirs.lastYearPct !== null && w.reservoirs.storagePct < w.reservoirs.lastYearPct - 10 ? "bad" : undefined}>{Math.round(w.reservoirs.storagePct)}<small>{te ? "% నిండి" : "% full"}</small></b>
                  <em>{te
                    ? `జిల్లాలో ${w.reservoirs.count}${w.reservoirs.lastYearPct !== null ? `; ఏడాది క్రితం ${Math.round(w.reservoirs.lastYearPct)}%` : ""} (${dayIn(lang, dates.reservoirs)})`
                    : `${w.reservoirs.count} in the district${w.reservoirs.lastYearPct !== null ? `, against ${Math.round(w.reservoirs.lastYearPct)}% a year ago` : ""} (${dayIn(lang, dates.reservoirs)})`}</em>
                </li>
              ) : w?.soil ? (
                <li>
                  <span>{te ? "నేల తేమ" : "Soil moisture"}</span>
                  <b>{Math.round(w.soil.medianPct)}<small>%</small></b>
                  <em>{te
                    ? `మధ్యస్థ మండలంలో; ${w.soil.withBaseline}లో ${w.soil.belowOwnMedian} మండలాల్లో ఈ తేదీకి సాధారణం కంటే తక్కువ`
                    : `at the median mandal; ${w.soil.belowOwnMedian} of ${w.soil.withBaseline} below their own usual for the date`}</em>
                </li>
              ) : <li><span>{te ? "జలాశయాలు" : "Reservoirs"}</span><b>–</b><em>{te ? "జిల్లాలో నమోదు కాలేదు" : "none recorded in the district"}</em></li>}
            </ul>

            <div className={styles.split}>
              <figure className={styles.mapWrap}>
                <svg viewBox={s.map.viewBox} className={styles.map} role="img" aria-label={te ? `${s.name} మండలాలు, సాధారణ ${month}తో పోలిస్తే నీటి మట్టం రంగుల్లో` : `${s.name}'s mandals coloured by their water table against the usual ${month}`}>
                  {s.map.shapes.map((shape, i) => <path key={i} d={shape.d} fill={toneOf(shape.side)} stroke="#fff" strokeWidth={0.35} strokeLinejoin="round" />)}
                  {s.map.shapes.filter(shape => shape.priority).map((shape, i) => <path key={`p${i}`} d={shape.d} fill="none" stroke="#0d2138" strokeWidth={0.9} strokeLinejoin="round" />)}
                </svg>
                <figcaption className={styles.key}>
                  <span><i style={{ background: TONE.deeper }} />{te ? "సాధారణం కంటే లోతు" : "Deeper than usual"}</span>
                  <span><i style={{ background: TONE.shallower }} />{te ? "పైన" : "Shallower"}</span>
                  <span><i style={{ background: TONE.steady }} />{te ? "0.1 మీ. లోపు" : "Within 0.1 m"}</span>
                  {s.priority.rows.length ? <span><i className={styles.ring} />{te ? "వేసవి జాబితాలో" : "On the summer list"}</span> : null}
                </figcaption>
              </figure>

              <div className={styles.side}>
                <h3>{te ? "వేసవి తాగునీరు: ముందుగా ప్రణాళిక" : "Summer drinking water: plan first"}{firstRows.length ? <small>{te ? " · కుడివైపు: సాధారణ శీతాకాలంలో మే లోతు" : " · right: May depth, typical winter"}</small> : null}</h3>
                {firstRows.length ? (
                  <ul className={styles.first} data-testid="district-sheet-first">
                    {firstRows.map(r => (
                      <li key={r.index}>
                        <span><b>{r.mandal}</b><small>{te
                          ? `${BAND.te[r.band]} · ఇప్పుడు ${metresIn(lang, r.nowM)}, అత్యంత లోతైన మే ${metresIn(lang, r.deepestMayM)}${r.people ? ` · ${peopleIn(lang, r.people)} మంది` : ""}`
                          : `${BAND.en[r.band]} · now ${r.nowM.toFixed(1)} m, deepest May ${r.deepestMayM.toFixed(1)} m${r.people ? ` · ${peopleIn(lang, r.people)} people` : ""}`}</small></span>
                        <strong>{metresIn(lang, r.typicalM)}</strong>
                      </li>
                    ))}
                  </ul>
                ) : <p className={styles.none}>{te ? "ఈ జిల్లాలో ముందుగా లేదా తదుపరి ప్రణాళిక జాబితాలో ఏ మండలమూ లేదు." : "No mandal here is on the summer list to plan first or next."}</p>}
                <p className={styles.note}>
                  {planned.length > firstRows.length ? (te ? `మరో ${planned.length - firstRows.length} మండలాలకు ప్రణాళిక అవసరం. ` : `${planned.length - firstRows.length} more to plan for. `) : ""}
                  {s.priority.watch ? (te ? `మరో ${s.priority.watch} పర్యవేక్షణలో: పొడి శీతాకాలంలో మాత్రమే రికార్డును దాటుతాయి. ` : `${s.priority.watch} more to watch: past their record only in a dry winter. `) : ""}
                  <Link href="/summer/">{te ? "కారణాలతో పూర్తి జాబితా" : "The full list, with reasons"}</Link>.
                </p>
                {dr ? (
                  <p className={styles.note}>{te
                    ? <><b>కరవు మాన్యువల్, {dayIn(lang, dates.drought)} వరకు:</b> అంచనా వేసిన {dr.assessed} మండలాల్లో {dr.severe} తీవ్రం, {dr.moderate} మధ్యస్థం{dr.between ? `, ${dr.between} రెండు రీడింగుల మధ్య` : ""}. ఇది ప్రాథమిక పరిశీలన మాత్రమే, ప్రకటన కాదు.</>
                    : <><b>Drought manual, to {dayIn(lang, dates.drought)}:</b> {dr.severe} severe, {dr.moderate} moderate{dr.between ? `, ${dr.between} between two readings` : ""} of {dr.assessed} mandals assessed. A screening reading, not a declaration.</>}</p>
                ) : null}
                {s.fieldTeams.length ? <p className={styles.note}><b>{te ? "క్షేత్ర బృందాల జాబితాలో:" : "On the field-teams list:"}</b> {s.fieldTeams.join(", ")}.</p> : null}
              </div>
            </div>

            <div className={brief.sec}>{te ? `ప్రతి మండలం ఒక బోరుబావిగా, ${monthYear}` : `Every mandal as a borewell, ${s.month}`}</div>
            <div className={styles.bores} data-testid="district-sheet-bores">
              <Borewells uid={`sb-${s.slug}`} bores={s.mandals.map(x => ({ id: x.id, name: x.name, nowM: x.nowM, usualM: x.usualM, side: x.side, deepestM: x.deepestM }))}
                scaleM={s.scaleM} aquifer={s.aquifer} soil={86} nameSize={s.mandals.length > 30 ? 11.5 : 12.5} nameMax={14}
                unit={unit} groundLabel={GROUND[lang]?.[s.aquifer]}
                label={te ? `${s.name} జిల్లాలోని ${s.mandals.length} మండలాలు బోరుబావులుగా, ${monthYear}` : `${s.name}'s ${s.mandals.length} mandals as borewells in ${s.month}`} />
              <p className={styles.boresKey}>
                <span><i style={{ background: "#5be38a" }} />{te ? "నడుస్తోంది" : "Running"} {n("full") + n("steady")}</span>
                <span><i style={{ background: "#f2b442" }} />{te ? "సాధారణం కంటే దిగువ, సన్నగా" : "Below usual, a trickle"} {n("trickle")}</span>
                <span><i style={{ background: "#ff5a3c" }} />{te ? "పంపు కంటే దిగువ, ఎండిపోయింది" : "Below the pump, dry"} {n("dry")}</span>
                <span>{te ? `స్కేల్ ప్రకారం; పంపులు సాధారణ ${month} కంటే 2 మీ. దిగువన.` : `To scale; pumps 2 m below the usual ${month}.`}</span>
              </p>
            </div>

            <div className={brief.sec}>{te ? `సాధారణ ${month} కంటే అత్యంత లోతులో` : `Furthest below their usual ${month}`}</div>
            {shown.length ? (
              <table className={styles.table} data-testid="district-sheet-table">
                <thead><tr>
                  <th>{te ? "మండలం" : "Mandal"}</th><th className={styles.num}>{month} {year}</th><th className={styles.num}>{te ? "సాధారణం" : "Usual"}</th>
                  <th className={styles.num}>{te ? "ఎంత లోతు" : "Deeper by"}</th><th>{te ? "మే నాటికి, సాధారణ శీతాకాలం" : "By May, typical winter"}</th>
                </tr></thead>
                <tbody>
                  {shown.map((x: SheetMandal) => (
                    <tr key={x.id}>
                      <td><b>{x.name}</b>{x.priority && x.priority !== "watch" ? <small>{te ? " · వేసవి జాబితాలో" : " · on the summer list"}</small> : null}</td>
                      <td className={styles.num}>{x.nowM !== null ? metresIn(lang, x.nowM) : "–"}</td>
                      <td className={styles.num}>{x.usualM !== null ? metresIn(lang, x.usualM) : "–"}</td>
                      <td className={`${styles.num} ${styles.bad}`}>{x.vsUsualM !== null ? m(x.vsUsualM) : "–"}</td>
                      <td>{x.summer ? SUMMER_WORD[lang][x.summer] : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className={styles.none}>{te ? `ఏ మండలమూ సాధారణ ${month} కంటే 0.1 మీ. కంటే ఎక్కువ లోతులో లేదు.` : `No mandal stands more than 0.1 m below its usual ${month}.`}</p>}
            {rest > 0 ? <p className={styles.more}>{te ? `మరో ${rest} మండలాలు సాధారణం కంటే లోతులో ఉన్నాయి; పై బోరుబావుల్లో ప్రతి దాని పేరు ఉంది.` : `And ${rest} more deeper than usual, each named in the borewells above.`}</p> : null}
          </div>

          <div className={brief.foot}>
            <span>
              {te
                ? `భూగర్భ జలం: APWRIMS నెలవారీ చేతి రీడింగుల బావులు, మండల మధ్యస్థం, ${monthYear}; సాధారణం అంటే రికార్డులోని ఆ మండలపు ${month} నెలల మధ్యస్థం. వేసవి: అవే రీడింగులు, ప్రతి మండలపు గత శీతాకాలాలతో సైట్ అంచనా. వర్షం, జలాశయాలు: APWRIMS ద్వారా రాష్ట్ర వర్షమాపకాలు, జలాశయ మట్టాలు. కరవు: జాతీయ కరవు మాన్యువల్ సూచికలు. మండలాలు, జిల్లాల పేర్లు ఆంగ్లంలో. ${caveat}`
                : `Groundwater: APWRIMS monthly hand-read wells, the mandal median, ${s.month}; usual is each mandal’s median ${month} on record. Summer: the site’s outlook from the same readings and each mandal’s past winters. Rain and reservoirs: State gauges and reservoir levels via APWRIMS. Drought: the national drought manual’s indicators. ${caveat}`}
            </span>
            <span><b>prucodes.github.io/ap-groundwater-fusion</b><br />{here}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
