import outlookJson from "../../data/enso_outlook.json";
import type { EnsoOutlook as Outlook, NeMonsoonSoFar } from "../../lib/data";
import { monsoonWatch } from "../../lib/data";
import { waterSummary } from "../../lib/waterSummary";
import { place, shortDate, signedPct } from "../../lib/drought";
import styles from "./EnsoOutlook.module.css";

/* What NOAA's forecasters expect the Pacific to do next, and what past El
   Niños meant for rain in Andhra Pradesh, side by side and never merged: the
   first is a forecast for the ocean, the second a record for the state. */

const outlook = outlookJson as unknown as Outlook;

const BANDS = [
  { key: "elNinoVeryStrong", label: "Very strong (≥ 2.0 °C)", color: "#b23a2e" },
  { key: "elNinoStrong", label: "Strong (1.5–2.0)", color: "#d9693e" },
  { key: "elNinoModerate", label: "Moderate (1.0–1.5)", color: "#e9a15a" },
  { key: "elNinoWeak", label: "Weak (0.5–1.0)", color: "#f3cf8f" },
  { key: "neutral", label: "Neutral", color: "#8a97a8" },
  { key: "laNina", label: "La Niña", color: "#3f86d6" },
] as const;

const THRESHOLDS = [
  { c: 0.5, label: "weak" },
  { c: 1.0, label: "moderate" },
  { c: 1.5, label: "strong" },
  { c: 2.0, label: "very strong" },
];

function laNina(row: Outlook["strengths"][number]) {
  return row.laNinaVeryStrong + row.laNinaStrong + row.laNinaModerate + row.laNinaWeak;
}

function FanChart() {
  const rows = outlook.outlook;
  const W = 640, H = 270, L = 40, R = 86, T = 18, B = 40;
  const lo = Math.min(-0.5, Math.floor(Math.min(...rows.map(r => r.p5)) * 2) / 2);
  const hi = Math.max(3, Math.ceil(Math.max(...rows.map(r => r.p95)) * 2) / 2);
  const x = (i: number) => L + (i * (W - L - R)) / Math.max(rows.length - 1, 1);
  const y = (c: number) => T + ((hi - c) * (H - T - B)) / (hi - lo);
  const band = (a: "p5" | "p25", b: "p95" | "p75") =>
    rows.map((r, i) => `${x(i)},${y(r[b])}`).join(" ") + " " + rows.map((r, i) => `${x(i)},${y(r[a])}`).reverse().join(" ");
  const peakIndex = rows.findIndex(r => r.season === outlook.peak.season);
  const ticks: number[] = [];
  for (let c = Math.ceil(lo); c <= hi; c += 1) ticks.push(c);
  return (
    <svg className={styles.fan} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`NOAA's forecast of the Niño 3.4 index: median peaking at ${outlook.peak.medianC} °C in ${outlook.peak.label}`}>
      {ticks.map(c => (
        <g key={c}>
          <line x1={L} x2={W - R} y1={y(c)} y2={y(c)} className={c === 0 ? styles.zero : styles.grid} />
          <text x={L - 8} y={y(c) + 4} textAnchor="end" className={styles.axis}>{c > 0 ? `+${c}` : c}</text>
        </g>
      ))}
      {THRESHOLDS.map(t => (
        <g key={t.c}>
          <line x1={L} x2={W - R} y1={y(t.c)} y2={y(t.c)} className={styles.threshold} />
          <text x={W - R + 6} y={y(t.c) + 4} className={styles.thresholdLabel}>{t.label}</text>
        </g>
      ))}
      <polygon points={band("p5", "p95")} className={styles.band90} />
      <polygon points={band("p25", "p75")} className={styles.band50} />
      <polyline points={rows.map((r, i) => `${x(i)},${y(r.p50)}`).join(" ")} className={styles.median} />
      {rows.map((r, i) => (
        <g key={r.season}>
          <circle cx={x(i)} cy={y(r.p50)} r={i === peakIndex ? 5.5 : 3.5} className={i === peakIndex ? styles.peakDot : styles.dot} />
          <text x={x(i)} y={H - B + 18} textAnchor="middle" className={styles.season}>{r.season}</text>
          <text x={x(i)} y={H - B + 31} textAnchor="middle" className={styles.seasonYear}>{r.label.slice(-4)}</text>
        </g>
      ))}
      {peakIndex >= 0 ? (
        <text x={x(peakIndex)} y={y(rows[peakIndex].p95) - 8} textAnchor="middle" className={styles.peakLabel}>
          {`+${outlook.peak.medianC.toFixed(2)} °C`}
        </text>
      ) : null}
    </svg>
  );
}

function StrengthBars() {
  const rows = outlook.strengths;
  return (
    <div className={styles.bars} role="img"
      aria-label={`Chance of each El Niño strength by season; very strong peaks at ${Math.max(...rows.map(r => r.elNinoVeryStrong))}%`}>
      {rows.map(row => {
        const parts = BANDS.map(b => ({ ...b, value: b.key === "laNina" ? laNina(row) : row[b.key] }));
        return (
          <div className={styles.barCol} key={row.season} title={`${row.label}: ${parts.filter(p => p.value > 0).map(p => `${p.label} ${p.value}%`).join(", ")}`}>
            <span className={styles.barTop}>{row.elNinoVeryStrong}%</span>
            <span className={styles.barTrack}>
              {parts.slice().reverse().map(p => p.value > 0 ? (
                <i key={p.key} style={{ height: `${p.value}%`, background: p.color }} />
              ) : null)}
            </span>
            <span className={styles.barLabel}>{row.season}</span>
          </div>
        );
      })}
    </div>
  );
}

function daysBetween(start: string, end: string) {
  const a = start.split("-").map(Number), b = end.split("-").map(Number);
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000) + 1;
}

function NeSoFar({ ne }: { ne: NeMonsoonSoFar | null | undefined }) {
  if (!ne || ne.status === "unavailable") {
    return <p className={styles.soFarNote}>The October–December gauge figures could not be read this week; the record below still stands.</p>;
  }
  if (ne.status === "notStarted") {
    return <p className={styles.soFarNote}>The northeast monsoon window opens on {shortDate(ne.start, true)}. Gauge figures appear here from the first weekly refresh after it.</p>;
  }
  const days = daysBetween(ne.start, ne.end);
  const early = days < 14;
  const driest = ne.districts.filter(d => d.deviationPct !== null).slice(0, 5);
  return (
    <div className={styles.soFar}>
      <div className={styles.soFarHead}>
        <span className={styles.kickerDark}>So far · AP DES gauges</span>
        <strong>{early ? `Day ${days} of 92` : signedPct(ne.deviationPct)}</strong>
        <em>
          {shortDate(ne.start)} to {shortDate(ne.end, true)} · district mean {ne.meanActualMm ?? "—"} mm against {ne.meanNormalMm ?? "—"} mm normal
        </em>
      </div>
      {early ? (
        <p className={styles.soFarNote}>
          {`Too early to read: ${days} ${days === 1 ? "day" : "days"} of a 92-day season, and one wet spell can change it. District departures are shown from the second week of October.`}
        </p>
      ) : (
        <ul className={styles.soFarList} aria-label="Driest districts so far">
          {driest.map(d => (
            <li key={d.district}><span>{place(d.district)}</span><b>{signedPct(d.deviationPct)}</b><small>{d.actualMm} / {d.normalMm} mm</small></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EnsoOutlook() {
  const after = monsoonWatch.elNinoRainfall.afterElNino;
  const ne = monsoonWatch.elNinoRainfall.neMonsoon;
  const dependent = (ne?.byDistrict ?? [])
    .filter(d => (d.shareOfAnnualPct ?? 0) >= 33)
    .sort((a, b) => (b.shareOfAnnualPct ?? 0) - (a.shareOfAnnualPct ?? 0))
    .slice(0, 7);
  const veryStrong = after?.detail.filter(d => d.oniOndC >= after.veryStrong.thresholdC) ?? [];
  const peakVeryStrong = Math.max(...outlook.strengths.map(r => r.elNinoVeryStrong));
  const maxAbs = Math.max(15, ...dependent.map(d => Math.abs(d.elNinoAnomalyPct)));

  return (
    <section className={styles.panel} id="enso-outlook" aria-label="El Niño outlook and what it has meant for Andhra Pradesh">
      <div className={styles.head}>
        <div>
          <span className={styles.kicker}>NOAA Climate Prediction Center · issued {shortDate(outlook.issued, true)}{outlook.next ? ` · next ${shortDate(outlook.next)}` : ""}</span>
          <h2>The El Niño ahead, and what past ones meant here</h2>
          <blockquote>
            &ldquo;{outlook.synopsis}&rdquo;
            <cite>NOAA CPC ENSO Diagnostic Discussion, {shortDate(outlook.issued, true)}</cite>
          </blockquote>
        </div>
        <span className={styles.alert} data-testid="enso-alert">{outlook.alert}</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Forecast Niño 3.4 index, °C above normal · median and ranges</span>
          <FanChart />
          <p>
            Median peak <b>{`+${outlook.peak.medianC.toFixed(2)} °C`}</b> in {outlook.peak.label}; half of NOAA&rsquo;s outcomes lie
            between {outlook.peak.likelyRangeC[0].toFixed(2)} and {outlook.peak.likelyRangeC[1].toFixed(2)} °C. Dark band: 25th–75th percentile; light: 5th–95th.
          </p>
        </div>
        <div className={styles.tile}>
          <span className={styles.tileLabel}>Chance of each strength, by season</span>
          <StrengthBars />
          <ul className={styles.legend}>
            {BANDS.map(b => <li key={b.key}><i style={{ background: b.color }} />{b.label}</li>)}
          </ul>
          <p>A very strong event (≥ 2.0 °C) peaks at <b>{peakVeryStrong}%</b>. Top figure on each bar is that chance.</p>
        </div>
      </div>

      <div className={styles.record}>
        <div className={styles.recordHead}>
          <span className={styles.kicker}>The record for Andhra Pradesh · CHIRPS rain {after?.firstYear ?? 1981}–{after?.lastYear ?? 2025}</span>
          <p>{outlook.caveat} What the state&rsquo;s own record shows:</p>
        </div>
        <div className={styles.recordGrid}>
          {ne ? (
            <div className={styles.fact}>
              <span className={styles.tileLabel}>Northeast monsoon in El Niño years</span>
              <strong className={ne.elNinoAnomalyPct !== null && ne.elNinoAnomalyPct < 0 ? styles.bad : styles.good}>{signedPct(ne.elNinoAnomalyPct, 1)}</strong>
              <p>Statewide October–December, average of {ne.elNinoYears} El Niño years. Below normal in <b>{ne.elNinoBelowNormal} of {ne.elNinoYears}</b>, against {ne.belowNormalAllYears} of {ne.allYears} years overall.</p>
            </div>
          ) : null}
          {after ? (
            <div className={styles.fact}>
              <span className={styles.tileLabel}>The next southwest monsoon</span>
              <strong className={after.all.meanAnomalyPct < 0 ? styles.bad : styles.good}>{signedPct(after.all.meanAnomalyPct, 1)}</strong>
              <p>June–September after the {after.all.years} El Niño winters. Below normal in <b>{after.all.belowNormal} of {after.all.years}</b>, against {after.allYearsBelowNormal} of {after.allYears} years overall.</p>
            </div>
          ) : null}
          {after && veryStrong.length ? (
            <div className={styles.fact}>
              <span className={styles.tileLabel}>After very strong El Niños (≥ {after.veryStrong.thresholdC.toFixed(1)} °C)</span>
              <ul className={styles.years}>
                {veryStrong.map(d => (
                  <li key={d.year}><span>{d.year}</span><b className={d.anomalyPct < 0 ? styles.bad : styles.good}>{signedPct(d.anomalyPct, 1)}</b><small>after {d.afterWinter}–{String(d.afterWinter + 1).slice(2)}, +{d.oniOndC.toFixed(1)} °C</small></li>
                ))}
              </ul>
              <p>{`In all ${veryStrong.length}, the next monsoon was at or above normal. ${veryStrong.length} cases are too few to promise anything.`}</p>
            </div>
          ) : null}
        </div>

        {dependent.length ? (
          <div className={styles.dependent}>
            <div className={styles.dependentHead}>
              <span className={styles.tileLabel}>Districts that live on the northeast monsoon · its share of their year, and El Niño years against normal</span>
            </div>
            <ul className={styles.diverging} aria-label="Northeast-monsoon districts in El Niño years">
              {dependent.map(d => {
                const width = (Math.abs(d.elNinoAnomalyPct) / maxAbs) * 50;
                return (
                  <li key={d.district}>
                    <span className={styles.dName}>{place(d.district)}</span>
                    <span className={styles.dShare}><i style={{ width: `${d.shareOfAnnualPct ?? 0}%` }} /><b>{Math.round(d.shareOfAnnualPct ?? 0)}%</b></span>
                    <span className={styles.dTrack}>
                      <i className={d.elNinoAnomalyPct < 0 ? styles.dNeg : styles.dPos}
                        style={d.elNinoAnomalyPct < 0 ? { right: "50%", width: `${width}%` } : { left: "50%", width: `${width}%` }} />
                    </span>
                    <span className={styles.dValue}>{signedPct(d.elNinoAnomalyPct, 1)}<small>{d.elNinoBelowNormal ?? "—"}/{d.elNinoYears} below</small></span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <NeSoFar ne={waterSummary.rain?.neMonsoon} />
      </div>

      <p className={styles.foot}>
        Forecast: <a href={outlook.urls.outlook} target="_blank" rel="noreferrer">NOAA CPC official ENSO outlook</a>,{" "}
        <a href={outlook.urls.strengths} target="_blank" rel="noreferrer">strength probabilities</a> and{" "}
        <a href={outlook.urls.discussion} target="_blank" rel="noreferrer">diagnostic discussion</a>; {outlook.index}. Fetched {shortDate(outlook.fetchedAt, true)}, weekly.
        Record: CHIRPS v3 monthly rain, equal-weight mandal means; El Niño years by NOAA&rsquo;s ONI. Neither enters any model on this site.
      </p>
    </section>
  );
}
