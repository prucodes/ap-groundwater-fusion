"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as "light" | "dark") || "light";
    setTheme(current);
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
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <IconSun /> : <IconMoon />}
      {!collapsed && <span className="utilLabel">{theme === "dark" ? "Light" : "Dark"}</span>}
    </button>
  );
}
