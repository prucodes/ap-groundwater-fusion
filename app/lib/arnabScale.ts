/* Kept apart from lib/arnab.ts so the client map can use it without bundling the storm's data. */
/** Storm rain classes for the maps, light to deep storm blue. */
export const RAIN_SCALE = [
  { key: "0", max: 25, label: "Under 25 mm", color: "#e3edf7" },
  { key: "1", max: 50, label: "25 to 50", color: "#b5d0ec" },
  { key: "2", max: 100, label: "50 to 100", color: "#6fa3d9" },
  { key: "3", max: 200, label: "100 to 200", color: "#2f63b4" },
  { key: "4", max: Infinity, label: "200 mm or more", color: "#1b2a78" },
];
