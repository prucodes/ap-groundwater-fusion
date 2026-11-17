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
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Without an observer nothing could ever be drawn in, so everything is simply shown.
    if (!("IntersectionObserver" in window)) { document.querySelectorAll<HTMLElement>("[data-draw]").forEach(node => { node.dataset.drawn = "done"; }); return; }
    const root = document.documentElement;
    const seen = new WeakSet<Element>();
    // A chart clipped to nothing never counts as on screen, so the observer watches its
    // container and draws the chart inside it.
    const charts = new Map<Element, HTMLElement[]>();
    const view = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const nodes = charts.get(entry.target);
        if (!entry.isIntersecting || !nodes || (nodes[0].dataset.draw === "sequence" && entry.intersectionRatio < 0.5)) continue;
        view.unobserve(entry.target); charts.delete(entry.target);
        for (const node of nodes) {
          node.dataset.drawn = "drawing";
          window.setTimeout(() => { node.dataset.drawn = "done"; }, REVEAL_MS + 100);
        }
      }
    }, { threshold: [0.2, 0.5] });
    const watch = (scope: ParentNode) => scope.querySelectorAll<HTMLElement>("[data-draw]").forEach(node => {
      if (seen.has(node)) return;
      seen.add(node);
      // A sequence (the sensor map's dots) is never clipped, so it is watched itself and plays once at
      // least half of it is in view; a wiped chart already on screen at first paint stays drawn rather than blink.
      const sequence = node.dataset.draw === "sequence";
      const box = node.getBoundingClientRect();
      const shown = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)) / Math.max(box.height, 1);
      if (!root.dataset.motion && (sequence ? shown >= 0.5 : shown > 0)) { node.dataset.drawn = "done"; return; }
      const frame = sequence ? node : node.parentElement ?? node;
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
