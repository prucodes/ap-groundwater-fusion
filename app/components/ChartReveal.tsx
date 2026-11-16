"use client";

import { useEffect } from "react";

/* Charts draw themselves in, left to right, the first time they scroll into view.
   Any element marked data-draw takes part. The hidden state exists only once this
   has run (html[data-motion="ready"]), so without script, in print or with reduced
   motion every chart is simply there. After the reveal the clip is removed, so
   tooltips and labels that overflow the chart are never cut. Charts that arrive
   later (an opened fold, a new route) are picked up as they mount. */
const REVEAL_MS = 1100;

export function ChartReveal() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const root = document.documentElement;
    const seen = new WeakSet<Element>();
    // A chart clipped to nothing never counts as on screen, so the observer watches its
    // container and draws the chart inside it.
    const charts = new Map<Element, HTMLElement[]>();
    const view = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const nodes = charts.get(entry.target);
        if (!nodes) continue;
        view.unobserve(entry.target); charts.delete(entry.target);
        for (const node of nodes) {
          node.dataset.drawn = "drawing";
          window.setTimeout(() => { node.dataset.drawn = "done"; }, REVEAL_MS + 100);
        }
      }
    }, { threshold: 0.2 });
    const watch = (scope: ParentNode) => scope.querySelectorAll<HTMLElement>("[data-draw]").forEach(node => {
      if (seen.has(node)) return;
      seen.add(node);
      // Already on screen before this ran (a fast first paint): leave it drawn rather than blink it.
      const box = node.getBoundingClientRect();
      if (!root.dataset.motion && box.top < window.innerHeight && box.bottom > 0) { node.dataset.drawn = "done"; return; }
      const frame = node.parentElement ?? node;
      const nodes = charts.get(frame);
      if (nodes) { nodes.push(node); return; }
      charts.set(frame, [node]);
      view.observe(frame);
    });
    watch(document);
    root.dataset.motion = "ready";
    const added = new MutationObserver(records => {
      for (const record of records) record.addedNodes.forEach(node => { if (node instanceof Element) { if (node.matches("[data-draw]")) watch(node.parentNode ?? document); else watch(node); } });
    });
    added.observe(document.body, { childList: true, subtree: true });
    return () => { view.disconnect(); added.disconnect(); delete root.dataset.motion; };
  }, []);
  return null;
}
