import { formatNumber, wetnessTier } from "../lib/data";

/** Compact percentile bar with value — satellite-model wetness signal (0–100). */
export function PercentileBar({ value }: { value: number | null }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const tier = wetnessTier(value);
  return (
    <span className="pctCell">
      <span className="pctBar">
        <span className="pctBarFill" style={{ width: `${v}%`, background: tier.color }} />
      </span>
      <span className="pctNum">{value === null ? "—" : formatNumber(value)}</span>
    </span>
  );
}

/** Wetness assessment pill (Extremely Wet / Very Wet / Wet / Normal / Dry). */
export function WetnessTag({ value }: { value: number | null }) {
  const tier = wetnessTier(value);
  return (
    <span className={`wetTag ${tier.className}`}>
      <span className="drop" />
      {tier.label}
    </span>
  );
}
