"use client";

import { useEffect, useRef, type ReactNode } from "react";

/* A chapter that is context rather than the page's own story, folded to one line: its
   title, the single thing it says, and a way in. The jump menu and shared links open it:
   any fragment that names the chapter or something inside it unfolds it first. Printing
   shows it whole (globals.css). */
export function ChapterFold({ id, title, sub, summary, children }: {
  id: string; title: string; sub: string; summary: ReactNode; children: ReactNode;
}) {
  const fold = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const openFor = () => {
      const name = decodeURIComponent(window.location.hash.slice(1));
      const target = name ? document.getElementById(name) : null;
      if (!target || !fold.current?.contains(target) || fold.current.open) return;
      fold.current.open = true;
      requestAnimationFrame(() => target.scrollIntoView());
    };
    openFor();
    window.addEventListener("hashchange", openFor);
    return () => window.removeEventListener("hashchange", openFor);
  }, []);
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
