import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { ConstituencyExplorer } from "../../components/constituencies/ConstituencyExplorer";
import styles from "../../components/constituencies/Constituencies.module.css";
import constituencyJson from "../../data/constituencies.json";
import type { ConstituencyData, ConstituencyRow } from "../../lib/constituencies";
import { MAP_VIEW, districtGeometry, mandalToPath, titleCase } from "../../lib/data";
import { shortDate } from "../../lib/drought";
import { stateSummary } from "../../lib/stateSummary";

export const metadata: Metadata = {
  title: "Constituencies | AP Water Intelligence",
  description: "Groundwater, the State's latest well readings, the drought manual and gauge rain, rolled up by assembly and parliamentary constituency.",
};

const data = constituencyJson as unknown as ConstituencyData;

const share = (part: number, whole: number) => (whole ? Math.round((100 * part) / whole) : null);
const name = (value: string) => (/[a-z]/.test(value) ? value : titleCase(value));

/** The centre of a constituency's largest part, in map coordinates. */
function labelAt(rings: number[][][] | null): [number, number] | null {
  if (!rings || !rings.length) return null;
  const area = (ring: number[][]) => Math.abs(ring.reduce((sum, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return sum + x * y2 - x2 * y;
  }, 0)) / 2;
  const largest = rings.reduce((best, ring) => (area(ring) > area(best) ? ring : best), rings[0]);
  const lon = largest.reduce((sum, p) => sum + p[0], 0) / largest.length;
  const lat = largest.reduce((sum, p) => sum + p[1], 0) / largest.length;
  return MAP_VIEW.project(lon, lat);
}

function rows(): ConstituencyRow[] {
  return data.constituencies.map(c => ({
    ac: c.ac,
    code: c.code,
    pc: c.pc,
    districts: c.districts.map(name).join(", "),
    mandals: c.mandals.length,
    mandalNames: c.mandals.map(name).join(", "),
    placedByLocation: c.placedByLocation.map(name).join(", "),
    outline: c.outline,
    officialKm2: c.officialKm2,
    path: c.rings ? mandalToPath(c.rings) : null,
    label: labelAt(c.rings),
    stressShare: share(c.groundwater.stress, c.groundwater.assessed),
    stress: c.groundwater.stress,
    assessed: c.groundwater.assessed,
    medianDepthM: c.groundwater.medianDepthM,
    sinceMayM: c.stateReading.medianSinceMayM,
    stations: c.stateReading.stations,
    droughtShare: share(c.drought.active, c.drought.assessed),
    droughtActive: c.drought.active,
    droughtSevere: c.drought.severe,
    rainPct: c.rain.medianDeparturePct,
  }));
}

export default function ConstituenciesPage() {
  const all = rows();
  // At least three assessed mandals, so two-mandal towns at 100% do not crowd
  // the list; ties broken by the number of mandals behind the share.
  const ranked = (key: "stressShare" | "droughtShare") => {
    const count = (r: ConstituencyRow) => (key === "stressShare" ? r.stress : r.droughtActive);
    return [...all].filter(r => r[key] !== null && r.assessed >= 3)
      .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0) || count(b) - count(a)).slice(0, 5);
  };
  const fell = all.filter(r => (r.sinceMayM ?? 0) > 0).length;
  const withFall = all.filter(r => r.sinceMayM !== null).length;
  const byPc = data.parliament.map(p => {
    const members = data.constituencies.filter(c => c.pc === p.pc);
    const assessed = members.reduce((n, c) => n + c.groundwater.assessed, 0);
    return {
      pc: p.pc, acs: members.length, mandals: members.reduce((n, c) => n + c.mandals.length, 0), assessed,
      stress: members.reduce((n, c) => n + c.groundwater.stress, 0), watch: members.reduce((n, c) => n + c.groundwater.watch, 0),
      stable: members.reduce((n, c) => n + c.groundwater.stable, 0),
      drought: members.reduce((n, c) => n + c.drought.active, 0),
    };
  }).sort((a, b) => b.stress / Math.max(b.assessed, 1) - a.stress / Math.max(a.assessed, 1));

  return (
    <div className={`pageWrap ${styles.page}`}>
      <HeaderHero
        title="Constituencies"
        subtitle={<>Groundwater, the State&rsquo;s latest well readings, the drought manual and gauge rain, rolled up by the assembly constituency each mandal belongs to in the State&rsquo;s own records.</>}
        showChips={false}
        variant="compact"
      />

      <section className={styles.command} aria-label="Constituencies at a glance">
        <span className={styles.kicker}>{`${data.summary.constituencies} of ${data.summary.stateAssembly} assembly · ${data.summary.parliamentary} of ${data.summary.stateParliament} parliamentary constituencies`}</span>
        <h2>{`Groundwater is in stress in at least half the assessed mandals of ${all.filter(r => (r.stressShare ?? 0) >= 50 && r.assessed >= 2).length} constituencies.`}</h2>
        <p>
          {`State wells read deeper in early September than in May across ${fell} of ${withFall} constituencies. Each figure is the constituency's mandals summed or taken at the median; the method is at the foot of the page.`}
        </p>
        <div className={styles.tiles}>
          <div className={styles.tile}><span>Mandals placed</span><strong>{data.summary.mandals}</strong>
            <em>{`${data.summary.placedByRecord} by the State's mandal record, ${data.summary.placedByLocation} by location${data.summary.mandalsWithoutConstituency ? `, ${data.summary.mandalsWithoutConstituency} not placed` : ""} · ${data.summary.officialOutlines} official seat outlines`}</em></div>
          <div className={styles.tile}><span>Deeper than May</span><strong>{`${fell}/${withFall}`}</strong>
            <em>{`constituencies, State wells ${stateSummary.readingDates.mostCommon ? `to ${shortDate(stateSummary.readingDates.mostCommon)}` : ""}`}</em></div>
          <div className={styles.tile}><span>Most groundwater stress</span>
            <ol>{ranked("stressShare").map(r => <li key={r.ac}>{`${r.ac} · ${r.stressShare}%`}</li>)}</ol></div>
          <div className={styles.tile}><span>Most drought (manual)</span>
            <ol>{ranked("droughtShare").map(r => <li key={r.ac}>{`${r.ac} · ${r.droughtShare}%`}</li>)}</ol></div>
        </div>
      </section>

      <ConstituencyExplorer rows={all} width={MAP_VIEW.width} height={MAP_VIEW.height}
        districts={districtGeometry.districts.map(d => mandalToPath(d.rings))} />

      <section className={styles.section} aria-label="By parliamentary constituency">
        <h3>By parliamentary constituency</h3>
        <p>Assessed mandals by groundwater status: stress, watch, stable. Ordered by the share in stress.</p>
        <div className={styles.pcGrid}>
          {byPc.map(p => (
            <div className={styles.pcCard} key={p.pc}>
              <strong>{p.pc}</strong>
              <span>{`${p.acs} assembly constituencies · ${p.mandals} mandals · ${p.drought} moderate or severe on the drought manual`}</span>
              <div className={styles.pcBar} role="img" aria-label={`${p.stress} stress, ${p.watch} watch, ${p.stable} stable`}>
                <i style={{ width: `${(100 * p.stress) / Math.max(p.assessed, 1)}%`, background: "var(--st-stress)" }} />
                <i style={{ width: `${(100 * p.watch) / Math.max(p.assessed, 1)}%`, background: "var(--st-watch)" }} />
                <i style={{ width: `${(100 * p.stable) / Math.max(p.assessed, 1)}%`, background: "var(--st-normal)" }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className={styles.foot}>
        {`${data.source}. ${data.note} Groundwater status: this site's assessment of each mandal's monthly series. State wells: the AWARE feed's single early-September reading against its May value, median per constituency. Drought: this site's reading of the national drought manual, not a declaration. Rain: AP DES gauges via APWRIMS, median departure. `}
        <Link href="/methodology">How each is built</Link>.
      </p>
    </div>
  );
}
