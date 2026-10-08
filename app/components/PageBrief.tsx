import type { PageBrief } from "../lib/pageBriefs";

/** What the screen is, what it says now, and what to do with it: the same three lines on every page. */
export function PageBriefList({ brief }: { brief: PageBrief }) {
  // On a phone the hero leads with what it says now; the other two lines open
  // from "About this page" (a CSS-only toggle, so it works without a script).
  return (
    <div className="heroBriefWrap" data-testid="page-brief">
      <input type="checkbox" id="page-brief-more" className="briefToggle" />
      <dl className="heroBrief">
        <div className="briefMore"><dt>What this is</dt><dd>{brief.what}</dd></div>
        {brief.now ? <div className="heroBriefNow"><dt>What it says now</dt><dd>{brief.now}</dd></div> : null}
        <div className="briefMore"><dt>What to do with it</dt><dd>{brief.use}</dd></div>
      </dl>
      <label htmlFor="page-brief-more" className="briefMoreLabel">About this page</label>
    </div>
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
