"use client";

/* Seamless moves between views with the browser's View Transitions: the old view is held as a
   picture while the new one is put in place, and elements that share a view-transition-name
   glide from one to the other. Where the browser has none, or the reader asks for less
   motion, the change simply happens. */

type Doc = Document & { startViewTransition?: (update: () => Promise<void> | void) => { finished: Promise<void> } };

let arrive: (() => void) | null = null;

export const able = () => typeof document !== "undefined" && Boolean((document as Doc).startViewTransition) && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Run `update` (which must change the page synchronously) as a view transition. */
export function transition(update: () => void): Promise<void> {
  if (!able()) { update(); return Promise.resolve(); }
  return (document as Doc).startViewTransition!(update).finished.catch(() => undefined);
}

/** Go to another page as a view transition: the new page is captured once it has arrived. */
export function navigate(push: () => void, beforeNew?: () => void): Promise<void> {
  if (!able()) { beforeNew?.(); push(); return Promise.resolve(); }
  return (document as Doc).startViewTransition!(() => new Promise<void>(resolve => {
    let settled = false;
    const done = () => { if (settled) return; settled = true; if (arrive === done) arrive = null; beforeNew?.(); resolve(); };
    arrive = done;
    push();
    window.setTimeout(done, 2500);
  })).finished.catch(() => undefined);
}

/** Called by the site's shell when a new page is in place. */
export function arrived() { arrive?.(); }
