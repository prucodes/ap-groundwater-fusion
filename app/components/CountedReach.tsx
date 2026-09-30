"use client";

import { useEffect, useRef } from "react";
import { countEvent } from "../lib/visit-counter";

/**
 * Marks a point in a long page and records the visits that scroll far enough to see it.
 *
 * The monsoon page is long enough that a page view says nothing about whether its later
 * evidence is read at all. A marker on a section answers that for that section: how many of
 * the visits that opened the page got as far as the map, the heat record, the list.
 *
 * These are separate reach figures and not a funnel. A reader who jumps to the bottom, or
 * follows a link into one section, records that section and not the ones above it, so the
 * numbers need not fall in reading order and the later one can exceed the earlier. Firing
 * the earlier markers too would make a tidier chart out of views that did not happen.
 *
 * It records a section coming into view, not dwelling on it, and — like every other event
 * here — at most once per page load.
 */
export function CountedReach({ event, title }: { event: string; title: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    // The marker itself is an empty inline span with no area, which an intersection observer
    // cannot reliably report on, so the card holding it is what gets observed. That is also
    // the honest target: the event means the section came into view.
    const target = node.parentElement ?? node;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      countEvent(event, title);
      observer.disconnect();
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [event, title]);
  return <span ref={ref} aria-hidden="true" />;
}
