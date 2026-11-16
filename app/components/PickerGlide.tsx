"use client";

import { useEffect, useRef } from "react";

/* A highlight that glides to the pressed button of the group it sits in. The leading
   edge moves first and the trailing edge follows, so it stretches a little and settles.
   Until it has measured once, the pressed button keeps its own fill (no-JS and first
   paint look the same as before). Colours come from the group: --glide-bg,
   --glide-border, --glide-radius, --glide-shadow. */
export function PickerGlide() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const glide = ref.current, group = glide?.parentElement;
    if (!glide || !group) return;
    let last: number | null = null;
    const place = () => {
      const active = group.querySelector<HTMLElement>(':scope > [aria-pressed="true"]');
      if (!active) { delete glide.dataset.ready; return; }
      const left = active.offsetLeft, top = active.offsetTop;
      glide.dataset.dir = last === null || left >= last ? "right" : "left";
      glide.style.left = `${left}px`;
      glide.style.right = `${group.clientWidth - left - active.offsetWidth}px`;
      glide.style.top = `${top}px`;
      glide.style.bottom = `${group.clientHeight - top - active.offsetHeight}px`;
      if (last === null) requestAnimationFrame(() => { glide.dataset.ready = ""; });
      last = left;
    };
    place();
    const pressed = new MutationObserver(place);
    pressed.observe(group, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    const resized = new ResizeObserver(place);
    resized.observe(group);
    return () => { pressed.disconnect(); resized.disconnect(); };
  }, []);
  return <span ref={ref} className="pickerGlide" aria-hidden="true" />;
}
