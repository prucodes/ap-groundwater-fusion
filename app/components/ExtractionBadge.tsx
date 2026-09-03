import { EXTRACTION_CATEGORY_META } from "../lib/data";
import type { ExtractionCategory } from "../lib/types";

/**
 * The CGWB Dynamic Ground Water Resources Assessment category.
 *
 * This is the vocabulary AP officials already work in — safe, semi-critical,
 * critical, over-exploited — and it is the one label on the page that is an
 * official 2024 assessment rather than anything this prototype computed. It is
 * kept visually distinct from the app's own status pills for that reason.
 */
export function ExtractionBadge({
  category,
  size = "md",
}: {
  category: ExtractionCategory | null;
  size?: "sm" | "md";
}) {
  if (!category) {
    return (
      <span className={`cgwbBadge cgwbBadgeNone ${size === "sm" ? "cgwbSm" : ""}`} title="No entry for this mandal in the CGWB 2024 assessment.">
        <span className="cgwbSource">CGWB 2024</span>
        <span className="cgwbLabel">Not assessed</span>
      </span>
    );
  }
  const meta = EXTRACTION_CATEGORY_META[category];
  return (
    <span
      className={`cgwbBadge ${size === "sm" ? "cgwbSm" : ""}`}
      style={{ ["--cgwb" as string]: meta.color }}
      title={`${meta.label} — ${meta.note}`}
    >
      <span className="cgwbSource">CGWB 2024</span>
      <span className="cgwbLabel">{meta.label}</span>
    </span>
  );
}
