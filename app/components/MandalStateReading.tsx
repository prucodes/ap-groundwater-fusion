import Link from "next/link";
import { agricultureEvidence } from "../lib/agricultureServer";
import { boundaryLabel, mapGeometry } from "../lib/data";
import { shortDate } from "../lib/drought";
import { stateReadingFor, stateSnapshot } from "../lib/stateSnapshot";
import { IconArrowRight, IconDroplet } from "./icons";
import styles from "./MandalStateReading.module.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

/** Metres below ground: a positive change means the water table fell. */
function move(value: number | null | undefined) {
  if (value === null || value === undefined) return { text: "—", tone: "" };
  if (Math.abs(value) < 0.05) return { text: "no change", tone: "" };
  return value > 0
    ? { text: `${value.toFixed(2)} m deeper`, tone: styles.worse }
    : { text: `${Math.abs(value).toFixed(2)} m shallower`, tone: styles.better };
}

/** The State network's latest reading for one mandal, and the mandal's official
 *  codes and constituency. Server-rendered: only this mandal's row is sent. */
export function MandalStateReading({ mandalId }: { mandalId: string }) {
  const matches = agricultureEvidence().mandals.filter(row => row.id === mandalId);
  if (matches.length !== 1) return null;
  const feature = mapGeometry.mandals[matches[0].index];
  if (!feature) return null;
  const reading = stateReadingFor(feature.d, feature.m);
  if (!reading && !feature.ac) return null;
  const sinceMay = move(reading?.sinceMayM);
  const yearAgo = move(reading?.vsYearAgoM);
  const vsOurs = move(reading?.vsOurLatestM);
  return (
    <section className="card" aria-labelledby="mandal-state-title">
      <div className="cardHead">
        <div className="cardTitle" id="mandal-state-title">
          <span className="titleIcon"><IconDroplet /></span>The State network&rsquo;s latest reading
        </div>
        <span className="cardSub">AWARE groundwater feed · one reading, not a monthly mean</span>
      </div>
      {reading ? (
        <>
          <div className={styles.grid} data-testid="state-reading">
            <div><span>Latest reading</span><strong>{reading.currentM === null ? "—" : `${reading.currentM.toFixed(2)} m`}</strong>
              <em>below ground{reading.date ? `, ${shortDate(reading.date, true)}` : ""}{reading.band ? ` · State band ${reading.band.replace("m-", "–").replace("m", " m")}` : ""}</em></div>
            <div><span>Since May</span><strong className={sinceMay.tone}>{sinceMay.text}</strong>
              <em>pre-monsoon {reading.preMonsoonM === null ? "—" : `${reading.preMonsoonM.toFixed(2)} m`}</em></div>
            <div><span>Against a year ago</span><strong className={yearAgo.tone}>{yearAgo.text}</strong>
              <em>{reading.yearAgoM === null ? "no year-ago value" : `${reading.yearAgoM.toFixed(2)} m then`}</em></div>
            <div><span>Stations</span><strong>{reading.stations}</strong>
              <em>{reading.stations === 0 ? "no station reported" : reading.stations === 1 ? "one well carries this mandal" : "wells averaged"}</em></div>
          </div>
          {reading.ourLatestMonth ? (
            <p className={styles.note}>
              {`Our monthly series ends ${month(reading.ourLatestMonth)} at ${reading.ourLatestM?.toFixed(2)} m; the State reading is ${vsOurs.text === "no change" ? "the same" : vsOurs.text} since then. `}
              {reading.matchedBy && reading.matchedBy !== "district" ? `Matched to this mandal by ${reading.matchedBy} (${reading.feedName}). ` : ""}
              It is shown beside our series, not merged into it, and the model does not use it.
            </p>
          ) : null}
        </>
      ) : (
        <p className={styles.note}>The State feed has no reading matched to this mandal.</p>
      )}
      {feature.ac ? (
        <dl className={styles.codes}>
          <div><dt>Assembly constituency</dt><dd>{feature.ac}</dd></div>
          {feature.pc ? <div><dt>Parliamentary constituency</dt><dd>{feature.pc}</dd></div> : null}
          {feature.div ? <div><dt>Revenue division</dt><dd>{feature.div}</dd></div> : null}
          {feature.lgd ? <div><dt>LGD mandal code</dt><dd>{feature.lgd}</dd></div> : null}
          {feature.officialKm2 ? <div><dt>Official area</dt><dd>{`${feature.officialKm2} km²`}</dd></div> : null}
          <div><dt>Outline drawn</dt><dd>{boundaryLabel(feature)}</dd></div>
        </dl>
      ) : null}
      <p className={styles.source}>
        {`${stateSnapshot.source}. Readings ${stateSnapshot.readingDates.first ? shortDate(stateSnapshot.readingDates.first) : "?"}–${stateSnapshot.readingDates.last ? shortDate(stateSnapshot.readingDates.last, true) : "?"}.`}
      </p>
      {feature.ac ? (
        <Link className="linkAction" href="/constituencies" style={{ marginTop: 10 }}>Every constituency <IconArrowRight /></Link>
      ) : null}
    </section>
  );
}
