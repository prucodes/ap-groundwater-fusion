import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import styles from "../../../components/constituencies/ConstituencyBrief.module.css";
import { PrintBrief } from "../../../components/constituencies/PrintBrief";
import constituencyJson from "../../../data/constituencies.json";
import type { Constituency, ConstituencyData } from "../../../lib/constituencies";
import { MAP_VIEW, datasetManifest, formatPeriod, mapGeometry, mandalByMapKey, statusMeta, titleCase } from "../../../lib/data";
import { CATEGORY_META, shortDate, signedPct } from "../../../lib/drought";
import { droughtForMandal, droughtWatch } from "../../../lib/droughtWatch";
import { reliabilityFor } from "../../../lib/forecastReliability";
import { stateReadingFor } from "../../../lib/stateSnapshot";
import { stateSummary } from "../../../lib/stateSummary";

/* One page per assembly constituency, laid out to print on a single A4 sheet
   for a meeting: the headline figures, what they mean in plain words, every
   mandal in a row, and where each figure comes from. Built from the same
   published files as the rest of the site; nothing is computed here that the
   site does not already show. */

const data = constituencyJson as unknown as ConstituencyData;
export const dynamicParams = false;

export function generateStaticParams() {
  return data.constituencies.map(c => ({ code: c.code as string }));
}

const find = (code: string) => data.constituencies.find(c => c.code === code);
const name = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));
const norm = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const c = find((await params).code);
  return c ? {
    title: `${c.ac} water brief | AP Water Intelligence`,
    description: `Groundwater, the State's well readings, the drought manual and gauge rain for ${c.ac} assembly constituency, mandal by mandal.`,
  } : {};
}

/** Each mandal the constituency holds, with its district from the map. */
function mandalsOf(c: Constituency) {
  const districts = new Set(c.districts.map(norm));
  return c.mandals.map(m => {
    const feature = mapGeometry.mandals.find(f => norm(f.m) === norm(m) && districts.has(norm(f.d)))
      ?? mapGeometry.mandals.find(f => norm(f.m) === norm(m));
    return { name: m, district: feature?.d ?? c.districts[0], feature };
  });
}

function outlinePath(rings: number[][][]) {
  return rings.map(ring => ring.map(([lon, lat], i) => {
    const [x, y] = MAP_VIEW.project(lon, lat);
    return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join("") + "Z").join("");
}

function bounds(ringsList: number[][][][]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const rings of ringsList) for (const ring of rings) for (const [lon, lat] of ring) {
    const [x, y] = MAP_VIEW.project(lon, lat);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08 + 2;
  return `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`;
}

const metres = (value: number | null | undefined, digits = 1) => (value === null || value === undefined ? "—" : `${value.toFixed(digits)} m`);
const change = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : value >= 0 ? `${value.toFixed(2)} m deeper` : `${Math.abs(value).toFixed(2)} m shallower`;

export default async function ConstituencyBriefPage({ params }: { params: Promise<{ code: string }> }) {
  const c = find((await params).code);
  if (!c) notFound();

  const rows = mandalsOf(c).map(({ name: mandal, district, feature }) => {
    const view = mandalByMapKey(district, mandal) ?? null;
    const state = stateReadingFor(district, mandal);
    const drought = droughtForMandal(district, mandal);
    const trust = view && view.forecast_mbgl !== null && view.forecast_mbgl !== undefined ? reliabilityFor(view.id) : null;
    return { mandal, district, feature, view, state, drought, trust };
  });
  const gw = c.groundwater, sr = c.stateReading, dr = c.drought;
  const stressShare = gw.assessed ? Math.round((100 * gw.stress) / gw.assessed) : null;
  const severe = rows.filter(r => r.drought?.category === "severe").map(r => name(r.mandal));
  const deepest = [...rows].filter(r => r.state?.sinceMayM !== null && r.state?.sinceMayM !== undefined)
    .sort((a, b) => (b.state!.sinceMayM as number) - (a.state!.sinceMayM as number))[0];
  const rings = rows.map(r => r.feature?.rings).filter((r): r is number[][][] => Boolean(r && r.length));
  const viewBox = rings.length ? bounds(c.rings && c.rings.length ? [c.rings] : rings) : null;
  const lowerConfidence = rows.filter(r => r.trust && r.trust.verdict !== "beats").length;
  const forecasts = rows.filter(r => r.trust).length;
  const rainDate = droughtWatch.sources.rain.window.end ?? droughtWatch.season.asOf;

  const sentences: string[] = [];
  if (gw.assessed) {
    sentences.push(`Groundwater reads stress in ${gw.stress} of ${gw.assessed} assessed mandal${gw.assessed === 1 ? "" : "s"}${gw.medianDepthM !== null ? `, with a median depth of ${gw.medianDepthM.toFixed(1)} m below ground` : ""}.`);
  }
  if (sr.medianSinceMayM !== null) {
    sentences.push(`The State's ${sr.stations} well${sr.stations === 1 ? "" : "s"} here read ${change(sr.medianSinceMayM)} than in May (median)${deepest?.state?.sinceMayM && deepest.state.sinceMayM >= 0.1 ? `; the largest fall is in ${name(deepest.mandal)}, ${deepest.state.sinceMayM.toFixed(1)} m` : ""}.`);
  }
  if (dr.assessed) {
    sentences.push(dr.active
      ? `On the national drought manual, ${dr.active} of ${dr.assessed} mandal${dr.assessed === 1 ? "" : "s"} read moderate or worse${severe.length ? ` and ${severe.join(", ")} read${severe.length === 1 ? "s" : ""} severe` : ""}: evidence for the State's field check, not a declaration.`
      : `No mandal reads moderate or worse on the national drought manual's indicators.`);
  }
  if (c.rain.medianDeparturePct !== null) {
    sentences.push(`Gauge rain since 1 June is ${signedPct(c.rain.medianDeparturePct)} against normal (median of the mandals).`);
  }
  if (forecasts) {
    sentences.push(lowerConfidence
      ? `The three-month groundwater forecast carries lower confidence for ${lowerConfidence} of ${forecasts} mandal${forecasts === 1 ? "" : "s"}: forecasts made in the same month after similar rain have not beaten assuming no change.`
      : `The three-month groundwater forecast is backed by its record in every mandal here.`);
  }

  return (
    <article className={styles.brief}>
      <header className={styles.head}>
        <div>
          <span className={styles.kicker}>Constituency water brief · Andhra Pradesh</span>
          <h1>{c.ac} <small>{`AC ${c.code}`}</small></h1>
          <p>{`${c.pc} parliamentary constituency · ${c.districts.map(name).join(", ")} district${c.districts.length === 1 ? "" : "s"}${c.reserved && c.reserved !== "General" ? ` · reserved ${c.reserved}` : ""}`}</p>
        </div>
        <div className={styles.headSide}>
          <span>{`Data to ${shortDate(datasetManifest.generatedAt.slice(0, 10), true)}`}</span>
          <PrintBrief className={styles.print} />
          <Link href="/constituencies" className={styles.back}>All constituencies</Link>
        </div>
      </header>

      <section className={styles.tiles} aria-label="Headline figures">
        <div><span>Groundwater in stress</span><strong>{stressShare === null ? "—" : `${stressShare}%`}</strong><em>{`${gw.stress} of ${gw.assessed} assessed mandals`}</em></div>
        <div><span>Median depth</span><strong>{metres(gw.medianDepthM)}</strong><em>below ground, latest monthly reading</em></div>
        <div><span>State wells since May</span><strong>{sr.medianSinceMayM === null ? "—" : `${sr.medianSinceMayM >= 0 ? "+" : "−"}${Math.abs(sr.medianSinceMayM).toFixed(2)} m`}</strong><em>{`${sr.medianSinceMayM !== null && sr.medianSinceMayM >= 0 ? "deeper" : "shallower"} · ${sr.stations} stations`}</em></div>
        <div><span>Drought manual</span><strong>{`${dr.active} / ${dr.assessed}`}</strong><em>{`moderate or worse · ${dr.severe} severe`}</em></div>
        <div><span>Gauge rain</span><strong>{c.rain.medianDeparturePct === null ? "—" : signedPct(c.rain.medianDeparturePct)}</strong><em>against normal since 1 June</em></div>
      </section>

      <div className={styles.body}>
        <section className={styles.reading} aria-label="What the figures say">
          <h2>What the figures say</h2>
          {sentences.length ? sentences.map(s => <p key={s}>{s}</p>) : <p>No mandal of this constituency has its own boundary on this map; the city is counted in the seat its centre falls in.</p>}
        </section>
        {viewBox ? (
          <figure className={styles.map}>
            <svg viewBox={viewBox} role="img" aria-label={`${c.ac}: its mandals coloured by groundwater status`}>
              {rows.map(r => r.feature ? (
                <path key={r.mandal} d={outlinePath(r.feature.rings)} fill={r.view ? statusMeta(r.view.status_bucket).color : "var(--st-insufficient)"} className={styles.mandal} />
              ) : null)}
              {c.rings && c.rings.length ? <path d={outlinePath(c.rings)} className={styles.outline} /> : null}
            </svg>
            <figcaption>{c.outline === "official" ? "The State's constituency outline over its mandals" : "The constituency as the union of its mandals"} · coloured by groundwater status</figcaption>
          </figure>
        ) : null}
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Mandal</th><th>Groundwater</th><th>Depth</th><th>State wells since May</th><th>Drought manual</th><th>Gauge rain</th><th>3-month outlook</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const status = r.view ? statusMeta(r.view.status_bucket) : null;
            const category = r.drought ? CATEGORY_META[r.drought.category] : null;
            return (
              <tr key={r.mandal}>
                <td><strong>{r.view ? <Link href={`/mandals/${r.view.id}`}>{name(r.mandal)}</Link> : name(r.mandal)}</strong><small>{name(r.district)}</small></td>
                <td>{status ? <span className={styles.chip}><i style={{ background: status.color }} />{status.label}</span> : "—"}</td>
                <td>{r.view ? <>{metres(r.view.display_mbgl ?? r.view.median_groundwater_mbgl, 2)}<small>{formatPeriod(r.view.latest_observation_period)}</small></> : "—"}</td>
                <td>{change(r.state?.sinceMayM)}{r.state ? <small>{`${r.state.stations} station${r.state.stations === 1 ? "" : "s"}`}</small> : null}</td>
                <td>{category ? <span className={styles.chip}><i style={{ background: category.color }} />{category.short}</span> : "—"}</td>
                <td>{r.drought?.rain?.dev !== null && r.drought?.rain?.dev !== undefined ? signedPct(r.drought.rain.dev) : "—"}</td>
                <td>{r.view?.forecast_mbgl !== null && r.view?.forecast_mbgl !== undefined
                  ? <>{metres(r.view.forecast_mbgl, 2)}<small>{`${formatPeriod(r.view.forecast_target_period)}${r.trust && r.trust.verdict !== "beats" ? " · lower confidence" : ""}`}</small></>
                  : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer className={styles.foot}>
        <p>
          <strong>Sources.</strong>{" "}Groundwater: APWRIMS monthly series, this site&rsquo;s assessment of each mandal (depth is the latest
          measured monthly aggregate). State wells: AP AWARE groundwater feed via the AI Living Labs data lake, one reading{stateSummary.readingDates.mostCommon ? ` (${shortDate(stateSummary.readingDates.mostCommon, true)})` : ""}{" "}against May.
          Drought: this site&rsquo;s reading of the national Manual for Drought Management (2020){rainDate ? `, rain to ${shortDate(rainDate, true)}` : ""}.
          Gauge rain: AP DES gauges via APWRIMS. Outlook: the released three-month forecast; &ldquo;lower confidence&rdquo; where forecasts made in the same
          month after similar rain have not beaten assuming no change.
        </p>
        <p>
          <strong>Prototype.</strong>{" "}A research result, not an official one: not official until the APWRIMS export is authorised. A drought
          reading here is evidence for the State&rsquo;s field verification, not a declaration. Mandals are placed in the constituency their State record names{c.placedByLocation.length ? `; ${c.placedByLocation.map(name).join(", ")} by where ${c.placedByLocation.length === 1 ? "its" : "their"} centre falls` : ""}.
        </p>
      </footer>
    </article>
  );
}
