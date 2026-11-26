import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { RankList } from "../../components/RankList";
import { GardenFilm } from "../../components/garden/GardenFilm";
import { WaterGarden } from "../../components/garden/WaterGarden";
import { IconLeaf, IconPlay } from "../../components/icons";
import { brief } from "../../lib/pageBriefs";
import { MIN_YEARS, monthYear } from "../../lib/gardenShared";
import { gardenSummary, waterGarden } from "../../lib/waterGarden";
import shared from "../rabi/Rabi.module.css";
import styles from "./Garden.module.css";

export const metadata: Metadata = {
  title: "Water Garden | AP Water Intelligence",
  description: "Every mandal in Andhra Pradesh as a plant: its roots reach down to the measured water table, it opens where the water stands above its usual level for the month and droops where it stands below. Every year on record, and a short film to forward.",
};

export default function GardenPage() {
  const garden = waterGarden(), s = gardenSummary(garden), c = s.counts;
  const now = monthYear(garden, s.step.year), month = garden.monthName;
  const first = garden.steps[0].year;
  const most = s.fallen[0]?.changeM ?? 1;
  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero
        title="Water Garden"
        brief={brief("/garden", <>{now} against each mandal&rsquo;s usual {month}, from the State&rsquo;s monthly well readings.</>)}
        showChips={false}
        variant="compact"
      />

      <section className={shared.hero} aria-label="The garden in one view" data-testid="garden-hero">
        <div className={shared.heroText}>
          <span className={shared.kicker}>Water garden · {now} against each mandal&rsquo;s usual {month}</span>
          <h2>
            Each of the State&rsquo;s {c.total} mandals is a plant whose roots reach its water table. In {now},{" "}
            <b data-testid="garden-deeper">{c.deeper}</b> of {c.compared} droop: their water stands deeper than their usual {month}
            {s.worstSince ? <>, the most since {s.worstSince}</> : <>, the most of any {month} on record</>}.
          </h2>
          <p>{c.shallower} stand open, above their usual; {c.steady} are within 0.1 m of it.{c.noReading ? ` ${c.noReading} were not read this ${month} or have too few ${month}s on record.` : ""}</p>
        </div>
        <ul className={shared.tiles}>
          <li><span>Deeper than usual</span><b data-tone="bad">{c.deeper}<small> of {c.compared}</small></b><em>by more than 0.1 m: the plant droops</em></li>
          <li><span>Above their usual</span><b data-testid="garden-shallower">{c.shallower}</b><em>by more than 0.1 m: the plant opens</em></li>
          {s.medianNowM !== null && s.medianUsualM !== null ? (
            <li><span>Median water table</span><b>{s.medianNowM.toFixed(1)}<small> m</small></b><em>below ground, against a usual {month} of {s.medianUsualM.toFixed(1)} m</em></li>
          ) : null}
          {s.deepest ? <li><span>Deepest water</span><b>{s.deepest.depthM.toFixed(1)}<small> m</small></b><em>{s.deepest.name}, {s.deepest.district}</em></li> : null}
        </ul>
      </section>

      <section className={shared.block} aria-labelledby="garden-title">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconLeaf /> Every mandal a plant, north to south</span>
          <h2 id="garden-title">Where the water stands below its usual {month}, the garden droops</h2>
          <p>
            The roots of each plant reach down to that mandal&rsquo;s water table in {now}, drawn to scale; the deeper the water,
            the longer the roots and the shorter the plant. Open blue flowers are mandals whose water stands above their usual
            {" "}{month}, rust ones nodding over are below it. Play the years since {first} to see the dry ones wilt and the wet ones
            bloom. Point at a plant for its mandal; click it to open the mandal&rsquo;s page.
          </p>
        </header>
        <WaterGarden />
        {s.fallen.length ? (
          <div className={styles.fallen}>
            <RankList title={`Furthest below their usual ${month}`} rows={s.fallen.slice(0, 6).map(f => ({
              name: f.name, note: <>{f.district} · {f.nowM.toFixed(1)} m now, usually {f.usualM.toFixed(1)} m</>, value: `${f.changeM.toFixed(1)} m`, share: (100 * f.changeM) / most, color: "#e07a55",
            }))} foot={<>Depth now against the mandal&rsquo;s median {month} on record. <Link href="/monsoon/">How this season&rsquo;s recharge compares</Link>.</>} />
          </div>
        ) : null}
      </section>

      <section className={shared.block} aria-labelledby="garden-film">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconPlay /> The garden as a film</span>
          <h2 id="garden-film">Half a minute to forward</h2>
          <p>The same garden growing in, drooping where the water stands below its usual, then every {month} since {first}. Each deploy records it in three shapes, for WhatsApp Status, for groups and for a meeting screen.</p>
        </header>
        <GardenFilm />
      </section>

      <details className="foldMore">
        <summary><span>How the garden is drawn</span><span>Source, the rule, the scale and the gaps</span></summary>
        <div className={styles.method}>
          <p>
            <b>Source.</b> The APWRIMS monthly hand-read well levels, as the median of each mandal&rsquo;s wells (the same series as
            the mandal pages), in {month} of each year from {first} to {s.step.year}. {month} is the latest month most mandals report.
            {garden.missingYears.length ? ` No ${month} readings were published in ${garden.missingYears.join(", ")}; the garden steps over it.` : ""}
          </p>
          <p>
            <b>Open, bud or drooping.</b> A mandal&rsquo;s water in {month} against its usual {month}: the median of its own {month}
            {" "}readings in every year on record, so each place is judged against what is normal for it, not against one wet or dry
            year. More than 0.1 m shallower than usual opens the flower, more than 0.1 m deeper bows it, anything between is a bud.
            The change is taken in whole centimetres on the two-decimal figures, so the count above and the plants drawn always
            agree. Water 3 m or more from its usual opens or bows a flower all the way. A mandal with fewer than {MIN_YEARS}{" "}
            {month}s read has no usual and stands as a bud, uncounted.
          </p>
          <p>
            <b>Scale.</b> Roots are to scale: the soil is {garden.scaleM} m deep, the deepest reading shown rounded up. The glowing line
            is the water table, mandal by mandal. A plant&rsquo;s height is not a measurement: it stands taller where the water is
            nearer the surface, and leans by a fixed amount of its own so the garden reads as a garden.
          </p>
          <p>
            <b>Order.</b> {garden.regions.join(", ")}, each from north to south by where the mandal lies. A mandal not read in a year
            stands faint, with no roots.
          </p>
        </div>
      </details>
    </div>
  );
}
