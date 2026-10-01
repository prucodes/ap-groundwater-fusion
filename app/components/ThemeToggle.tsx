"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem("ap-gw-theme", next);
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      className="utilBtn"
      type="button"
      onClick={toggle}
      title={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
      aria-label={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"}
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
      {!collapsed && (
        <span className="utilLabel">
          {theme === "dark" ? "Switch to light" : "Switch to dark"}
        </span>
      )}
    </button>
  );
}
