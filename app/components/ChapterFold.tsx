"use client";

import { useEffect, useRef, type ReactNode } from "react";

/* A chapter that is context rather than the page's own story, folded to one line: its
   title, the single thing it says, and a way in. The jump menu and shared links open it:
   any fragment that names the chapter or something inside it unfolds it first. Printing
   shows it whole (globals.css). */
/** Open a fold at once, without the glide, so a link or button that lands inside it can
    scroll straight to its target; the glide is kept for a reader's own click. */
export function openFold(fold: HTMLDetailsElement | null | undefined) {
  if (!fold || fold.open) return;
  fold.dataset.instant = "";
  fold.open = true;
  requestAnimationFrame(() => requestAnimationFrame(() => { delete fold.dataset.instant; }));
}

/** Opens the fold when a shared link or an in-page link points at something inside it. */
function useOpenForLinks(fold: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const openFor = () => {
      const name = decodeURIComponent(window.location.hash.slice(1));
      const target = name ? document.getElementById(name) : null;
      if (!target || !fold.current?.contains(target) || fold.current.open) return;
      openFold(fold.current);
      requestAnimationFrame(() => target.scrollIntoView());
    };
    // A jump-menu link is caught before the browser follows it, so the fold is already
    // open (at once, no glide) when the browser scrolls to the target.
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!link || link.pathname !== window.location.pathname) return;
      const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      if (target && fold.current?.contains(target)) openFold(fold.current);
    };
    openFor();
    window.addEventListener("hashchange", openFor);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("hashchange", openFor); document.removeEventListener("click", onClick, true); };
  }, [fold]);
}

export function ChapterFold({ id, title, sub, summary, children }: {
  id: string; title: string; sub: string; summary: ReactNode; children: ReactNode;
}) {
  const fold = useRef<HTMLDetailsElement>(null);
  useOpenForLinks(fold);
  return (
    <details ref={fold} className="chapterFold" data-testid={`fold-${id}`}>
      <summary>
        <h2 className="pageChapter" id={id}>{title}<span>{sub}</span></h2>
        <p>{summary}</p>
        <span className="chapterFoldCta" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

/* A supporting section folded to one line on a phone only; on a wider screen the line is
   hidden and the section stands open as before (globals.css). */
export function PhoneFold({ title, summary, children }: { title: string; summary: ReactNode; children: ReactNode }) {
  const fold = useRef<HTMLDetailsElement>(null);
  useOpenForLinks(fold);
  return (
    <details ref={fold} className="phoneFold">
      <summary><span>{title}</span><span>{summary}</span></summary>
      {children}
    </details>
  );
}
