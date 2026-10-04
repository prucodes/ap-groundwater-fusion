import type { PageBrief } from "../lib/pageBriefs";

/** What the screen is, what it says now, and what to do with it: the same three lines on every page. */
export function PageBriefList({ brief }: { brief: PageBrief }) {
  return (
    <dl className="heroBrief" data-testid="page-brief">
      <div><dt>What this is</dt><dd>{brief.what}</dd></div>
      {brief.now ? <div className="heroBriefNow"><dt>What it says now</dt><dd>{brief.now}</dd></div> : null}
      <div><dt>What to do with it</dt><dd>{brief.use}</dd></div>
    </dl>
  );
}

/** For a page with a hero of its own: the brief as a band beneath it. */
export function PageBriefBand({ brief }: { brief: PageBrief }) {
  return (
    <section className="pageBriefBand" aria-label="About this page">
      <PageBriefList brief={brief} />
    </section>
  );
}
