"use client";

import { useEffect, useState } from "react";

/** Whether the dark theme is on, following the toggle. False until mounted, so the first
 *  client render matches the static HTML and hydration never mismatches. */
export function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () => setDark(document.documentElement.dataset.theme === "dark");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}
