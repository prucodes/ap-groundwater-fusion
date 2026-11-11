import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { FactActions } from "../../components/FactActions";
import { StateOutlineMap } from "../../components/StateOutlineMap";
import { CHAPTERS, facts, type Fact, type FactVisual } from "../../lib/facts";
import { STATIC_MAP_VIEW } from "../../lib/staticMap";
import { brief } from "../../lib/pageBriefs";
import styles from "./Facts.module.css";

export const metadata: Metadata = {
  title: "In Numbers | AP Water Intelligence",
  description: "Andhra Pradesh's groundwater season as a story in ten numbers: each with a picture, its source, its date and a link, rebuilt at every refresh.",
};

const TONE = { bad: "#c65a46", warn: "#d79b2e", water: "#12b5cb" };
/* The same tones as type: darker on white, so a big number reads at 3:1 or better in both themes. */
const INK = { bad: "var(--bad-ink, #b04a38)", warn: "var(--amber-ink, #9a6a14)", water: "var(--cyan-ink, #0e7c8c)" };

/* Each figure's own picture: the mandals it counts on the State map, a hundred
   squares for a share, or two bars for this year against the usual. */
function Visual({ v }: { v: FactVisual }) {
  if (v.kind === "map") {
    return (
      <div className={styles.map}>
        <StateOutlineMap aspect={STATIC_MAP_VIEW.width / STATIC_MAP_VIEW.height} keys={v.keys} notes={v.keys.map(() => "")}
          colors={{ y: TONE[v.tone], n: "var(--fact-map-rest, #dfe6eb)" }} label={v.label} legend={null} />
      </div>
    );
  }
  if (v.kind === "waffle") {
    const filled = Math.round(v.pct);
    return (
      <svg className={styles.waffle} viewBox="0 0 100 100" role="img" aria-label={`${v.pct}% of 100 squares`}>
        {Array.from({ length: 100 }, (_, i) => <rect key={i} x={(i % 10) * 10 + 1} y={Math.floor(i / 10) * 10 + 1} width="8" height="8" rx="2"
          fill={i < filled ? TONE[v.tone] : "var(--fact-cell, #e6ecf0)"} />)}
      </svg>
    );
  }
  const most = Math.max(...v.items.map(i => i.value), 1);
  return (
    <div className={styles.bars} role="img" aria-label={v.items.map(i => `${i.label} ${i.value} ${v.unit}`).join(", ")}>
      {v.items.map(i => <div key={i.label} className={styles.barRow} data-tone={i.tone}>
        <span>{i.label}</span>
        <i style={{ width: `${(100 * i.value) / most}%` }} />
        <b>{Math.round(i.value)}</b>
      </div>)}
      <small>{v.unit}</small>
    </div>
  );
}

function FactCard({ f }: { f: Fact }) {
  return (
    <li id={f.id} className={styles.fact} data-kind={f.visual.kind} data-testid="fact">
      <div className={styles.visual}><Visual v={f.visual} /></div>
      <div className={styles.words}>
        <p className={styles.big} style={{ color: INK[f.tone] }}>{f.big}</p>
        <p className={styles.headline}>{f.headline}</p>
        <p className={styles.text}>{f.text}</p>
        <span className={styles.meta}>{f.source} · as of {f.asOf} · <Link href={f.href}>where it comes from →</Link></span>
        <FactActions id={f.id} text={f.text} source={f.source} asOf={f.asOf} />
      </div>
    </li>
  );
}

export default function FactsPage() {
  const all = facts();
  return (
    <div className="pageWrap">
      <HeaderHero title="In Numbers" brief={brief("/facts", <>The season in <b>{all.length} numbers</b>, in the order it happened: each with its picture, source and date, rebuilt every time the data is.</>)} showChips={false} variant="compact" />
      <ol className={styles.story}>
        {CHAPTERS.map((c, k) => {
          const mine = all.filter(f => f.chapter === c.title);
          if (!mine.length) return null;
          return (
            <li key={c.title} className={styles.chapter} aria-labelledby={`chapter-${k}`}>
              <header>
                <span className={styles.step}>{String(k + 1).padStart(2, "0")}</span>
                <div>
                  <h2 id={`chapter-${k}`}>{c.title}</h2>
                  <p>{c.lede}</p>
                </div>
              </header>
              <ol className={styles.list}>{mine.map(f => <FactCard key={f.id} f={f} />)}</ol>
            </li>
          );
        })}
      </ol>
      <p className={styles.note}>APWRIMS readings are a research sample pending authorisation, not official data. A figure here changes when its source does; the date says which reading it is.</p>
    </div>
  );
}
