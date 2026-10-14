import type { CSSProperties } from "react";

// A readable ink variant keeps pale map colours usable on both light and dark cards.
const surface = {
  background: "color-mix(in srgb, var(--map-status-color) 9%, var(--map-tip-surface, var(--card)))",
  borderLeftColor: "color-mix(in srgb, var(--map-status-color) 38%, var(--line))",
  borderRightColor: "color-mix(in srgb, var(--map-status-color) 38%, var(--line))",
  borderBottomColor: "color-mix(in srgb, var(--map-status-color) 38%, var(--line))",
  borderTopColor: "var(--map-status-color)",
  borderTopStyle: "solid" as const,
  borderTopWidth: "3px",
  borderRadius: "8px",
};

export function mapTooltipStyle(color: string, base = "var(--card)"): CSSProperties {
  return { ...surface, "--map-status-color": color, "--map-status-ink": "color-mix(in srgb, var(--map-status-color) 45%, var(--ink))", "--map-tip-surface": base } as CSSProperties;
}

/** Leaflet creates its tooltip outside React's DOM. */
export function applyMapTooltipStyle(element: HTMLElement | undefined, color: string) {
  if (!element) return;
  Object.assign(element.style, surface);
  element.style.setProperty("--map-status-color", color);
  element.style.setProperty("--map-status-ink", "color-mix(in srgb, var(--map-status-color) 45%, var(--ink))");
}
