"use client";

import { useEffect } from "react";

/* One reveal for every picture on the site, played once, the first time it is reached:

   - a chart marked data-draw is wiped in left to right;
   - data-draw="sequence" plays the element's own choreography (a map's wash, the sensor
     dots, a ring's sweep, a hundred squares filling) once at least half of it is in view;
   - data-draw="always" does the same even when the element opens on screen;
   - every bar on the site (an <i> with a percentage width, by this codebase's convention,
     and any parts stacked beside it) grows from the start of its track, without being
     marked by hand.

   The hidden state exists only once this has run (html[data-motion="ready"]), so without
   script, in print or with reduced motion everything is simply there. Whatever is already
   on screen when the page opens stays as it is rather than blink. After a reveal the clip
   is removed, so tooltips and labels that overflow a chart are never cut. Pictures that
   arrive later (an opened fold, a new route) are picked up as they mount. */
const REVEAL_MS = 1100;
const BARS = 'i[style*="width"]';
/** Bars in one reveal follow each other by this much, up to a dozen; then together. */
const BAR_STAGGER_MS = 45;

export function ChartReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Without an observer nothing could ever be drawn in, so everything is simply shown.
    if (!("IntersectionObserver" in window)) { document.querySelectorAll<HTMLElement>("[data-draw]").forEach(node => { node.dataset.drawn = "done"; }); return; }
    const root = document.documentElement;
    const seen = new WeakSet<Element>();
    // A chart clipped to nothing never counts as on screen, so the observer watches its
    // container and draws the chart inside it.
    const charts = new Map<Element, HTMLElement[]>();
    /* Throughout: measure first, then change. A measurement taken after a change makes the
       browser lay the whole page out again, and with a few hundred bars on a page that is a
       few hundred layouts in a row, enough to stall a phone for a second. */
    const view = new IntersectionObserver(entries => {
      const due: Array<{ nodes: HTMLElement[]; bar: boolean; lefts: number[] }> = [];
      for (const entry of entries) {
        const nodes = charts.get(entry.target);
        if (!entry.isIntersecting || !nodes) continue;
        // Enough of it to be worth playing: a share of the element, or, for one taller than
        // the screen (which could never show that share), a fair part of the screen.
        const tall = entry.intersectionRect.height, screen = window.innerHeight;
        const enough = nodes[0].dataset.draw === "sequence"
          ? entry.intersectionRatio >= 0.5 || tall >= screen * 0.45
          : entry.intersectionRatio >= 0.2 || tall >= Math.min(160, screen * 0.25);
        if (!enough) continue;
        view.unobserve(entry.target); charts.delete(entry.target);
        const bar = nodes[0].dataset.draw === "bar";
        due.push({ nodes, bar, lefts: bar ? nodes.map(node => node.getBoundingClientRect().left) : [] });
      }
      let bars = 0;
      for (const { nodes, bar, lefts } of due) {
        // Where this track's bar begins: the first part's own edge (a label may sit before it).
        // Every part grows from there, not from its own edge, so the parts of one bar leave
        // together; the bars of a group follow one after another.
        const start = bar ? Math.min(...lefts) : 0;
        nodes.forEach((node, i) => {
          if (bar) {
            node.style.setProperty("--bar-origin", `${Math.round(start - lefts[i])}px`);
            node.style.setProperty("--bar-delay", `${Math.min(bars, 12) * BAR_STAGGER_MS}ms`);
          }
          node.dataset.drawn = "drawing";
          window.setTimeout(() => { node.dataset.drawn = "done"; }, REVEAL_MS + (bar ? 700 : 100));
        });
        if (bar) bars++;
      }
    }, { threshold: [0, 0.01, 0.03, 0.1, 0.2, 0.35, 0.5, 0.75] });
    const watch = (scopes: ParentNode[]) => {
      // Bars are found, not marked: any not already part of a picture with its own reveal.
      // A bar built of parts (a rust part, then an amber one) is marked whole, so it grows as one.
      for (const scope of scopes) scope.querySelectorAll<HTMLElement>(BARS).forEach(bar => {
        if (bar.dataset.draw || !bar.style.width.endsWith("%") || bar.closest("[data-draw], [data-no-reveal], [data-testid='weekly-film']")) return;
        for (const part of bar.parentElement?.children ?? []) if (part instanceof HTMLElement && part.style.width.endsWith("%") && !part.dataset.draw) part.dataset.draw = "bar";
      });
      const fresh = scopes.flatMap(scope => [...scope.querySelectorAll<HTMLElement>("[data-draw]")]).filter(node => !seen.has(node) && (seen.add(node), true));
      const screen = window.innerHeight, boxes = fresh.map(node => node.getBoundingClientRect());
      fresh.forEach((node, i) => {
        // A sequence (the sensor map's dots) is never clipped, so it is watched itself and plays once at
        // least half of it is in view; a wiped chart already on screen at first paint stays drawn rather than blink.
        const sequence = node.dataset.draw === "sequence", box = boxes[i];
        const shown = Math.max(0, Math.min(box.bottom, screen) - Math.max(box.top, 0)) / Math.max(box.height, 1);
        // "always": hidden from first paint (no flash) and drawn in even when it opens on screen.
        if (node.dataset.draw === "always" && shown > 0) {
          requestAnimationFrame(() => { node.dataset.drawn = "drawing"; window.setTimeout(() => { node.dataset.drawn = "done"; }, REVEAL_MS + 2000); });
          return;
        }
        if (!root.dataset.motion && (sequence ? shown >= 0.5 : shown > 0)) { node.dataset.drawn = "done"; return; }
        const frame = sequence ? node : node.parentElement ?? node;
        const nodes = charts.get(frame);
        if (nodes) { nodes.push(node); return; }
        charts.set(frame, [node]);
        view.observe(frame);
      });
    };
    watch([document]);
    root.dataset.motion = "ready";
    // Pictures that mount later are marked before they are first painted, so a bar never shows whole and then starts over.
    const added = new MutationObserver(records => {
      const scopes = new Set<ParentNode>();
      for (const record of records) record.addedNodes.forEach(node => { if (node instanceof Element) scopes.add(node.matches(`[data-draw], ${BARS}`) ? node.parentNode ?? document : node); });
      if (scopes.size) watch([...scopes]);
    });
    added.observe(document.body, { childList: true, subtree: true });
    return () => { view.disconnect(); added.disconnect(); delete root.dataset.motion; };
  }, []);
  return null;
}
