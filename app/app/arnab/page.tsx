import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { CycloneArnabMap } from "../../components/CycloneArnabMap";
import { ArnabSpiral } from "../../components/CycloneArnab";
import { RowFold, foldAt } from "../../components/RowFold";
import { CountedReach } from "../../components/CountedReach";
import { IconCloudRain, IconCyclone, IconDroplet, IconTarget, IconWaves } from "../../components/icons";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import { formatNumber, titleCase } from "../../lib/data";
import { brief } from "../../lib/pageBriefs";
import { arnab, arnabDay, arnabMonth, BASIN_NAMES, listOf, RAIN_SCALE, soakedDistricts, titleName, type ArnabDay } from "../../lib/arnab";
import shared from "../rabi/Rabi.module.css";
import styles from "./Arnab.module.css";

export const metadata: Metadata = {
  title: "Cyclone Arnab | AP Water Intelligence",
  description: "Where Cyclone Arnab's rain fell across Andhra Pradesh, where the water went, and whether the water table rose where it had room. Updated daily.",
};

const signed = (v: number, unit: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} ${unit}`;

/* Storage across the State's reservoirs, day by day since the storm. A quiet line:
   the days are few, so every reading is a labelled point. */
function StorageLine({ days }: { days: ArnabDay[] }) {
  const W = 560, H = 180, L = 48, R = 34, T = 30, B = 30;
  const v = days.map(d => d.reservoirTmc);
  const lo = Math.floor((Math.min(...v) - 2) / 5) * 5, hi = Math.ceil((Math.max(...v) + 2) / 5) * 5;
  const x = (i: number) => (days.length === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (days.length - 1));
  const y = (t: number) => T + ((hi - t) * (H - T - B)) / (hi - lo || 1);
  const line = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.reservoirTmc).toFixed(1)}`).join("");
  const area = `${line}L${x(days.length - 1).toFixed(1)},${H - B}L${x(0).toFixed(1)},${H - B}Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  return (
    <svg className={styles.line} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Reservoir storage by day: ${days.map(d => `${arnabDay(d.date)} ${d.reservoirTmc} TMC`).join(", ")}.`}>
      <defs>
        <linearGradient id="arnabFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#12b5cb" stopOpacity=".28" />
          <stop offset="1" stopColor="#12b5cb" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map(t => <g key={t}>
        <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={styles.grid} />
        <text x={L - 8} y={y(t) + 4} textAnchor="end" className={styles.tick}>{t}</text>
      </g>)}
      <path d={area} fill="url(#arnabFill)" />
      <path d={line} className={styles.stroke} />
      {days.map((d, i) => <g key={d.date}>
        <circle cx={x(i)} cy={y(d.reservoirTmc)} r={i === days.length - 1 ? 5 : 3.5} className={i === days.length - 1 ? styles.dotNow : styles.dot} />
        <text x={x(i)} y={H - 10} textAnchor="middle" className={styles.tick}>{arnabDay(d.date)}</text>
      </g>)}
      <text x={L - 8} y={14} textAnchor="end" className={styles.tick}>TMC</text>
    </svg>
  );
}

export default function ArnabPage() {
  const d = arnab, s = d.state, since = d.since;
  const seen = arnabMonth(d.groundwaterLatest);
  const soaked = soakedDistricts();
  const precedent = new Map(d.precedent.bands.map(b => [b.band, b]));
  const mostHeavy = Math.max(...d.byDepth.map(b => b.heavy), 1);
  const mostRise = Math.max(...d.precedent.bands.map(b => b.extraRiseM), 0.1);
  const wettest = d.districts.slice(0, 8);
  const topMm = Math.max(...wettest.map(x => x.medianMm), 1);
  const rainKeys = Array<string>(d.map.reduce((n, r) => Math.max(n, r[0] + 1), 0)).fill("i");
  const rainNotes = Array<string>(rainKeys.length).fill("No reading.");
  for (const [i, mandal, , mm] of d.map) {
    rainKeys[i] = RAIN_SCALE.find(b => mm < b.max)!.key;
    rainNotes[i] = `${mm} mm from ${arnabDay(d.rainWindow.from)} to ${arnabDay(d.rainWindow.to)} (${mandal}).`;
  }
  const octOut = d.follow.published.includes("2026-10"), novOut = d.follow.published.includes("2026-11");

  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero
        title="Cyclone Arnab"
        brief={brief("/arnab", <><b>{s.rainTmc.toFixed(0)} TMC</b> of rain in four days, most of it on the north coast; only <b>{s.deepHeavyMandals} of {s.deepMandals}</b> deep-table mandals got 100 mm or more.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={styles.hero} aria-label="Cyclone Arnab in figures" data-testid="arnab-hero">
        <div className={styles.heroText}>
          <span className={styles.kicker}>Came ashore {arnabDay(d.landfall)} 2026 · updated {d.updatedAt ? arnabDay(d.updatedAt) : "daily"}</span>
          <h2>The rain fell where the water table was already high</h2>
          <p>The heaviest fell on {listOf(soaked)}, where most tables sat within {d.deepM} m of the surface. The deep, dry interior, which had the most room to take it, got little.</p>
        </div>
        <ArnabSpiral className={styles.spiral} />
        <ul className={styles.tiles}>
          <li><span>Rain, {d.rainWindow.days} days</span><b>{formatNumber(Math.round(s.rainTmc))}<small> TMC</small></b><em>{Math.round(s.rainTmc / s.normalTmc)}× the normal</em></li>
          <li><span>Soil moisture</span><b>{Math.round(s.soilMedianBefore)}<small>%</small> → {Math.round(s.soilMedianAfter)}<small>%</small></b><em>at 30 cm, statewide median</em></li>
          {since ? <li><span>Reservoirs</span><b>{signed(since.gainTmc, "")}<small>TMC</small></b><em>since {arnabDay(since.from)}, now {since.days[since.days.length - 1].reservoirPct}% full</em></li> : null}
          <li className={styles.key}><span>Deep tables</span><b>{s.deepHeavyMandals}<small> of {s.deepMandals}</small></b><em>got {d.heavyMm} mm or more, of those deeper than {d.deepM} m</em></li>
        </ul>
      </section>

      <nav className={`jumpNav jumpNavPlain ${styles.jump}`} aria-label="Cyclone Arnab sections">
        <a href="#arnab-rain">What fell</a><a href="#arnab-water">Where the water went</a><a href="#arnab-room">Room to rise</a><a href="#arnab-follow">Did Arnab follow?</a>
      </nav>

      <section className={shared.block} id="arnab-rain" aria-labelledby="arnab-rain-title">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconCloudRain /> The storm</span>
          <h2 id="arnab-rain-title">What fell</h2>
          <p>Gauge rain from {arnabDay(d.rainWindow.from)} to {arnabDay(d.rainWindow.to)}, mandal by mandal: <b>{s.heavyMandals} mandals</b> got {d.heavyMm} mm or more. The season&apos;s shortfall since 1 June narrowed from {s.seasonDeviationBefore}% to {s.seasonDeviationAfter}%.</p>
        </header>
        <div className={styles.split}>
          <StateOutlineMap testId="arnab-rain-map" aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height}
            keys={rainKeys} colors={{ ...Object.fromEntries(RAIN_SCALE.map(b => [b.key, b.color])), i: "#e6ebf1" }} notes={rainNotes}
            label={`Cyclone Arnab's rain by mandal, ${arnabDay(d.rainWindow.from)} to ${arnabDay(d.rainWindow.to)}.`}
            legend={<>{RAIN_SCALE.map(b => <span key={b.key}><i style={{ background: b.color }} />{b.label}</span>)}</>} />
          <div className={styles.side}>
            <h3>Wettest districts</h3>
            <ol className={styles.bars} aria-label="Median mandal rain by district">
              {wettest.map(x => <li key={x.district}>
                <span>{x.district}</span>
                <i style={{ width: `${(100 * x.medianMm) / topMm}%` }} />
                <b>{x.medianMm} mm</b>
              </li>)}
            </ol>
            <p className={styles.small}>Median mandal in each district. Rayalaseema, Prakasam and Nellore had under 15 mm.</p>
          </div>
        </div>
      </section>

      {since ? (
        <section className={shared.block} id="arnab-water" aria-labelledby="arnab-water-title">
          <CountedReach event="arnab/reached-water" title="Arnab: reached where the water went" />
          <header className={shared.blockHead}>
            <span className={shared.eyebrow}><IconWaves /> Reservoirs, read daily</span>
            <h2 id="arnab-water-title">Where the water went</h2>
            <p>The State&apos;s {formatNumber(Math.round(since.days[0].reservoirTmc))} TMC of reservoir storage on {arnabDay(since.from)}, read every morning since. The smaller north-coast reservoirs filled first; water reaches the large Krishna and Godavari reservoirs later, if at all.</p>
          </header>
          <div className={styles.split}>
            <div className={styles.side}>
              <h3>All reservoirs, storage</h3>
              <StorageLine days={since.days} />
              <h3>By river basin</h3>
              <ul className={styles.dumbbells}>
                {since.basins.map(b => <li key={b.basin}>
                  <span>{BASIN_NAMES[b.basin] ?? b.basin}</span>
                  <span className={styles.track} aria-hidden="true">
                    <s style={{ left: `${Math.min(b.beforePct, b.nowPct)}%`, width: `${Math.abs(b.nowPct - b.beforePct)}%` }} />
                    <i className={styles.then} style={{ left: `${b.beforePct}%` }} />
                    <i className={styles.now} style={{ left: `${b.nowPct}%` }} />
                  </span>
                  <b>{Math.round(b.beforePct)}% → {Math.round(b.nowPct)}%</b>
                </li>)}
              </ul>
              <p className={styles.small}><i className={styles.thenKey} /> {arnabDay(since.from)} <i className={styles.nowKey} /> {arnabDay(since.to)} · share of capacity</p>
            </div>
            <div className={styles.side}>
              <h3>Reservoirs that gained most</h3>
              <ol className={styles.fills}>
                {since.reservoirs.slice(0, 6).map(r => <li key={r.name}>
                  <div><b>{titleName(r.name)}</b><small>{r.district} · {formatNumber(r.capacityTmc)} TMC</small></div>
                  <span className={styles.gauge} aria-hidden="true"><i style={{ width: `${r.beforePct}%` }} /><u style={{ left: `${r.beforePct}%`, width: `${Math.max(0, r.nowPct - r.beforePct)}%` }} /></span>
                  <em>{Math.round(r.beforePct)}% → <b>{Math.round(r.nowPct)}%</b></em>
                </li>)}
              </ol>
              <p className={styles.small}>Storage at the dam, measured. It reaches groundwater over weeks, through canals, tanks and seepage, mostly near the dam and its command area.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className={shared.block} id="arnab-room" aria-labelledby="arnab-room-title">
        <CountedReach event="arnab/reached-room" title="Arnab: reached room to rise" />
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconDroplet /> Groundwater</span>
          <h2 id="arnab-room-title">Room to rise</h2>
          <p>A water table near the surface has little room to rise; a deep one has a lot. Last year Cyclone Montha came ashore on the same coast on the same date. Where October brought {d.heavyMm} mm or more above the usual, the November reading rose beyond its usual change, and more the deeper the table had been.</p>
        </header>
        <div className={styles.split}>
          <CycloneArnabMap rows={d.map} heavyMm={d.heavyMm} deepM={d.deepM} month={seen} aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height} />
          <div className={styles.side}>
            <h3>Rain against room to rise</h3>
            <div className={styles.mirror} role="table" aria-label="Arnab's heavy rain by depth, beside last year's rise">
              <div className={styles.mirrorHead} role="row">
                <span role="columnheader">Heavy-rain mandals</span><span role="columnheader">Depth in {seen}</span><span role="columnheader">Rise after Montha</span>
              </div>
              {d.byDepth.map(b => {
                const p = precedent.get(b.band);
                return <div className={styles.mirrorRow} role="row" key={b.band}>
                  <span role="cell" className={styles.left}><b>{b.heavy}</b><i style={{ width: `${(100 * b.heavy) / mostHeavy}%` }} /></span>
                  <span role="cell" className={styles.mid}>{b.band}</span>
                  <span role="cell" className={styles.right}><i style={{ width: `${p ? (100 * p.extraRiseM) / mostRise : 0}%` }} /><b>{p ? `${p.extraRiseM.toFixed(1)} m` : "no data"}</b></span>
                </div>;
              })}
            </div>
            <p className={styles.small}>Most of Arnab&apos;s heavy rain fell where last year&apos;s rise was smallest. Rise is beyond each mandal&apos;s usual change from the October to the November reading. Last year is a precedent, not a forecast.</p>
          </div>
        </div>
      </section>

      <section className={shared.block} id="arnab-follow" aria-labelledby="arnab-follow-title" data-testid="arnab-follow">
        <CountedReach event="arnab/reached-follow" title="Arnab: reached did Arnab follow" />
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconTarget /> Checked when the readings arrive</span>
          <h2 id="arnab-follow-title">Did Arnab follow?</h2>
          <p>The {d.watch.length} mandals where heavy rain met a deep table. The State publishes each month&apos;s reading after the month ends; when October and November arrive, this fills in by itself.</p>
        </header>
        <div className={styles.status}>
          <span data-done={octOut || undefined}><i />October {octOut ? "in" : "awaited"}</span>
          <span data-done={novOut || undefined}><i />November {novOut ? "in" : "awaited"}</span>
        </div>
        {d.follow.bands.length ? (
          <ul className={styles.verdict}>
            {d.follow.bands.map(b => <li key={b.band}><span>{b.band}</span><b>{signed(b.extraRiseM, "m")}</b><em>{b.mandals} mandals · Montha {b.precedentM === null ? "no data" : signed(b.precedentM, "m")}</em></li>)}
          </ul>
        ) : null}
        <RowFold id="arnab-follow-rows" total={d.watch.length} visible={8} noun="mandals">
          <div className={`tableWrap capped ${styles.wideOnly}`}>
            <table className="dataTable compact" aria-label="Deep water tables that got heavy rain">
              <thead><tr><th>Mandal</th><th>District</th><th>Arnab rain</th><th>Depth in {seen}</th><th>Last year suggests</th><th>October reading</th><th>November, beyond usual</th></tr></thead>
              <tbody>
                {d.watch.map((m, i) => <tr key={`${m.district}-${m.mandal}`} {...foldAt(i, 8)}>
                  <td>{/[a-z]/.test(m.mandal) ? m.mandal : titleCase(m.mandal)}</td><td>{m.district}</td><td>{Math.round(m.stormMm)} mm</td><td>{m.depthM.toFixed(1)} m</td>
                  <td>{m.precedentM === null ? "no data" : `rise ${m.precedentM.toFixed(1)} m`}</td>
                  <td className={m.octRiseM === undefined ? styles.pending : m.octRiseM > 0 ? styles.rose : styles.fell}>{m.octRiseM === undefined ? "awaited" : `${m.octRiseM > 0 ? "rose" : "fell"} ${Math.abs(m.octRiseM).toFixed(1)} m`}</td>
                  <td className={m.novExtraRiseM === undefined ? styles.pending : m.novExtraRiseM > 0 ? styles.rose : styles.fell}>{m.novExtraRiseM === undefined ? "awaited" : signed(m.novExtraRiseM, "m")}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <ul className={styles.cards} aria-label="Deep water tables that got heavy rain">
            {d.watch.map((m, i) => <li key={`${m.district}-${m.mandal}`} {...foldAt(i, 8)}>
              <div className={styles.cardTop}>
                <b>{/[a-z]/.test(m.mandal) ? m.mandal : titleCase(m.mandal)}</b>
                <span>{Math.round(m.stormMm)} mm</span>
              </div>
              <small>{m.district} · {m.depthM.toFixed(1)} m down in {seen}</small>
              <p>
                <span>Last year suggests {m.precedentM === null ? "no data" : `a rise of ${m.precedentM.toFixed(1)} m`}</span>
                <span className={m.novExtraRiseM === undefined ? styles.pending : m.novExtraRiseM > 0 ? styles.rose : styles.fell}>
                  November {m.novExtraRiseM === undefined ? "awaited" : signed(m.novExtraRiseM, "m")}
                </span>
              </p>
            </li>)}
          </ul>
        </RowFold>
      </section>

      <details className={`${shared.block} ${styles.notes}`}>
        <summary><IconCyclone /> Sources and limits</summary>
        <p>{d.caveat}</p>
        <p>Rain: AP Directorate of Economics and Statistics gauges. Soil moisture: NRSC model. Reservoirs: State telemetry. All via APWRIMS, as a research sample pending authorisation. Updated every morning until 15 November, then weekly. <Link href="/monsoon/">Monsoon Watch →</Link></p>
      </details>
    </div>
  );
}
