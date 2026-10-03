import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { IconActivity, IconCloudRain, IconDroplet, IconLeaf, IconSatellite, IconShield, IconWaves } from "../../components/icons";
import { DroughtCommand } from "../../components/drought/DroughtCommand";
import { DroughtFunnel } from "../../components/drought/DroughtFunnel";
import { DroughtWorkspace } from "../../components/drought/DroughtWorkspace";
import { SeasonBuildup } from "../../components/drought/SeasonBuildup";
import { DistrictWeekHeat, type HeatRow } from "../../components/drought/DistrictWeekHeat";
import { DistrictMatrix } from "../../components/drought/DistrictMatrix";
import { DroughtMethod, ReservoirPanel, SowingPanel, StateActions } from "../../components/drought/DroughtPanels";
import { daysUntil, place, shortDate, todayInIndia } from "../../lib/drought";
import { droughtWatch } from "../../lib/droughtWatch";
import styles from "../../components/drought/Drought.module.css";

export const metadata: Metadata = {
  title: "Drought Watch | AP Water Intelligence",
  description: "Prototype: every Andhra Pradesh mandal read against India's Manual for Drought Management (2020), steps 1 and 2. Not a declaration.",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jun–Aug 2026" from "2026-06 to 2026-08". */
function monthsLabel(span: string) {
  const [first, last] = span.split(" to ");
  const name = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1];
  return `${name(first)}–${name(last ?? first)} ${(last ?? first).slice(0, 4)}`;
}

function heatRows(): HeatRow[] {
  const weeks = droughtWatch.season.weeks.length;
  const groups = new Map<string, HeatRow>();
  for (const row of droughtWatch.mandals) {
    const entry = groups.get(row.d) ?? { district: row.d, mandals: 0, trigger1: 0, dry: Array(weeks).fill(0), known: Array(weeks).fill(0) };
    entry.mandals += 1;
    if (row.t1) entry.trigger1 += 1;
    row.weeks?.forEach((pct, i) => {
      if (pct === null) return;
      entry.known[i] += 1;
      if (pct < 50) entry.dry[i] += 1;
    });
    groups.set(row.d, entry);
  }
  return [...groups.values()].sort((a, b) => b.trigger1 / Math.max(1, b.mandals) - a.trigger1 / Math.max(1, a.mandals) || a.district.localeCompare(b.district));
}

/** The season in four numbers, read from the same rows as the map. */
function seasonFacts(rows: HeatRow[]) {
  const d = droughtWatch;
  const spells = d.mandals.map(row => row.dry?.longest).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  const median = spells.length ? spells[Math.floor(spells.length / 2)] : null;
  const longest = d.mandals.reduce<(typeof d.mandals)[number] | null>((best, row) =>
    (row.dry?.longest ?? -1) > (best?.dry?.longest ?? -1) ? row : best, null);
  const weekly = d.season.weeks.map((week, i) => {
    const dry = rows.reduce((sum, row) => sum + row.dry[i], 0);
    const known = rows.reduce((sum, row) => sum + row.known[i], 0);
    return { week, share: known ? dry / known : 0, dry, known };
  }).filter(entry => entry.week.counted);
  const driest = weekly.reduce((best, entry) => (entry.share > best.share ? entry : best), weekly[0]);
  const last = d.timeline[d.timeline.length - 1];
  return [
    { label: "Ran a dry spell", value: `${d.state.drySpell}`, note: `of ${d.state.assessed} mandals; ${d.state.trigger1Light} on the 3-week light-soil rule` },
    { label: "Typical longest spell", value: median === null ? "—" : `${median} weeks`, note: longest?.dry ? `longest: ${longest.dry.longest} weeks, ${place(longest.m)} (${place(longest.d)})` : "" },
    { label: "Driest week", value: driest ? `${Math.round(100 * driest.share)}%` : "—", note: driest ? `of mandals under half of normal, ${shortDate(driest.week.start)}–${shortDate(driest.week.end)}` : "" },
    { label: "Short for the season", value: `${last.classes.deficient + last.classes.largeDeficient + last.classes.noRain}`, note: `mandals deficient or worse to ${shortDate(last.end)}; ${last.classes.largeDeficient} large deficient` },
  ];
}

export default function DroughtPage() {
  const d = droughtWatch;
  const s = d.sources;
  const builtOn = todayInIndia();
  const heat = heatRows();
  return (
    <div className={`pageWrap ${styles.page}`}>
      <HeaderHero
        title={`Drought Watch — ${d.season.name}`}
        subtitle={<>
          Every mandal read against India&rsquo;s <strong>Manual for Drought Management (2020)</strong>, the procedure a State follows to declare drought:
          the rainfall trigger, then three impact indicators, each with the manual&rsquo;s own thresholds. Field verification and the notification remain the State&rsquo;s.
        </>}
        showChips={false}
        variant="compact"
      />

      <div className="provRibbon">
        <span className="provRibbonItem"><IconCloudRain /> AP DES rain gauges · weekly to {shortDate(s.rain.window.end)}</span>
        <span className="provRibbonDot" />
        {s.spi ? <><span className="provRibbonItem"><IconCloudRain /> CHIRPS v3 SPI · {monthsLabel(s.spi.months)}</span><span className="provRibbonDot" /></> : null}
        {s.vci ? <><span className="provRibbonItem"><IconSatellite /> NOAA vegetation index · to ~{shortDate(s.vci.averaged[s.vci.averaged.length - 1].approxEnd)}</span><span className="provRibbonDot" /></> : null}
        {s.pasm ? <><span className="provRibbonItem"><IconDroplet /> NRSC soil moisture · to {shortDate(s.pasm.asOf)}</span><span className="provRibbonDot" /></> : null}
        {s.gwdi ? <><span className="provRibbonItem"><IconWaves /> APWRIMS wells · {s.gwdi.month}</span><span className="provRibbonDot" /></> : null}
        {s.sowing ? <><span className="provRibbonItem"><IconLeaf /> Area sown · reported {shortDate(s.sowing.asOf)}</span><span className="provRibbonDot" /></> : null}
        <span className="provRibbonItem"><IconShield /> evidence for steps 1–2 · not a declaration</span>
      </div>

      <DroughtCommand data={{ state: d.state, season: d.season, rules: d.rules }} builtDays={daysUntil(d.season.declareBy)} />

      <section className={styles.section} aria-labelledby="drought-path">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>01 / The manual&rsquo;s path</span>
            <h2 id="drought-path">Where every mandal stands in the three steps</h2>
            <p>Step 1 asks whether the rains failed: a dry spell, or a large deficit. Step 2 asks whether it shows, on three of four impact indicators. Step 3, field verification, decides.</p>
          </div>
          <span className={styles.badge}>Table 3.11 → Table 3.12 → 3.2.6</span>
        </div>
        <DroughtFunnel data={d} />
      </section>

      <section className={styles.section} aria-labelledby="drought-where">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>02 / Where</span>
            <h2 id="drought-where">Every mandal, and the manual&rsquo;s matrix filled in for any one of them</h2>
            <p>Colour the map by the outcome or by any single indicator. Pick a mandal to see each value, the rule it was read against and where it comes from.</p>
          </div>
          <span className={styles.badge}>Rain to {shortDate(s.rain.window.end, true)}</span>
        </div>
        <DroughtWorkspace mandals={d.mandals} weeks={d.season.weeks} sowing={d.sowingDistricts}
          sowingAsOf={s.sowing?.asOf ?? null} changes={d.state.changes} asOf={s.rain.window.end} manualUrl={d.manual.url} />
      </section>

      <section className={styles.section} aria-labelledby="drought-season">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>03 / How it built</span>
            <h2 id="drought-season">A season of dry weeks</h2>
            <p>The trigger did not arrive at once: it built week by week as the rains failed in one district after another.</p>
          </div>
          <span className={styles.badge}>{d.season.weeks.length} weeks from {shortDate(d.season.start)}</span>
        </div>
        <div className={styles.twoCol}>
          <SeasonBuildup timeline={d.timeline} facts={seasonFacts(heat)} />
          <DistrictWeekHeat rows={heat} weeks={d.season.weeks} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="drought-districts">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>04 / By district</span>
            <h2 id="drought-districts">Which districts carry the most mandals at moderate or worse</h2>
            <p>Sorted by the share of assessed mandals at moderate or worse; click a heading to sort by an indicator. Medians across each district&rsquo;s mandals.</p>
          </div>
          <span className={styles.badge}>{d.districts.length} districts</span>
        </div>
        <DistrictMatrix districts={d.districts} />
      </section>

      <section className={styles.section} aria-labelledby="drought-water">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>05 / Water in store, fields sown</span>
            <h2 id="drought-water">The two impact indicators that are not per mandal</h2>
            <p>Reservoir storage and area sown belong to the matrix too, but neither is published per mandal. Both are shown at the level they exist.</p>
          </div>
        </div>
        <div className={styles.twoCol}>
          <ReservoirPanel data={d} />
          <SowingPanel data={d} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="drought-state">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}>06 / What the State still has to do</span>
            <h2 id="drought-state">From evidence to a notification by {shortDate(d.season.declareBy, true)}</h2>
            <p>The manual gives the State the last word: field checks, the area sown, the irrigated share, and the notification itself.</p>
          </div>
          <Link className={styles.badge} href="/agriculture#agriculture-brief">Agriculture review →</Link>
        </div>
        <StateActions data={d} builtOn={builtOn} />
      </section>

      <section className={styles.section} aria-labelledby="drought-method">
        <div className={styles.sectionHead}>
          <div>
            <span className={styles.eyebrow}><IconActivity style={{ width: 11, height: 11, verticalAlign: -1 }} /> Method</span>
            <h2 id="drought-method">How this page reads the manual</h2>
          </div>
          <span className={styles.badge}>Built {shortDate(builtOn, true)} · data {shortDate(d.generatedAt.slice(0, 10), true)}</span>
        </div>
        <DroughtMethod data={d} />
      </section>
    </div>
  );
}
