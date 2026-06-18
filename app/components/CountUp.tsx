"use client";

import { useEffect, useRef, useState } from "react";

/* Count-up that is correct first and animated second.
   - Initial render shows the true value (SSR / no-JS safe).
   - On mount (motion allowed) it resets to 0 and animates up when in view,
     with a timer fallback so the real value is always reached even if the
     IntersectionObserver never fires. */
export function CountUp({
  value,
  decimals = 0,
  duration = 1100,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(value);
      return;
    }

    setDisplay(0);

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(value * eased);
        if (t < 1) requestAnimationFrame(tick);
        else setDisplay(value);
      };
      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    observer.observe(node);

    // Fallback: never leave the value stuck at 0 if the observer doesn't fire.
    const fallback = window.setTimeout(() => {
      run();
      observer.disconnect();
    }, 600);

    return () => {
      observer.disconnect();
      window.clearTimeout(fallback);
    };
  }, [value, duration]);

  return (
    <span ref={ref}>
      {display.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
