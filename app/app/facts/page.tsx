import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../components/HeaderHero";
import { FactActions } from "../../components/FactActions";
import { facts } from "../../lib/facts";
import { brief } from "../../lib/pageBriefs";
import styles from "./Facts.module.css";

export const metadata: Metadata = {
  title: "In Numbers | AP Water Intelligence",
  description: "Andhra Pradesh groundwater in one sentence at a time: each figure with its source, its date and a link, rebuilt at every refresh.",
};

export default function FactsPage() {
  const all = facts();
  const themes = [...new Set(all.map(f => f.theme))];
  return (
    <div className="pageWrap">
      <HeaderHero title="In Numbers" brief={brief("/facts", <><b>{all.length} figures</b> to quote, each with its source and date, rebuilt every time the data is.</>)} showChips={false} variant="compact" />
      {themes.map(theme => (
        <section key={theme} className={styles.group} aria-labelledby={`theme-${theme}`}>
          <h2 id={`theme-${theme}`}>{theme}</h2>
          <ol className={styles.list}>
            {all.filter(f => f.theme === theme).map(f => (
              <li key={f.id} id={f.id} className={styles.fact} data-testid="fact">
                <p>{f.text}</p>
                <span className={styles.meta}>{f.source} · as of {f.asOf} · <Link href={f.href}>where it comes from →</Link></span>
                <FactActions id={f.id} text={f.text} source={f.source} asOf={f.asOf} />
              </li>
            ))}
          </ol>
        </section>
      ))}
      <p className={styles.note}>APWRIMS readings are a research sample pending authorisation, not official data. A figure here changes when its source does; the date says which reading it is.</p>
    </div>
  );
}
