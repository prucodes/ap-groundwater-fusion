import type { Metadata } from "next";
import Link from "next/link";
import { HeaderHero } from "../../../components/HeaderHero";
import { IconFile } from "../../../components/icons";
import { basePath } from "../../../lib/data";
import { districtSheets, pdfName } from "../../../lib/districtSheet";
import { brief } from "../../../lib/pageBriefs";
import shared from "../../rabi/Rabi.module.css";
import styles from "./Sheets.module.css";

export const metadata: Metadata = {
  title: "District sheets | AP Water Intelligence",
  description: "One A4 page for each district's Collector: groundwater against its usual, the monsoon's recharge, rain and reservoirs, summer drinking water and the drought manual, as PDFs rebuilt every Monday.",
};

/* Every district's one-page sheet (districts/[slug]/sheet/), with its PDF. */
export default function DistrictSheetsPage() {
  const sheets = districtSheets(), month = sheets[0]?.month ?? "";
  const share = (s: (typeof sheets)[number]) => s.counts.deeper / Math.max(s.counts.compared, 1);
  const worst = [...sheets].sort((a, b) => share(b) - share(a)).slice(0, 3);
  return (
    <div className={`pageWrap ${shared.page}`}>
      <HeaderHero title="District sheets" brief={brief("/districts/sheets", <>{sheets.length} districts, groundwater to {month}.</>)} showChips={false} variant="compact" />
      <section className={shared.block} aria-labelledby="sheets-title" data-testid="district-sheets">
        <header className={shared.blockHead}>
          <span className={shared.eyebrow}><IconFile /> One page for each Collector</span>
          <h2 id="sheets-title">{sheets.length} district sheets, rebuilt every Monday</h2>
          <p>
            Each is one A4 page: where the water table stands against each mandal&rsquo;s usual {month.split(" ")[0]}, this season&rsquo;s
            recharge, rain and reservoirs, the mandals to plan summer drinking water for first, and the drought manual&rsquo;s reading.
            Each also comes in Telugu, as a page and a PDF.
            Furthest below their usual: {worst.map((s, i) => <span key={s.slug}>{i ? ", " : ""}<b>{s.name}</b> ({s.counts.deeper} of {s.counts.compared})</span>)}.
          </p>
        </header>
        <ul className={styles.grid}>
          {sheets.map(s => (
            <li key={s.slug} data-testid="district-sheet-card">
              <Link href={`/districts/${s.slug}/sheet/`} className={styles.name}>{s.name}</Link>
              <span className={styles.fig}><b>{s.counts.deeper}</b> of {s.counts.compared} deeper than usual{s.priority.first ? <> · <b>{s.priority.first}</b> to plan first</> : null}</span>
              <span className={styles.bar} aria-hidden="true"><i style={{ width: `${Math.round(100 * share(s))}%` }} /></span>
              <span className={styles.pdfs}>
                <a className={styles.pdf} href={`${basePath}/districts/${s.slug}/sheet/${pdfName(s.slug)}`} download={`AP-${s.slug}-district-sheet.pdf`}>PDF</a>
                <a className={styles.pdf} href={`${basePath}/districts/${s.slug}/sheet/te/${pdfName(s.slug, "te")}`} download={`AP-${s.slug}-district-sheet-te.pdf`} lang="te" data-testid="district-sheet-te-pdf">తెలుగు PDF</a>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
